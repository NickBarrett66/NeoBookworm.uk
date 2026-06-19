function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBookingPage(config, slug, rescheduleToken = null) {
  const displayName = escHtml(config.displayName);
  const slugJson = JSON.stringify(slug);
  const slotDuration = config.slotDuration || 30;
  const maxAdvanceDays = config.maxAdvanceDays || 60;
  const workingDowsJson = JSON.stringify(Object.keys(config.workingHours).map(Number));
  const homeUrl = config.homeUrl ? escHtml(config.homeUrl) : null;
  const rescheduleTokenJson = JSON.stringify(rescheduleToken);
  const t = config.theme || {};
  const themeCss = `
    :root {
      --bg:         ${t.bg        || '#0f1f3d'};
      --accent:     ${t.accent    || '#f5a623'};
      --accent-h:   ${t.accentH   || '#d4891a'};
      --accent-fg:  ${t.accentFg  || '#0f1f3d'};
      --accent-rgb: ${t.accentRgb || '245, 166, 35'};
    }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book a slot | ${displayName}</title>
  <link rel="icon" type="image/x-icon" href="https://neobookworm.uk/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="https://neobookworm.uk/favicon-32x32.png">
  <link rel="stylesheet" href="https://neobookworm.uk/fonts.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://neobookworm.uk/fonts.css"></noscript>
  <style>
    ${themeCss}

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: var(--bg);
      color: #fff;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Header band ─────────────────────────────── */
    .biz-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.25rem;
      background: rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      flex-wrap: wrap;
    }

    .biz-name {
      font-weight: 700;
      font-size: 1rem;
      letter-spacing: -0.01em;
    }

    .biz-sep { opacity: 0.4; }

    .biz-meta {
      font-size: 0.875rem;
      opacity: 0.75;
    }

    /* ── Outer wrap ──────────────────────────────── */
    .wrap {
      max-width: 860px;
      margin: 0 auto;
      padding: 1.25rem 1rem 2.5rem;
    }

    .view[hidden] { display: none !important; }

    /* ── Two-pane picker layout ──────────────────── */
    .picker-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    @media (min-width: 640px) {
      .picker-layout {
        grid-template-columns: 1fr 1fr;
        align-items: start;
        gap: 2rem;
      }
    }

    /* ── Calendar pane ───────────────────────────── */
    .cal-pane {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 1rem;
    }

    .cal-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .cal-month-label {
      font-weight: 600;
      font-size: 0.9375rem;
    }

    .cal-nav-btn {
      width: 2rem;
      height: 2rem;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      background: transparent;
      color: #fff;
      font-size: 1.125rem;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, border-color 0.15s;
    }

    .cal-nav-btn:hover:not(:disabled) {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.5);
    }

    .cal-nav-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .cal-nav-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .cal-dow-row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      margin-bottom: 0.25rem;
    }

    .cal-dow-row span {
      text-align: center;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.5;
      padding: 0.25rem 0;
    }

    .cal-dow-row .cal-sun { opacity: 0.25; }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }

    .cal-cell {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #fff;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s;
      min-height: 36px;
    }

    .cal-cell.cal-empty {
      cursor: default;
      pointer-events: none;
    }

    .cal-cell:hover:not(.unavailable):not(.selected):not(.cal-empty) {
      background: rgba(255,255,255,0.1);
    }

    .cal-cell:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    .cal-cell.cal-today {
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .cal-cell.selected {
      background: var(--accent);
      color: var(--accent-fg);
      font-weight: 700;
    }

    .cal-cell.unavailable {
      opacity: 0.22;
      cursor: not-allowed;
    }

    /* subtle pulse while month data loads */
    .cal-cell.cal-loading-day {
      animation: cellpulse 1.4s ease-in-out infinite;
    }

    @keyframes cellpulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 0.35; }
    }

    /* ── Slots pane ──────────────────────────────── */
    .slots-pane {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 10rem;
    }

    .slots-area { flex: 1; }

    .slots-hint {
      margin: 0;
      padding: 1.5rem 0.5rem;
      text-align: center;
      font-size: 0.9375rem;
      opacity: 0.55;
    }

    .slots-empty,
    .slot-taken-msg {
      text-align: center;
      padding: 1.5rem 0.5rem;
      font-size: 0.9375rem;
      opacity: 0.9;
    }

    /* Skeleton shimmer for slot buttons */
    .slots-skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
      gap: 0.4rem;
      margin-top: 0.75rem;
    }

    .slot-skeleton-btn {
      height: 44px;
      border-radius: 8px;
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.07) 25%,
        rgba(255,255,255,0.13) 50%,
        rgba(255,255,255,0.07) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .slot-group-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.5;
      margin: 0.75rem 0 0.4rem;
    }

    .slot-group-label:first-child { margin-top: 0; }

    .slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
      gap: 0.4rem;
    }

    .time-btn {
      min-height: 44px;
      padding: 0.4rem 0.5rem;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 8px;
      background: transparent;
      color: #fff;
      font-family: inherit;
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, transform 0.1s;
    }

    .time-btn:hover:not(.selected) {
      border-color: rgba(255,255,255,0.55);
      background: rgba(255,255,255,0.06);
    }

    .time-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .time-btn.selected {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accent-fg);
      font-weight: 700;
      transform: scale(1.04);
    }

    .continue-btn {
      display: block;
      width: 100%;
      min-height: 48px;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-fg);
      font-family: inherit;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .continue-btn:hover { opacity: 0.9; }

    .continue-btn:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }

    /* ── Form view ───────────────────────────────── */
    .form-wrap {
      max-width: 520px;
      margin: 0 auto;
    }

    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 1rem;
      padding: 0.35rem 0;
      border: none;
      background: none;
      color: rgba(255,255,255,0.8);
      font-family: inherit;
      font-size: 0.875rem;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .back-btn:hover { color: #fff; }
    .back-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .booking-summary-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0 0 1.5rem;
      padding: 1rem 1.125rem;
      border-radius: 10px;
      background: rgba(var(--accent-rgb), 0.12);
      border: 1px solid rgba(var(--accent-rgb), 0.3);
    }

    .booking-summary-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
      line-height: 1;
    }

    .booking-summary-text {
      font-size: 0.9375rem;
      font-weight: 600;
      line-height: 1.35;
    }

    .booking-summary-sub {
      font-size: 0.8125rem;
      font-weight: 400;
      opacity: 0.75;
      margin-top: 0.1rem;
    }

    .field { margin-bottom: 1rem; }

    .field label {
      display: block;
      margin-bottom: 0.35rem;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .field input,
    .field textarea {
      display: block;
      width: 100%;
      padding: 0.65rem 0.75rem;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      background: rgba(255,255,255,0.07);
      color: #fff;
      font-family: inherit;
      font-size: 1rem;
      line-height: 1.4;
    }

    .field input::placeholder,
    .field textarea::placeholder { opacity: 0.45; }

    .field textarea {
      min-height: 4.5rem;
      resize: vertical;
    }

    .field input:focus,
    .field textarea:focus {
      outline: 2px solid var(--accent);
      outline-offset: 0;
      background: rgba(255,255,255,0.1);
    }

    .hp-field {
      position: absolute;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }

    .vehicle-card {
      margin-top: 0.5rem;
      padding: 0.55rem 0.75rem;
      border-radius: 6px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      line-height: 1.4;
    }

    .vehicle-card.vc-found {
      border-color: rgba(var(--accent-rgb), 0.4);
      background: rgba(var(--accent-rgb), 0.08);
    }

    .vehicle-card.vc-miss { opacity: 0.65; }

    .vc-spinner {
      flex-shrink: 0;
      width: 0.875rem;
      height: 0.875rem;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    .form-error {
      text-align: center;
      padding: 0.75rem;
      margin-bottom: 0.75rem;
      border-radius: 6px;
      background: rgba(220,53,69,0.15);
      border: 1px solid rgba(220,53,69,0.3);
      font-size: 0.9375rem;
    }

    .submit-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      min-height: 50px;
      margin-top: 0.5rem;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-fg);
      font-family: inherit;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .submit-btn:hover:not(:disabled) { opacity: 0.9; }

    .submit-btn:disabled {
      background: rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.4);
      cursor: not-allowed;
    }

    .submit-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

    .submit-btn .spinner {
      width: 1.125rem;
      height: 1.125rem;
      border: 2px solid rgba(255,255,255,0.25);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    /* ── Success view ────────────────────────────── */
    .success-wrap {
      max-width: 480px;
      margin: 0 auto;
      text-align: center;
      padding: 2rem 1rem;
    }

    .success-icon {
      font-size: 3rem;
      line-height: 1;
      margin-bottom: 1rem;
    }

    .success-wrap h2 {
      margin: 0 0 0.5rem;
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--accent);
    }

    .success-slot-card {
      display: inline-block;
      margin: 1rem auto;
      padding: 0.875rem 1.5rem;
      border-radius: 10px;
      background: rgba(var(--accent-rgb), 0.12);
      border: 1px solid rgba(var(--accent-rgb), 0.25);
      font-weight: 600;
      font-size: 1rem;
      line-height: 1.4;
    }

    .success-wrap p {
      margin: 0.75rem 0 0;
      font-size: 0.9375rem;
      opacity: 0.8;
    }

    .success-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
      align-items: center;
    }

    .success-another-btn {
      padding: 0.65rem 1.5rem;
      border: none;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-fg);
      font-family: inherit;
      font-size: 0.9375rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .success-another-btn:hover { opacity: 0.9; }
    .success-another-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

    .ics-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.55rem 1.25rem;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 8px;
      background: transparent;
      color: rgba(255,255,255,0.85);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .ics-btn:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.55); }
    .ics-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .success-home-link {
      font-size: 0.875rem;
      color: rgba(255,255,255,0.7);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .success-home-link:hover { color: #fff; }
  </style>
</head>
<body>
  <header class="biz-header">
    <span class="biz-name">${displayName}</span>
    <span class="biz-sep" aria-hidden="true">·</span>
    <span class="biz-meta">Book a ${slotDuration}-min slot</span>
  </header>

  <div class="wrap">

    <!-- Picker view -->
    <div id="view-picker" class="view">
      <div class="picker-layout">

        <div class="cal-pane">
          <div class="cal-nav">
            <button type="button" class="cal-nav-btn" id="cal-prev" aria-label="Previous month">&#8249;</button>
            <span class="cal-month-label" id="cal-month-label"></span>
            <button type="button" class="cal-nav-btn" id="cal-next" aria-label="Next month">&#8250;</button>
          </div>
          <div class="cal-dow-row" aria-hidden="true">
            <span>Mo</span><span>Tu</span><span>We</span><span>Th</span>
            <span>Fr</span><span>Sa</span><span class="cal-sun">Su</span>
          </div>
          <div class="cal-grid" id="cal-grid" role="listbox" aria-label="Choose a date"></div>
        </div>

        <div class="slots-pane">
          <div class="slots-area" id="slots-area">
            <p class="slots-hint" id="slots-hint">Select a date to see available times</p>
            <div class="slots-empty" id="slots-empty" hidden>No slots available — try another day</div>
            <div class="slot-taken-msg" id="slot-taken-msg" hidden>That slot was just taken — try another</div>
            <div id="slots-content"></div>
          </div>
          <button type="button" class="continue-btn" id="continue-btn" hidden>Continue →</button>
        </div>

      </div>
    </div>

    <!-- Form view -->
    <div id="view-form" class="view" hidden>
      <div class="form-wrap">
        <button type="button" class="back-btn" id="back-btn">← Back</button>
        <div class="booking-summary-card" id="booking-summary-card">
          <div class="booking-summary-icon" aria-hidden="true">&#128197;</div>
          <div>
            <div class="booking-summary-text" id="booking-summary-text"></div>
            <div class="booking-summary-sub">${displayName} · ${slotDuration} min</div>
          </div>
        </div>
        <form id="booking-form" novalidate>
          <div class="field">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" required maxlength="80" autocomplete="name">
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autocomplete="email">
          </div>
          <div class="field">
            <label for="phone">Phone</label>
            <input type="tel" id="phone" name="phone" required maxlength="30" autocomplete="tel">
          </div>
          <div class="field">
            <label for="reg">Vehicle registration <span style="font-weight:400;opacity:0.6">(optional)</span></label>
            <input type="text" id="reg" name="reg" maxlength="10" autocomplete="off" spellcheck="false" placeholder="e.g. AB12 CDE" style="text-transform:uppercase;letter-spacing:.05em">
            <div class="vehicle-card" id="vehicle-card" hidden></div>
          </div>
          <div class="field">
            <label for="note">Note <span style="font-weight:400;opacity:0.6">(optional)</span></label>
            <textarea id="note" name="note" maxlength="500" placeholder="e.g. tyre size or anything else we should know"></textarea>
          </div>
          <div class="hp-field" aria-hidden="true">
            <label for="company">Company</label>
            <input type="text" id="company" name="company" tabindex="-1" autocomplete="off">
          </div>
          <p class="form-error" id="form-error" hidden>Something went wrong — please try again</p>
          <button type="submit" class="submit-btn" id="submit-btn">Confirm booking</button>
        </form>
      </div>
    </div>

    <!-- Success view -->
    <div id="view-success" class="view" hidden>
      <div class="success-wrap">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <h2>Booking confirmed</h2>
        <div class="success-slot-card" id="success-slot-text"></div>
        <p>A confirmation has been sent to your email address.</p>
        <div class="success-actions">
          <button type="button" class="ics-btn" id="ics-btn">&#128197; Add to calendar</button>
          <button type="button" class="success-another-btn" id="success-another-btn">Book another slot</button>
          ${homeUrl ? `<a href="${homeUrl}" class="success-home-link" target="_parent">← Back to ${displayName}</a>` : ''}
        </div>
      </div>
    </div>

  </div>

  <script>
(function () {
  var SLUG = ${slugJson};
  var RESCHEDULE_TOKEN = ${rescheduleTokenJson};
  var TZ = 'Europe/London';
  var MAX_ADVANCE_DAYS = ${maxAdvanceDays};
  var WORKING_DOWS = ${workingDowsJson};

  // DOM refs
  var calGrid        = document.getElementById('cal-grid');
  var calMonthLabel  = document.getElementById('cal-month-label');
  var calPrev        = document.getElementById('cal-prev');
  var calNext        = document.getElementById('cal-next');
  var slotsHint      = document.getElementById('slots-hint');
  var slotsEmpty     = document.getElementById('slots-empty');
  var slotsContent   = document.getElementById('slots-content');
  var slotTakenMsg   = document.getElementById('slot-taken-msg');
  var continueBtn    = document.getElementById('continue-btn');
  var viewPicker     = document.getElementById('view-picker');
  var viewForm       = document.getElementById('view-form');
  var viewSuccess    = document.getElementById('view-success');
  var backBtn        = document.getElementById('back-btn');
  var bookingSummaryText = document.getElementById('booking-summary-text');
  var bookingForm    = document.getElementById('booking-form');
  var formError      = document.getElementById('form-error');
  var submitBtn      = document.getElementById('submit-btn');
  var successSlotText  = document.getElementById('success-slot-text');
  var successAnotherBtn = document.getElementById('success-another-btn');
  var icsBtn           = document.getElementById('ics-btn');

  // State
  var todayIso = londonToday();
  var currentMonth = todayIso.slice(0, 7);
  var maxMonth = addDaysIso(todayIso, MAX_ADVANCE_DAYS).slice(0, 7);
  var monthCache = {};   // 'YYYY-MM' -> { available: [...] } or { error: true }
  var monthLoading = {}; // 'YYYY-MM' -> true/false

  var selectedDate = null;
  var selectedTime = null;
  var selectedSlot = null;
  var fetchToken = 0;
  var hasAutoNudged = false;
  var vehicleSummary = null;
  var regLookupTimer = null;

  // ── Date helpers ─────────────────────────────────

  function londonToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function addDaysIso(iso, n) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
  }

  function isoUTCDay(iso) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); // 0=Sun
  }

  function isWorkingDay(iso) {
    var dow = isoUTCDay(iso); // 0=Sun,1=Mon,...,6=Sat
    return WORKING_DOWS.indexOf(dow) !== -1;
  }

  function monthDays(month) {
    var p = month.split('-').map(Number);
    var last = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    var days = [];
    for (var d = 1; d <= last; d++) {
      days.push(month + '-' + String(d).padStart(2, '0'));
    }
    return days;
  }

  function monthLabel(month) {
    var p = month.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, 15));
    return new Intl.DateTimeFormat('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC'
    }).format(d);
  }

  function formatSummaryLine(iso, time) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    var dateStr = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ
    }).format(d);
    return dateStr + ' at ' + time;
  }

  // ── Month availability ───────────────────────────

  function loadMonthAvailability(month) {
    if (monthCache[month] || monthLoading[month]) return;
    monthLoading[month] = true;

    fetch('/' + SLUG + '/month?month=' + encodeURIComponent(month))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        monthLoading[month] = false;
        var available = data.available || [];
        monthCache[month] = { available: available };
        if (month === currentMonth) {
          // Auto-nudge: if this is the opening view and there are no slots, advance once
          if (!hasAutoNudged && available.length === 0 && currentMonth < maxMonth) {
            hasAutoNudged = true;
            var p2 = currentMonth.split('-').map(Number);
            currentMonth = new Date(Date.UTC(p2[0], p2[1], 1)).toISOString().slice(0, 7);
            loadMonthAvailability(currentMonth);
          }
          renderCalendar();
        }
      })
      .catch(function () {
        monthLoading[month] = false;
        monthCache[month] = { error: true };
        if (month === currentMonth) renderCalendar();
      });
  }

  // ── Calendar rendering ───────────────────────────

  function renderCalendar() {
    calMonthLabel.textContent = monthLabel(currentMonth);
    calPrev.disabled = currentMonth <= todayIso.slice(0, 7);
    calNext.disabled = currentMonth >= maxMonth;

    var days = monthDays(currentMonth);
    var firstDow = isoUTCDay(days[0]); // 0=Sun
    var offset = firstDow === 0 ? 6 : firstDow - 1; // Mon-first padding

    var cacheEntry = monthCache[currentMonth];
    var isLoading  = monthLoading[currentMonth] && !cacheEntry;
    var available  = cacheEntry && !cacheEntry.error ? cacheEntry.available : null;

    calGrid.textContent = '';

    // Empty padding cells
    for (var i = 0; i < offset; i++) {
      var empty = document.createElement('span');
      empty.className = 'cal-cell cal-empty';
      calGrid.appendChild(empty);
    }

    days.forEach(function (iso) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-cell';
      btn.dataset.date = iso;
      btn.setAttribute('role', 'option');
      btn.textContent = parseInt(iso.split('-')[2], 10);

      var isPast     = iso < todayIso;
      var notWorking = !isWorkingDay(iso);
      var notAvail   = available !== null && available.indexOf(iso) === -1;
      var isUnavail  = isPast || notWorking || notAvail;

      if (iso === todayIso)     btn.classList.add('cal-today');
      if (iso === selectedDate) btn.classList.add('selected');

      if (isUnavail) {
        btn.disabled = true;
        btn.classList.add('unavailable');
      } else if (isLoading && !isPast && !notWorking) {
        btn.classList.add('cal-loading-day');
      }

      if (!isUnavail) {
        btn.addEventListener('click', function () {
          selectDay(this.dataset.date);
        });
      }

      calGrid.appendChild(btn);
    });
  }

  // ── Day / slot selection ─────────────────────────

  function selectDay(iso) {
    var cacheEntry = monthCache[currentMonth];
    if (cacheEntry && !cacheEntry.error && cacheEntry.available.indexOf(iso) === -1) return;

    selectedDate = iso;
    selectedTime = null;
    selectedSlot = null;
    continueBtn.hidden = true;
    slotTakenMsg.hidden = true;
    renderCalendar();
    loadSlots(iso);
  }

  function clearSlotsUI() {
    slotsContent.textContent = '';
    slotsHint.hidden    = true;
    slotsEmpty.hidden   = true;
    slotTakenMsg.hidden = true;
    continueBtn.hidden  = true;
    selectedTime = null;
    selectedSlot = null;
  }

  function showSlotsSkeleton() {
    slotsContent.textContent = '';
    var grid = document.createElement('div');
    grid.className = 'slots-skeleton-grid';
    for (var i = 0; i < 8; i++) {
      var skel = document.createElement('div');
      skel.className = 'slot-skeleton-btn';
      skel.style.animationDelay = (i * 0.07) + 's';
      grid.appendChild(skel);
    }
    slotsContent.appendChild(grid);
  }

  async function loadSlots(iso) {
    var token = ++fetchToken;
    clearSlotsUI();
    showSlotsSkeleton();

    try {
      var res  = await fetch('/' + SLUG + '/slots?date=' + encodeURIComponent(iso));
      var data = await res.json();
      if (token !== fetchToken) return;
      slotsContent.textContent = '';

      if (!res.ok || !data.slots) {
        slotsEmpty.hidden = false;
        slotsEmpty.textContent = 'Unable to load times — please try again';
        return;
      }

      if (data.slots.length === 0) {
        slotsEmpty.hidden = false;
        // Remove this day from cache so calendar dims it
        var entry = monthCache[currentMonth];
        if (entry && entry.available) {
          var idx = entry.available.indexOf(iso);
          if (idx !== -1) entry.available.splice(idx, 1);
          renderCalendar();
        }
        return;
      }

      // Group into Morning / Afternoon
      var morning   = data.slots.filter(function (t) { return t < '12:00'; });
      var afternoon = data.slots.filter(function (t) { return t >= '12:00'; });

      function renderGroup(label, slots) {
        if (!slots.length) return;
        var lbl = document.createElement('p');
        lbl.className = 'slot-group-label';
        lbl.textContent = label;
        slotsContent.appendChild(lbl);
        var grid = document.createElement('div');
        grid.className = 'slots-grid';
        slots.forEach(function (time) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'time-btn';
          btn.textContent = time;
          btn.dataset.time = time;
          btn.setAttribute('role', 'option');
          if (time === selectedTime) btn.classList.add('selected');
          btn.addEventListener('click', function () { selectTime(time); });
          grid.appendChild(btn);
        });
        slotsContent.appendChild(grid);
      }

      renderGroup('Morning', morning);
      renderGroup('Afternoon', afternoon);

    } catch (err) {
      if (token !== fetchToken) return;
      slotsContent.textContent = '';
      slotsEmpty.hidden = false;
      slotsEmpty.textContent = 'Unable to load times — please try again';
    }
  }

  function selectTime(time) {
    selectedTime = time;
    selectedSlot = selectedDate + 'T' + time + ':00';
    slotsContent.querySelectorAll('.time-btn').forEach(function (btn) {
      btn.classList.toggle('selected', btn.dataset.time === time);
    });
    continueBtn.hidden = false;
  }

  // ── Reg lookup ───────────────────────────────────

  function setVehicleCard(state, html) {
    var card = document.getElementById('vehicle-card');
    if (!card) return;
    card.hidden = (state === 'hidden');
    card.className = 'vehicle-card' +
      (state === 'found' ? ' vc-found' : state === 'miss' ? ' vc-miss' : '');
    card.innerHTML = html;
  }

  function safeText(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function lookupReg(reg) {
    vehicleSummary = null;
    setVehicleCard('loading', '<span class="vc-spinner" aria-hidden="true"></span> Looking up…');
    try {
      var res = await fetch('https://neobookworm.uk/api/reg-lookup?reg=' + encodeURIComponent(reg));
      var data = await res.json();
      if (data.error || !data.vehicle) {
        setVehicleCard("miss", "— Not recognised — we'll double-check when you arrive");
        return;
      }
      var v = data.vehicle;
      var label = [
        [v.make, v.model].filter(Boolean).join(' '),
        [v.colour, v.year].filter(Boolean).join(' · '),
      ].filter(Boolean).join(' · ');
      if (!label) { setVehicleCard('hidden', ''); return; }
      vehicleSummary = label;
      setVehicleCard('found', '🚗 ' + safeText(label));
    } catch (e) {
      setVehicleCard("miss", "Couldn't look that up right now");
    }
  }

  var regInputEl = document.getElementById('reg');
  if (regInputEl) {
    regInputEl.addEventListener('input', function () {
      vehicleSummary = null;
      clearTimeout(regLookupTimer);
      setVehicleCard('hidden', '');
      var val = this.value.replace(/\s+/g, '').toUpperCase();
      if (val.length >= 5) {
        regLookupTimer = setTimeout(function () { lookupReg(val); }, 1200);
      }
    });
    regInputEl.addEventListener('blur', function () {
      clearTimeout(regLookupTimer);
      var val = this.value.replace(/\s+/g, '').toUpperCase();
      var card = document.getElementById('vehicle-card');
      if (val.length >= 5 && card && card.hidden) lookupReg(val);
    });
  }

  // ── View switching ───────────────────────────────

  function showView(name) {
    viewPicker.hidden  = name !== 'picker';
    viewForm.hidden    = name !== 'form';
    viewSuccess.hidden = name !== 'success';
  }

  // ── Month navigation ─────────────────────────────

  calPrev.addEventListener('click', function () {
    var p = currentMonth.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 2, 1));
    currentMonth = d.toISOString().slice(0, 7);
    loadMonthAvailability(currentMonth);
    renderCalendar();
    clearSlotsUI();
    slotsHint.hidden = false;
    selectedDate = null;
    selectedTime = null;
  });

  calNext.addEventListener('click', function () {
    var p = currentMonth.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1], 1));
    currentMonth = d.toISOString().slice(0, 7);
    loadMonthAvailability(currentMonth);
    renderCalendar();
    clearSlotsUI();
    slotsHint.hidden = false;
    selectedDate = null;
    selectedTime = null;
  });

  // ── Reschedule mode setup ────────────────────────

  if (RESCHEDULE_TOKEN) {
    continueBtn.textContent = 'Choose this slot →';
    submitBtn.textContent = 'Confirm reschedule';
    // Hide personal detail fields — we reuse the original booking's details
    ['name', 'email', 'phone', 'note'].forEach(function (id) {
      var field = document.getElementById(id);
      if (field) {
        field.removeAttribute('required');
        var wrap = field.closest('.field');
        if (wrap) wrap.hidden = true;
      }
    });
    var rescheduleNote = document.createElement('p');
    rescheduleNote.style.cssText = 'font-size:0.875rem;opacity:0.7;margin:0 0 1rem';
    rescheduleNote.textContent = "We'll use the contact details from your original booking.";
    bookingSummaryText.parentNode.insertBefore(rescheduleNote, bookingSummaryText.nextSibling);
  }

  // ── Continue / back / submit ─────────────────────

  continueBtn.addEventListener('click', function () {
    if (!selectedDate || !selectedTime) return;
    bookingSummaryText.textContent = formatSummaryLine(selectedDate, selectedTime);
    formError.hidden = true;
    showView('form');
  });

  backBtn.addEventListener('click', function () {
    formError.hidden = true;
    showView('picker');
    renderCalendar();
    if (selectedDate) loadSlots(selectedDate);
  });

  bookingForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.hidden = true;
    if (!RESCHEDULE_TOKEN && !bookingForm.reportValidity()) return;

    submitBtn.disabled = true;
    var origLabel = submitBtn.textContent;
    submitBtn.textContent = '';
    var spin = document.createElement('span');
    spin.className = 'spinner';
    spin.setAttribute('aria-hidden', 'true');
    submitBtn.appendChild(spin);
    submitBtn.appendChild(document.createTextNode(RESCHEDULE_TOKEN ? 'Rescheduling…' : 'Booking…'));

    var endpoint = RESCHEDULE_TOKEN ? ('/' + SLUG + '/reschedule') : ('/' + SLUG + '/book');
    var body = RESCHEDULE_TOKEN
      ? { token: RESCHEDULE_TOKEN, slot: selectedSlot }
      : {
          slot:           selectedSlot,
          name:           document.getElementById('name').value.trim(),
          email:          document.getElementById('email').value.trim(),
          phone:          document.getElementById('phone').value.trim(),
          note:           document.getElementById('note').value.trim() || null,
          company:        document.getElementById('company').value,
          reg:            (document.getElementById('reg')?.value.replace(/\s+/g, '').toUpperCase()) || null,
          vehicleSummary: vehicleSummary || null,
        };

    try {
      var res  = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await res.json();

      if (data.ok) {
        successSlotText.textContent = formatSummaryLine(selectedDate, selectedTime);
        var successH2 = document.querySelector('#view-success h2');
        if (successH2) successH2.textContent = RESCHEDULE_TOKEN ? 'Booking rescheduled' : 'Booking confirmed';
        try { window.parent.postMessage('booking-confirmed', '*'); } catch (_) {}
        showView('success');
        return;
      }

      if (data.error === 'too_many') {
        formError.hidden = false;
        formError.textContent = 'Too many attempts — please wait a minute and try again';
        submitBtn.replaceChildren();
        submitBtn.textContent = origLabel;
        submitBtn.disabled = false;
        return;
      }

      if (data.error === 'slot_taken') {
        submitBtn.replaceChildren();
        submitBtn.textContent = origLabel;
        submitBtn.disabled = false;
        showView('picker');
        slotTakenMsg.hidden = false;
        selectedTime = null;
        selectedSlot = null;
        continueBtn.hidden = true;
        renderCalendar();
        if (selectedDate) await loadSlots(selectedDate);
        return;
      }

      formError.hidden = false;
      submitBtn.replaceChildren();
      submitBtn.textContent = origLabel;
      submitBtn.disabled = false;
    } catch (err) {
      formError.hidden = false;
      submitBtn.replaceChildren();
      submitBtn.textContent = origLabel;
      submitBtn.disabled = false;
    }
  });

  if (successAnotherBtn) {
    successAnotherBtn.addEventListener('click', function () {
      selectedDate = null;
      selectedTime = null;
      selectedSlot = null;
      vehicleSummary = null;
      var regEl = document.getElementById('reg');
      if (regEl) regEl.value = '';
      setVehicleCard('hidden', '');
      clearSlotsUI();
      slotsHint.hidden = false;
      renderCalendar();
      showView('picker');
    });
  }

  // ── ICS download ────────────────────────────────

  // Convert a London wall-time string (e.g. "2026-06-23T09:00:00") to UTC ms.
  // Uses the same Intl offset trick as the server-side londonWallToInstant.
  function wallToUtcMs(wall) {
    var guess = new Date(wall + 'Z');
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, timeZoneName: 'shortOffset',
    }).formatToParts(guess);
    var tzPart = '';
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'timeZoneName') { tzPart = parts[i].value; break; }
    }
    var m = tzPart.match(/GMT([+-])(\\d+)/);
    if (!m) return guess.getTime();
    var sign = m[1] === '+' ? 1 : -1;
    return guess.getTime() - sign * parseInt(m[2], 10) * 3600000;
  }

  function makeIcs(wallStart, durationMins, summary) {
    function toZ(ms) {
      return new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    }
    var startMs = wallToUtcMs(wallStart);
    var uid = Date.now().toString(36) + Math.random().toString(36).slice(2) + '@neobookworm.uk';
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NeoBookworm//Booking//EN',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTART:' + toZ(startMs),
      'DTEND:' + toZ(startMs + durationMins * 60000),
      'SUMMARY:' + summary,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\\r\\n');
  }

  if (icsBtn) {
    icsBtn.addEventListener('click', function () {
      if (!selectedSlot) return;
      var ics = makeIcs(selectedSlot, ${slotDuration}, 'Booking at ${displayName}');
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'booking.ics';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    });
  }

  // ── Boot ─────────────────────────────────────────

  loadMonthAvailability(currentMonth);
  renderCalendar();
  // Prefetch next month in the background
  var p = currentMonth.split('-').map(Number);
  var nextMonth = new Date(Date.UTC(p[0], p[1], 1)).toISOString().slice(0, 7);
  if (nextMonth <= maxMonth) loadMonthAvailability(nextMonth);

})();
  </script>
</body>
</html>`;
}

