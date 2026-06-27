# D1 Read-Efficiency Audit

**Date:** 2026-06-27  
**Plan:** Workers Free (5M rows read / 100K rows written per day, shared across account)  
**Risk:** If the quota is exceeded, queries fail until midnight UTC.

---

## Database Inventory

### 1. neobookworm-enquiries (`771b3047-f977-485e-9cfb-736815931998`)

Accessed via native D1 binding in the `neobookworm-landing-enquiry` Worker and via REST API in Vercel functions under `api/`.

| Table | Rows (2026-06-27) | Purpose |
|---|---|---|
| `landing_enquiries` | 3 | Landing page form submissions (J1–J3) |
| `clients` | 3 | Onboarding client state machine |
| `email_log` | 2 | Outbound email history |
| `intake_submissions` | ~0 | Full intake form submissions (J4) |
| `contact_enquiries` | ~0 | Quick contact form (J5) |
| `change_requests` | ~0 | Portal revision requests |
| `feedback` | ~0 | Portal feedback (unused) |

**Existing indexes:**

| Index | Columns | Notes |
|---|---|---|
| `idx_enquiries_status_created` | `landing_enquiries(notion_status, email_status, created_at)` | notion_status is now dead weight — see §Offenders |
| `idx_clients_source` | `clients(source_type, source_id)` UNIQUE | Covers promotion idempotency check |
| `idx_clients_stage` | `clients(stage, stage_changed_at)` | Dashboard client list filtering |
| `idx_clients_email` | `clients(email)` | Dashboard search |
| `idx_email_log_slug_sent` | `email_log(slug, sent_at DESC)` | Portal email history |
| `idx_email_log_slug_template` | `email_log(slug, template)` | E1 dedup check |
| `idx_change_requests_slug` | `change_requests(slug, created_at DESC)` | Portal revision list |
| `idx_feedback_slug` | `feedback(slug)` | Unused table |

---

### 2. neobookworm-prospects (`0ae32598-1680-4995-a010-96b647eacabd`)

Accessed exclusively via Cloudflare REST API (`api/_lib/d1.js`) — no native binding.

| Table | Rows (2026-06-27) | Purpose |
|---|---|---|
| `prospects` | **4,776** | Cold prospect records |
| `outbox` | **753** | Per-prospect email queue |
| `campaigns` | 25 | Email campaign definitions |
| `landing_pages` | ~10 | Trade landing page URLs (source of truth for campaign setup) |
| `dnc` | 7 | Do-not-contact list |
| `location_catchment` | ~0 | Area trade-volume reference |

**Existing indexes:**

| Index | Columns | Notes |
|---|---|---|
| `idx_status` | `prospects(status)` | Single-column; partially covers campaign setup query |
| `idx_trade_category` | `prospects(trade_category)` | Single-column; partially covers campaign setup query |
| `idx_do_not_contact` | `prospects(do_not_contact)` | Single-column |
| `idx_has_website` | `prospects(has_website)` | Single-column |
| `idx_date_added` | `prospects(date_added)` | Import ordering |
| `idx_outbox_queue` | `outbox(sent, skipped, approved, campaign_id, scheduled_not_before, created_at)` | Designed for the send queue; campaign_id is 4th column — can't serve `WHERE campaign_id = ?` efficiently |
| `idx_dnc_phone` | `dnc(phone)` | DNC phone lookup |

---

### 3. bookings (`cd064320-d5b6-435c-8767-d50a4d3513a0`)

Accessed via native D1 binding in the `neobookworm-booking` Worker.

| Table | Rows (2026-06-27) | Purpose |
|---|---|---|
| `bookings` | 15 | Appointment records (HE Tyres + NeoBookworm) |
| `tenants` | 2 | Per-tenant booking configuration |

**Existing indexes:**

