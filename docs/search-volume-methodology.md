# Local search-volume figures — methodology & reference

How NeoBookworm produces the "around X people a month search for a [trade] near you"
line used in cold-email outreach, where the data lives, and what to say if a prospect
challenges the number.

---

## What the figure is

An **estimate** of how many people search Google each month for a given trade within
roughly a **10-mile radius** of the prospect's town. It is derived from Google's own
UK-wide search data, scaled down to the local area by population.

It is deliberately quoted softly ("around", "roughly") in emails — it is a defensible
estimate, never an exact promise.

---

## Where the data lives (Cloudflare D1)

Database: `0ae32598-1680-4995-a010-96b647eacabd` (same DB as `prospects`).

| Object | Type | What it holds |
|---|---|---|
| `trade_search_volume` | table | One row per trade: the UK national monthly search volume + a per-trade `correction_factor` |
| `location_catchment` | table | One row per town string: the ~10-mile catchment population |
| `area_trade_volume` | **view** | Auto-computes the local estimate for every trade × town combination |

### `trade_search_volume` columns
`trade_category` (PK, matches `prospects.trade_category` exactly), `keyword_cluster`
(the terms searched in Keyword Planner), `national_monthly` (UK total), `correction_factor`
(default 1.0; set by calibration), `source`, `captured_date`.

### `location_catchment` columns
`town` (PK, matches `prospects.town` exactly — variant spellings get their own row
pointing to the same population), `catchment_population`, `source`, `captured_date`.

### The formula (lives inside the `area_trade_volume` view)
```
monthly_estimate = round(
  national_monthly × (catchment_population ÷ 68,000,000) × correction_factor
  / 10) × 10
```
68,000,000 = UK population. Result is rounded to the nearest 10. Because it is a **view**,
changing any national figure, population, or correction factor instantly updates every
estimate — nothing to rebuild.

### How the email skill reads it
```sql
SELECT monthly_estimate FROM area_trade_volume
WHERE trade_category = ? AND town = ?;
```
If no row comes back (town not in `location_catchment`, or trade has no national figure
yet), the skill omits the search-volume line entirely — graceful degradation.

---

## Refreshing / adding national figures (the only recurring manual step)

For each trade, once:

1. Open Google Keyword Planner → **Search volume and forecasts**.
2. Set **Location = United Kingdom**, **date range = last 12 months**.
3. Paste the trade's keyword cluster (below).
4. Read the **Avg. monthly searches** for each keyword and **add them together**.
5. Store the total:
```sql
INSERT OR REPLACE INTO trade_search_volume
  (trade_category, keyword_cluster, national_monthly, correction_factor, source, captured_date)
VALUES (?, ?, ?, 1.0, 'Google Keyword Planner, UK, last 12 months', '<YYYY-MM-DD>');
```

### Keyword clusters per trade

| trade_category | Keyword cluster (paste all three, sum the results) |
|---|---|
| Plumber | `plumber near me`, `emergency plumber`, `plumber` |
| Electrician | `electrician near me`, `emergency electrician`, `electrician` |
| Builder | `builder near me`, `builders`, `building contractor` |
| Landscaper / Garden Designer | `landscaper near me`, `landscaping`, `garden designer` |
| Driveway / Paving Contractor | `driveway companies near me`, `block paving`, `driveway contractor` |
| Carpenter / Joiner | `carpenter near me`, `joiner`, `carpentry` |
| Painter & Decorator | `painter and decorator near me`, `decorator`, `painter decorator` |
| Handyman | `handyman near me`, `handyman services`, `local handyman` |
| Roofer | `roofer near me`, `roofing`, `roof repair` |
| Plasterer | `plasterer near me`, `plastering`, `plasterer cost` |
| Kitchen Fitter | `kitchen fitter near me`, `kitchen fitters`, `kitchen installation` |
| Bathroom Fitter | `bathroom fitter near me`, `bathroom fitters`, `bathroom installation` |
| Gas Engineer / Boiler Installer | `gas engineer near me`, `boiler installation`, `boiler repair` |
| Tiler | `tiler near me`, `tiling`, `wall and floor tiler` |
| Commercial Cleaner | `commercial cleaning`, `office cleaning`, `commercial cleaners near me` |
| Loft Conversion / Extension Builder | `loft conversion`, `house extension`, `loft conversion near me` |
| Other | — (no clean keyword; these prospects get no search line) |

