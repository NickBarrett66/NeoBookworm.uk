function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBookingPage(config, slug) {
  const displayName = escHtml(config.displayName);
  const slugJson = JSON.stringify(slug);

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
    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #0f1f3d;
      color: #fff;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .wrap {
      max-width: 520px;
      margin: 0 auto;
      padding: 1.25rem 1rem 2rem;
    }

    h1 {
      margin: 0 0 1.25rem;
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1.35;
    }

    .view[hidden] { display: none !important; }

    /* Day strip */
    .day-strip {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x mandatory;
      padding-bottom: 0.5rem;
      margin: 0 -1rem 1.25rem;
      padding-left: 1rem;
      padding-right: 1rem;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.25) transparent;
    }

    .day-strip::-webkit-scrollbar { height: 4px; }
    .day-strip::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.25);
      border-radius: 2px;
    }

    .day-btn {
      flex: 0 0 auto;
      scroll-snap-align: start;
      min-width: 4.5rem;
      padding: 0.6rem 0.5rem;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 8px;
      background: transparent;
      color: #fff;
      font-family: inherit;
      font-size: 0.8125rem;
      line-height: 1.25;
      text-align: center;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, opacity 0.15s;
    }

    .day-btn .dow {
      display: block;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      opacity: 0.85;
    }

    .day-btn:hover:not(:disabled):not(.selected) {
      border-color: rgba(255,255,255,0.6);
      background: rgba(255,255,255,0.06);
    }

    .day-btn:focus-visible {
      outline: 2px solid #f5a623;
      outline-offset: 2px;
    }

    .day-btn.selected {
      background: #f5a623;
      border-color: #f5a623;
      color: #0f1f3d;
      font-weight: 600;
    }

    .day-btn.selected .dow { opacity: 1; }

    .day-btn:disabled,
    .day-btn.disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* Slots area */
    .slots-area { min-height: 5rem; }

    .slots-loading,
    .slots-empty,
    .form-error,
    .slot-taken-msg {
      text-align: center;
      padding: 1.5rem 0.5rem;
      font-size: 0.9375rem;
      opacity: 0.9;
    }

    .slots-loading .spinner {
      display: inline-block;
      width: 1.25rem;
      height: 1.25rem;
      border: 2px solid rgba(255,255,255,0.25);
      border-top-color: #f5a623;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 0.5rem;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
      gap: 0.5rem;
    }

    .time-btn {
      min-height: 44px;
      padding: 0.5rem 0.75rem;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 8px;
      background: transparent;
      color: #fff;
      font-family: inherit;
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .time-btn:hover:not(.selected) {
      border-color: rgba(255,255,255,0.6);
      background: rgba(255,255,255,0.06);
    }

    .time-btn:focus-visible {
      outline: 2px solid #f5a623;
      outline-offset: 2px;
    }

    .time-btn.selected {
      background: #f5a623;
      border-color: #f5a623;
      color: #0f1f3d;
      font-weight: 600;
    }

    .continue-btn {
      display: block;
      width: 100%;
      margin-top: 1.25rem;
      min-height: 48px;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      background: #f5a623;
      color: #0f1f3d;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
    }

    .continue-btn:hover { opacity: 0.92; }
    .continue-btn:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }

    /* Form view */
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 1rem;
      padding: 0.35rem 0;
      border: none;
      background: none;
      color: rgba(255,255,255,0.85);
      font-family: inherit;
      font-size: 0.875rem;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .back-btn:hover { color: #fff; }
    .back-btn:focus-visible {
      outline: 2px solid #f5a623;
      outline-offset: 2px;
    }

    .booking-summary {
      margin: 0 0 1.25rem;
      padding: 0.875rem 1rem;
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
      font-size: 0.9375rem;
      font-weight: 500;
    }

    .field {
      margin-bottom: 1rem;
    }

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
      border: 1px solid #0f1f3d;
      border-radius: 6px;
      background: #fff;
      color: #1a1a1a;
      font-family: inherit;
      font-size: 1rem;
      line-height: 1.4;
    }

    .field textarea {
      min-height: 5rem;
      resize: vertical;
    }

    .field input:focus,
    .field textarea:focus {
      outline: 2px solid #f5a623;
      outline-offset: 0;
    }

    .hp-field {
      position: absolute;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }

    .submit-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      min-height: 48px;
      margin-top: 0.5rem;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      background: #f5a623;
      color: #0f1f3d;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s, background 0.15s;
    }

    .submit-btn:hover:not(:disabled) { opacity: 0.92; }

    .submit-btn:disabled {
      background: #8a8a8a;
      color: #e8e8e8;
      cursor: not-allowed;
      opacity: 0.85;
    }

    .submit-btn:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }

    .submit-btn .spinner {
      width: 1.125rem;
      height: 1.125rem;
      border: 2px solid rgba(15,31,61,0.25);
      border-top-color: #0f1f3d;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    .success-msg {
      text-align: center;
      padding: 2.5rem 1rem;
    }

    .success-msg h2 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 600;
      color: #f5a623;
    }

    .success-msg p {
      margin: 0;
      font-size: 0.9375rem;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div id="view-picker" class="view">
      <h1>Book a slot at ${displayName}</h1>
      <div class="day-strip" id="day-strip" role="listbox" aria-label="Choose a date"></div>
      <div class="slots-area">
        <div class="slots-loading" id="slots-loading" hidden>
          <span class="spinner" aria-hidden="true"></span>Loading times…
        </div>
        <div class="slots-empty" id="slots-empty" hidden>No slots available — try another day</div>
        <div class="slot-taken-msg" id="slot-taken-msg" hidden>Sorry, that slot was just taken. Picking another…</div>
        <div class="slots-grid" id="slots-grid" role="listbox" aria-label="Choose a time"></div>
      </div>
      <button type="button" class="continue-btn" id="continue-btn" hidden>Continue →</button>
    </div>

    <div id="view-form" class="view" hidden>
      <button type="button" class="back-btn" id="back-btn">← Back</button>
      <p class="booking-summary" id="booking-summary"></p>
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
          <label for="note">Note <span style="font-weight:400;opacity:0.75">(optional)</span></label>
          <textarea id="note" name="note" maxlength="500" placeholder="e.g. tyre size, vehicle reg"></textarea>
        </div>
        <div class="hp-field" aria-hidden="true">
          <label for="company">Company</label>
          <input type="text" id="company" name="company" tabindex="-1" autocomplete="off">
        </div>
        <p class="form-error" id="form-error" hidden>Something went wrong — please try again</p>
        <button type="submit" class="submit-btn" id="submit-btn">Confirm booking</button>
      </form>
    </div>

    <div id="view-success" class="view success-msg" hidden>
      <h2>Booking confirmed</h2>
      <p>Check your email for confirmation details.</p>
    </div>
  </div>

  <script>
(function () {
  var SLUG = ${slugJson};
  var TZ = 'Europe/London';
  var DAYS_SHOWN = 14;

  var viewPicker = document.getElementById('view-picker');
  var viewForm = document.getElementById('view-form');
  var viewSuccess = document.getElementById('view-success');
  var dayStrip = document.getElementById('day-strip');
  var slotsLoading = document.getElementById('slots-loading');
  var slotsEmpty = document.getElementById('slots-empty');
  var slotsGrid = document.getElementById('slots-grid');
  var continueBtn = document.getElementById('continue-btn');
  var backBtn = document.getElementById('back-btn');
  var bookingSummary = document.getElementById('booking-summary');
  var bookingForm = document.getElementById('booking-form');
  var formError = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit-btn');
  var slotTakenMsg = document.getElementById('slot-taken-msg');

  var days = [];
  var selectedDate = null;
  var selectedTime = null;
  var selectedSlot = null;
  var zeroSlotDays = Object.create(null);
  var fetchToken = 0;

  function londonToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function addDaysIso(iso, n) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }

  function weekdayLondon(iso) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  function dateFromIso(iso) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0));
  }

  function formatDayBtn(iso) {
    var d = dateFromIso(iso);
    var dow = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ }).format(d);
    var rest = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }).format(d);
    return { dow: dow, rest: rest };
  }

  function formatSummary(iso, time) {
    var d = dateFromIso(iso);
    var dateStr = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: TZ
    }).format(d);
    return dateStr + ' at ' + time;
  }

  function buildDays() {
    var start = londonToday();
    days = [];
    for (var i = 0; i < DAYS_SHOWN; i++) {
      var iso = addDaysIso(start, i);
      days.push({ iso: iso, sunday: weekdayLondon(iso) === 0 });
    }
  }

  function renderDayStrip() {
    dayStrip.textContent = '';
    days.forEach(function (day) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-btn';
      btn.dataset.date = day.iso;
      btn.setAttribute('role', 'option');

      var isDisabled = day.sunday || zeroSlotDays[day.iso];
      if (isDisabled) {
        btn.disabled = true;
        if (zeroSlotDays[day.iso]) btn.classList.add('disabled');
      }
      if (day.iso === selectedDate) btn.classList.add('selected');

      var parts = formatDayBtn(day.iso);
      btn.innerHTML = '<span class="dow">' + parts.dow + '</span>' + parts.rest;
      btn.addEventListener('click', function () { selectDay(day.iso); });
      dayStrip.appendChild(btn);
    });
  }

  function clearSlotsUI() {
    slotsGrid.textContent = '';
    slotsEmpty.hidden = true;
    slotTakenMsg.hidden = true;
    continueBtn.hidden = true;
    selectedTime = null;
    selectedSlot = null;
  }

  function setSlotsLoading(on) {
    slotsLoading.hidden = !on;
  }

  function selectDay(iso) {
    if (zeroSlotDays[iso]) return;
    var day = days.find(function (d) { return d.iso === iso; });
    if (!day || day.sunday) return;

    selectedDate = iso;
    selectedTime = null;
    selectedSlot = null;
    continueBtn.hidden = true;
    slotTakenMsg.hidden = true;
    renderDayStrip();
    loadSlots(iso);
  }

  async function loadSlots(iso) {
    var token = ++fetchToken;
    clearSlotsUI();
    setSlotsLoading(true);

    try {
      var res = await fetch('/' + SLUG + '/slots?date=' + encodeURIComponent(iso));
      var data = await res.json();
      if (token !== fetchToken) return;

      setSlotsLoading(false);

      if (!res.ok || !data.slots) {
        slotsEmpty.hidden = false;
        slotsEmpty.textContent = 'Unable to load times — please try again';
        return;
      }

      if (data.slots.length === 0) {
        zeroSlotDays[iso] = true;
        slotsEmpty.hidden = false;
        renderDayStrip();
        if (selectedDate === iso) {
          var next = days.find(function (d) {
            return !d.sunday && !zeroSlotDays[d.iso] && d.iso > iso;
          });
          if (next) selectDay(next.iso);
        }
        return;
      }

      data.slots.forEach(function (label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'time-btn';
        btn.textContent = label;
        btn.dataset.time = label;
        btn.setAttribute('role', 'option');
        if (label === selectedTime) btn.classList.add('selected');
        btn.addEventListener('click', function () { selectTime(label); });
        slotsGrid.appendChild(btn);
      });
    } catch (err) {
      if (token !== fetchToken) return;
      setSlotsLoading(false);
      slotsEmpty.hidden = false;
      slotsEmpty.textContent = 'Unable to load times — please try again';
    }
  }

  function selectTime(label) {
    selectedTime = label;
    selectedSlot = selectedDate + 'T' + label + ':00';
    slotsGrid.querySelectorAll('.time-btn').forEach(function (btn) {
      btn.classList.toggle('selected', btn.dataset.time === label);
    });
    continueBtn.hidden = false;
  }

  function showView(name) {
    viewPicker.hidden = name !== 'picker';
    viewForm.hidden = name !== 'form';
    viewSuccess.hidden = name !== 'success';
  }

  function initialDay() {
    var today = days[0];
    if (!today.sunday) return today.iso;
    return days[1] ? days[1].iso : today.iso;
  }

  continueBtn.addEventListener('click', function () {
    if (!selectedDate || !selectedTime) return;
    bookingSummary.textContent = formatSummary(selectedDate, selectedTime);
    formError.hidden = true;
    showView('form');
  });

  backBtn.addEventListener('click', function () {
    formError.hidden = true;
    showView('picker');
    renderDayStrip();
    if (selectedDate) loadSlots(selectedDate);
  });

  bookingForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.hidden = true;

    if (!bookingForm.reportValidity()) return;

    submitBtn.disabled = true;
    var label = submitBtn.textContent;
    submitBtn.textContent = '';
    var spin = document.createElement('span');
    spin.className = 'spinner';
    spin.setAttribute('aria-hidden', 'true');
    submitBtn.appendChild(spin);
    submitBtn.appendChild(document.createTextNode('Booking…'));

    var body = {
      slot: selectedSlot,
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      note: document.getElementById('note').value.trim() || null,
      company: document.getElementById('company').value
    };

    try {
      var res = await fetch('/' + SLUG + '/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await res.json();

      if (data.ok) {
        try { window.parent.postMessage('booking-confirmed', '*'); } catch (_) {}
        showView('success');
        return;
      }

      if (data.error === 'slot_taken') {
        submitBtn.replaceChildren();
        submitBtn.textContent = label;
        submitBtn.disabled = false;
        showView('picker');
        slotTakenMsg.hidden = false;
        selectedTime = null;
        selectedSlot = null;
        continueBtn.hidden = true;
        renderDayStrip();
        await loadSlots(selectedDate);
        return;
      }

      formError.hidden = false;
      submitBtn.replaceChildren();
      submitBtn.textContent = label;
      submitBtn.disabled = false;
    } catch (err) {
      formError.hidden = false;
      submitBtn.replaceChildren();
      submitBtn.textContent = label;
      submitBtn.disabled = false;
    }
  });

  buildDays();
  var first = initialDay();
  selectedDate = first;
  renderDayStrip();
  loadSlots(first);
})();
  </script>
</body>
</html>`;
}