| Index | Columns | Notes |
|---|---|---|
| `idx_bookings_slug_slot` | `bookings(slug, slot_start)` | Slot availability check |
| `uniq_bookings_active_slot` | `bookings(slug, slot_start) WHERE status='confirmed'` | Double-booking guard |
| `uniq_bookings_manage_token` | `bookings(manage_token) WHERE manage_token IS NOT NULL` | Cancel/reschedule link lookup |

---

## Worst Offenders

Ranked by estimated **rows read per day** (rows scanned per execution × executions per day). Both tables being small right now means the absolute numbers are low — but the cron and campaign patterns are structural and will scale with table growth.

### #1 — Prospect campaign setup query (prospects DB)

**File:** `skill-revisions/neobookworm-campaign-setup/SKILL.md` (Step 2)  
**Frequency:** ~20–40 executions/day during active campaigns  
**SQL:**
```sql
SELECT notion_id, business_name, contact_name, email_address, town,
       trade_category, review_count, years_on_checkatrade, company_type, ...
FROM   prospects
WHERE  status = 'Researched'
  AND  trade_category = ?
  AND  do_not_contact = 0
  AND  email_address IS NOT NULL
  AND  company_type = 'ltd'
ORDER BY review_count DESC
LIMIT 25;
```

**Problem:** SQLite picks one of the three single-column indexes (`idx_status`, `idx_trade_category`, `idx_do_not_contact`) and filters the rest in memory. `idx_status` is probably chosen since 'Researched' is likely the most selective — but that still returns ~500–1,000 rows, all of which are scanned for `trade_category` and `do_not_contact`.

**Current rows read/day:** ~500 × 30 = **15,000**  
**After fix:** ~50 × 30 = **1,500** (composite index narrows directly to trade+status+dnc)  
**Savings: ~13,500 rows/day**

---

### #2 — Outbox notion_id lookups (prospects DB)

**File:** `api/dashboard.js` (multiple locations — suppress, unsuppress, approve, campaign summary)  
**Frequency:** ~50–100 executions/day when dashboard is active or campaigns running  
**SQL patterns:**
```sql
UPDATE outbox SET suppressed = 1, ... WHERE notion_id = ? AND sent = 0;
SELECT campaign_id FROM outbox WHERE notion_id = ? GROUP BY campaign_id ...;
```

**Problem:** No index on `notion_id` in outbox. Every query full-scans 753 rows.

**Current rows read/day:** 753 × 75 = **56,475**  
**After fix:** ~30 × 75 = **2,250** (index makes notion_id lookups O(log n))  
**Savings: ~54,000 rows/day**

---

### #3 — Campaign completion count (prospects DB)

**File:** `api/dashboard.js` (~line 95)  
**Frequency:** ~100 executions/day during email approvals/sends  
**SQL:**
```sql
SELECT (SELECT COUNT(*) FROM outbox WHERE campaign_id = ?) AS total,
       (SELECT COUNT(*) FROM outbox WHERE campaign_id = ? AND sent = 0 AND skipped = 0) AS pending
```

**Problem:** `idx_outbox_queue` has `campaign_id` as 4th column — useless for `WHERE campaign_id = ?` alone. Full table scan of 753 rows per call.

**Current rows read/day:** 753 × 100 = **75,300**  
**After fix:** ~30 × 100 = **3,000** (index with campaign_id leading)  
**Savings: ~72,000 rows/day**

---

### #4 — Retry cron on landing_enquiries (enquiries DB)

**File:** `workers/landing-enquiry/src/scheduled.js` (RETRY_SQL, DIGEST_SQL)  
**Frequency:** 96×/day (retry) + 1×/day (digest) = **97×/day**  
**SQL:**
```sql
-- RETRY (every 15 min)
SELECT id, email_status, email_attempts
FROM   landing_enquiries
WHERE  email_status = 'failed'
  AND  email_attempts < 5
  AND  created_at > datetime('now', '-7 days')
ORDER BY created_at ASC LIMIT 20;

-- DIGEST (08:00 UTC daily)
SELECT id, created_at, email, ... FROM landing_enquiries
WHERE  email_status = 'failed'
ORDER BY created_at ASC;
```