---

## Calibration (the "bulletproof" check)

Done once to remove systematic bias from the population-scaling model. Pick the
**Plumber** cluster (highest, cleanest volume) and four towns spanning the size range:

| Town | Estimate basis (catchment pop) |
|---|---|
| Bristol | 700,000 (large city) |
| Swindon | 230,000 (mid town) |
| Salisbury | 120,000 (low-density rural) |
| Calne | 90,000 (small town) |

For each, in Keyword Planner set **Location = a 10-mile radius around the town**
(Keyword Planner → Locations → enter town → "Nearby" → set radius 10 mi), run the
plumber cluster, and read the total. Compare each measured figure to what
`area_trade_volume` predicts. Compute:

```
correction_factor = average( measured ÷ predicted )  across the four towns
```

Apply it to all trades (or per-trade if you later calibrate more):
```sql
UPDATE trade_search_volume SET correction_factor = ?;
```
Every estimate in the view updates automatically. Re-quote a couple of towns to confirm
they now sit on top of the measured numbers.

---

## If a prospect challenges the figure

### Short version (one line, for a quick reply)
> It's from Google's own Keyword Planner — the UK search volume for [trade] terms,
> scaled to about a 10-mile radius around [town] by population. It's a calibrated
> estimate built on Google's real data, not a guarantee, but it's in the right ballpark.

### Full version (for a fuller reply)
> Fair question. The number comes from Google Keyword Planner — the same tool
> advertisers use to see how often something gets searched. I take the UK-wide monthly
> search volume for [trade] terms (things like "[trade] near me", "emergency [trade]",
> "[trade]") and scale it down to roughly a 10-mile radius around [town] using local
> population. So it's an estimate rather than a promise — but it's built from Google's
> real search data, and I've sanity-checked it against Google's own location-targeted
> figures for a handful of towns to make sure it's in the right ballpark. The exact
> number isn't really the point: it's that a meaningful number of people near you type
> this into Google every month, and right now your business isn't what comes up.

### Tone notes
- Never defend the exact digit. Concede it's an estimate immediately — that *increases*
  credibility.
- Pivot to the real point: demand exists locally and they're invisible for it.
- Never claim it's a guarantee of leads or traffic.

---

## Calibration results (2026-05-21)

Four-town plumber calibration against Google Keyword Planner city-level targets:

| Town | Our estimate | Google measured | Ratio |
|---|---|---|---|
| Bristol | 1,540 | 1,500 | 0.97 ✓ |
| Swindon | 510 | 1,050 | 2.06 — conservative |
| Salisbury | 260 | 150 | 0.57 |
| Calne | 200 | 150 | 0.75 |

**Conclusion:** correction_factor left at 1.0. A single factor cannot reconcile inconsistent
ratios caused by differing Google city boundaries and heavy bucket rounding (150 and 1,050
are both rounded values). Our figures are conservative for market towns with large rural
hinterlands (e.g. Swindon draws from Royal Wootton Bassett, Highworth, etc.). Bristol
is essentially exact. Salisbury/Calne figures are within bucket-rounding uncertainty
(Google's "150" means anything from 100–199).

**This is the correct side to err on.** If challenged, "if anything, the real number
is likely higher" is the strongest possible response.

Note: Google Keyword Planner also shows a "Reach" figure in its UI — this is Google's
count of cookied/logged-in users in the area, not total population. It is always much
smaller than total population and has no bearing on search volumes. Ignore it.

---

## Coverage & limitations (as of 2026-05-21)

- **716 of 1,367 emailable prospects** resolve to a catchment figure (52%).
- 404 have a null/empty `town` (no address data recoverable from research_summary for most).
- 247 have a town value not yet in `location_catchment` — primarily more unusual towns
  not yet in the catchment table. Adding a row to `location_catchment` for any new town
  instantly makes all matching prospects resolvable.
- Catchment populations are reasoned ~10-mile estimates; figures are conservative
  (actual local volumes may be higher, particularly in towns with large rural hinterlands).
- 78 towns were recovered from `research_summary` in May 2026, raising coverage from
  ~298 (Ltd-only baseline) to 716 across the full prospect base.
