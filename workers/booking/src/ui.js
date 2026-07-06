import { workbenchSectionTitle } from './workbench.js';

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

// ── Staff workbench (read-only day view) ────────────────────────────────────

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

function renderWorkbenchActionsHtml(b) {
  if (b.isPending) {
    return `
      <div class="wb-actions wb-actions-pending">
        <button type="button" class="wb-action-btn wb-action-confirm" data-wb-confirm data-id="${escHtml(b.id)}">Confirm visit</button>
        <button type="button" class="wb-action-btn wb-action-decline" data-wb-decline data-id="${escHtml(b.id)}">Decline</button>
      </div>`;
  }
  if (b.manageToken && b.amendUrl) {
    const keyAttr = b.adminKey ? ` data-admin-key="${escHtml(b.adminKey)}"` : '';
    return `
      <div class="wb-actions">
        <a class="wb-action-btn wb-action-amend" href="${escHtml(b.amendUrl)}">Amend</a>
        <button type="button" class="wb-action-btn wb-action-cancel" data-wb-cancel data-token="${escHtml(b.manageToken)}"${keyAttr}>Cancel</button>
      </div>`;
  }
  return '';
}

function renderWorkbenchPrepHtml(b) {
  const isReady = b.prepStatus === 'ready';
  const advanceBtn = isReady
    ? `<button type="button" class="wb-prep-btn wb-prep-ready" disabled aria-label="Prep complete">${escHtml(b.prepLabel)} ✓</button>`
    : `<button type="button" class="wb-prep-btn" data-prep-advance data-id="${escHtml(b.id)}" data-next="${escHtml(b.nextPrepStatus)}" aria-label="Advance prep to ${escHtml(b.advancePrepLabel)}">${escHtml(b.advancePrepLabel)}</button>`;
  const backBtn = b.prevPrepStatus
    ? `<button type="button" class="wb-prep-back" data-prep-back data-id="${escHtml(b.id)}" data-prev="${escHtml(b.prevPrepStatus)}" aria-label="Step prep back one stage">‹ Back</button>`
    : '';
  const statusPill = `<span class="wb-prep-status" data-prep-label>${escHtml(b.prepLabel)}</span>`;
  const noteVal = b.internalNote ? escHtml(b.internalNote) : '';
  return `
    <div class="wb-prep-row">
      ${statusPill}
      <div class="wb-prep-actions">${advanceBtn}${backBtn}</div>
    </div>
    <label class="wb-internal-wrap">
      <span class="wb-internal-label">Private staff note</span>
      <textarea class="wb-internal-note" data-booking-id="${escHtml(b.id)}" data-saved="${noteVal}" rows="2" maxlength="500" placeholder="Sizes, supplier, due date — customers never see this">${noteVal}</textarea>
    </label>`;
}

function renderWorkbenchBookingRowHtml(b, { highlightNotReady = false } = {}) {
  const typeClass = b.type === 'mobile' ? 'wb-type-mobile' : 'wb-type-depot';
  const pendingClass = b.isPending ? ' wb-pending-row' : '';
  const notReadyClass = (highlightNotReady && b.prepStatus !== 'ready') ? ' wb-card-not-ready' : '';

  const regHtml = b.reg
    ? `<div class="wb-reg">${escHtml(b.reg)}</div>`
    : '';

  const phoneHtml = b.telHref
    ? `<a class="wb-link" href="${escHtml(b.telHref)}">${escHtml(b.phone)}</a>`
    : (b.phone ? `<span>${escHtml(b.phone)}</span>` : '');

  const emailHtml = b.email
    ? `<a class="wb-link" href="mailto:${escHtml(b.email)}">${escHtml(b.email)}</a>`
    : '';

  const bandHtml = b.band
    ? `<span class="wb-band">Band ${escHtml(b.band)}</span>`
    : '';

  let addressHtml = '';
  if (b.type === 'mobile' && (b.address || b.postcode)) {
    const addrText = [b.address, b.postcode].filter(Boolean).join(', ');
    if (b.mapsUrl) {
      addressHtml = `<a class="wb-link wb-address" href="${escHtml(b.mapsUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(addrText)}</a>`;
    } else {
      addressHtml = `<div class="wb-address">${escHtml(addrText)}</div>`;
    }
  }

  const noteHtml = b.note
    ? `<div class="wb-note"><span class="wb-note-label">Customer note</span> ${escHtml(b.note)}</div>`
    : '';

  return `
    <article class="wb-card${pendingClass}${notReadyClass}" data-booking-id="${escHtml(b.id)}">
      <div class="wb-card-top">
        <span class="wb-time">${escHtml(b.timeLabel)}</span>
        <span class="wb-type ${typeClass}">${escHtml(b.typeLabel)}</span>
        ${bandHtml}
      </div>
      <div class="wb-name">${escHtml(b.name)}</div>
      ${regHtml}
      <div class="wb-contact">${phoneHtml}${phoneHtml && emailHtml ? ' · ' : ''}${emailHtml}</div>
      ${addressHtml}
      ${noteHtml}
      ${renderWorkbenchActionsHtml(b)}
      ${b.isPending ? '' : renderWorkbenchPrepHtml(b)}
    </article>`;
}

