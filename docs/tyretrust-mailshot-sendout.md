# TyreTrust — Mailshot Send-Out Checklist (Stannp)

Operational steps for when the 29-fitter mailshot is ready to print and post. For the
letter copy, phone script, and campaign strategy, see
[docs/tyretrust-campaign.md](tyretrust-campaign.md). This doc covers the QR
personalisation mechanics and tracking.

---

## 1. Finalise the prospect list

- Confirm the 29 rows in [docs/tyretrust-mailshot-codes.csv](tyretrust-mailshot-codes.csv)
  are still current — re-export from `Local-no-website-tyre-fitters.xlsx`
  ("Mailshot Summary" tab, on iCloud Drive) if the list has changed.
- Pick the Tier 1 (top ~5 bespoke pre-builds) vs Tier 2 (standard letter) split per the
  campaign pack.

## 2. Build the Stannp letter template

- Use the Option 1 (or Option 2) letter copy from `docs/tyretrust-campaign.md`.
  Personalised fields: `[Owner name / "the team at Business"]`, `[Business name]`, `[date]`.
- Drop a QR code element into the template and bind it to the **Merge URL** column
  from the CSV — don't hardcode a fixed QR image. Stannp's variable-data merge does the
  whole 29-letter run from one template + one CSV upload; no per-letter image generation
  needed on our side.
- Upload `docs/tyretrust-mailshot-codes.csv` as the Stannp data source and map columns:
  Business Name / Address → the postal address block, Merge URL → the QR element.

## 3. What the Merge URL does

Each row's Merge URL looks like:

```
https://neobookworm.uk/tyretrust/?p=kingswood-tyre-service&utm_source=mailshot&utm_medium=direct-mail&utm_campaign=tyretrust-29&utm_content=kingswood-tyre-service
```

Two things happen when a prospect scans it:

- **`?p=<code>`** — read client-side by `tyretrust/index.html`, looked up in an inline
  `MAILSHOT` table, and used to show a personalised amber banner under the header:
  *"Thanks for stopping by — I'd love to build a website like this one for
  [Business] in [Town]."* Unknown or missing codes leave the banner hidden — the page
  still works normally for anyone else.
- **`utm_source/medium/campaign/content`** — standard UTM parameters, picked up
  automatically by GA4 (TyreTrust's own property `G-84ZR6LQ0GQ`). This is the reliable
  way to see which codes actually get scanned: in GA4 Acquisition reports, filter by
  `utm_campaign = tyretrust-29` and break down by `utm_content` (= the code, so 1:1 with
  a business) to see per-prospect visits.

There's also a custom `mailshot_view` event (fires with `mailshot_code`, `business`,
`town` params) for a shortcut view without cross-referencing the CSV — but this site is
consent-gated (Google Analytics only loads after a visitor accepts cookies), so treat the
UTM parameters as the primary signal and the custom event as a bonus that only reliably
fires for visitors who already have analytics consent stored from a previous visit.

## 4. Test before the full run

- Get one proof from Stannp (their preview/test-print feature) and scan the QR with your
  phone. Confirm it lands on the right `?p=` URL and the amber banner shows the correct
  business + town.
- Check a couple of the trickier business names render properly — `Sinan's Tyre`,
  `G&S Tyres`, `24/7 Mobile Tyres Gloucestershire` — already verified in preview, but
  worth a real-device check too.
- In GA4 (once consent is granted on your test device), confirm the test scan shows up
  under `utm_campaign = tyretrust-29`.

## 5. Owner names, if you get any before printing

If you learn a first name for any code before the print run, give me the code + name and
I'll add it to the `MAILSHOT` object in `tyretrust/index.html` and redeploy — the banner
upgrades automatically to *"Thanks for stopping by, James — I'd love to build..."* with no
CSV or Stannp changes needed.

## 6. Print & send

- Proper stock, real signature in blue ink — this cohort is allergic to
  mail-merge-scam vibes.
- Address both owners where known (the "Emma and Howard effect").

## 7. After the drop

- ~7 days later: phone follow-up using the script in `docs/tyretrust-campaign.md`.
- Check GA4 periodically for `tyretrust-29` scans by `utm_content` — lets you see who's
  looked before they call or reply, useful context for the phone follow-up.

---

## Reference: where things live

| What | Where |
|---|---|
| Prospect list (source) | `Local-no-website-tyre-fitters.xlsx`, "Mailshot Summary" tab (iCloud Drive) |
| Merge CSV for Stannp | [docs/tyretrust-mailshot-codes.csv](tyretrust-mailshot-codes.csv) |
| Landing page + personalisation logic | `tyretrust/index.html` (`MAILSHOT` object + banner JS near the bottom) |
| Letter copy, postcard, phone script | [docs/tyretrust-campaign.md](tyretrust-campaign.md) |
| GA4 property | `G-84ZR6LQ0GQ` (TyreTrust's own, separate from the main site) |
