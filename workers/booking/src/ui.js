function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCustomQuestionField(q) {
  const id = 'cq-' + escHtml(q.id);
  const label = escHtml(q.label);
  const req = q.required === true;
  const reqAttr = req ? 'required' : '';
  const optTag = req ? '' : ' <span style="font-weight:400;opacity:0.6">(optional)</span>';
  if (q.type === 'checkbox') {
    return `<div class="field">
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-weight:600">
        <input type="checkbox" id="${id}" data-cq="${escHtml(q.id)}" ${reqAttr} style="width:18px;height:18px;accent-color:var(--accent)"> ${label}
      </label>
    </div>`;
  }
  if (q.type === 'select') {
    const opts = (q.options || []).map((o) => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
    return `<div class="field">
      <label for="${id}">${label}${optTag}</label>
      <select id="${id}" data-cq="${escHtml(q.id)}" ${reqAttr}><option value="">Choose…</option>${opts}</select>
    </div>`;
  }
  if (q.type === 'textarea') {
    return `<div class="field">
      <label for="${id}">${label}${optTag}</label>
      <textarea id="${id}" data-cq="${escHtml(q.id)}" maxlength="500" ${reqAttr}></textarea>
    </div>`;
  }
  return `<div class="field">
    <label for="${id}">${label}${optTag}</label>
    <input type="text" id="${id}" data-cq="${escHtml(q.id)}" maxlength="500" ${reqAttr}>
  </div>`;
}

export function renderBookingPage(config, slug, rescheduleToken = null, adminKey = null) {
  const displayName = escHtml(config.displayName);
  const slugJson = JSON.stringify(slug);
  const adminKeyJson = JSON.stringify(adminKey);
  const slotDuration = config.slotDuration || 30;
  const maxAdvanceDays = config.maxAdvanceDays || 60;
  const workingDowsJson = JSON.stringify(Object.keys(config.workingHours).map(Number));
  const homeUrl = config.homeUrl ? escHtml(config.homeUrl) : null;
  const rescheduleTokenJson = JSON.stringify(rescheduleToken);
  const regEnabled = config.regLookup !== false;
  const noteLabel = escHtml(config.noteLabel || 'Note');
  const notePlaceholder = escHtml(config.notePlaceholder || 'Anything else we should know');
  const logoUrl = config.logoUrl ? escHtml(config.logoUrl) : null;
  const introLine = config.introLine ? escHtml(config.introLine) : null;
  const successHeading = escHtml(config.successHeading || 'Booking confirmed');
  const successMessage = escHtml(config.successMessage || 'A confirmation has been sent to your email address.');
  // Phase 4 — form flexibility
  const phoneEnabled = config.phoneEnabled !== false;
  const phoneRequired = phoneEnabled && config.phoneRequired !== false;
  const noteEnabled = config.noteEnabled !== false;
  const noteRequired = noteEnabled && config.noteRequired === true;
  const addressEnabled = config.addressEnabled === true;
  const addressRequired = addressEnabled && config.addressRequired === true;
  const addressLookup = config.addressLookup === 'full' ? 'full' : 'postcode';
  const addressLookupJson = JSON.stringify(addressLookup);
  const locationType = config.locationType || 'in_person';
  const locationDetail = config.locationDetail ? escHtml(config.locationDetail) : null;
  const customQuestions = Array.isArray(config.customQuestions) ? config.customQuestions : [];
  const customQuestionsJson = JSON.stringify(customQuestions);
  const addressEnabledJson = JSON.stringify(addressEnabled);
  const fittingChooser = config.mobileBooking === true || !!config.mobileEnquiryUrl;
  const mobileBooking = config.mobileBooking === true;
  const mobileEnquiryUrlJson = JSON.stringify(config.mobileEnquiryUrl || null);
  const fittingChooserJson = JSON.stringify(fittingChooser);
  const mobileBookingJson = JSON.stringify(mobileBooking);
  const optionalTag = ' <span style="font-weight:400;opacity:0.6">(optional)</span>';
  const locationNote = locationType === 'phone'
    ? 'This is a phone appointment — we\'ll call you on the number you provide.'
    : locationType === 'video'
      ? (config.locationDetail ? 'This is a video appointment. Joining details: ' + locationDetail : 'This is a video appointment — a joining link will be emailed to you.')
      : (config.locationDetail ? 'Location: ' + locationDetail : null);
  let addressBlock = '';
  if (addressEnabled) {
    const addrField = `<div class="field">
            <label for="address">Address${addressRequired ? '' : optionalTag}</label>
            <textarea id="address" name="address" maxlength="300" ${addressRequired ? 'required' : ''} autocomplete="street-address"></textarea>
          </div>`;
    const findBtn = addressLookup === 'full' ? `<button type="button" id="address-find" class="pc-find-btn">Find address</button>` : '';
    const picker = addressLookup === 'full' ? `<select id="address-picker" class="address-picker" hidden></select>` : '';
    const pcHint = addressLookup === 'full' ? `<div class="pc-hint">Enter your postcode and tap <strong>Find address</strong>, then pick yours from the list.</div>` : '';
    const pcPlaceholder = addressLookup === 'full' ? ' placeholder="e.g. SW1A 1AA"' : '';
    const pcField = `<div class="field">
            <label for="postcode">Postcode${addressRequired ? '' : optionalTag}</label>
            ${pcHint}
            <div class="pc-row"><input type="text" id="postcode" name="postcode" maxlength="10" ${addressRequired ? 'required' : ''} autocomplete="postal-code"${pcPlaceholder} style="text-transform:uppercase">${findBtn}</div>
            ${picker}
            <div class="postcode-msg" id="postcode-msg" hidden></div>
          </div>`;
    addressBlock = addressLookup === 'full' ? (pcField + addrField) : (addrField + pcField);
  }
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

    .biz-logo {
      height: 28px;
      width: auto;
      max-width: 160px;
      object-fit: contain;
      display: block;
    }

    .biz-tagline {
      margin: 0;
      padding: 0.6rem 1.25rem 0;
      font-size: 0.9rem;
      opacity: 0.8;
    }

    /* ── Outer wrap ──────────────────────────────── */
    .wrap {
      max-width: 860px;
      margin: 0 auto;
      padding: 1.25rem 1rem 2.5rem;
    }

    .view[hidden] { display: none !important; }

    /* ── Fitting chooser (View 0) ───────────────── */
    .chooser-wrap {
      max-width: 520px;
      margin: 0 auto;
    }

    .chooser-heading {
      margin: 0 0 0.35rem;
      font-size: 1.125rem;
      font-weight: 700;
      text-align: center;
      line-height: 1.35;
    }

    .chooser-sub {
      margin: 0 0 1.25rem;
      font-size: 0.9375rem;
      opacity: 0.75;
      text-align: center;
    }

    .chooser-btns {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .chooser-btn {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      width: 100%;
      min-height: 72px;
      padding: 1rem 1.125rem;
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      color: #fff;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
    }

    .chooser-btn:hover {
      background: rgba(255,255,255,0.09);
      border-color: rgba(255,255,255,0.4);
    }

    .chooser-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .chooser-btn.selected {
      background: rgba(var(--accent-rgb), 0.14);
      border-color: rgba(var(--accent-rgb), 0.55);
      box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.25);
    }

    .chooser-icon {
      font-size: 1.5rem;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 0.1rem;
    }

    .chooser-text { flex: 1; min-width: 0; }

    .chooser-title {
      display: block;
      font-weight: 700;
      line-height: 1.3;
    }

    .chooser-desc {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.875rem;
      font-weight: 400;
      opacity: 0.75;
      line-height: 1.35;
    }

    .picker-back-chooser {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.75rem;
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

    .picker-back-chooser:hover { color: #fff; }
    .picker-back-chooser:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .mobile-intro {
      margin: 0 0 1.25rem;
      font-size: 0.9375rem;
      opacity: 0.85;
      line-height: 1.45;
    }

    .out-of-area-msg {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 1rem 1.1rem;
      margin: 0 0 1rem;
      font-size: 0.9375rem;
    }

    .out-of-area-msg p { margin: 0 0 0.5rem; }
    .out-of-area-msg p:last-child { margin-bottom: 0; }

    .mobile-postcode-chip {
      font-size: 0.8125rem;
      opacity: 0.75;
      margin: 0 0 0.75rem 1.25rem;
    }

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
    .field textarea,
    .field select {
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

    .field select option { color: #111; }

    .postcode-msg {
      margin-top: 0.35rem;
      font-size: 0.85rem;
    }
    .postcode-msg.bad { color: #ffb3b3; }
    .postcode-msg.warn { color: #ffd9a0; }
    .postcode-msg.ok { color: #9ff0c0; }

    .pc-hint {
      margin: -0.1rem 0 0.4rem;
      font-size: 0.8rem;
      opacity: 0.7;
    }

    .pc-row { display: flex; gap: 0.5rem; align-items: stretch; }
    .pc-row input { flex: 1; }
    .pc-find-btn {
      flex: 0 0 auto;
      padding: 0 0.9rem;
      border: 1px solid var(--accent);
      border-radius: 6px;
      background: var(--accent);
      color: var(--accent-fg, #0f1f3d);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .pc-find-btn:disabled { opacity: 0.6; cursor: default; }
    .address-picker { margin-top: 0.5rem; }
    /* The hidden attribute must win over the generic .field select display:block rule,
       otherwise an empty picker shows before any search has run. */
    .address-picker[hidden] { display: none; }
    .field textarea.addr-highlight { border-color: var(--accent); }

    .location-note {
      margin: 0 0 1rem;
      padding: 0.6rem 0.8rem;
      background: rgba(255,255,255,0.06);
      border-radius: 6px;
      font-size: 0.9rem;
      opacity: 0.9;
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

    ${regEnabled ? `
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
    }` : ''}

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
    ${logoUrl ? `<img class="biz-logo" src="${logoUrl}" alt="${displayName}">` : ''}
    ${logoUrl ? '' : `<span class="biz-name">${displayName}</span>`}
    <span class="biz-sep" aria-hidden="true">·</span>
    <span class="biz-meta">${fittingChooser ? 'Depot or mobile fitting' : 'Book a ' + slotDuration + '-min slot'}</span>
  </header>
  ${introLine ? `<p class="biz-tagline">${introLine}</p>` : ''}

  <div class="wrap">

    ${fittingChooser ? `<!-- View 0: depot / mobile chooser -->
    <div id="view-chooser" class="view">
      <div class="chooser-wrap">
        <p class="chooser-heading">Where would you like your tyres fitted?</p>
        <p class="chooser-sub">Depot slots are confirmed instantly. Mobile visits are requested — Howie confirms before your visit.</p>
        <div class="chooser-btns" role="group" aria-label="Fitting location">
          <button type="button" class="chooser-btn" id="choose-depot">
            <span class="chooser-icon" aria-hidden="true">&#128295;</span>
            <span class="chooser-text">
              <span class="chooser-title">At the depot — watch over a coffee</span>
              <span class="chooser-desc">Pick a half-hour slot and relax in HEhub while we work</span>
            </span>
          </button>
          <button type="button" class="chooser-btn" id="choose-mobile">
            <span class="chooser-icon" aria-hidden="true">&#128656;</span>
            <span class="chooser-text">
              <span class="chooser-title">At my home or work — we come to you</span>
              <span class="chooser-desc">${mobileBooking ? 'Pick a day and arrival window — we come to you' : "Tell us where to come and we'll get back to you to arrange"}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    ${mobileBooking ? `<!-- Mobile booking: postcode gate -->
    <div id="view-mobile-postcode" class="view" hidden>
      <div class="form-wrap">
        <button type="button" class="back-btn" id="mobile-pc-back-btn">← Back</button>
        <p class="mobile-intro">Where should we come to fit your tyres?</p>
        <div class="field">
          <label for="mobile-pc-input">Fitting postcode</label>
          <input type="text" id="mobile-pc-input" maxlength="10" autocomplete="postal-code" placeholder="e.g. SN1 2BL" style="text-transform:uppercase">
          <div class="postcode-msg" id="mobile-pc-msg" hidden></div>
        </div>
        <div class="out-of-area-msg" id="mobile-out-of-area" hidden>
          <p>You're just outside our mobile patch (about 15 miles from the depot).</p>
          <p>Give Ema a call on <a href="tel:01793876969" style="color:var(--accent)">01793 876 969</a> — we'll see what we can do.</p>
        </div>
        <button type="button" class="submit-btn" id="mobile-pc-continue">Continue</button>
      </div>
    </div>

    <!-- Mobile booking: day + arrival window picker -->
    <div id="view-mobile-picker" class="view" hidden>
      <button type="button" class="picker-back-chooser" id="mobile-picker-back">← Change fitting type</button>
      <p class="mobile-postcode-chip" id="mobile-postcode-chip"></p>
      <div class="picker-layout">
        <div class="cal-pane">
          <div class="cal-nav">
            <button type="button" class="cal-nav-btn" id="mob-cal-prev" aria-label="Previous month">&#8249;</button>
            <span class="cal-month-label" id="mob-cal-month-label"></span>
            <button type="button" class="cal-nav-btn" id="mob-cal-next" aria-label="Next month">&#8250;</button>
          </div>
          <div class="cal-dow-row" aria-hidden="true">
            <span>Mo</span><span>Tu</span><span>We</span><span>Th</span>
            <span>Fr</span><span>Sa</span><span class="cal-sun">Su</span>
          </div>
          <div class="cal-grid" id="mob-cal-grid" role="listbox" aria-label="Choose a date"></div>
        </div>
        <div class="slots-pane">
          <div class="slots-area" id="mob-windows-area">
            <p class="slots-hint" id="mob-windows-hint">Select a date to see arrival windows</p>
            <div class="slots-empty" id="mob-windows-empty" hidden>No windows available — try another day</div>
            <div id="mob-windows-content"></div>
          </div>
          <button type="button" class="continue-btn" id="mob-continue-btn" hidden>Continue →</button>
        </div>
      </div>
    </div>

    <!-- Mobile booking: details form -->
    <div id="view-mobile-form" class="view" hidden>
      <div class="form-wrap">
        <button type="button" class="back-btn" id="mobile-form-back-btn">← Back</button>
        <div class="booking-summary-card" id="mobile-summary-card">
          <div class="booking-summary-icon" aria-hidden="true">&#128656;</div>
          <div>
            <div class="booking-summary-text" id="mobile-summary-text"></div>
            <div class="booking-summary-sub">Mobile fitting · request</div>
          </div>
        </div>
        <form id="mobile-booking-form" novalidate>
          <div class="field">
            <label for="mob-name">Your name</label>
            <input type="text" id="mob-name" name="name" required maxlength="80" autocomplete="name">
          </div>
          <div class="field">
            <label for="mob-email">Email</label>
            <input type="email" id="mob-email" name="email" required autocomplete="email">
          </div>
          <div class="field">
            <label for="mob-phone">Phone number</label>
            <input type="tel" id="mob-phone" name="phone" required maxlength="30" autocomplete="tel">
          </div>
          ${regEnabled ? `<div class="field">
            <label for="mob-reg">Vehicle registration${optionalTag}</label>
            <input type="text" id="mob-reg" name="reg" maxlength="10" autocomplete="off" spellcheck="false" placeholder="e.g. AB12 CDE" style="text-transform:uppercase;letter-spacing:.05em">
            <div class="vehicle-card" id="mob-vehicle-card" hidden></div>
          </div>` : ''}
          <div class="field">
            <label for="mob-address">Fitting address</label>
            ${addressLookup === 'full' ? `<div class="pc-hint">Enter your postcode and tap <strong>Find address</strong>, then pick yours from the list.</div>` : ''}
            <div class="pc-row">
              <input type="text" id="mob-fitting-postcode" name="postcode" required maxlength="10" autocomplete="postal-code" placeholder="e.g. SN1 2BL" style="text-transform:uppercase">
              ${addressLookup === 'full' ? `<button type="button" id="mob-address-find" class="pc-find-btn">Find address</button>` : ''}
            </div>
            ${addressLookup === 'full' ? `<select id="mob-address-picker" class="address-picker" hidden></select>` : ''}
            <div class="postcode-msg" id="mob-addr-msg" hidden></div>
            <textarea id="mob-address" name="address" required maxlength="300" autocomplete="street-address"></textarea>
          </div>
          <div class="field">
            <label for="mob-note">Anything else we should know?${optionalTag}</label>
            <textarea id="mob-note" name="note" maxlength="500" placeholder="Tyre size, access notes, etc."></textarea>
          </div>
          <div class="hp-field" aria-hidden="true">
            <label for="mob-company">Company</label>
            <input type="text" id="mob-company" name="company" tabindex="-1" autocomplete="off">
          </div>
          <p class="form-error" id="mobile-booking-error" hidden>Something went wrong — please try again</p>
          <button type="submit" class="submit-btn" id="mobile-booking-submit">Request visit</button>
        </form>
      </div>
    </div>` : fittingChooser ? `<!-- Mobile enquiry view (legacy fallback) -->
    <div id="view-mobile-enquiry" class="view" hidden>
      <div class="form-wrap">
        <button type="button" class="back-btn" id="mobile-back-btn">← Back</button>
        <p class="mobile-intro">We'll come to you — tell us where and we'll call to arrange a time.</p>
        <form id="mobile-enquiry-form" novalidate>
          <div class="field">
            <label for="mob-postcode">Fitting postcode</label>
            <input type="text" id="mob-postcode" name="postcode" required maxlength="10" autocomplete="postal-code" placeholder="e.g. SN1 2BL" style="text-transform:uppercase">
            <div class="postcode-msg" id="mob-postcode-msg" hidden></div>
          </div>
          <div class="field">
            <label for="mob-address">Fitting address${optionalTag}</label>
            <textarea id="mob-address" name="fitting_address" maxlength="300" placeholder="House number and street — helps us find you" autocomplete="street-address"></textarea>
          </div>
          <div class="field">
            <label for="mob-name">Your name</label>
            <input type="text" id="mob-name" name="name" required maxlength="80" autocomplete="name">
          </div>
          <div class="field">
            <label for="mob-phone">Phone number</label>
            <input type="tel" id="mob-phone" name="phone" required maxlength="30" autocomplete="tel">
          </div>
          <div class="field">
            <label for="mob-email">Email${optionalTag}</label>
            <input type="email" id="mob-email" name="email" autocomplete="email">
          </div>
          ${regEnabled ? `<div class="field">
            <label for="mob-reg">Vehicle registration${optionalTag}</label>
            <input type="text" id="mob-reg" name="reg" maxlength="10" autocomplete="off" spellcheck="false" placeholder="e.g. AB12 CDE" style="text-transform:uppercase;letter-spacing:.05em">
            <div class="vehicle-card" id="mob-vehicle-card" hidden></div>
          </div>` : ''}
          <div class="hp-field" aria-hidden="true">
            <label for="mob-website">Website</label>
            <input type="text" id="mob-website" name="website" tabindex="-1" autocomplete="off">
          </div>
          <p class="form-error" id="mobile-form-error" hidden>Something went wrong — please try again</p>
          <button type="submit" class="submit-btn" id="mobile-submit-btn">Send enquiry</button>
        </form>
      </div>
    </div>` : ''}
` : ''}

    <!-- Picker view -->
    <div id="view-picker" class="view"${fittingChooser ? ' hidden' : ''}>
      ${fittingChooser ? '<button type="button" class="picker-back-chooser" id="picker-back-chooser">← Change fitting type</button>' : ''}
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
        ${locationNote ? `<p class="location-note">${locationNote}</p>` : ''}
        <form id="booking-form" novalidate>
          <div class="field">
            <label for="name">Name</label>
            <input type="text" id="name" name="name" required maxlength="80" autocomplete="name">
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autocomplete="email">
          </div>
          ${phoneEnabled ? `<div class="field">
            <label for="phone">Phone${phoneRequired ? '' : optionalTag}</label>
            <input type="tel" id="phone" name="phone" ${phoneRequired ? 'required' : ''} maxlength="30" autocomplete="tel">
          </div>` : ''}
          ${regEnabled ? `<div class="field">
            <label for="reg">Vehicle registration <span style="font-weight:400;opacity:0.6">(optional)</span></label>
            <input type="text" id="reg" name="reg" maxlength="10" autocomplete="off" spellcheck="false" placeholder="e.g. AB12 CDE" style="text-transform:uppercase;letter-spacing:.05em">
            <div class="vehicle-card" id="vehicle-card" hidden></div>
          </div>` : ''}
          ${addressBlock}
          ${customQuestions.map((q) => renderCustomQuestionField(q)).join('')}
          ${noteEnabled ? `<div class="field">
            <label for="note">${noteLabel}${noteRequired ? '' : optionalTag}</label>
            <textarea id="note" name="note" maxlength="500" ${noteRequired ? 'required' : ''} placeholder="${notePlaceholder}"></textarea>
          </div>` : ''}
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
        <h2>${successHeading}</h2>
        <div class="success-slot-card" id="success-slot-text"></div>
        <p>${successMessage}</p>
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
  var ADMIN_KEY = ${adminKeyJson};
  var TZ = 'Europe/London';
  var MAX_ADVANCE_DAYS = ${maxAdvanceDays};
  var WORKING_DOWS = ${workingDowsJson};
  var CUSTOM_QUESTIONS = ${customQuestionsJson};
  var ADDRESS_ENABLED = ${addressEnabledJson};
  var ADDRESS_LOOKUP = ${addressLookupJson};
  var FITTING_CHOOSER = ${fittingChooserJson};
  var MOBILE_BOOKING = ${mobileBookingJson};
  var MOBILE_ENQUIRY_URL = ${mobileEnquiryUrlJson};
  var UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\\s*[0-9][A-Z]{2}$/i;

  // DOM refs
  var viewChooser    = document.getElementById('view-chooser');
  var viewMobile     = document.getElementById('view-mobile-enquiry');
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
  var chooseDepotBtn   = document.getElementById('choose-depot');
  var chooseMobileBtn  = document.getElementById('choose-mobile');
  var pickerBackChooser = document.getElementById('picker-back-chooser');
  var mobileBackBtn    = document.getElementById('mobile-back-btn');
  var mobileEnquiryForm = document.getElementById('mobile-enquiry-form');
  var mobileFormError  = document.getElementById('mobile-form-error');
  var mobileSubmitBtn  = document.getElementById('mobile-submit-btn');

  // State
  // The initial calendar render happens only via bootCalendarIfNeeded(), which
  // is called for the reschedule and no-chooser boot paths and on chooser-button
  // click. So this MUST start false — otherwise that first render is skipped and
  // the day grid renders empty (e.g. the amend/reschedule flow).
  var calendarBooted = false;
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

  ${regEnabled ? `
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
      var val = this.value.replace(/[\\s]+/g, '').toUpperCase();
      if (val.length >= 5) {
        regLookupTimer = setTimeout(function () { lookupReg(val); }, 1200);
      }
    });
    regInputEl.addEventListener('blur', function () {
      clearTimeout(regLookupTimer);
      var val = this.value.replace(/[\\s]+/g, '').toUpperCase();
      var card = document.getElementById('vehicle-card');
      if (val.length >= 5 && card && card.hidden) lookupReg(val);
    });
  }
  ` : ''}

  // ── View switching ───────────────────────────────

  function showView(name) {
    if (viewChooser) viewChooser.hidden = name !== 'chooser';
    viewPicker.hidden  = name !== 'picker';
    if (viewMobile) viewMobile.hidden = name !== 'mobile';
    var viewMobilePc = document.getElementById('view-mobile-postcode');
    var viewMobilePicker = document.getElementById('view-mobile-picker');
    var viewMobileForm = document.getElementById('view-mobile-form');
    if (viewMobilePc) viewMobilePc.hidden = name !== 'mobile-postcode';
    if (viewMobilePicker) viewMobilePicker.hidden = name !== 'mobile-picker';
    if (viewMobileForm) viewMobileForm.hidden = name !== 'mobile-form';
    viewForm.hidden    = name !== 'form';
    viewSuccess.hidden = name !== 'success';
  }

  function bootCalendarIfNeeded() {
    if (calendarBooted) return;
    calendarBooted = true;
    loadMonthAvailability(currentMonth);
    renderCalendar();
    var p = currentMonth.split('-').map(Number);
    var nextMonth = new Date(Date.UTC(p[0], p[1], 1)).toISOString().slice(0, 7);
    if (nextMonth <= maxMonth) loadMonthAvailability(nextMonth);
  }

  if (FITTING_CHOOSER && !RESCHEDULE_TOKEN) {
    if (chooseDepotBtn) {
      chooseDepotBtn.addEventListener('click', function () {
        bootCalendarIfNeeded();
        showView('picker');
      });
    }
    if (chooseMobileBtn) {
      chooseMobileBtn.addEventListener('click', function () {
        if (MOBILE_BOOKING) {
          showView('mobile-postcode');
          return;
        }
        if (mobileFormError) mobileFormError.hidden = true;
        showView('mobile');
      });
    }
    if (pickerBackChooser) {
      pickerBackChooser.addEventListener('click', function () {
        selectedDate = null;
        selectedTime = null;
        selectedSlot = null;
        clearSlotsUI();
        slotsHint.hidden = false;
        showView('chooser');
      });
    }
    if (mobileBackBtn) {
      mobileBackBtn.addEventListener('click', function () {
        if (mobileFormError) mobileFormError.hidden = true;
        showView('chooser');
      });
    }
  }

  // ── Mobile booking flow (M2) ─────────────────────

  if (MOBILE_BOOKING) {
    var mobilePostcode = '';
    var mobileSelectedDate = null;
    var mobileSelectedWindow = null;
    var mobileWindowLabel = '';
    var mobileVehicleSummary = null;
    var mobCalendarBooted = false;
    var mobCurrentMonth = todayIso.slice(0, 7);
    var mobFetchToken = 0;

    var mobCalGrid = document.getElementById('mob-cal-grid');
    var mobCalMonthLabel = document.getElementById('mob-cal-month-label');
    var mobCalPrev = document.getElementById('mob-cal-prev');
    var mobCalNext = document.getElementById('mob-cal-next');
    var mobWindowsHint = document.getElementById('mob-windows-hint');
    var mobWindowsEmpty = document.getElementById('mob-windows-empty');
    var mobWindowsContent = document.getElementById('mob-windows-content');
    var mobContinueBtn = document.getElementById('mob-continue-btn');

    function setMobilePcMsg(kind, text) {
      var m = document.getElementById('mobile-pc-msg');
      if (!m) return;
      if (!text) { m.hidden = true; return; }
      m.hidden = false; m.className = 'postcode-msg ' + kind; m.textContent = text;
    }

    function setMobAddrMsg(kind, text) {
      var m = document.getElementById('mob-addr-msg');
      if (!m) return;
      if (!text) { m.hidden = true; return; }
      m.hidden = false; m.className = 'postcode-msg ' + kind; m.textContent = text;
    }

    function formatMobileSummary(iso, windowId) {
      var p = iso.split('-').map(Number);
      var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
      var dateStr = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ
      }).format(d);
      return dateStr + ' · ' + (windowId === 'am' ? 'Morning' : 'Afternoon');
    }

    function bootMobileCalendar() {
      if (mobCalendarBooted) return;
      mobCalendarBooted = true;
      loadMonthAvailability(mobCurrentMonth);
      renderMobileCalendar();
    }

    function renderMobileCalendar() {
      if (!mobCalGrid) return;
      mobCalMonthLabel.textContent = monthLabel(mobCurrentMonth);
      mobCalPrev.disabled = mobCurrentMonth <= todayIso.slice(0, 7);
      mobCalNext.disabled = mobCurrentMonth >= maxMonth;

      var days = monthDays(mobCurrentMonth);
      var firstDow = isoUTCDay(days[0]);
      var offset = firstDow === 0 ? 6 : firstDow - 1;
      var cacheEntry = monthCache[mobCurrentMonth];
      var isLoading = monthLoading[mobCurrentMonth] && !cacheEntry;
      var available = cacheEntry && !cacheEntry.error ? cacheEntry.available : null;

      mobCalGrid.textContent = '';
      for (var i = 0; i < offset; i++) {
        var empty = document.createElement('span');
        empty.className = 'cal-cell cal-empty';
        mobCalGrid.appendChild(empty);
      }

      days.forEach(function (iso) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-cell';
        btn.dataset.date = iso;
        btn.setAttribute('role', 'option');
        btn.textContent = parseInt(iso.split('-')[2], 10);

        var isPast = iso < todayIso;
        var notWorking = !isWorkingDay(iso);
        var notAvail = available !== null && available.indexOf(iso) === -1;
        var isUnavail = isPast || notWorking || notAvail;

        if (iso === todayIso) btn.classList.add('cal-today');
        if (iso === mobileSelectedDate) btn.classList.add('selected');

        if (isUnavail) {
          btn.disabled = true;
          btn.classList.add('unavailable');
        } else if (isLoading && !isPast && !notWorking) {
          btn.classList.add('cal-loading-day');
        }

        if (!isUnavail) {
          btn.addEventListener('click', function () { selectMobileDay(this.dataset.date); });
        }
        mobCalGrid.appendChild(btn);
      });
    }

    function clearMobileWindowsUI() {
      if (mobWindowsContent) mobWindowsContent.textContent = '';
      if (mobWindowsHint) mobWindowsHint.hidden = false;
      if (mobWindowsEmpty) mobWindowsEmpty.hidden = true;
      if (mobContinueBtn) mobContinueBtn.hidden = true;
      mobileSelectedWindow = null;
      mobileWindowLabel = '';
    }

    async function loadMobileWindows(iso) {
      var token = ++mobFetchToken;
      clearMobileWindowsUI();
      if (mobWindowsHint) mobWindowsHint.hidden = true;
      if (mobWindowsContent) {
        mobWindowsContent.textContent = '';
        var skel = document.createElement('div');
        skel.className = 'slots-skeleton-grid';
        for (var i = 0; i < 4; i++) {
          var s = document.createElement('div');
          s.className = 'slot-skeleton-btn';
          mobWindowsContent.appendChild(s);
        }
      }

      try {
        var url = '/' + SLUG + '/mobile-windows?date=' + encodeURIComponent(iso) +
          '&postcode=' + encodeURIComponent(mobilePostcode);
        var res = await fetch(url);
        var data = await res.json();
        if (token !== mobFetchToken) return;
        if (mobWindowsContent) mobWindowsContent.textContent = '';

        if (!res.ok || data.inArea === false) {
          if (mobWindowsEmpty) {
            mobWindowsEmpty.hidden = false;
            mobWindowsEmpty.textContent = data.inArea === false
              ? 'Outside our mobile area for this postcode'
              : 'Unable to load windows — please try again';
          }
          return;
        }

        var availableWindows = (data.windows || []).filter(function (w) { return w.available; });
        if (!availableWindows.length) {
          if (mobWindowsEmpty) mobWindowsEmpty.hidden = false;
          return;
        }

        var lbl = document.createElement('p');
        lbl.className = 'slot-group-label';
        lbl.textContent = 'Arrival window';
        mobWindowsContent.appendChild(lbl);

        var grid = document.createElement('div');
        grid.className = 'slots-grid';
        availableWindows.forEach(function (w) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'time-btn';
          btn.textContent = w.label;
          btn.dataset.window = w.id;
          if (w.id === mobileSelectedWindow) btn.classList.add('selected');
          btn.addEventListener('click', function () { selectMobileWindow(w.id, w.label); });
          grid.appendChild(btn);
        });
        mobWindowsContent.appendChild(grid);
      } catch (e) {
        if (token !== mobFetchToken) return;
        if (mobWindowsContent) mobWindowsContent.textContent = '';
        if (mobWindowsEmpty) {
          mobWindowsEmpty.hidden = false;
          mobWindowsEmpty.textContent = 'Unable to load windows — please try again';
        }
      }
    }

    function selectMobileDay(iso) {
      mobileSelectedDate = iso;
      mobileSelectedWindow = null;
      mobileWindowLabel = '';
      if (mobContinueBtn) mobContinueBtn.hidden = true;
      renderMobileCalendar();
      loadMobileWindows(iso);
    }

    function selectMobileWindow(id, label) {
      mobileSelectedWindow = id;
      mobileWindowLabel = label;
      mobWindowsContent.querySelectorAll('.time-btn').forEach(function (btn) {
        btn.classList.toggle('selected', btn.dataset.window === id);
      });
      if (mobContinueBtn) mobContinueBtn.hidden = false;
    }

    var mobilePcBack = document.getElementById('mobile-pc-back-btn');
    var mobilePcContinue = document.getElementById('mobile-pc-continue');
    var mobilePcInput = document.getElementById('mobile-pc-input');
    var mobileOutOfArea = document.getElementById('mobile-out-of-area');
    var mobilePickerBack = document.getElementById('mobile-picker-back');
    var mobileFormBack = document.getElementById('mobile-form-back-btn');
    var mobileBookingForm = document.getElementById('mobile-booking-form');
    var mobileBookingError = document.getElementById('mobile-booking-error');
    var mobileBookingSubmit = document.getElementById('mobile-booking-submit');
    var mobileSummaryText = document.getElementById('mobile-summary-text');
    var mobFittingPostcode = document.getElementById('mob-fitting-postcode');

    if (mobilePcBack) {
      mobilePcBack.addEventListener('click', function () { showView('chooser'); });
    }

    if (mobilePickerBack) {
      mobilePickerBack.addEventListener('click', function () {
        mobileSelectedDate = null;
        mobileSelectedWindow = null;
        clearMobileWindowsUI();
        showView('chooser');
      });
    }

    if (mobileFormBack) {
      mobileFormBack.addEventListener('click', function () {
        if (mobileBookingError) mobileBookingError.hidden = true;
        showView('mobile-picker');
        renderMobileCalendar();
        if (mobileSelectedDate) loadMobileWindows(mobileSelectedDate);
      });
    }

    if (mobilePcInput) {
      mobilePcInput.addEventListener('input', function () {
        if (mobileOutOfArea) mobileOutOfArea.hidden = true;
        if (mobilePcContinue) mobilePcContinue.hidden = false;
      });
    }

    if (mobilePcContinue) {
      mobilePcContinue.addEventListener('click', async function () {
        if (!mobilePcInput) return;
        var pc = mobilePcInput.value.trim();
        if (!UK_POSTCODE_RE.test(pc)) {
          setMobilePcMsg('bad', 'Please enter a valid UK postcode');
          mobilePcInput.focus();
          return;
        }
        mobilePcContinue.disabled = true;
        if (mobileOutOfArea) mobileOutOfArea.hidden = true;
        setMobilePcMsg('', '');

        try {
          var res = await fetch('/' + SLUG + '/mobile-windows?date=' + encodeURIComponent(todayIso) +
            '&postcode=' + encodeURIComponent(pc));
          var data = await res.json();
          if (data.inArea === false) {
            if (mobileOutOfArea) mobileOutOfArea.hidden = false;
            if (mobilePcContinue) mobilePcContinue.hidden = true;
            return;
          }
          if (!res.ok) {
            setMobilePcMsg('bad', 'Could not check that postcode — please try again');
            return;
          }
          mobilePostcode = pc.toUpperCase();
          var chip = document.getElementById('mobile-postcode-chip');
          if (chip) chip.textContent = 'Fitting postcode: ' + mobilePostcode;
          if (mobFittingPostcode) mobFittingPostcode.value = mobilePostcode;
          mobCurrentMonth = todayIso.slice(0, 7);
          mobileSelectedDate = null;
          mobileSelectedWindow = null;
          clearMobileWindowsUI();
          bootMobileCalendar();
          showView('mobile-picker');
        } catch (e) {
          setMobilePcMsg('bad', 'Could not check that postcode — please try again');
        } finally {
          mobilePcContinue.disabled = false;
        }
      });
    }

    if (mobCalPrev) {
      mobCalPrev.addEventListener('click', function () {
        var p = mobCurrentMonth.split('-').map(Number);
        mobCurrentMonth = new Date(Date.UTC(p[0], p[1] - 2, 1)).toISOString().slice(0, 7);
        if (!monthCache[mobCurrentMonth]) loadMonthAvailability(mobCurrentMonth);
        renderMobileCalendar();
        clearMobileWindowsUI();
        mobileSelectedDate = null;
      });
    }

    if (mobCalNext) {
      mobCalNext.addEventListener('click', function () {
        var p = mobCurrentMonth.split('-').map(Number);
        mobCurrentMonth = new Date(Date.UTC(p[0], p[1], 1)).toISOString().slice(0, 7);
        if (!monthCache[mobCurrentMonth]) loadMonthAvailability(mobCurrentMonth);
        renderMobileCalendar();
        clearMobileWindowsUI();
        mobileSelectedDate = null;
      });
    }

    if (mobContinueBtn) {
      mobContinueBtn.addEventListener('click', function () {
        if (!mobileSelectedDate || !mobileSelectedWindow) return;
        if (mobileSummaryText) {
          mobileSummaryText.textContent = formatMobileSummary(mobileSelectedDate, mobileSelectedWindow);
        }
        if (mobileBookingError) mobileBookingError.hidden = true;
        showView('mobile-form');
      });
    }

    // Postcoder address finder for mobile form
    (function wireMobileAddress() {
      var findBtn = document.getElementById('mob-address-find');
      var picker = document.getElementById('mob-address-picker');
      var addrEl = document.getElementById('mob-address');
      var pcEl = mobFittingPostcode;
      var found = [];
      if (!findBtn || !pcEl) return;

      findBtn.addEventListener('click', async function () {
        var pc = pcEl.value.trim();
        if (!UK_POSTCODE_RE.test(pc)) { setMobAddrMsg('bad', 'Please enter a valid UK postcode'); return; }
        findBtn.disabled = true;
        var orig = findBtn.textContent;
        findBtn.textContent = 'Searching…';
        try {
          var r = await fetch('/' + SLUG + '/address-lookup?postcode=' + encodeURIComponent(pc));
          var d = await r.json().catch(function () { return null; });
          if (!r.ok || !d) {
            setMobAddrMsg('warn', 'Our address finder is unavailable — type your address below.');
            return;
          }
          found = d.addresses || [];
          if (!found.length) {
            if (picker) picker.hidden = true;
            setMobAddrMsg('bad', "We couldn't find an address — please type it below.");
            return;
          }
          if (picker) {
            var opts = '<option value="">' + found.length + ' found — choose yours…</option>';
            for (var i = 0; i < found.length; i++) {
              opts += '<option value="' + i + '">' + found[i].summary.replace(/</g, '&lt;') + '</option>';
            }
            picker.innerHTML = opts;
            picker.hidden = false;
          }
          setMobAddrMsg('ok', 'Select your address below');
        } catch (e) {
          setMobAddrMsg('warn', 'Our address finder is unavailable — type your address below.');
        } finally {
          findBtn.disabled = false;
          findBtn.textContent = orig;
        }
      });

      if (picker) {
        picker.addEventListener('change', function () {
          if (picker.value === '') return;
          var a = found[picker.value];
          if (!a || !addrEl) return;
          addrEl.value = [a.line1, a.line2, a.town].filter(function (x) { return x; }).join('\\n');
          if (a.postcode) pcEl.value = a.postcode;
          setMobAddrMsg('ok', '✓ Address selected');
        });
      }
    })();

    ${regEnabled ? `
    var mobRegInput2 = document.getElementById('mob-reg');
    var mobRegTimer2 = null;
    function setMobVehicleCard2(state, html) {
      var card = document.getElementById('mob-vehicle-card');
      if (!card) return;
      card.hidden = (state === 'hidden');
      card.className = 'vehicle-card' +
        (state === 'found' ? ' vc-found' : state === 'miss' ? ' vc-miss' : '');
      card.innerHTML = html;
    }
    if (mobRegInput2) {
      mobRegInput2.addEventListener('input', function () {
        mobileVehicleSummary = null;
        clearTimeout(mobRegTimer2);
        setMobVehicleCard2('hidden', '');
        var val = this.value.replace(/[\\s]+/g, '').toUpperCase();
        if (val.length >= 5) {
          mobRegTimer2 = setTimeout(async function () {
            setMobVehicleCard2('loading', '<span class="vc-spinner" aria-hidden="true"></span> Looking up…');
            try {
              var res = await fetch('https://neobookworm.uk/api/reg-lookup?reg=' + encodeURIComponent(val));
              var data = await res.json();
              if (data.error || !data.vehicle) {
                setMobVehicleCard2('miss', "— Not recognised — we'll confirm when Howie calls");
                return;
              }
              var v = data.vehicle;
              var label = [
                [v.make, v.model].filter(Boolean).join(' '),
                [v.colour, v.year].filter(Boolean).join(' · '),
              ].filter(Boolean).join(' · ');
              mobileVehicleSummary = label || null;
              if (label) setMobVehicleCard2('found', '🚗 ' + safeText(label));
              else setMobVehicleCard2('hidden', '');
            } catch (e) {
              setMobVehicleCard2('miss', "Couldn't look that up right now");
            }
          }, 1200);
        }
      });
    }
    ` : ''}

    if (mobileBookingForm) {
      mobileBookingForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (mobileBookingError) mobileBookingError.hidden = true;
        if (!mobileBookingForm.reportValidity()) return;
        if (!mobileSelectedDate || !mobileSelectedWindow) return;

        mobileBookingSubmit.disabled = true;
        var origLabel = mobileBookingSubmit.textContent;
        mobileBookingSubmit.textContent = 'Sending request…';

        var mobRegEl = document.getElementById('mob-reg');
        var payload = {
          date: mobileSelectedDate,
          arrivalWindow: mobileSelectedWindow,
          postcode: mobFittingPostcode ? mobFittingPostcode.value.trim().toUpperCase() : mobilePostcode,
          name: document.getElementById('mob-name').value.trim(),
          email: document.getElementById('mob-email').value.trim(),
          phone: document.getElementById('mob-phone').value.trim(),
          address: document.getElementById('mob-address').value.trim(),
          note: document.getElementById('mob-note').value.trim() || null,
          reg: mobRegEl ? mobRegEl.value.replace(/[\\s]+/g, '').toUpperCase() : null,
          vehicleSummary: mobileVehicleSummary,
          company: document.getElementById('mob-company').value.trim(),
        };

        try {
          var res = await fetch('/' + SLUG + '/mobile-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          var data = await res.json().catch(function () { return {}; });

          if (res.ok && data.ok) {
            successSlotText.textContent = data.arrivalLabel || formatMobileSummary(mobileSelectedDate, mobileSelectedWindow);
            var successH2 = document.querySelector('#view-success h2');
            if (successH2) successH2.textContent = 'Request received';
            var successP = document.querySelector('#view-success .success-wrap > p');
            if (successP) successP.textContent = 'Howie will confirm your visit shortly — watch for a confirmation email.';
            if (icsBtn) icsBtn.hidden = true;
            showView('success');
            try { window.parent.postMessage('booking-confirmed', '*'); } catch (e) {}
            return;
          }

          if (mobileBookingError) {
            mobileBookingError.hidden = false;
            if (data.error === 'window_unavailable') {
              mobileBookingError.textContent = 'That window was just taken — please go back and pick another.';
            } else if (data.error === 'out_of_area') {
              mobileBookingError.textContent = 'That postcode is outside our mobile area.';
            } else {
              mobileBookingError.textContent = 'Something went wrong — please try again or call 01793 876 969';
            }
          }
        } catch (err) {
          if (mobileBookingError) {
            mobileBookingError.hidden = false;
            mobileBookingError.textContent = 'Something went wrong — please try again or call 01793 876 969';
          }
        }

        mobileBookingSubmit.textContent = origLabel;
        mobileBookingSubmit.disabled = false;
      });
    }
  }

  function setMobPostcodeMsg(kind, text) {
    var m = document.getElementById('mob-postcode-msg');
    if (!m) return;
    if (!text) { m.hidden = true; return; }
    m.hidden = false; m.className = 'postcode-msg ' + kind; m.textContent = text;
  }

  if (FITTING_CHOOSER && MOBILE_ENQUIRY_URL) {
    var mobPcEl = document.getElementById('mob-postcode');
    if (mobPcEl) {
      mobPcEl.addEventListener('blur', async function () {
        var pc = mobPcEl.value.trim();
        if (!pc) { setMobPostcodeMsg('', ''); return; }
        if (!UK_POSTCODE_RE.test(pc)) { setMobPostcodeMsg('bad', 'Please enter a valid UK postcode'); return; }
        var a = await postcodeArea(pc);
        if (!a.valid) setMobPostcodeMsg('bad', 'We could not find that postcode');
        else setMobPostcodeMsg('ok', a.area ? '✓ ' + a.area : '');
      });
    }

    ${regEnabled ? `
    var mobRegInput = document.getElementById('mob-reg');
    var mobRegTimer = null;
    function setMobVehicleCard(state, html) {
      var card = document.getElementById('mob-vehicle-card');
      if (!card) return;
      card.hidden = (state === 'hidden');
      card.className = 'vehicle-card' +
        (state === 'found' ? ' vc-found' : state === 'miss' ? ' vc-miss' : '');
      card.innerHTML = html;
    }
    async function lookupMobReg(reg) {
      setMobVehicleCard('loading', '<span class="vc-spinner" aria-hidden="true"></span> Looking up…');
      try {
        var res = await fetch('https://neobookworm.uk/api/reg-lookup?reg=' + encodeURIComponent(reg));
        var data = await res.json();
        if (data.error || !data.vehicle) {
          setMobVehicleCard('miss', "— Not recognised — we'll confirm when we call");
          return;
        }
        var v = data.vehicle;
        var label = [
          [v.make, v.model].filter(Boolean).join(' '),
          [v.colour, v.year].filter(Boolean).join(' · '),
        ].filter(Boolean).join(' · ');
        if (!label) { setMobVehicleCard('hidden', ''); return; }
        setMobVehicleCard('found', '🚗 ' + safeText(label));
      } catch (e) {
        setMobVehicleCard('miss', "Couldn't look that up right now");
      }
    }
    if (mobRegInput) {
      mobRegInput.addEventListener('input', function () {
        clearTimeout(mobRegTimer);
        setMobVehicleCard('hidden', '');
        var val = this.value.replace(/[\\s]+/g, '').toUpperCase();
        if (val.length >= 5) {
          mobRegTimer = setTimeout(function () { lookupMobReg(val); }, 1200);
        }
      });
    }
    ` : ''}

    if (mobileEnquiryForm) {
      mobileEnquiryForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (mobileFormError) mobileFormError.hidden = true;
        if (!mobileEnquiryForm.reportValidity()) return;

        var mobPc = document.getElementById('mob-postcode');
        var pc = mobPc ? mobPc.value.trim() : '';
        if (!UK_POSTCODE_RE.test(pc)) {
          setMobPostcodeMsg('bad', 'Please enter a valid UK postcode');
          if (mobPc) mobPc.focus();
          return;
        }
        var area = await postcodeArea(pc);
        if (!area.valid) {
          setMobPostcodeMsg('bad', 'We could not find that postcode — please check it');
          if (mobPc) mobPc.focus();
          return;
        }

        mobileSubmitBtn.disabled = true;
        var mobOrigLabel = mobileSubmitBtn.textContent;
        mobileSubmitBtn.textContent = '';
        var mobSpin = document.createElement('span');
        mobSpin.className = 'spinner';
        mobSpin.setAttribute('aria-hidden', 'true');
        mobileSubmitBtn.appendChild(mobSpin);
        mobileSubmitBtn.appendChild(document.createTextNode('Sending…'));

        function mobVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
        var mobRegEl = document.getElementById('mob-reg');
        var payload = {
          enquiry_type: 'mobile',
          name: mobVal('mob-name'),
          phone: mobVal('mob-phone'),
          email: mobVal('mob-email'),
          postcode: pc.toUpperCase(),
          fitting_address: mobVal('mob-address') || null,
          reg: mobRegEl ? mobRegEl.value.replace(/[\\s]+/g, '').toUpperCase() : null,
          vehicle_make: null,
          vehicle_model: null,
          website: mobVal('mob-website'),
        };

        try {
          var mobRes = await fetch(MOBILE_ENQUIRY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          var mobData = await mobRes.json().catch(function () { return {}; });

          if (mobRes.ok && mobData.ok) {
            successSlotText.textContent = 'Mobile fitting enquiry sent';
            var successH2 = document.querySelector('#view-success h2');
            if (successH2) successH2.textContent = 'Enquiry received';
            var successP = document.querySelector('#view-success .success-wrap > p');
            if (successP) successP.textContent = "Thanks — we'll call you shortly to arrange your visit.";
            if (icsBtn) icsBtn.hidden = true;
            showView('success');
            return;
          }

          if (mobileFormError) {
            mobileFormError.hidden = false;
            mobileFormError.textContent = mobData.error || 'Something went wrong — please try again or call 01793 876 969';
          }
        } catch (err) {
          if (mobileFormError) {
            mobileFormError.hidden = false;
            mobileFormError.textContent = 'Something went wrong — please try again or call 01793 876 969';
          }
        }

        mobileSubmitBtn.replaceChildren();
        mobileSubmitBtn.textContent = mobOrigLabel;
        mobileSubmitBtn.disabled = false;
      });
    }
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

  function setPostcodeMsg(kind, text) {
    var m = document.getElementById('postcode-msg');
    if (!m) return;
    if (!text) { m.hidden = true; return; }
    m.hidden = false; m.className = 'postcode-msg ' + kind; m.textContent = text;
  }

  // Free postcodes.io lookup — returns { valid, area }. Fails open on network error.
  async function postcodeArea(pc) {
    try {
      var r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc.replace(/[\\s]+/g, '')));
      if (r.status === 404) return { valid: false, area: null };
      if (!r.ok) return { valid: true, area: null };
      var d = await r.json();
      if (!d || !d.result) return { valid: false, area: null };
      var parts = [d.result.admin_district, d.result.region].filter(function (x) { return x; });
      return { valid: true, area: parts.join(', ') };
    } catch (e) { return { valid: true, area: null }; }
  }

  // Postcode UX: free area-confirmation on blur, or full Ideal Postcodes finder.
  (function wireAddress() {
    var pcEl = document.getElementById('postcode');
    if (!pcEl || !ADDRESS_ENABLED) return;
    if (ADDRESS_LOOKUP !== 'full') {
      pcEl.addEventListener('blur', async function () {
        var pc = pcEl.value.trim();
        if (!pc) { setPostcodeMsg('', ''); return; }
        if (!UK_POSTCODE_RE.test(pc)) { setPostcodeMsg('bad', 'Please enter a valid UK postcode'); return; }
        var a = await postcodeArea(pc);
        if (!a.valid) setPostcodeMsg('bad', 'We could not find that postcode');
        else setPostcodeMsg('ok', a.area ? '✓ ' + a.area : '');
      });
      return;
    }
    var findBtn = document.getElementById('address-find');
    var picker = document.getElementById('address-picker');
    var addrEl = document.getElementById('address');
    var found = [];
    // Service-down fallback: point the customer at the manual Address box and make it
    // obvious. Used when the finder is unavailable (out of credit, rate-limited, etc.).
    function revealManualAddress() {
      if (!addrEl) return;
      addrEl.classList.add('addr-highlight');
      try { addrEl.focus(); } catch (e) {}
      try { addrEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    }
    if (addrEl) addrEl.addEventListener('input', function () { addrEl.classList.remove('addr-highlight'); });
    if (findBtn) findBtn.addEventListener('click', async function () {
      var pc = pcEl.value.trim();
      if (!UK_POSTCODE_RE.test(pc)) { setPostcodeMsg('bad', 'Please enter a valid UK postcode'); return; }
      findBtn.disabled = true;
      var orig = findBtn.textContent;
      findBtn.textContent = 'Searching…';
      try {
        var r = await fetch('/' + SLUG + '/address-lookup?postcode=' + encodeURIComponent(pc));
        var d = await r.json().catch(function () { return null; });
        if (!r.ok || !d) {
          // Service problem (out of credit 502, rate-limited 429, missing key 500, bad JSON).
          // Not the customer's fault — don't blame their postcode; offer manual entry.
          if (picker) picker.hidden = true;
          setPostcodeMsg('warn', 'Our address finder is unavailable right now — just type your address below.');
          revealManualAddress();
          return;
        }
        found = d.addresses || [];
        if (!found.length) {
          if (picker) picker.hidden = true;
          setPostcodeMsg('bad', "We couldn't find an address for that postcode — please type it below.");
          revealManualAddress();
          return;
        }
        if (picker) {
          var opts = '<option value="">' + found.length + ' found — choose yours…</option>';
          for (var i = 0; i < found.length; i++) opts += '<option value="' + i + '">' + found[i].summary.replace(/</g, '&lt;') + '</option>';
          picker.innerHTML = opts;
          picker.hidden = false;
          try { picker.focus(); } catch (e) {}
        }
        setPostcodeMsg('ok', 'Select your address below');
      } catch (e) {
        // Network throw (offline / blocked) — same graceful manual fallback.
        if (picker) picker.hidden = true;
        setPostcodeMsg('warn', 'Our address finder is unavailable right now — just type your address below.');
        revealManualAddress();
      }
      finally { findBtn.disabled = false; findBtn.textContent = orig; }
    });
    if (picker) picker.addEventListener('change', function () {
      if (picker.value === '') return;
      var a = found[picker.value];
      if (!a) return;
      if (addrEl) {
        addrEl.value = [a.line1, a.line2, a.town].filter(function (x) { return x; }).join('\\n');
        addrEl.classList.remove('addr-highlight');
      }
      if (a.postcode) pcEl.value = a.postcode;
      setPostcodeMsg('ok', '✓ Address selected');
    });
  })();

  bookingForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.hidden = true;
    if (!RESCHEDULE_TOKEN && !bookingForm.reportValidity()) return;

    if (!RESCHEDULE_TOKEN && ADDRESS_ENABLED) {
      var pcEl = document.getElementById('postcode');
      var pc = pcEl ? pcEl.value.trim() : '';
      if (pc) {
        if (!UK_POSTCODE_RE.test(pc)) {
          setPostcodeMsg('bad', 'Please enter a valid UK postcode');
          if (pcEl) pcEl.focus();
          return;
        }
        var area = await postcodeArea(pc);
        if (!area.valid) {
          setPostcodeMsg('bad', 'We could not find that postcode — please check it');
          if (pcEl) pcEl.focus();
          return;
        }
        setPostcodeMsg('ok', area.area ? '✓ ' + area.area : '');
      }
    }

    submitBtn.disabled = true;
    var origLabel = submitBtn.textContent;
    submitBtn.textContent = '';
    var spin = document.createElement('span');
    spin.className = 'spinner';
    spin.setAttribute('aria-hidden', 'true');
    submitBtn.appendChild(spin);
    submitBtn.appendChild(document.createTextNode(RESCHEDULE_TOKEN ? 'Rescheduling…' : 'Booking…'));

    function getVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function collectCustomAnswers() {
      var ans = {};
      for (var i = 0; i < CUSTOM_QUESTIONS.length; i++) {
        var q = CUSTOM_QUESTIONS[i];
        var el = document.getElementById('cq-' + q.id);
        if (!el) continue;
        ans[q.id] = (q.type === 'checkbox') ? el.checked : el.value.trim();
      }
      return ans;
    }

    var endpoint = RESCHEDULE_TOKEN ? ('/' + SLUG + '/reschedule') : ('/' + SLUG + '/book');
    var body = RESCHEDULE_TOKEN
      ? { token: RESCHEDULE_TOKEN, slot: selectedSlot, adminKey: ADMIN_KEY }
      : {
          slot:           selectedSlot,
          name:           getVal('name'),
          email:          getVal('email'),
          phone:          getVal('phone'),
          note:           getVal('note') || null,
          company:        getVal('company'),
          reg:            (document.getElementById('reg')?.value.replace(/[\\s]+/g, '').toUpperCase()) || null,
          vehicleSummary: vehicleSummary || null,
          address:        getVal('address') || null,
          postcode:       getVal('postcode').toUpperCase() || null,
          customAnswers:  collectCustomAnswers(),
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
        var successP = document.querySelector('#view-success .success-wrap > p');
        if (successP) successP.textContent = ${JSON.stringify(successMessage)};
        if (icsBtn) icsBtn.hidden = false;
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
      var successH2 = document.querySelector('#view-success h2');
      if (successH2) successH2.textContent = ${JSON.stringify(successHeading)};
      var successP = document.querySelector('#view-success .success-wrap > p');
      if (successP) successP.textContent = ${JSON.stringify(successMessage)};
      if (icsBtn) icsBtn.hidden = false;
      if (mobileEnquiryForm) mobileEnquiryForm.reset();
      var mobVc = document.getElementById('mob-vehicle-card');
      if (mobVc) mobVc.hidden = true;
      setMobPostcodeMsg('', '');
      if (FITTING_CHOOSER && !RESCHEDULE_TOKEN) {
        showView('chooser');
      } else {
        showView('picker');
      }
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

  if (RESCHEDULE_TOKEN) {
    showView('picker');
    bootCalendarIfNeeded();
  } else if (FITTING_CHOOSER) {
    showView('chooser');
  } else {
    bootCalendarIfNeeded();
  }

})();
  </script>
</body>
</html>`;
}

// ── Manage page (cancel / reschedule) ────────────────────────────────────────

export function renderManagePage(booking, state, config, slug, opts = {}) {
  const isAdmin = !!opts.isAdmin;
  const adminKey = opts.adminKey || null;
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
    const tooClosed = !isPast && (slotMs <= Date.now() + (config.minLeadMinutes ?? 120) * 60_000);

    const slotFormatted = escHtml(fmtSlot(booking.slot_start));
    const tokenJson = JSON.stringify(booking.manage_token);
    const slugJson = JSON.stringify(slug);
    const adminKeyJson = JSON.stringify(adminKey);
    const cardLabel = isAdmin ? 'Customer booking' : 'Your booking';
    const cancelLabel = isAdmin ? 'Cancel this booking' : 'Cancel booking';

    let actionsHtml;
    if (!isAdmin && isPast) {
      actionsHtml = `<p class="note">This appointment has already passed.</p>`;
    } else if (!isAdmin && tooClosed) {
      actionsHtml = `<p class="note">Your appointment is coming up very soon — it's too late to make changes online. Please call ${escHtml(config.displayName)} directly.</p>`;
    } else {
      actionsHtml = `
        ${isAdmin ? '<p class="note" style="margin-bottom:0.75rem">Staff view — changes here skip the customer cutoff. The customer is emailed automatically.</p>' : ''}
        <div class="actions">
          <button type="button" class="btn-reschedule" id="rescheduleBtn">${isAdmin ? 'Amend / reschedule' : 'Reschedule'}</button>
          <button type="button" class="btn-cancel"     id="cancelBtn">${cancelLabel}</button>
        </div>
        <p class="cancel-msg" id="cancelMsg" hidden></p>`;
    }

    bodyHtml = `
      <div class="booking-card">
        <div class="booking-card-label">${cardLabel}</div>
        <div class="booking-card-slot">${slotFormatted}</div>
        <div class="booking-card-biz">${isAdmin && booking.name ? escHtml(booking.name) + ' · ' : ''}${displayName}</div>
      </div>
      ${actionsHtml}
      <script>
(function () {
  var SLUG  = ${slugJson};
  var TOKEN = ${tokenJson};
  var ADMIN_KEY = ${adminKeyJson};
  var rescheduleBtn = document.getElementById('rescheduleBtn');
  var cancelBtn     = document.getElementById('cancelBtn');
  var cancelMsg     = document.getElementById('cancelMsg');

  if (rescheduleBtn) {
    rescheduleBtn.addEventListener('click', function () {
      var url = '/' + SLUG + '?reschedule=' + encodeURIComponent(TOKEN);
      if (ADMIN_KEY) url += '&k=' + encodeURIComponent(ADMIN_KEY);
      window.location.href = url;
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
          body: JSON.stringify({ token: TOKEN, adminKey: ADMIN_KEY }),
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
    <span class="biz-meta">Manage booking${isAdmin ? ' · staff' : ''}</span>
  </header>
  <div class="wrap">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

// ── Howie confirm page (mobile pending → confirmed) ─────────────────────────

export function renderConfirmPage(booking, state, config) {
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

  function fmtArrival(bookingRow) {
    if (!bookingRow?.slot_start) return '';
    const [datePart] = bookingRow.slot_start.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const dateStr = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(dt);
    const part = bookingRow.arrival_window === 'am' ? 'morning' : 'afternoon';
    return `${dateStr} ${part}`;
  }

  let bodyHtml;
  if (state === 'not_found' || state === 'invalid') {
    bodyHtml = `<div class="msg-card err"><p>This confirmation link is not valid — it may have expired.</p></div>`;
  } else if (state === 'already_confirmed') {
    bodyHtml = `
      <div class="msg-card ok">
        <p><strong>Already confirmed.</strong></p>
        <p>${escHtml(fmtArrival(booking))} — ${escHtml(booking.name)}</p>
        <p>The customer has already been sent their confirmation email.</p>
      </div>`;
  } else if (state === 'slot_taken') {
    bodyHtml = `
      <div class="msg-card err">
        <p><strong>That slot is no longer free.</strong></p>
        <p>${escHtml(fmtArrival(booking))} — ${escHtml(booking.name)}</p>
        <p>Another booking was confirmed for this time before you could confirm this one, so it hasn't been booked in. Nothing has been sent to the customer. Please contact them to arrange another time.</p>
      </div>`;
  } else if (state === 'confirmed') {
    bodyHtml = `
      <div class="msg-card ok">
        <p><strong>Visit confirmed.</strong></p>
        <p>${escHtml(fmtArrival(booking))} — ${escHtml(booking.name)}</p>
        <p>${escHtml(booking.address || '')}${booking.postcode ? `, ${escHtml(booking.postcode)}` : ''}</p>
        <p>The customer has been sent their firm confirmation email.</p>
      </div>`;
  } else {
    bodyHtml = `<div class="msg-card err"><p>Something went wrong.</p></div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm mobile visit | ${displayName}</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" type="image/x-icon" href="https://neobookworm.uk/favicon.ico">
  <style>
    ${themeCss}
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; background: var(--bg); color: #fff;
      font-family: 'DM Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.5; }
    .biz-header { padding: 0.875rem 1.25rem; background: rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 700; }
    .wrap { max-width: 520px; margin: 0 auto; padding: 2rem 1rem 3rem; }
    .msg-card { background: rgba(255,255,255,0.06); border-radius: 12px; padding: 1.5rem; }
    .msg-card.ok { border: 1px solid rgba(var(--accent-rgb), 0.45); }
    .msg-card.err { border: 1px solid rgba(220,53,69,0.3); }
    .msg-card p { margin: 0 0 0.75rem; }
    .msg-card p:last-child { margin-bottom: 0; }
  </style>
</head>
<body>
  <header class="biz-header">${displayName} — mobile confirm</header>
  <div class="wrap">${bodyHtml}</div>
</body>
</html>`;
}

// ── Staff workbench (Bench mode — live day dashboard) ───────────────────────
// Rendered as a shell + inlined initial data; a single client-side renderer
// draws the cards (used for both first paint and the 5-min auto-refresh) so
// there is one source of truth for the markup. The URL key is the credential.

function workbenchThemeCss(config) {
  const t = config?.theme || {};
  return `
    :root {
      --bg:         ${t.bg        || '#0f1f3d'};
      --accent:     ${t.accent    || '#f5a623'};
      --accent-h:   ${t.accentH   || '#d4891a'};
      --accent-fg:  ${t.accentFg  || '#0f1f3d'};
      --accent-rgb: ${t.accentRgb || '245, 166, 35'};
    }`;
}

/** Generic refusal — no tenant name, same for unknown slug or bad key. */
export function renderWorkbenchRefusalPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link not recognised</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" type="image/x-icon" href="https://neobookworm.uk/favicon.ico">
  <style>
    :root { --bg: #0f1f3d; --accent: #f5a623; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; background: var(--bg); color: #fff;
      font-family: 'DM Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.5; }
    .wrap { max-width: 520px; margin: 0 auto; padding: 3rem 1.25rem; text-align: center; }
    h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.75rem; }
    p { margin: 0; opacity: 0.85; font-size: 1rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Link not recognised</h1>
    <p>Ask Nick for a fresh link.</p>
  </div>
</body>
</html>`;
}

export function renderWorkbenchPage(config, slug, key, data) {
  const displayName = escHtml(config.displayName);
  const themeCss = workbenchThemeCss(config);
  const tz = config.timezone || 'Europe/London';
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const maxIso = (() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + (config.maxAdvanceDays || 30))).toISOString().slice(0, 10);
  })();
  const cfg = {
    displayName: config.displayName || '',
    tz,
    today: todayIso,
    maxDate: maxIso,
    regLookup: !!config.regLookup,
  };
  const boot = JSON.stringify({ data, cfg }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Workbench | ${displayName}</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" type="image/x-icon" href="https://neobookworm.uk/favicon.ico">
  <link rel="stylesheet" href="https://neobookworm.uk/fonts.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://neobookworm.uk/fonts.css"></noscript>
  <style>
    ${themeCss}
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%;
      background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 82%, #fff 18%) 0%, var(--bg) 46%, color-mix(in srgb, var(--bg) 78%, #000 22%) 100%) fixed;
      color: #fff; font-family: 'DM Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.45;
      -webkit-font-smoothing: antialiased; }
    button { font-family: inherit; }
    a { color: var(--accent); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
      padding: 0.7rem 0.9rem calc(0.7rem + env(safe-area-inset-top)); padding-top: max(0.7rem, env(safe-area-inset-top));
      position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 86%, #000 14%);
      border-bottom: 1px solid rgba(255,255,255,0.10); backdrop-filter: blur(8px); }
    .head .biz { font-weight: 800; font-size: 1.02rem; letter-spacing: 0.01em; }
    .head .clock { font-size: 0.78rem; opacity: 0.6; font-variant-numeric: tabular-nums; }
    .head .sync { min-height: 40px; padding: 0.4rem 0.7rem; border: 1px solid rgba(255,255,255,0.22);
      border-radius: 9px; background: transparent; color: #fff; font-size: 0.78rem; font-weight: 600;
      cursor: pointer; white-space: nowrap; }
    .head .sync:disabled { opacity: 0.55; }
    .wrap { max-width: 680px; margin: 0 auto; padding: 0.9rem 0.9rem calc(6rem + env(safe-area-inset-bottom)); }

    /* stat tiles */
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
    .stat { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.11); border-radius: 13px;
      padding: 0.6rem 0.4rem; text-align: center; }
    .stat .n { font-size: 1.6rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
    .stat .l { font-size: 0.62rem; opacity: 0.62; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.28rem; }
    .stat.warn { border-color: rgba(255,190,80,0.5); background: rgba(255,190,80,0.10); }
    .stat.warn .n { color: #ffcf6b; }
    .stat.free .n { color: var(--accent); }

    /* controls row */
    .controls { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .search { flex: 1; position: relative; }
    .search input { width: 100%; min-height: 46px; padding: 0.6rem 0.8rem 0.6rem 2.1rem; border-radius: 11px;
      border: 1px solid rgba(255,255,255,0.16); background: rgba(0,0,0,0.22); color: #fff; font-size: 1rem; }
    .search input::placeholder { color: rgba(255,255,255,0.5); }
    .search .ic { position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 1rem; }
    .add-btn { min-height: 46px; padding: 0 1rem; border: none; border-radius: 11px; background: var(--accent);
      color: var(--accent-fg); font-size: 0.95rem; font-weight: 800; cursor: pointer; white-space: nowrap; }
    .add-btn:active { background: var(--accent-h); }

    .sec { margin-bottom: 1.6rem; }
    .sec-h { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;
      opacity: 0.62; margin: 0 0 0.6rem; display: flex; align-items: center; gap: 0.5rem; }
    .sec-h .cnt { color: #ffcf6b; opacity: 1; }
    .sec-warn .sec-h { color: #ffcf6b; opacity: 0.95; }
    .list { display: flex; flex-direction: column; gap: 0.65rem; }
    .empty { margin: 0; padding: 0.9rem 1rem; border-radius: 11px; background: rgba(255,255,255,0.04);
      font-size: 0.9rem; opacity: 0.7; }

    /* free chips */
    .free-wrap { margin-bottom: 0.8rem; }
    .free-lab { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.55; margin: 0 0 0.4rem; }
    .free-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .free-chip { min-height: 38px; padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px dashed rgba(var(--accent-rgb),0.55);
      background: rgba(var(--accent-rgb),0.08); color: #fff; font-size: 0.85rem; font-weight: 700; cursor: pointer;
      font-variant-numeric: tabular-nums; }
    .free-chip:active { background: rgba(var(--accent-rgb),0.2); }

    /* now line */
    .nowline { display: flex; align-items: center; gap: 0.5rem; color: #ffcf6b; font-size: 0.66rem;
      font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin: 0.15rem 0; }
    .nowline .ln { flex: 1; height: 1px; background: linear-gradient(90deg, #ffcf6b, transparent); }

    /* card */
    .card { position: relative; overflow: hidden; background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.045));
      border: 1px solid rgba(255,255,255,0.13); border-radius: 15px; padding: 0.85rem 0.95rem 0.9rem 1.05rem;
      box-shadow: 0 6px 18px -12px rgba(0,0,0,0.55); }
    .card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: rgba(255,255,255,0.22); }
    .card.edge-ready::before { background: #3fae6b; }
    .card.edge-warn::before  { background: #f0a836; }
    .card.edge-pending::before { background: var(--accent); }
    .card.edge-done::before { background: #3fae6b; }
    .card.edge-noshow::before { background: #d9534f; }
    .card.dim { opacity: 0.62; }
    .card.hide { display: none; }
    .c-top { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.35rem; }
    .c-time { font-weight: 800; font-size: 1.05rem; font-variant-numeric: tabular-nums; }
    .tag { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
      padding: 0.15rem 0.45rem; border-radius: 5px; }
    .tag-depot { background: rgba(255,255,255,0.14); }
    .tag-mobile { background: rgba(var(--accent-rgb),0.28); }
    .tag-walkin { background: rgba(120,180,255,0.22); color: #cfe3ff; }
    .tag-out { background: rgba(255,255,255,0.12); }
    .tag-out.done { background: rgba(63,174,107,0.25); color: #b8f0cd; }
    .tag-out.noshow { background: rgba(217,83,79,0.28); color: #ffd0ce; }
    .c-name { font-size: 1.12rem; font-weight: 700; margin-bottom: 0.2rem; }
    .plate { display: inline-flex; align-items: center; font-weight: 800; letter-spacing: 0.06em;
      background: #f8d800; color: #111; border: 1px solid #b9a400; border-radius: 4px; padding: 2px 8px 2px 12px;
      font-size: 0.9rem; font-variant-numeric: tabular-nums; box-shadow: inset 3px 0 0 #0a4ea8; margin-bottom: 0.35rem; }
    .c-contact { font-size: 0.98rem; margin-bottom: 0.15rem; }
    .lnk { color: var(--accent); text-decoration: none; font-weight: 600; min-height: 40px;
      display: inline-flex; align-items: center; }
    .c-addr { display: block; font-size: 0.9rem; margin-top: 0.25rem; opacity: 0.92; }
    .c-note { margin-top: 0.55rem; padding-top: 0.55rem; border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 0.9rem; opacity: 0.9; }
    .c-note .nl { display: block; font-size: 0.62rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.05em; opacity: 0.5; margin-bottom: 0.15rem; }

    .prep { margin-top: 0.75rem; padding-top: 0.7rem; border-top: 1px solid rgba(255,255,255,0.12); }
    .prep-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .prep-pill { font-size: 0.64rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.65; }
    .prep-btn { flex: 1; min-height: 46px; min-width: 130px; padding: 0.55rem 0.9rem; border: none; border-radius: 10px;
      background: var(--accent); color: var(--accent-fg); font-size: 0.95rem; font-weight: 800; cursor: pointer; }
    .prep-btn:active:not(:disabled) { background: var(--accent-h); }
    .prep-btn.ready { background: rgba(63,174,107,0.28); color: #d7f6e2; }
    .prep-btn:disabled { cursor: default; }
    .prep-back { min-height: 46px; padding: 0.55rem 0.8rem; border: 1px solid rgba(255,255,255,0.25);
      border-radius: 10px; background: transparent; color: #fff; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
    .note-in { width: 100%; min-height: 3rem; margin-top: 0.6rem; padding: 0.6rem 0.7rem; border-radius: 9px;
      border: 1px dashed rgba(150,190,255,0.4); background: rgba(0,0,0,0.24); color: #fff; font-family: inherit;
      font-size: 0.92rem; line-height: 1.4; resize: vertical; }
    .note-lab { display: block; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
      color: rgba(160,195,255,0.85); margin-top: 0.6rem; }

    .acts { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.7rem; }
    .act { flex: 1; min-height: 46px; min-width: 110px; padding: 0.55rem 0.9rem; border-radius: 10px; font-size: 0.95rem;
      font-weight: 800; text-align: center; text-decoration: none; cursor: pointer; display: inline-flex;
      align-items: center; justify-content: center; }
    .act-primary { border: none; background: var(--accent); color: var(--accent-fg); }
    .act-primary:active { background: var(--accent-h); }
    .act-ghost { border: 1px solid rgba(255,255,255,0.28); background: transparent; color: #fff; }
    .act-ghost:active { background: rgba(255,255,255,0.08); }
    .act-amend { border: 1px solid rgba(var(--accent-rgb),0.5); background: rgba(var(--accent-rgb),0.15); color: #fff; }
    .act-sm { min-width: 0; flex: 0 0 auto; min-height: 40px; padding: 0.35rem 0.7rem; font-size: 0.82rem; font-weight: 700; }

    .out-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem;
      padding-top: 0.6rem; border-top: 1px dashed rgba(255,255,255,0.1); }
    .out-lab { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.5; margin-right: 0.15rem; }

    .wk-editor { margin-top: 0.7rem; padding: 0.75rem; border-radius: 11px; background: rgba(120,180,255,0.08);
      border: 1px solid rgba(120,180,255,0.28); }
    .wk-editor.hide { display: none; }
    .fld { display: block; margin-bottom: 0.5rem; }
    .fld span { display: block; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; margin-bottom: 0.2rem; }
    .fld input, .fld textarea { width: 100%; min-height: 44px; padding: 0.5rem 0.65rem; border-radius: 9px;
      border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.24); color: #fff; font-family: inherit; font-size: 1rem; }
    .fld textarea { min-height: 3rem; resize: vertical; }
    .notif { font-size: 0.72rem; margin-top: 0.4rem; }
    .notif.sent { color: #9ff0c1; }
    .notif.unsent { color: rgba(255,255,255,0.6); }

    /* modal */
    .modal { position: fixed; inset: 0; z-index: 60; display: none; align-items: flex-end; justify-content: center;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(2px); }
    .modal.open { display: flex; }
    .sheet { width: 100%; max-width: 680px; max-height: 92vh; overflow-y: auto; background: color-mix(in srgb, var(--bg) 88%, #000 12%);
      border: 1px solid rgba(255,255,255,0.14); border-radius: 18px 18px 0 0; padding: 1.1rem 1.1rem calc(1.4rem + env(safe-area-inset-bottom)); }
    .sheet h2 { margin: 0 0 0.3rem; font-size: 1.15rem; }
    .sheet .sub { margin: 0 0 1rem; font-size: 0.88rem; opacity: 0.7; }
    .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 0.45rem; margin: 0.3rem 0 0.9rem; }
    .slot-b { min-height: 46px; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(255,255,255,0.05);
      color: #fff; font-size: 0.95rem; font-weight: 700; cursor: pointer; font-variant-numeric: tabular-nums; }
    .slot-b.sel { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .slot-note { font-size: 0.85rem; opacity: 0.7; margin: 0.2rem 0 0.9rem; }
    .sheet-acts { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    .sheet-close { position: absolute; }
    .msg { margin-top: 0.6rem; font-size: 0.9rem; }
    .msg.ok { color: #9ff0c1; }
    .msg.err { color: #ff9a95; }
    .foot { text-align: center; font-size: 0.72rem; opacity: 0.4; margin-top: 1.2rem; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  </style>
</head>
<body>
  <header class="head">
    <div>
      <div class="biz">${displayName}</div>
      <div class="clock" id="wbClock"></div>
    </div>
    <button type="button" class="sync" id="wbSync" title="Check for bookings deleted in Google Calendar and free their slots">Sync calendar</button>
  </header>
  <main class="wrap" id="wbMain"><p class="empty">Loading…</p></main>

  <div class="modal" id="wbModal" role="dialog" aria-modal="true" aria-label="Add a phone booking">
    <div class="sheet">
      <h2>Add a phone booking</h2>
      <p class="sub">Pencil someone in now — add their details and send a confirmation whenever you like.</p>
      <label class="fld"><span>Day</span><input type="date" id="wkDate"></label>
      <div id="wkSlotsWrap">
        <span class="note-lab" style="color:rgba(255,255,255,0.6)">Free times</span>
        <div class="slot-grid" id="wkSlots"></div>
        <p class="slot-note" id="wkSlotNote"></p>
      </div>
      <label class="fld"><span>Name (optional)</span><input type="text" id="wkName" maxlength="80" placeholder="Phone booking" autocomplete="off"></label>
      <label class="fld"><span>Reg (optional)</span><input type="text" id="wkReg" maxlength="10" placeholder="e.g. KV19 ABC" autocomplete="off" style="text-transform:uppercase"></label>
      <label class="fld"><span>Phone (optional)</span><input type="tel" id="wkPhone" maxlength="30" autocomplete="off"></label>
      <label class="fld"><span>Email (optional — needed to send a confirmation)</span><input type="email" id="wkEmail" maxlength="120" autocomplete="off"></label>
      <label class="fld"><span>Note (optional)</span><textarea id="wkNote" maxlength="500" placeholder="Tyre size, what they need…"></textarea></label>
      <div class="sheet-acts">
        <button type="button" class="act act-ghost" id="wkPencil">Pencil in</button>
        <button type="button" class="act act-primary" id="wkSend">Save &amp; send confirmation</button>
      </div>
      <button type="button" class="act act-ghost" id="wkCancel" style="width:100%;margin-top:0.5rem">Close</button>
      <p class="msg" id="wkMsg"></p>
    </div>
  </div>

  <script>
(function () {
  var BOOT = ${boot};
  var DATA = BOOT.data || {};
  var CFG = BOOT.cfg || {};
  var SLUG = ${JSON.stringify(slug)};
  var KEY = ${JSON.stringify(key)};
  var REFRESH_MS = 5 * 60 * 1000;
  var PREP_ADVANCE = { new: 'Check stock', stock_checked: 'Mark ordered', ordered: 'Mark ready', ready: 'Ready' };
  var PREP_LABEL = { new: 'New', stock_checked: 'Stock checked', ordered: 'Ordered', ready: 'Ready' };
  var noteTimers = {};
  var busy = false; // pause auto-refresh while a modal/editor is open

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function el(id) { return document.getElementById(id); }

  function nowWall() {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: CFG.tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })
      .formatToParts(new Date()).reduce(function (a,x){ a[x.type]=x.value; return a; }, {});
    var hh = p.hour === '24' ? '00' : p.hour;
    return p.year+'-'+p.month+'-'+p.day+'T'+hh+':'+p.minute+':'+p.second;
  }

  function tickClock() {
    var d = new Date();
    var t = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.tz, hour:'2-digit', minute:'2-digit' }).format(d);
    var day = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.tz, weekday:'long', day:'numeric', month:'long' }).format(d);
    var c = el('wbClock'); if (c) c.textContent = t + ' · ' + day;
  }

  // ── card pieces ─────────────────────────────────────────────────────────
  function plate(reg) { return reg ? '<span class="plate">' + esc(reg) + '</span>' : ''; }

  function edgeClass(b, highlight) {
    if (b.outcome === 'done') return 'edge-done';
    if (b.outcome === 'no_show') return 'edge-noshow';
    if (b.isPending) return 'edge-pending';
    if (b.isReady) return 'edge-ready';
    if (highlight) return 'edge-warn';
    return '';
  }

  function tags(b) {
    var out = '';
    out += '<span class="tag ' + (b.type === 'mobile' ? 'tag-mobile' : 'tag-depot') + '">' + esc(b.typeLabel) + '</span>';
    if (b.isWalkin) out += '<span class="tag tag-walkin">Phone</span>';
    if (b.outcome === 'done') out += '<span class="tag tag-out done">Done ✓</span>';
    if (b.outcome === 'no_show') out += '<span class="tag tag-out noshow">No-show</span>';
    return out;
  }

  function contactLine(b) {
    var parts = [];
    if (b.telHref) parts.push('<a class="lnk" href="' + esc(b.telHref) + '">' + esc(b.phone) + '</a>');
    else if (b.phone) parts.push('<span>' + esc(b.phone) + '</span>');
    if (b.email) parts.push('<a class="lnk" href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a>');
    return parts.length ? '<div class="c-contact">' + parts.join(' · ') + '</div>' : '';
  }

  function addrLine(b) {
    if (b.type !== 'mobile' || (!b.address && !b.postcode)) return '';
    var txt = [b.address, b.postcode].filter(Boolean).join(', ');
    return b.mapsUrl
      ? '<a class="lnk c-addr" href="' + esc(b.mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(txt) + ' ↗</a>'
      : '<div class="c-addr">' + esc(txt) + '</div>';
  }

  function prepBlock(b) {
    var advance = b.isReady
      ? '<button type="button" class="prep-btn ready" disabled>Ready ✓</button>'
      : '<button type="button" class="prep-btn" data-prep-advance data-id="' + esc(b.id) + '" data-next="' + esc(b.nextPrepStatus) + '">' + esc(b.advancePrepLabel || PREP_ADVANCE[b.prepStatus] || 'Advance') + '</button>';
    var back = b.prevPrepStatus
      ? '<button type="button" class="prep-back" data-prep-back data-id="' + esc(b.id) + '" data-prev="' + esc(b.prevPrepStatus) + '">‹ Back</button>'
      : '';
    var noteVal = b.internalNote ? esc(b.internalNote) : '';
    return '<div class="prep">' +
      '<div class="prep-row"><span class="prep-pill">Prep · ' + esc(b.prepLabel || PREP_LABEL[b.prepStatus] || 'New') + '</span></div>' +
      '<div class="prep-row" style="margin-top:0.5rem">' + advance + back + '</div>' +
      '<span class="note-lab">Private staff note</span>' +
      '<textarea class="note-in" data-note data-id="' + esc(b.id) + '" data-saved="' + noteVal + '" rows="2" maxlength="500" placeholder="In stock? Ordered from…  (customers never see this)">' + noteVal + '</textarea>' +
      '</div>';
  }

  function outcomeBlock(b) {
    if (b.isPending) return '';
    if (b.outcome) {
      var lab = b.outcome === 'done' ? 'Marked done' : 'Marked no-show';
      return '<div class="out-row"><span class="out-lab">' + lab + '</span>' +
        '<button type="button" class="act act-ghost act-sm" data-outcome data-id="' + esc(b.id) + '" data-val="">Undo</button></div>';
    }
    return '<div class="out-row"><span class="out-lab">After the job</span>' +
      '<button type="button" class="act act-ghost act-sm" data-outcome data-id="' + esc(b.id) + '" data-val="done">✓ Done</button>' +
      '<button type="button" class="act act-ghost act-sm" data-outcome data-id="' + esc(b.id) + '" data-val="no_show">No-show</button></div>';
  }

  function actionsBlock(b) {
    if (b.isPending) {
      return '<div class="acts">' +
        '<button type="button" class="act act-primary" data-confirm data-id="' + esc(b.id) + '">Confirm visit</button>' +
        '<button type="button" class="act act-ghost" data-decline data-id="' + esc(b.id) + '">Decline</button></div>';
    }
    var out = '<div class="acts">';
    if (b.manageToken && b.amendUrl) {
      var keyAttr = b.adminKey ? ' data-admin-key="' + esc(b.adminKey) + '"' : '';
      out += '<a class="act act-amend" href="' + esc(b.amendUrl) + '">Amend time</a>' +
        '<button type="button" class="act act-ghost" data-cancel data-token="' + esc(b.manageToken) + '"' + keyAttr + '>Cancel</button>';
    }
    out += '</div>';
    return out;
  }

  function walkinEditor(b) {
    if (!b.isWalkin) return '';
    var sent = b.notifyState === 'sent';
    var notif = sent
      ? '<p class="notif sent">✓ Confirmation sent to the customer</p>'
      : '<p class="notif unsent">No confirmation sent yet</p>';
    return '<div class="acts"><button type="button" class="act act-ghost" data-editor-toggle data-id="' + esc(b.id) + '">' + (sent ? 'Edit details' : 'Add details / send confirmation') + '</button></div>' +
      '<div class="wk-editor hide" data-editor="' + esc(b.id) + '">' +
        '<label class="fld"><span>Name</span><input type="text" data-ed="name" maxlength="80" value="' + (b.name && b.name !== 'Phone booking' ? esc(b.name) : '') + '" placeholder="Customer name"></label>' +
        '<label class="fld"><span>Reg</span><input type="text" data-ed="reg" maxlength="10" value="' + esc(b.reg || '') + '" style="text-transform:uppercase"></label>' +
        '<label class="fld"><span>Phone</span><input type="tel" data-ed="phone" maxlength="30" value="' + esc(b.phone || '') + '"></label>' +
        '<label class="fld"><span>Email</span><input type="email" data-ed="email" maxlength="120" value="' + esc(b.email || '') + '"></label>' +
        '<label class="fld"><span>Note (customer-facing)</span><textarea data-ed="note" maxlength="500">' + esc(b.note || '') + '</textarea></label>' +
        '<div class="sheet-acts">' +
          '<button type="button" class="act act-ghost" data-ed-save data-id="' + esc(b.id) + '">Save</button>' +
          '<button type="button" class="act act-primary" data-ed-send data-id="' + esc(b.id) + '">' + (sent ? 'Save' : 'Save & send') + '</button>' +
        '</div>' + notif +
        '<p class="msg" data-ed-msg></p>' +
      '</div>';
  }

  function cardHtml(b, highlight) {
    var cls = 'card ' + edgeClass(b, highlight);
    if (b.outcome) cls += ' dim';
    var search = ((b.name || '') + ' ' + (b.reg || '') + ' ' + (b.phone || '')).toLowerCase();
    var html = '<article class="' + cls + '" data-card data-id="' + esc(b.id) + '" data-search="' + esc(search) + '">' +
      '<div class="c-top"><span class="c-time">' + esc(b.timeLabel) + '</span>' + tags(b) + '</div>' +
      '<div class="c-name">' + esc(b.name || 'Phone booking') + '</div>' +
      plate(b.reg) +
      contactLine(b) + addrLine(b);
    if (b.note && !b.isWalkin) html += '<div class="c-note"><span class="nl">Customer note</span>' + esc(b.note) + '</div>';
    html += actionsBlock(b);
    if (!b.isPending) html += prepBlock(b) + outcomeBlock(b) + walkinEditor(b);
    html += '</article>';
    return html;
  }

  // ── sections ────────────────────────────────────────────────────────────
  function notReadyCount(list) {
    return list.filter(function (b) { return !b.isReady && !b.outcome; }).length;
  }

  function sectionHtml(title, list, emptyMsg, opts) {
    opts = opts || {};
    var warn = opts.count && notReadyCount(list) > 0;
    var head = '<h2 class="sec-h">' + esc(title);
    if (opts.count && list.length) {
      var nr = notReadyCount(list);
      if (nr > 0) head += ' <span class="cnt">· ' + nr + ' of ' + list.length + ' not ready</span>';
    }
    head += '</h2>';
    var now = nowWall();
    var body = '';
    if (!list.length) {
      body = '<p class="empty">' + esc(emptyMsg) + '</p>';
    } else {
      var placedNow = false;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (opts.nowLine && !placedNow && b.rawSlotStart && b.rawSlotStart >= now) {
          body += '<div class="nowline"><span>Now</span><span class="ln"></span></div>';
          placedNow = true;
        }
        body += cardHtml(b, opts.highlight);
      }
    }
    return '<section class="sec' + (warn ? ' sec-warn' : '') + '">' + head + '<div class="list">' + body + '</div></section>';
  }

  function futureFree() {
    var now = nowWall();
    return (DATA.freeToday || []).filter(function (s) { return s.slot >= now; });
  }

  function statsHtml() {
    var today = DATA.today || [], tomorrow = DATA.tomorrow || [], pending = DATA.pending || [];
    var notReady = notReadyCount(today) + notReadyCount(tomorrow);
    var mobile = pending.length + today.concat(tomorrow).filter(function (b) { return b.type === 'mobile'; }).length;
    var free = futureFree().length;
    function tile(n, l, cls) { return '<div class="stat ' + (cls||'') + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }
    return '<div class="stats">' +
      tile(today.length, 'Today', '') +
      tile(notReady, 'Not ready', notReady ? 'warn' : '') +
      tile(mobile, 'Mobile', '') +
      tile(free, 'Free today', 'free') + '</div>';
  }

  function freeChipsHtml() {
    var free = futureFree();
    if (!free.length) return '';
    var chips = free.map(function (s) {
      return '<button type="button" class="free-chip" data-freeslot="' + esc(s.slot) + '">' + esc(s.label) + '</button>';
    }).join('');
    return '<div class="free-wrap"><p class="free-lab">Free bench time today — tap to fill</p><div class="free-chips">' + chips + '</div></div>';
  }

  function render() {
    var pending = DATA.pending || [];
    var html = statsHtml() +
      '<div class="controls">' +
        '<div class="search"><span class="ic">⌕</span><input type="search" id="wbSearch" placeholder="Search reg, name or phone" autocomplete="off"></div>' +
        '<button type="button" class="add-btn" id="wbAdd">+ Phone booking</button>' +
      '</div>';
    if (pending.length) {
      html += '<section class="sec sec-warn"><h2 class="sec-h">Waiting on your yes</h2><div class="list">' +
        pending.map(function (b) { return cardHtml(b, false); }).join('') + '</div></section>';
    }
    html += freeChipsHtml();
    html += sectionHtml('Today', DATA.today || [], 'Nothing booked today', { count: true, highlight: true, nowLine: true });
    html += sectionHtml('Tomorrow', DATA.tomorrow || [], 'Nothing booked tomorrow', { count: true, highlight: true });
    html += sectionHtml('Next 7 days', DATA.upcoming || [], 'Nothing booked in the next week', {});
    html += '<p class="foot" id="wbFoot">' + (DATA.updatedAt ? 'Updated ' + new Date(DATA.updatedAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '') + '</p>';
    el('wbMain').innerHTML = html;
    wireSearch();
  }

  function wireSearch() {
    var s = el('wbSearch');
    if (s) s.addEventListener('input', function () {
      var q = s.value.trim().toLowerCase();
      document.querySelectorAll('[data-card]').forEach(function (c) {
        var hit = !q || (c.getAttribute('data-search') || '').indexOf(q) !== -1;
        c.classList.toggle('hide', !hit);
      });
    });
    var add = el('wbAdd');
    if (add) add.addEventListener('click', function () { openModal(CFG.today, null); });
  }

  // ── API ─────────────────────────────────────────────────────────────────
  function post(path, payload) {
    return fetch('/' + SLUG + '/workbench/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ key: KEY }, payload)),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw new Error(d.error || 'failed'); return d;
    });
  }

  function refresh() {
    if (busy) return;
    fetch('/' + SLUG + '/workbench/data?key=' + encodeURIComponent(KEY), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.ok) { DATA = d; render(); } })
      .catch(function () {});
  }

  // ── walk-in modal ─────────────────────────────────────────────────────────
  var selectedSlot = null;

  function openModal(dateIso, preSlot) {
    busy = true;
    selectedSlot = preSlot || null;
    el('wkDate').value = dateIso || CFG.today;
    el('wkDate').min = CFG.today;
    el('wkDate').max = CFG.maxDate;
    el('wkName').value = ''; el('wkReg').value = ''; el('wkPhone').value = ''; el('wkEmail').value = ''; el('wkNote').value = '';
    el('wkMsg').textContent = '';
    el('wbModal').classList.add('open');
    loadSlots(dateIso || CFG.today);
  }
  function closeModal() { busy = false; el('wbModal').classList.remove('open'); }

  function loadSlots(dateIso) {
    var wrap = el('wkSlots'); var note = el('wkSlotNote');
    wrap.innerHTML = ''; note.textContent = 'Checking free times…';
    fetch('/' + SLUG + '/workbench/slots?key=' + encodeURIComponent(KEY) + '&date=' + encodeURIComponent(dateIso), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { note.textContent = 'Could not load times — ' + (d.error || 'try again'); return; }
        var slots = d.slots || [];
        if (!slots.length) { note.textContent = 'No free times that day.'; return; }
        note.textContent = '';
        wrap.innerHTML = slots.map(function (s) {
          var sel = s.slot === selectedSlot ? ' sel' : '';
          return '<button type="button" class="slot-b' + sel + '" data-slot="' + esc(s.slot) + '">' + esc(s.label) + '</button>';
        }).join('');
      })
      .catch(function () { note.textContent = 'Could not load times — try again.'; });
  }

  function submitWalkin(sendNotify) {
    var msg = el('wkMsg'); msg.className = 'msg'; msg.textContent = '';
    if (!selectedSlot) { msg.className = 'msg err'; msg.textContent = 'Pick a time first.'; return; }
    var email = el('wkEmail').value.trim();
    if (sendNotify && !email) { msg.className = 'msg err'; msg.textContent = 'Add an email to send a confirmation, or use “Pencil in”.'; return; }
    el('wkPencil').disabled = true; el('wkSend').disabled = true;
    post('walkin', {
      slot: selectedSlot,
      name: el('wkName').value.trim(),
      reg: el('wkReg').value.trim(),
      phone: el('wkPhone').value.trim(),
      email: email,
      note: el('wkNote').value.trim(),
      sendNotify: !!sendNotify,
    }).then(function () {
      closeModal(); refresh();
    }).catch(function (e) {
      msg.className = 'msg err';
      msg.textContent = e.message === 'slot_taken' ? 'That slot was just taken — pick another.' : 'Could not save — ' + e.message;
      el('wkPencil').disabled = false; el('wkSend').disabled = false;
    });
  }

  // ── events ─────────────────────────────────────────────────────────────
  el('wbSync').addEventListener('click', function () {
    var btn = el('wbSync'); var orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Syncing…';
    post('reconcile', {}).then(function (r) {
      btn.textContent = r.freed > 0 ? 'Freed ' + r.freed : 'Up to date';
      refresh();
      setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 2500);
    }).catch(function () {
      btn.textContent = 'Sync failed';
      setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 2500);
    });
  });

  el('wkCancel').addEventListener('click', closeModal);
  el('wkPencil').addEventListener('click', function () { submitWalkin(false); });
  el('wkSend').addEventListener('click', function () { submitWalkin(true); });
  el('wkDate').addEventListener('change', function () { selectedSlot = null; loadSlots(el('wkDate').value); });
  el('wbModal').addEventListener('click', function (e) { if (e.target === el('wbModal')) closeModal(); });

  document.addEventListener('click', function (e) {
    var slotBtn = e.target.closest('[data-slot]');
    if (slotBtn) {
      selectedSlot = slotBtn.getAttribute('data-slot');
      document.querySelectorAll('#wkSlots .slot-b').forEach(function (b) { b.classList.toggle('sel', b === slotBtn); });
      return;
    }
    var freeChip = e.target.closest('[data-freeslot]');
    if (freeChip) { openModal(CFG.today, freeChip.getAttribute('data-freeslot')); return; }

    var adv = e.target.closest('[data-prep-advance]');
    if (adv) { adv.disabled = true; post('prep', { bookingId: adv.getAttribute('data-id'), prepStatus: adv.getAttribute('data-next') }).then(refresh).catch(function () { adv.disabled = false; }); return; }
    var back = e.target.closest('[data-prep-back]');
    if (back) { back.disabled = true; post('prep', { bookingId: back.getAttribute('data-id'), prepStatus: back.getAttribute('data-prev') }).then(refresh).catch(function () { back.disabled = false; }); return; }

    var oc = e.target.closest('[data-outcome]');
    if (oc) {
      var val = oc.getAttribute('data-val');
      if (val === 'no_show' && !confirm('Mark this booking as a no-show?')) return;
      oc.disabled = true;
      post('outcome', { bookingId: oc.getAttribute('data-id'), outcome: val }).then(refresh).catch(function () { oc.disabled = false; });
      return;
    }

    var cf = e.target.closest('[data-confirm]');
    if (cf) { if (!confirm('Confirm this mobile visit? The customer gets their confirmation email.')) return; cf.disabled = true; post('confirm', { bookingId: cf.getAttribute('data-id'), action: 'confirm' }).then(refresh).catch(function () { cf.disabled = false; }); return; }
    var dc = e.target.closest('[data-decline]');
    if (dc) { if (!confirm('Decline this request? The time is freed and the customer is emailed.')) return; dc.disabled = true; post('confirm', { bookingId: dc.getAttribute('data-id'), action: 'decline' }).then(refresh).catch(function () { dc.disabled = false; }); return; }
    var cn = e.target.closest('[data-cancel]');
    if (cn) {
      if (!confirm('Cancel this booking? The customer will be notified.')) return;
      cn.disabled = true;
      var payload = { token: cn.getAttribute('data-token') };
      var ak = cn.getAttribute('data-admin-key'); if (ak) payload.adminKey = ak;
      fetch('/' + SLUG + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.ok) throw new Error(d.error); refresh(); })
        .catch(function () { cn.disabled = false; });
      return;
    }

    var tog = e.target.closest('[data-editor-toggle]');
    if (tog) {
      var ed = document.querySelector('[data-editor="' + tog.getAttribute('data-id') + '"]');
      if (ed) { var opening = ed.classList.contains('hide'); ed.classList.toggle('hide'); busy = opening; }
      return;
    }
    var save = e.target.closest('[data-ed-save]');
    var send = e.target.closest('[data-ed-send]');
    if (save || send) {
      var btn = save || send; var id = btn.getAttribute('data-id');
      var box = document.querySelector('[data-editor="' + id + '"]');
      var emsg = box.querySelector('[data-ed-msg]'); emsg.className = 'msg'; emsg.textContent = '';
      function edv(k) { var i = box.querySelector('[data-ed="' + k + '"]'); return i ? i.value.trim() : undefined; }
      var wantSend = !!send;
      if (wantSend && !edv('email')) { emsg.className = 'msg err'; emsg.textContent = 'Add an email to send a confirmation.'; return; }
      btn.disabled = true;
      post('details', { bookingId: id, name: edv('name'), reg: edv('reg'), phone: edv('phone'), email: edv('email'), note: edv('note'), sendNotify: wantSend })
        .then(function () { busy = false; refresh(); })
        .catch(function (err) { emsg.className = 'msg err'; emsg.textContent = 'Could not save — ' + err.message; btn.disabled = false; });
      return;
    }
  });

  // Save internal staff note on blur.
  document.addEventListener('focusout', function (e) {
    var ta = e.target;
    if (!ta.matches || !ta.matches('[data-note]')) return;
    if (ta.getAttribute('data-saved') === ta.value) return;
    var id = ta.getAttribute('data-id');
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(function () {
      post('prep', { bookingId: id, internalNote: ta.value })
        .then(function () { ta.setAttribute('data-saved', ta.value); })
        .catch(function () { ta.style.borderColor = 'rgba(255,120,120,0.8)'; setTimeout(function () { ta.style.borderColor = ''; }, 2000); });
    }, 300);
  });

  render();
  tickClock();
  setInterval(tickClock, 30 * 1000);
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
})();
  <\/script>
</body>
</html>`;
}