**Problem:** Existing index `idx_enquiries_status_created` has `notion_status` as its leading column. Since Notion was retired (Session 0, 25 May 2026), `notion_status` is never updated and values are mixed from before retirement. SQLite must scan all `notion_status` leaf nodes to reach `email_status`. With 3 rows today this is trivial; with 1,000+ rows it becomes the dominant daily cost.

**Current rows read/day (at 3 rows):** 291  
**At 1,000 rows without fix:** 97,000  
**At 1,000 rows after fix:** ~100 (index seeks directly on email_status)  
**Savings at scale: ~96,900 rows/day per 1,000 landing_enquiries rows**

---

### Not worth fixing now

| Query | Why it's fine |
|---|---|
| Booking email rate-limit (`WHERE slug=? AND email=? AND status=? AND created_at>=?`) | 15 bookings total — full scan is effectively free |
| DNC full load (`SELECT id, phone, business_name, postcode FROM dnc`) | 7 rows; `idx_dnc_phone` exists for phone lookups; full load is negligible |
| Dashboard summary `COUNT(*)` on small tables | All three enquiry tables are tiny (< 10 rows) |
| Client list correlated subquery for `last_email_at` | Only 3 clients; will matter at ~50+ clients — revisit then |

---

## Index Recommendations

### neobookworm-enquiries — migration 0007

**File:** `workers/landing-enquiry/migrations/0007_add_indexes.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_landing_enquiries_email_status
  ON landing_enquiries (email_status, created_at);
```

**Why:** Puts `email_status` first so both cron queries seek directly to `('failed', ...)` entries, bypassing the stale `notion_status` leading column in the existing index.

**Trade-off:** Tiny additional write cost per landing_enquiry insert (~1 extra row to the B-tree).

---

### neobookworm-prospects — migration 0001

**File:** `migrations/neobookworm-prospects/0001_add_indexes.sql`

```sql
-- 1. Campaign setup: narrows prospect query from ~500 → ~50 rows
CREATE INDEX IF NOT EXISTS idx_prospects_status_trade_dnc
  ON prospects (status, trade_category, do_not_contact);

-- 2. Outbox notion_id: narrows per-prospect outbox queries from 753 → ~30 rows
CREATE INDEX IF NOT EXISTS idx_outbox_notion_id_sent
  ON outbox (notion_id, sent);

-- 3. Campaign completion: narrows campaign count queries from 753 → ~30 rows
CREATE INDEX IF NOT EXISTS idx_outbox_campaign_id_sent_skipped
  ON outbox (campaign_id, sent, skipped);
```

**Why each column order:**
- `(status, trade_category, do_not_contact)` — all three are equality predicates in the WHERE clause; the most selective first (`status` narrows most). `company_type` is omitted from the index because it's a cheap in-memory filter after narrowing to ~50 rows.
- `(notion_id, sent)` — `notion_id` is the primary filter; `sent` is always an equality predicate alongside it, making it a covering second column.
- `(campaign_id, sent, skipped)` — `campaign_id` is the filter; `sent` and `skipped` are included to cover the `AND sent = 0 AND skipped = 0` sub-query variant without needing to fetch the full row.

**Trade-off:** Each of the three new indexes adds 1 row to its B-tree per INSERT into outbox or prospects. Given low write volumes (25 prospects per campaign batch, low outbox insert rate), this cost is negligible.

---

## Before vs After Daily Rows Read

| Source | Before (current scale) | After | Savings |
|---|---|---|---|
| Campaign prospect queries (×30/day) | 15,000 | 1,500 | 13,500 |
| Outbox notion_id lookups (×75/day) | 56,475 | 2,250 | 54,225 |
| Campaign completion checks (×100/day) | 75,300 | 3,000 | 72,300 |
| Landing enquiry cron (×97/day, 3 rows) | 291 | ~10 | 281 |
| **Total** | **~147,000** | **~6,760** | **~140,000** |