// ── Manage page (cancel / reschedule) ────────────────────────────────────────

export function renderManagePage(booking, state, config, slug) {
  const displayName = escHtml(config.displayName);
  const t = config.theme || {};
  const themeCss = `
    :root {
      --bg:         ${t.bg        || '#0f1f3d'};
      --accent:     ${t.accent    || '#f5a623'};
      --accent-h:   ${t.accentH   || '#d4891a'};
      --accent-fg:  ${t.accentFg  || '#0f1f3d'};
      --accent-rgb: ${t.accentRgb || '245, 166, 35'};
    }`;

  function fmtSlot(wall) {
    const [datePart, timePart] = wall.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const dateStr = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(dt);
    const [hh, mm] = timePart.split(':');
    const h = parseInt(hh, 10);
    const ampm = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 || 12;
    return `${dateStr} at ${h12}:${mm}${ampm}`;
  }

  let bodyHtml;

  if (state === 'invalid' || state === 'not_found') {
    bodyHtml = `
      <div class="msg-card err">
        <p>Booking not found — the link may have expired or already been used.</p>
      </div>`;
  } else if (booking.status === 'cancelled') {
    bodyHtml = `
      <div class="msg-card">
        <p>This booking has been cancelled.</p>
      </div>`;
  } else {
    // Check if slot is in the past or within cutoff
    const slotMs = new Date(booking.slot_start.replace('T', ' ') + ' UTC').getTime();
    // Rough wall-time parse — precise enough for UI gating
    const isPast = slotMs < Date.now();
    const tooClosed = !isPast && (slotMs <= Date.now() + (config.minLeadMinutes || 60) * 60_000);

    const slotFormatted = escHtml(fmtSlot(booking.slot_start));
    const tokenJson = JSON.stringify(booking.manage_token);
    const slugJson = JSON.stringify(slug);

    let actionsHtml;
    if (isPast) {
      actionsHtml = `<p class="note">This appointment has already passed.</p>`;
    } else if (tooClosed) {
      actionsHtml = `<p class="note">Your appointment is coming up very soon — it's too late to make changes online. Please call ${escHtml(config.displayName)} directly.</p>`;
    } else {
      actionsHtml = `
        <div class="actions">
          <button type="button" class="btn-reschedule" id="rescheduleBtn">Reschedule</button>
          <button type="button" class="btn-cancel"     id="cancelBtn">Cancel booking</button>
        </div>
        <p class="cancel-msg" id="cancelMsg" hidden></p>`;
    }

    bodyHtml = `
      <div class="booking-card">
        <div class="booking-card-label">Your booking</div>
        <div class="booking-card-slot">${slotFormatted}</div>
        <div class="booking-card-biz">${displayName}</div>
      </div>
      ${actionsHtml}
      <script>
(function () {
  var SLUG  = ${slugJson};
  var TOKEN = ${tokenJson};
  var rescheduleBtn = document.getElementById('rescheduleBtn');
  var cancelBtn     = document.getElementById('cancelBtn');
  var cancelMsg     = document.getElementById('cancelMsg');

  if (rescheduleBtn) {
    rescheduleBtn.addEventListener('click', function () {
      window.location.href = '/' + SLUG + '?reschedule=' + encodeURIComponent(TOKEN);
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async function () {
      if (!confirm('Are you sure you want to cancel this booking?')) return;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling…';
      try {
        var res  = await fetch('/' + SLUG + '/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: TOKEN }),
        });
        var data = await res.json();
        if (data.ok) {
          cancelBtn.closest('.actions').hidden = true;
          cancelMsg.hidden = false;
          cancelMsg.textContent = 'Your booking has been cancelled. A confirmation has been sent to your email.';
          document.querySelector('.booking-card').style.opacity = '0.45';
        } else if (data.error === 'too_late') {
          cancelMsg.hidden = false;
          cancelMsg.textContent = 'It is too close to your appointment to cancel online — please call us directly.';
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Cancel booking';
        } else {
          cancelMsg.hidden = false;
          cancelMsg.textContent = 'Something went wrong — please try again.';
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Cancel booking';
        }
      } catch (_) {
        cancelMsg.hidden = false;
        cancelMsg.textContent = 'Something went wrong — please try again.';
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel booking';
      }
    });
  }
})();
      <\/script>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manage booking | ${displayName}</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" type="image/x-icon" href="https://neobookworm.uk/favicon.ico">
  <link rel="stylesheet" href="https://neobookworm.uk/fonts.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://neobookworm.uk/fonts.css"></noscript>
  <style>
    ${themeCss}
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; background: var(--bg); color: #fff;
      font-family: 'DM Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.5;
      -webkit-font-smoothing: antialiased; }
    .biz-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1.25rem;
      background: rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.1); }
    .biz-name { font-weight: 700; font-size: 1rem; }
    .biz-sep { opacity: 0.4; }
    .biz-meta { font-size: 0.875rem; opacity: 0.75; }
    .wrap { max-width: 520px; margin: 0 auto; padding: 2rem 1rem 3rem; }
    .booking-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
    .booking-card-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; opacity: 0.55; margin-bottom: 0.4rem; }
    .booking-card-slot { font-size: 1.125rem; font-weight: 700; line-height: 1.3; }
    .booking-card-biz { font-size: 0.875rem; opacity: 0.7; margin-top: 0.25rem; }
    .actions { display: flex; flex-direction: column; gap: 0.75rem; }
    .btn-reschedule { min-height: 48px; border: none; border-radius: 8px; background: var(--accent);
      color: var(--accent-fg); font-family: inherit; font-size: 1rem; font-weight: 700;
      cursor: pointer; transition: opacity 0.15s; }
    .btn-reschedule:hover { opacity: 0.9; }
    .btn-cancel { min-height: 44px; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px;
      background: transparent; color: #fff; font-family: inherit; font-size: 0.9375rem;
      font-weight: 500; cursor: pointer; transition: background 0.15s; }
    .btn-cancel:hover { background: rgba(255,255,255,0.07); }
    .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
    .cancel-msg { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 8px;
      background: rgba(255,255,255,0.07); font-size: 0.9375rem; }
    .msg-card { background: rgba(255,255,255,0.06); border-radius: 12px; padding: 1.5rem; }
    .msg-card.err { border: 1px solid rgba(220,53,69,0.3); }
    .note { font-size: 0.9375rem; opacity: 0.8; line-height: 1.5; }
  </style>
</head>
<body>
  <header class="biz-header">
    <span class="biz-name">${displayName}</span>
    <span class="biz-sep" aria-hidden="true">·</span>
    <span class="biz-meta">Manage booking</span>
  </header>
  <div class="wrap">
    ${bodyHtml}
  </div>
</body>
</html>`;
}
