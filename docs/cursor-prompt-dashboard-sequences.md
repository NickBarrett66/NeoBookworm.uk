# Cursor Prompt: Dashboard — 3-Email Sequence Support

## Context

The NeoBookworm outreach system is moving from single emails per prospect to a **3-email sequence per prospect** (Email 1 / Email 2 / Email 3), sent at Day 0, Day +5, and Day +12 via `scheduled_not_before` embargoes on outbox rows.

The outbox D1 table already has all the fields needed. The **campaign setup skill** now inserts 3 outbox rows per prospect, using a deterministic ID scheme: `{short-slug}-{notion_id}-e1`, `-e2`, `-e3`.

What needs changing is `dashboard.html` and `api/dashboard.js` to present and manage these sequences cleanly.

---

## Files to change

- `dashboard.html` — campaign detail UI, outbox rendering, summary bar
- `api/dashboard.js` — new API actions, updated queries

---

## Part 1 — D1 schema addition (run once in Cloudflare D1 console)

Add two columns to the `outbox` table. Include the migration SQL as a comment at the top of `api/dashboard.js` but **do not run it automatically** — Nick will run it manually in the D1 console.

```sql
-- Migration: add sequence support to outbox
-- Run once in Cloudflare D1 console (neobookworm-prospects DB)
ALTER TABLE outbox ADD COLUMN seq_num INTEGER NOT NULL DEFAULT 1;        -- 1, 2, or 3
ALTER TABLE outbox ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0;     -- 1 = stop sequence for this prospect
ALTER TABLE prospects ADD COLUMN sequence_suppressed INTEGER NOT NULL DEFAULT 0; -- mirrors suppressed state at prospect level
```

Also add a `suppressed` column to the `prospects` table so the sender script can check it efficiently without scanning all outbox rows.

---

## Part 2 — `api/dashboard.js` changes

### 2a — Update `outbox_list` query

Add `seq_num` and `suppressed` to the SELECT. Order by `notion_id ASC, seq_num ASC` so rows arrive grouped by prospect in sequence order.

```sql
SELECT id, notion_id, business_name, email, subject,
       substr(body, 1, 120) AS body_preview,
       created_at, scheduled_not_before,
       approved, approved_at,
       sent, sent_at, skipped, skip_reason,
       send_error, send_attempts,
       seq_num, suppressed
FROM outbox
WHERE campaign_id = ?
ORDER BY notion_id ASC, seq_num ASC
```

### 2b — Update `outbox_next` query

Add a guard so suppressed rows are never picked up by the sender:

```sql
SELECT o.id, o.campaign_id, o.notion_id, o.business_name,
       o.email, o.subject, o.body, o.seq_num
FROM outbox o
JOIN campaigns c ON o.campaign_id = c.id
WHERE o.sent = 0
  AND o.skipped = 0
  AND o.approved = 1
  AND o.suppressed = 0
  AND c.status = 'active'
  AND (o.scheduled_not_before IS NULL OR o.scheduled_not_before <= datetime('now'))
ORDER BY c.priority DESC, o.created_at ASC
LIMIT 1
```

### 2c — New POST action: `outbox_approve_prospect`

Approves all unsent, unskipped, unsuppressed rows for a given `notion_id` within a `campaign_id`.

```javascript
if (action === 'outbox_approve_prospect') {
  if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
  try {
    await queryD1(prospectsDb(),
      `UPDATE outbox SET approved = 1, approved_at = datetime('now')
       WHERE notion_id = ? AND campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0`,
      [body.notion_id, body.campaign_id]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
```

### 2d — New POST action: `outbox_unapprove_prospect`

Revokes approval for all unsent rows for a given prospect in a campaign.

```javascript
if (action === 'outbox_unapprove_prospect') {
  if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
  try {
    await queryD1(prospectsDb(),
      `UPDATE outbox SET approved = 0, approved_at = NULL
       WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
      [body.notion_id, body.campaign_id]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
