# HE Tyres — Reg Number Lookup on Booking

## What this does

When a customer books a depot slot via the Koalendar calendar on the HE Tyres site,
they are asked for their vehicle registration number as part of the booking questions.
Once the booking is confirmed, a Vercel serverless function calls the DVLA Vehicle
Enquiry Service API, looks up the make, model, colour, and year for that plate, then
emails the result to HE Tyres alongside the customer's name and appointment time.

This gives Emma and Howard the vehicle details before the customer arrives — no need
to ask on the day or run a separate check.

---

## Reference: Koalendar redirect-after-booking docs

https://help.koalendar.com/article/92-redirect-invitees-after-booking-with-optional-data

Key points from those docs:
- In the Booking Page Editor → After Booking, you can set a custom redirect URL.
- Enable "Pass event details to your redirected page" and Koalendar appends:
  - `name`, `email` — customer's contact details
  - `start_at`, `end_at` — booking times in ISO-8601
  - `booking_id` — unique identifier
  - `answer_1`, `answer_2`, … — responses to your custom booking questions
- The registration number will come through as `answer_1` (or whichever number you
  give the reg question in Koalendar).

---

## Architecture overview

```
Customer fills in booking (Koalendar iframe on HE Tyres site)
    │
    ▼
Koalendar confirms booking → redirects iframe to:
    https://hetyres.co.uk/he-tyres/booking-done?reg={answer_1}&name={name}&email={email}&start={start_at}&id={booking_id}
    │
    ▼
booking-done.html (same origin as iframe parent)
    │  Reads URL params
    │  POSTs to Vercel function
    │  Shows confirmation UI inside iframe
    └─ postMessages parent window → success overlay triggers
    │
    ▼
api/he-tyres-dvla.js (Vercel serverless function)
    │  Calls DVLA VES API with reg number
    │  Formats vehicle details
    └─ Emails HE Tyres (nickbarrett@me.com or HE_TYRES_TO_EMAIL env var)
```

The site currently uses Koalendar **embedded in an iframe** (see `he-tyres/index.html`
line ~822). When Koalendar redirects after booking, the redirect happens inside the
iframe — not the full page. The `booking-done.html` trick keeps everything on the
same origin so it can `postMessage` back to the parent window to trigger the existing
success overlay.

---

## Step 1 — Get an API key

### Option A — DVLA VES (free, but registrations currently closed)

As of June 2026, **DVLA VES new registrations are closed** while they do system
upgrades. There is no apply button or form available.

- Developer portal: https://developer-portal.driver-vehicle-licensing.api.gov.uk/
- VES API page: https://developer-portal.driver-vehicle-licensing.api.gov.uk/apis/vehicle-enquiry-service/vehicle-enquiry-service-description.html
- **Email to join the waitlist:** dvlaapiaccess@dvla.gov.uk (subject: "VES API technical query")
- General enquiries: serviceenquiries@dvla.gov.uk

When registrations reopen and you receive a key, the endpoints are:
```
POST https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles        ← production
POST https://uat.driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles    ← UAT / testing
```
Note: DVLA returns `make` but **not** `model`.

---

### Option B — UK Vehicle Data (recommended to use now)

Sign up at: https://ukvehicledata.co.uk/

- Free trial with no time limit and instant access — no waitlist
- Returns up to 142 fields per vehicle including **make, model, colour, fuel type,
  MOT history, engine, gearbox, VIN** — more data than DVLA
- JSON API, straightforward integration

Registration: https://panel.ukvehicledata.co.uk/ (30-second signup, key issued instantly)

Check their pricing page for costs beyond the free trial:
https://ukvehicledata.co.uk/pricing

---

### Option C — Check Car Details (pay-per-use, start immediately)

Sign up at: https://www.checkcardetails.co.uk/api/vehicledata

- Test API key issued automatically on signup
- £0.02 per registration lookup
- **Note: £20/month minimum charge even at zero usage** — only worth it if
  you expect consistent volume (roughly 1,000+ lookups/month to justify it)
- Returns make, model, colour, fuel type, MOT status, year, CO2

---

### Recommended path

Use **Option B (UK Vehicle Data)** to build and test — free, instant, more data.
If DVLA VES registrations reopen and you want the official free source, switch
later by changing one constant in `api/he-tyres-dvla.js`.

