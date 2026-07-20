# JD Tyres — follow-up postcards (TyreTrust)

Two A6 follow-up postcards for Julian at JD Tyres Chippenham, sent if there's no
response to the initial letter (`A4 JD Tyres Doc1 for Stannp`). Both point back to
`tyretrust.uk/jd-offer`.

- **Card 1 — the nudge** (send ≈ +16 days): JD's portrait + "your website's still built".
- **Card 2 — the last word** (send ≈ +40 days): Nick's photo + "last one from me".

## Print-ready files (for Stannp)

Separate front/back, one page each:

| File | Side |
|---|---|
| `card1-front.pdf` | Card 1 image side |
| `card1-back.pdf`  | Card 1 message + address side |
| `card2-front.pdf` | Card 2 image side |
| `card2-back.pdf`  | Card 2 message + address side |

**Specs:** A6 (148×105 mm) **+ 3 mm bleed all round** = 154×111 mm. No crop marks
(Stannp auto-trims). Text/QR kept 5 mm inside the trim. DM Sans embedded.
Colours print-forced.

**On both backs, the right ~60 mm is left blank** for Stannp to overlay the delivery
address + postal barcode — do not fill it.

## Editable source

`card1.html` / `card2.html` render to the combined 2-page PDFs. To re-render after an
edit (Chrome headless):

```
chrome --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf="card1.pdf" "file:///<abs-path>/card1.html"
```

Then split with `pdfseparate -f 1 -l 1 card1.pdf card1-front.pdf` etc.

Assets used by the HTML: `card1-front-jd-portrait.jpg`, `nick-photo-print.jpg`,
`jd-offer-qr-print.png` (1200 px, ECC-H → tyretrust.uk/jd-offer), `dmsans.woff2`,
`tt-logo.png`.

## Notes before ordering

- Card 1 front photo is ~190 dpi at full-bleed A6 (source is only 1106×723 — the max
  available). Fine for a photo; swap in a higher-res original if one turns up.
- Card 2's scarcity line ("I won't keep the free preview up forever") is only honest if
  the preview will genuinely come down at some point.