function renderWorkbenchSectionHtml(title, bookings, emptyMessage, { showReadyCount = false, highlightNotReady = false } = {}) {
  const heading = workbenchSectionTitle(title, bookings, { showReadyCount });
  const body = bookings.length
    ? bookings.map((b) => renderWorkbenchBookingRowHtml(b, { highlightNotReady })).join('')
    : `<p class="wb-empty">${escHtml(emptyMessage)}</p>`;
  const warnClass = showReadyCount && bookings.some((b) => b.prepStatus !== 'ready') ? ' wb-section-warn' : '';
  return `
    <section class="wb-section${warnClass}">
      <h2 class="wb-heading">${escHtml(heading)}</h2>
      <div class="wb-list">${body}</div>
    </section>`;
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

  const pendingSection = data.pending.length
    ? `
    <section class="wb-section wb-section-pending">
      <h2 class="wb-heading">Pending mobile requests</h2>
      <div class="wb-list">${data.pending.map((b) => renderWorkbenchBookingRowHtml(b)).join('')}</div>
    </section>`
    : '';

  const sectionsHtml =
    pendingSection
    + renderWorkbenchSectionHtml('Today', data.today, 'Nothing booked today', { showReadyCount: true, highlightNotReady: true })
    + renderWorkbenchSectionHtml('Tomorrow', data.tomorrow, 'Nothing booked tomorrow', { showReadyCount: true, highlightNotReady: true })
    + renderWorkbenchSectionHtml('Next 7 days', data.upcoming, 'Nothing booked in the next week');

  const slugJson = JSON.stringify(slug);
  const keyJson = JSON.stringify(key);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workbench | ${displayName}</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" type="image/x-icon" href="https://neobookworm.uk/favicon.ico">
  <link rel="stylesheet" href="https://neobookworm.uk/fonts.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://neobookworm.uk/fonts.css"></noscript>
  <style>
    ${themeCss}
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; background: var(--bg); color: #fff;
      font-family: 'DM Sans', system-ui, sans-serif; font-size: 17px; line-height: 1.45;
      -webkit-font-smoothing: antialiased; }
    .biz-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.875rem 1rem; background: rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 10; }
    .biz-name { font-weight: 700; font-size: 1.0625rem; }
    .biz-meta { font-size: 0.8125rem; opacity: 0.65; white-space: nowrap; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 1rem 1rem 3rem; }
    .wb-section { margin-bottom: 1.75rem; }
    .wb-section-pending { padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.12); }
    .wb-heading { font-size: 0.8125rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; opacity: 0.7; margin: 0 0 0.75rem; }
    .wb-pending-note { font-size: 0.875rem; opacity: 0.8; margin: -0.35rem 0 0.85rem; line-height: 1.4; }
    .wb-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .wb-empty { margin: 0; padding: 1rem 1.125rem; border-radius: 10px;
      background: rgba(255,255,255,0.04); font-size: 0.9375rem; opacity: 0.75; }
    .wb-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; padding: 1rem 1.125rem; }
    .wb-pending-row { border-color: rgba(var(--accent-rgb), 0.45); }
    .wb-card-top { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
    .wb-time { font-weight: 700; font-size: 1.0625rem; }
    .wb-type { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.04em; padding: 0.2rem 0.5rem; border-radius: 4px; }
    .wb-type-depot { background: rgba(255,255,255,0.12); }
    .wb-type-mobile { background: rgba(var(--accent-rgb), 0.25); color: #fff; }
    .wb-band { font-size: 0.75rem; opacity: 0.7; }
    .wb-name { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.15rem; }
    .wb-reg { font-size: 1rem; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 0.35rem;
      font-variant-numeric: tabular-nums; }
    .wb-contact { font-size: 1rem; margin-bottom: 0.25rem; }
    .wb-link { color: var(--accent); text-decoration: none; font-weight: 600;
      min-height: 44px; display: inline-flex; align-items: center; }
    .wb-link:active { opacity: 0.85; }
    .wb-address { display: block; font-size: 0.9375rem; margin-top: 0.35rem; line-height: 1.4; }
    .wb-note { margin-top: 0.65rem; padding-top: 0.65rem; border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 0.9375rem; opacity: 0.9; line-height: 1.4; }
    .wb-note-label { display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; opacity: 0.55; margin-bottom: 0.2rem; }
    .wb-card-not-ready { border-color: rgba(255, 180, 50, 0.75);
      box-shadow: inset 4px 0 0 rgba(255, 180, 50, 0.95); background: rgba(255, 180, 50, 0.08); }
    .wb-section-warn .wb-heading { color: #ffc857; opacity: 1; }
    .wb-prep-row { margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.12); }
    .wb-prep-status { display: inline-block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; opacity: 0.65; margin-bottom: 0.5rem; }
    .wb-prep-actions { display: flex; gap: 0.5rem; align-items: stretch; flex-wrap: wrap; }
    .wb-prep-btn { flex: 1; min-height: 48px; min-width: 140px; padding: 0.65rem 1rem; border: none;
      border-radius: 10px; background: var(--accent); color: var(--accent-fg); font-family: inherit;
      font-size: 1rem; font-weight: 700; cursor: pointer; touch-action: manipulation; }
    .wb-prep-btn:active:not(:disabled) { background: var(--accent-h); }
    .wb-prep-btn:disabled, .wb-prep-ready { opacity: 0.85; cursor: default; }
    .wb-prep-back { min-height: 48px; padding: 0.65rem 0.85rem; border: 1px solid rgba(255,255,255,0.25);
      border-radius: 10px; background: transparent; color: #fff; font-family: inherit; font-size: 0.9375rem;
      font-weight: 600; cursor: pointer; touch-action: manipulation; }
    .wb-prep-back:active { background: rgba(255,255,255,0.08); }
    .wb-internal-wrap { display: block; margin-top: 0.75rem; }
    .wb-internal-label { display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; color: rgba(180, 200, 255, 0.85); margin-bottom: 0.35rem; }
    .wb-internal-note { width: 100%; min-height: 3.5rem; padding: 0.65rem 0.75rem; border-radius: 8px;
      border: 1px dashed rgba(180, 200, 255, 0.35); background: rgba(0, 0, 0, 0.22); color: #fff;
      font-family: inherit; font-size: 0.9375rem; line-height: 1.4; resize: vertical; }
    .wb-internal-note:focus { outline: 2px solid rgba(180, 200, 255, 0.5); outline-offset: 1px; }
    .wb-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
    .wb-action-btn { flex: 1; min-height: 48px; min-width: 120px; padding: 0.65rem 1rem; border-radius: 10px;
      font-family: inherit; font-size: 1rem; font-weight: 700; text-align: center; text-decoration: none;
      cursor: pointer; touch-action: manipulation; display: inline-flex; align-items: center; justify-content: center; }
    .wb-action-confirm { border: none; background: var(--accent); color: var(--accent-fg); }
    .wb-action-confirm:active:not(:disabled) { background: var(--accent-h); }
    .wb-action-decline, .wb-action-cancel { border: 1px solid rgba(255,255,255,0.3); background: transparent; color: #fff; }
    .wb-action-decline:active:not(:disabled), .wb-action-cancel:active:not(:disabled) { background: rgba(255,255,255,0.08); }
    .wb-action-amend { border: 1px solid rgba(var(--accent-rgb), 0.5); background: rgba(var(--accent-rgb), 0.15); color: #fff; }
    .wb-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .wb-updated { text-align: center; font-size: 0.75rem; opacity: 0.45; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <header class="biz-header">
    <span class="biz-name">${displayName}</span>
    <span class="biz-meta" id="wbUpdated">Workbench</span>
  </header>
  <main class="wrap" id="wbMain">
    ${sectionsHtml}
    <p class="wb-updated" id="wbUpdatedFoot" hidden></p>
  </main>
  <script>
(function () {
  var SLUG = ${slugJson};
  var KEY = ${keyJson};
  var REFRESH_MS = 5 * 60 * 1000;
  var PREP_LABELS = { new: 'New', stock_checked: 'Stock checked', ordered: 'Ordered', ready: 'Ready' };
  var PREP_ADVANCE = { new: 'Check stock', stock_checked: 'Mark ordered', ordered: 'Mark ready', ready: 'Ready' };
  var PREP_NEXT = { new: 'stock_checked', stock_checked: 'ordered', ordered: 'ready', ready: null };
  var PREP_PREV = { new: null, stock_checked: 'new', ordered: 'stock_checked', ready: 'ordered' };
  var noteSaveTimers = {};

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sectionTitle(title, bookings, showReadyCount) {
    if (!showReadyCount || !bookings.length) return title;
    var notReady = bookings.filter(function (b) { return b.prepStatus !== 'ready'; }).length;
    if (!notReady) return title;
    return title + ' · ' + notReady + ' of ' + bookings.length + ' not ready';
  }

  function actionsHtml(b) {
    if (b.isPending) {
      return '<div class="wb-actions wb-actions-pending">' +
        '<button type="button" class="wb-action-btn wb-action-confirm" data-wb-confirm data-id="' + esc(b.id) + '">Confirm visit</button>' +
        '<button type="button" class="wb-action-btn wb-action-decline" data-wb-decline data-id="' + esc(b.id) + '">Decline</button></div>';
    }
    if (b.manageToken && b.amendUrl) {
      var keyAttr = b.adminKey ? ' data-admin-key="' + esc(b.adminKey) + '"' : '';
      return '<div class="wb-actions">' +
        '<a class="wb-action-btn wb-action-amend" href="' + esc(b.amendUrl) + '">Amend</a>' +
        '<button type="button" class="wb-action-btn wb-action-cancel" data-wb-cancel data-token="' + esc(b.manageToken) + '"' + keyAttr + '>Cancel</button></div>';
    }
    return '';
  }

  function prepHtml(b) {
    var isReady = b.prepStatus === 'ready';
    var advance = isReady
      ? '<button type="button" class="wb-prep-btn wb-prep-ready" disabled aria-label="Prep complete">' + esc(b.prepLabel || PREP_LABELS.ready) + ' ✓</button>'
      : '<button type="button" class="wb-prep-btn" data-prep-advance data-id="' + esc(b.id) + '" data-next="' + esc(b.nextPrepStatus) + '">' + esc(b.advancePrepLabel || PREP_ADVANCE[b.prepStatus] || 'Advance') + '</button>';
    var back = b.prevPrepStatus
      ? '<button type="button" class="wb-prep-back" data-prep-back data-id="' + esc(b.id) + '" data-prev="' + esc(b.prevPrepStatus) + '">‹ Back</button>'
      : '';
    var noteVal = b.internalNote ? esc(b.internalNote) : '';
    return '<div class="wb-prep-row"><span class="wb-prep-status" data-prep-label>' + esc(b.prepLabel || PREP_LABELS[b.prepStatus] || 'New') + '</span>' +
      '<div class="wb-prep-actions">' + advance + back + '</div></div>' +
      '<label class="wb-internal-wrap"><span class="wb-internal-label">Private staff note</span>' +
      '<textarea class="wb-internal-note" data-booking-id="' + esc(b.id) + '" data-saved="' + noteVal + '" rows="2" maxlength="500" placeholder="Sizes, supplier, due date — customers never see this">' + noteVal + '</textarea></label>';
  }

  function rowHtml(b, highlightNotReady) {
    var typeClass = b.type === 'mobile' ? 'wb-type-mobile' : 'wb-type-depot';
    var pendingClass = b.isPending ? ' wb-pending-row' : '';
    var notReadyClass = (highlightNotReady && b.prepStatus !== 'ready') ? ' wb-card-not-ready' : '';
    var regHtml = b.reg ? '<div class="wb-reg">' + esc(b.reg) + '</div>' : '';
    var phoneHtml = b.telHref
      ? '<a class="wb-link" href="' + esc(b.telHref) + '">' + esc(b.phone) + '</a>'
      : (b.phone ? '<span>' + esc(b.phone) + '</span>' : '');
    var emailHtml = b.email
      ? '<a class="wb-link" href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a>'
      : '';
    var bandHtml = b.band ? '<span class="wb-band">Band ' + esc(b.band) + '</span>' : '';
    var addressHtml = '';
    if (b.type === 'mobile' && (b.address || b.postcode)) {
      var addrText = [b.address, b.postcode].filter(Boolean).join(', ');
      addressHtml = b.mapsUrl
        ? '<a class="wb-link wb-address" href="' + esc(b.mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(addrText) + '</a>'
        : '<div class="wb-address">' + esc(addrText) + '</div>';
    }
    var noteHtml = b.note
      ? '<div class="wb-note"><span class="wb-note-label">Customer note</span> ' + esc(b.note) + '</div>'
      : '';
    var contactSep = phoneHtml && emailHtml ? ' · ' : '';
    return '<article class="wb-card' + pendingClass + notReadyClass + '" data-booking-id="' + esc(b.id) + '">' +
      '<div class="wb-card-top"><span class="wb-time">' + esc(b.timeLabel) + '</span>' +
      '<span class="wb-type ' + typeClass + '">' + esc(b.typeLabel) + '</span>' + bandHtml + '</div>' +
      '<div class="wb-name">' + esc(b.name) + '</div>' + regHtml +
      '<div class="wb-contact">' + phoneHtml + contactSep + emailHtml + '</div>' +
      addressHtml + noteHtml + actionsHtml(b) + (b.isPending ? '' : prepHtml(b)) + '</article>';
  }

  function sectionHtml(title, bookings, emptyMsg, opts) {
    opts = opts || {};
    var heading = sectionTitle(title, bookings, opts.showReadyCount);
    var warnClass = opts.showReadyCount && bookings.some(function (b) { return b.prepStatus !== 'ready'; }) ? ' wb-section-warn' : '';
    var body = bookings.length
      ? bookings.map(function (b) { return rowHtml(b, opts.highlightNotReady); }).join('')
      : '<p class="wb-empty">' + esc(emptyMsg) + '</p>';
    return '<section class="wb-section' + warnClass + '"><h2 class="wb-heading">' + esc(heading) + '</h2>' +
      '<div class="wb-list">' + body + '</div></section>';
  }

  function applyBookingToCard(card, booking) {
    if (!card || !booking) return;
    var section = card.closest('.wb-section');
    var heading = section && section.querySelector('.wb-heading');
    var baseTitle = heading ? heading.textContent.split(' · ')[0] : '';
    var highlight = baseTitle === 'Today' || baseTitle === 'Tomorrow';
    var parent = card.parentNode;
    var tmp = document.createElement('div');
    tmp.innerHTML = rowHtml(booking, highlight && booking.prepStatus !== 'ready');
    var fresh = tmp.firstElementChild;
    if (fresh && parent) parent.replaceChild(fresh, card);
    updateReadyCounts();
  }

  function updateReadyCounts() {
    document.querySelectorAll('.wb-section').forEach(function (sec) {
      var h = sec.querySelector('.wb-heading');
      if (!h) return;
      var base = h.textContent.split(' · ')[0];
      if (base !== 'Today' && base !== 'Tomorrow') return;
      var cards = sec.querySelectorAll('.wb-card');
      var notReady = 0;
      cards.forEach(function (c) {
        if (!c.querySelector('.wb-prep-ready')) notReady++;
      });
      if (notReady > 0) {
        h.textContent = base + ' · ' + notReady + ' of ' + cards.length + ' not ready';
        sec.classList.add('wb-section-warn');
        cards.forEach(function (c) {
          if (!c.querySelector('.wb-prep-ready')) c.classList.add('wb-card-not-ready');
          else c.classList.remove('wb-card-not-ready');
        });
      } else {
        h.textContent = base;
        sec.classList.remove('wb-section-warn');
        cards.forEach(function (c) { c.classList.remove('wb-card-not-ready'); });
      }
    });
  }

  async function postPrep(bookingId, prepStatus) {
    var res = await fetch('/' + SLUG + '/workbench/prep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KEY, bookingId: bookingId, prepStatus: prepStatus }),
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'update_failed');
    return data.booking;
  }

  async function saveInternalNote(textarea) {
    var bookingId = textarea.getAttribute('data-booking-id');
    var card = textarea.closest('.wb-card');
    var value = textarea.value;
    try {
      var res = await fetch('/' + SLUG + '/workbench/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: KEY, bookingId: bookingId, internalNote: value }),
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || 'save_failed');
      textarea.dataset.saved = value;
    } catch (_) {
      textarea.style.borderColor = 'rgba(255, 100, 100, 0.8)';
      setTimeout(function () { textarea.style.borderColor = ''; }, 2000);
    }
  }

  async function postWorkbenchConfirm(bookingId, action) {
    var res = await fetch('/' + SLUG + '/workbench/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: KEY, bookingId: bookingId, action: action }),
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'action_failed');
    return data.outcome;
  }

  async function postCancel(manageToken, adminKey) {
    var payload = { token: manageToken };
    if (adminKey) payload.adminKey = adminKey;
    var res = await fetch('/' + SLUG + '/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'cancel_failed');
  }

  function renderAll(data) {
    var pending = '';
    if (data.pending && data.pending.length) {
      pending = '<section class="wb-section wb-section-pending">' +
        '<h2 class="wb-heading">Pending mobile requests</h2>' +
        '<div class="wb-list">' + data.pending.map(function (b) { return rowHtml(b, false); }).join('') + '</div></section>';
    }
    return pending +
      sectionHtml('Today', data.today || [], 'Nothing booked today', { showReadyCount: true, highlightNotReady: true }) +
      sectionHtml('Tomorrow', data.tomorrow || [], 'Nothing booked tomorrow', { showReadyCount: true, highlightNotReady: true }) +
      sectionHtml('Next 7 days', data.upcoming || [], 'Nothing booked in the next week');
  }

  async function refresh() {
    try {
      var res = await fetch('/' + SLUG + '/workbench/data?key=' + encodeURIComponent(KEY), { cache: 'no-store' });
      var data = await res.json();
      if (!data.ok) return;
      document.getElementById('wbMain').innerHTML = renderAll(data) +
        '<p class="wb-updated" id="wbUpdatedFoot"' + (data.updatedAt ? '' : ' hidden') + '>' +
        (data.updatedAt ? 'Updated ' + new Date(data.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '') +
        '</p>';
    } catch (_) { /* silent — keep last good render */ }
  }

  document.addEventListener('click', function (e) {
    var confirmBtn = e.target.closest('[data-wb-confirm]');
    if (confirmBtn) {
      e.preventDefault();
      if (!confirm('Confirm this mobile visit? The customer will receive their confirmation email.')) return;
      var cid = confirmBtn.getAttribute('data-id');
      confirmBtn.disabled = true;
      postWorkbenchConfirm(cid, 'confirm').then(function () { refresh(); }).catch(function () {
        confirmBtn.disabled = false;
      });
      return;
    }
    var declineBtn = e.target.closest('[data-wb-decline]');
    if (declineBtn) {
      e.preventDefault();
      if (!confirm('Decline this request? The time will be freed and the customer will be emailed.')) return;
      var did = declineBtn.getAttribute('data-id');
      declineBtn.disabled = true;
      postWorkbenchConfirm(did, 'decline').then(function () { refresh(); }).catch(function () {
        declineBtn.disabled = false;
      });
      return;
    }
    var cancelBtn = e.target.closest('[data-wb-cancel]');
    if (cancelBtn) {
      e.preventDefault();
      if (!confirm('Cancel this booking? The customer will be notified.')) return;
      var token = cancelBtn.getAttribute('data-token');
      var adminKey = cancelBtn.getAttribute('data-admin-key') || null;
      cancelBtn.disabled = true;
      postCancel(token, adminKey).then(function () { refresh(); }).catch(function () {
        cancelBtn.disabled = false;
      });
      return;
    }
    var adv = e.target.closest('[data-prep-advance]');
    if (adv) {
      e.preventDefault();
      var id = adv.getAttribute('data-id');
      var next = adv.getAttribute('data-next');
      var card = adv.closest('.wb-card');
      adv.disabled = true;
      postPrep(id, next).then(function (booking) {
        applyBookingToCard(card, booking);
      }).catch(function () {
        adv.disabled = false;
      });
      return;
    }
    var back = e.target.closest('[data-prep-back]');
    if (back) {
      e.preventDefault();
      var bid = back.getAttribute('data-id');
      var prev = back.getAttribute('data-prev');
      var bcard = back.closest('.wb-card');
      back.disabled = true;
      postPrep(bid, prev).then(function (booking) {
        applyBookingToCard(bcard, booking);
      }).catch(function () {
        back.disabled = false;
      });
    }
  });

  document.addEventListener('focusout', function (e) {
    var ta = e.target;
    if (!ta.matches || !ta.matches('.wb-internal-note')) return;
    if (ta.dataset.saved === ta.value) return;
    clearTimeout(noteSaveTimers[ta.getAttribute('data-booking-id')]);
    noteSaveTimers[ta.getAttribute('data-booking-id')] = setTimeout(function () {
      saveInternalNote(ta).then(function () { ta.dataset.saved = ta.value; });
    }, 300);
  });

  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refresh();
  });
})();
  <\/script>
</body>
</html>`;
}