Set the chosen API key as a Vercel environment variable:
- Variable name: `VES_API_KEY`
- Set it on the NeoBookworm.uk Vercel project alongside the other `HE_TYRES_*` vars

---

### UK Vehicle Data API call format

The exact endpoint structure varies slightly — check the docs after signup at:
https://ukvehicledata.co.uk/ApiDocumentation

The general pattern is a GET request:
```
GET https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData?v=2&api_nullitems=1&auth_apikey=YOUR_KEY&user_tag=&key_VRM=AB12CDE
```
Response includes fields such as:
```json
{
  "VehicleRegistration": {
    "Make": "FORD",
    "Model": "FOCUS",
    "Colour": "BLUE",
    "YearOfManufacture": "2019",
    "FuelType": "Petrol",
    "EngineCapacity": "1497"
  }
}
```

---

## Step 2 — Koalendar booking page config

1. Log in to Koalendar and open the **book-depot-slot** booking page editor.
2. Add a new invitee question:
   - Label: "Vehicle registration number (optional)"
   - Type: Short text
   - Required: No (customer may not have it to hand)
   - Note: this will become `answer_1` in the redirect URL (or `answer_2` etc. if
     you already have another question — check the numbering).
3. In **After Booking**, set the redirect URL to:

```
https://hetyres.co.uk/he-tyres/booking-done?reg={answer_1}&name={name}&email={email}&start={start_at}&id={booking_id}
```

Replace `{answer_1}` with the correct `{answer_N}` number for the reg question.

4. Enable "Pass event details to your redirected page".
5. Save and test with a dummy booking on the staging version first.

---

## Step 3 — Create `he-tyres/booking-done.html`

This page lives on the same domain as the parent site, so it can `postMessage` back
to the parent window to trigger the success overlay that already exists in
`he-tyres/index.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking confirmed — HE Tyres</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #1a2336; color: #fff; text-align: center; padding: 1.5rem;
    }
    .box { max-width: 420px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
    p { color: #ccc; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">✅</div>
    <h1>You're booked in!</h1>
    <p>We'll see you at the depot. Check your email for your confirmation and calendar invite.</p>
  </div>

  <script>
    (function () {
      // Parse URL params
      var params = new URLSearchParams(window.location.search);
      var reg     = (params.get('reg')   || '').trim().toUpperCase().replace(/\s+/g, '');
      var name    = params.get('name')   || '';
      var email   = params.get('email')  || '';
      var start   = params.get('start')  || '';
      var id      = params.get('id')     || '';

      // Tell parent window the booking is done (triggers success overlay)
      try {
        window.parent.postMessage('booking-confirmed', '*');
      } catch (e) {}

      // Fire DVLA lookup + email if we have a reg number
      if (reg) {
        fetch('/api/he-tyres-dvla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reg: reg, name: name, email: email, start: start, booking_id: id })
        }).catch(function () { /* silent — non-critical */ });
      }
    })();
  </script>
</body>
</html>
```

---

## Step 4 — Create `api/he-tyres-dvla.js` (Vercel serverless function)