```

### 2e — New POST action: `outbox_suppress_prospect`

Sets `suppressed = 1` on all unsent rows for a prospect, and also sets `sequence_suppressed = 1` on the `prospects` row. Used when a reply or unsubscribe is received.

```javascript
if (action === 'outbox_suppress_prospect') {
  if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
  try {
    await Promise.all([
      queryD1(prospectsDb(),
        `UPDATE outbox SET suppressed = 1
         WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
        [body.notion_id, body.campaign_id]),
      queryD1(prospectsDb(),
        `UPDATE prospects SET sequence_suppressed = 1 WHERE notion_id = ?`,
        [body.notion_id]),
    ]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
```

### 2f — New POST action: `outbox_unsuppress_prospect`

Reverses suppression (e.g. if applied by mistake).

```javascript
if (action === 'outbox_unsuppress_prospect') {
  if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
  try {
    await Promise.all([
      queryD1(prospectsDb(),
        `UPDATE outbox SET suppressed = 0
         WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
        [body.notion_id, body.campaign_id]),
      queryD1(prospectsDb(),
        `UPDATE prospects SET sequence_suppressed = 0 WHERE notion_id = ?`,
        [body.notion_id]),
    ]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
```

### 2g — Update `campaigns_detail` query

Add prospect-level aggregate counts to the outbox query so the UI can show per-prospect sequence status without extra round trips:

```sql
SELECT o.notion_id, o.business_name, o.email,
       COUNT(*) AS total_emails,
       SUM(CASE WHEN o.sent = 1 THEN 1 ELSE 0 END) AS sent_count,
       SUM(CASE WHEN o.suppressed = 1 THEN 1 ELSE 0 END) AS suppressed_count,
       MAX(o.suppressed) AS is_suppressed
FROM outbox o
WHERE o.campaign_id = ?
GROUP BY o.notion_id, o.business_name, o.email
ORDER BY o.business_name ASC
```

Keep the full `outbox_list` action for the detailed row-level data — the UI fetches both.

---

## Part 3 — `dashboard.html` changes

### 3a — Summary bar (two lines, prospects vs emails)

Replace the current single-line summary bar in `renderOutboxSection` with a two-line version:

**Line 1:** `{N} prospects in sequence`
**Line 2:** `{totalEmails} emails — {sent} sent · {embargoed} embargoed · {pending} awaiting approval · {skipped} skipped · {suppressed} suppressed`

Where:
- `embargoed` = approved but `scheduled_not_before` is in the future
- `pending` = `approved = 0` and not skipped/suppressed
- `suppressed` = `suppressed = 1` (sequence stopped for this prospect)

Keep the existing "Review & Approve All" and "Approve All" buttons. Their behaviour remains unchanged (they operate on individual rows).

### 3b — Grouped outbox table (Option A)

Replace the current flat `renderOutboxRows` function with a grouped layout. The logic:

1. **Group outbox rows by `notion_id`** before rendering.
2. For each prospect group, render a **prospect header row** (a `<tr>` with a distinct background, `var(--navy-card)`), containing:
   - A toggle arrow (▶ / ▼) to collapse/expand the group
   - Business name (bold)
   - Email address (muted)
   - Aggregate status badge (see below)
   - Prospect-level action buttons: **Approve All** / **Revoke All** / **Suppress** (see below)
3. Below the header, render **3 sub-rows** (one per email), each indented slightly with a left border in `var(--border)`. Sub-rows show:
   - Sequence label: `1st Email`, `2nd Email`, `Final Email` (use these exact labels, not E1/E2/E3)
   - Subject line
   - Scheduled date
   - Approval cell (existing `renderOutboxApprovalCell` logic)
   - Status cell (existing `renderOutboxStatusCell` logic — Embargoed / Ready to send / Sent / Skipped / Suppressed)
   - Actions cell: existing Preview / Revoke (unapprove) / Skip per individual row

**Collapse behaviour:** groups start expanded. Clicking the header row toggles visibility of sub-rows. Store collapsed state in a `Set` keyed by `notion_id`.

### 3c — Prospect-level aggregate status badge

Show a compact badge on the prospect header row summarising the group state:

| State | Badge text | Colour |
|-------|-----------|--------|
| All sent | ✓ Complete | green |
| Suppressed (replied/unsubscribed) | ✦ Replied — stopped | purple (`var(--purple)`) |
| Partially sent (some sent, some pending) | → In progress | blue |
| All approved, none sent | ✓ Approved | green (dimmer) |
| Partially approved | ◑ Part-approved | amber |
| None approved | ○ Pending | muted |
| Any skipped | ⊘ Skipped | grey |

### 3d — Prospect-level action buttons

On each prospect header row, right-aligned, show these buttons:

**When none are sent and not suppressed:**
- `Approve Sequence` — calls `outbox_approve_prospect` for this `notion_id`
- `Revoke Sequence` — calls `outbox_unapprove_prospect` for this `notion_id`
- `Suppress` — calls `outbox_suppress_prospect`; adds a confirmation dialog: "Stop all remaining emails to [Business Name]? This cannot be auto-reversed."

**When suppressed:**
- Show the badge "✦ Replied — stopped" (no approve/revoke buttons)
- Show an `Unsuppress` button (small, muted style) that calls `outbox_unsuppress_prospect` with a confirmation: "Resume sequence for [Business Name]?"

**When all sent:**
- No buttons — just the "✓ Complete" badge

**When partially sent (E1 sent, E2/E3 pending):**
- Show `Suppress` button only — it's too late to revoke E1, but E2/E3 can still be stopped

### 3e — Individual row actions (unchanged in principle, minor additions)

Keep existing Preview / Revoke / Skip buttons per sub-row.

Add one new state to `renderOutboxStatusCell`: if `row.suppressed === 1`, show status as "Suppressed" in grey, regardless of other flags.

If a row is suppressed, disable Preview, Revoke, and Skip buttons and show them greyed out.

### 3f — "Replied — stopped" visual treatment

When `is_suppressed = 1` for a prospect group:
- Render the prospect header row with a subtle left border in `var(--purple)`
- All sub-rows show "Suppressed" in grey for status
- The header badge shows "✦ Replied — stopped" in purple

This makes it immediately obvious at a glance which prospects have dropped out of the sequence.

---

## Part 4 — Behaviour notes and edge cases

### Existing single-email campaigns (seq_num = 1 for all rows)

The new `seq_num` column defaults to `1`. Existing campaigns will have all rows with `seq_num = 1`. The grouping logic should detect when a prospect has only 1 outbox row and render it without the expand/collapse toggle — just a flat row (same as current behaviour). This ensures zero regression for existing campaigns.

### `outbox_approve_all` (header button)

This still approves all unapproved, unsent, unskipped rows across the whole campaign in one shot. No change to the existing `outbox_approve_all` action. In the UI it now reads "Approve All Emails" to distinguish from the per-prospect "Approve Sequence" button.

### `outbox_confirm` (called by sender script after sending)

No change needed. It already marks the individual row as `sent = 1` and increments `count_sent` on the campaign. The sender script should call it once per email sent.

### Preview modal

No change needed. Preview shows the full body of the individual outbox row. The sequence label (`1st Email` etc.) should be shown in the modal header so Nick knows which email he's previewing.

### Scroll position

After any approve/revoke/suppress action on a prospect group, re-render the outbox section but preserve scroll position (capture `window.scrollY` before, restore after).

---

## Summary of new API actions

| Action | Method | Description |
|--------|--------|-------------|
| `outbox_approve_prospect` | POST | Approve all unsent rows for a prospect |
| `outbox_unapprove_prospect` | POST | Revoke approval for all unsent rows for a prospect |
| `outbox_suppress_prospect` | POST | Suppress remaining sequence for a prospect + flag on prospects table |
| `outbox_unsuppress_prospect` | POST | Reverse suppression for a prospect |

All existing actions are unchanged.

---

## Summary of UI changes

| Component | Change |
|-----------|--------|
| Summary bar | Two lines: prospects count + emails breakdown |
| Outbox table | Grouped by prospect with collapsible sub-rows |
| Prospect header row | Business name, email, aggregate badge, sequence-level action buttons |
| Sub-rows | Sequence label (1st/2nd/Final), subject, date, approval, status, individual actions |
| Status cell | New "Suppressed" state added |
| Suppressed group | Purple left border, "✦ Replied — stopped" badge, Unsuppress button |
| Single-email campaigns | Detected automatically; rendered flat (no regression) |