At current table sizes (4,776 prospects, 753 outbox), the three new prospect indexes alone cut daily rows read from ~147K to under 7K — a **95% reduction** and well inside the 5M free-tier limit even when campaigns are actively running.

As `landing_enquiries` grows with traffic, the cron index pays off further: every 1,000 rows added saves an extra ~96,000 rows/day from the cron queries.

---

## How to Apply

```bat
rem neobookworm-enquiries (tracked by wrangler migrations):
cd workers\landing-enquiry
npx wrangler d1 migrations apply neobookworm-enquiries --remote

rem neobookworm-prospects (manual — no wrangler migration tracking):
cd ..\..
npx wrangler d1 execute neobookworm-prospects --remote --file=migrations\neobookworm-prospects\0001_add_indexes.sql
```

Both use `CREATE INDEX IF NOT EXISTS` — safe to re-run if applied twice.

---

## Ongoing Monitoring

### Check rows_read on individual queries

Every D1 result object includes `meta.rows_read` — the number of rows scanned (not returned). Log it during development by reading the wrangler output or checking `result.meta` in Worker code:

```js
const result = await env.DB.prepare(sql).bind(...params).all();
console.log('rows_read:', result.meta.rows_read);
```

In the Vercel `api/_lib/d1.js` REST wrapper, the response JSON includes the same `meta` block — log it when debugging a slow query.

### Check aggregate usage in the Cloudflare dashboard

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **D1**
2. Click the database name
3. Open the **Metrics** tab
4. The **Read Rows** graph shows daily totals — compare against the 5M limit

Check this after applying the indexes and again after the first heavy campaign run to confirm the reduction.

### Identify a slow query in production

D1 does not expose query-level EXPLAIN QUERY PLAN in production, but you can run it via wrangler against live data (read-only, zero rows written):

```bat
npx wrangler d1 execute neobookworm-prospects --remote --command ^
  "EXPLAIN QUERY PLAN SELECT notion_id FROM prospects WHERE status='Researched' AND trade_category='Plumber' AND do_not_contact=0"
```

Look for `USING INDEX` in the output — if you see `SCAN TABLE prospects` without an index, a new index is needed for that query shape.

---

## Quick Wins Beyond Indexing

These are non-index improvements spotted during the audit. None of them affect rows-read (only serialisation or code efficiency), so they're lower priority than the indexes above.

| Location | Issue | Fix |
|---|---|---|
| `api/dashboard.js` | `SELECT * FROM clients WHERE slug = ?` in several places — fetches all 30+ columns | Replace with named columns for the specific use case |
| `api/dashboard.js` ~line 153 | `SELECT id, phone, business_name, postcode FROM dnc` (loads all 7 rows into memory on every call) | Acceptable at 7 rows; if DNC grows beyond ~500 rows, switch to a per-phone lookup `WHERE phone = ?` backed by `idx_dnc_phone` |
| `api/dashboard.js` ~line 1813 | Correlated subquery `(SELECT MAX(sent_at) FROM email_log WHERE slug = c.slug)` runs per client row in the list | At 3 clients this is fine; at 50+ clients add `idx_email_log_slug_sent` cover or materialise into `clients.last_email_at` |
| `api/acknowledge.js` ~line 86 | `WHERE slug = ? AND template LIKE '%-E1%'` — LIKE with leading `%` prevents prefix scan on `template` | The existing `idx_email_log_slug_template` narrows to a single slug first; with <20 emails per client the in-memory LIKE filter is fine. Only revisit if email_log grows to thousands per slug |
| `workers/landing-enquiry/src/scheduled.js` | RETRY_SQL selects `id, email_status, email_attempts` (3 columns) then calls `syncEnquiry(env, row.id)` which runs a separate `SELECT *` — two queries per retry row | Acceptable for correctness; would need refactoring syncEnquiry to accept the full row to eliminate the second query |