```js
// api/he-tyres-dvla.js
// Receives booking data, looks up DVLA VES, emails HE Tyres.

const nodemailer = require('nodemailer');

const DVLA_URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';

async function dvlaLookup(reg) {
  const res = await fetch(DVLA_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.VES_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ registrationNumber: reg }),
  });
  if (!res.ok) return null;
  return res.json();
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { reg, name, email, start, booking_id } = req.body || {};

  if (!reg) return res.status(400).json({ error: 'reg required' });

  // DVLA lookup
  let vehicle = null;
  try {
    vehicle = await dvlaLookup(reg.toUpperCase().replace(/\s+/g, ''));
  } catch (e) {
    // continue — email will note the lookup failed
  }

  // Build email body
  const vehicleLine = vehicle
    ? [
        `Make:    ${vehicle.make || '—'}`,
        `Colour:  ${vehicle.colour || '—'}`,
        `Year:    ${vehicle.yearOfManufacture || '—'}`,
        `Fuel:    ${vehicle.fuelType || '—'}`,
        `Engine:  ${vehicle.engineCapacity ? vehicle.engineCapacity + ' cc' : '—'}`,
        `MOT:     ${vehicle.motExpiryDate || '—'}`,
        `Tax due: ${vehicle.taxDueDate || '—'}`,
      ].join('\n')
    : `DVLA lookup failed or returned no data for reg: ${reg}`;

  const body = `New depot booking — HE Tyres\n\n` +
    `Customer:   ${name || '—'}\n` +
    `Email:      ${email || '—'}\n` +
    `Appointment:${formatDate(start)}\n` +
    `Booking ID: ${booking_id || '—'}\n\n` +
    `Registration: ${reg}\n\n` +
    `Vehicle details from DVLA:\n${vehicleLine}\n`;

  // Send email using iCloud SMTP (same as api/contact.js)
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const toEmail = process.env.HE_TYRES_TO_EMAIL || process.env.TO_EMAIL;

  await transport.sendMail({
    from: `"HE Tyres Bookings" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `New booking — ${reg} — ${name || 'Customer'}`,
    text: body,
  });

  return res.status(200).json({ ok: true });
};
```

---

## Step 5 — Update `he-tyres/index.html` postMessage listener

The existing listener (around line 1387) catches Koalendar's own postMessage and
shows the success overlay. The `booking-done.html` page sends a `postMessage` with
the string `'booking-confirmed'`. Update the listener to catch both:

**Find this block (existing):**
```js
window.addEventListener('message', function (e) {
  if (!String(e.origin).includes('koalendar.com')) return;
  var data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data || '');
  if (/booking|confirmed|scheduled|booked|success/i.test(data)) showSuccess();
});
```

**Replace with:**
```js
window.addEventListener('message', function (e) {
  // Koalendar's own completion signal
  if (String(e.origin).includes('koalendar.com')) {
    var data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data || '');
    if (/booking|confirmed|scheduled|booked|success/i.test(data)) showSuccess();
    return;
  }
  // booking-done.html on same origin sends this after DVLA call is fired
  if (e.data === 'booking-confirmed') {
    showSuccess();
  }
});
```

---

## Step 6 — Environment variables checklist

All of these should be set in the Vercel project (NeoBookworm.uk → Settings →
Environment Variables):

| Variable | Value | Notes |
|---|---|---|
| `VES_API_KEY` | Your API key | From UK Vehicle Data (or DVLA when available) |
| `HE_TYRES_TO_EMAIL` | `nickbarrett@me.com` (or HE Tyres email when known) | Already set for enquiry form |
| `SMTP_HOST` | `smtp.mail.me.com` | Already set site-wide |
| `SMTP_PORT` | `587` | Already set |
| `SMTP_USER` | `neobookworm@icloud.com` | Already set |
| `SMTP_PASS` | iCloud app-specific password | Already set |

---

## Testing

1. Make a test booking via the Koalendar booking page.
2. Enter a known valid UK reg in the reg field (e.g. use your own car).
3. After confirming, you should be redirected to `booking-done.html` inside the
   iframe — the parent page success overlay should appear.
4. Within a few seconds, an email should arrive at `HE_TYRES_TO_EMAIL` with the
   vehicle details.
5. Test with no reg supplied — email should still arrive with booking details,
   and the vehicle section should note the reg was not provided.

To test the DVLA function in isolation before wiring up Koalendar:
```
curl -X POST https://hetyres.co.uk/api/he-tyres-dvla \
  -H "Content-Type: application/json" \
  -d '{"reg":"AB12CDE","name":"Test Customer","email":"test@example.com","start":"2026-06-10T10:00:00Z","booking_id":"test-001"}'
```

---

## Effort estimate

| Task | Time |
|---|---|
| DVLA API key registration | 10 min (then wait up to 2 days for approval) |
| Koalendar booking page config | 15 min |
| `booking-done.html` | 1 hour |
| `api/he-tyres-dvla.js` | 2–3 hours |
| Update postMessage listener | 30 min |
| Testing end-to-end | 1 hour |
| **Total** | **~5–6 hours** |

---

## Optional enhancement — vehicle not found

If the DVLA returns a 404 (reg not on record, or customer typed it wrong), the
email can include a direct link for Emma/Howard to check manually:

```
https://www.check-mot.service.gov.uk/
```

This is the DVLA's own public MOT history tool and works without an account.

---

*Written June 2026. Koalendar booking page slug: `book-depot-slot`.*
