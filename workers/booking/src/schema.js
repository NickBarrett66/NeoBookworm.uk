// Config schema — the single contract that drives:
//   1. validation of every write to the `tenants` table (Worker, admin.js)
//   2. the dashboard's tenant-edit form (rendered generically from this metadata)
//   3. (future) the portal's client-editable subset, and content fields beyond booking
//
// Design rule (Phase 2.5): keep this CONTENT-TYPE AGNOSTIC. A field is described
// by a `type` whose validator lives in TYPE_VALIDATORS. Adding a new capability —
// a per-tenant headline, a gallery image, a service description — is a matter of
// adding a field below (and, for a genuinely new shape, a validator), NOT touching
// the booking logic. That is what lets this generalise into a light client CMS.
//
// Each field:
//   key       — property name in the stored config object
//   label     — human label for the dashboard/portal form
//   type      — drives the input widget and the validator
//   scope     — 'nick' (dashboard only) | 'client' (also portal-editable later)
//   phase     — which roadmap phase introduced it (documentation only)
//   required  — must be present in a complete config (validateFull enforces)
//   nullable  — may be explicitly null/empty
//   default   — applied to brand-new tenants and when a value is absent
//   + type-specific metadata (min/max, options, fields, max length, hint)

const DOW = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

export const CONFIG_SCHEMA = [
  { key: 'displayName', label: 'Business name', type: 'text', scope: 'nick', phase: 1, required: true, max: 80,
    hint: 'Shown as "Book a slot at …".' },
  { key: 'homeUrl', label: 'Website URL', type: 'url', scope: 'nick', phase: 1, nullable: true,
    hint: 'The "Back to …" link target. Leave blank to hide it.' },
  { key: 'calendarId', label: 'Google Calendar ID', type: 'text', scope: 'nick', phase: 1, nullable: true, max: 200,
    hint: 'Leave blank to use the default NeoBookworm calendar.' },
  { key: 'timezone', label: 'Timezone', type: 'select', scope: 'nick', phase: 1, options: ['Europe/London'], default: 'Europe/London' },
  { key: 'slotDuration', label: 'Slot length (minutes)', type: 'int', scope: 'nick', phase: 1, min: 5, max: 240, default: 30 },
  { key: 'minLeadMinutes', label: 'Minimum notice (minutes)', type: 'int', scope: 'client', phase: 1, min: 0, max: 10080, default: 120,
    hint: 'How far ahead the soonest bookable slot must be (120 = 2 hours).' },
  { key: 'maxAdvanceDays', label: 'How far ahead bookable (days)', type: 'int', scope: 'client', phase: 1, min: 1, max: 365, default: 30 },
  { key: 'regLookup', label: 'Vehicle registration lookup', type: 'bool', scope: 'nick', phase: 1, default: false,
    hint: 'Shows the reg-plate lookup field (tyre/motor trades only).' },
  { key: 'noteLabel', label: 'Note field label', type: 'text', scope: 'client', phase: 4, nullable: true, max: 60, default: 'Note',
    hint: 'The label above the free-text box on the details form.' },
  { key: 'notePlaceholder', label: 'Note field placeholder', type: 'text', scope: 'client', phase: 4, nullable: true, max: 120,
    default: 'Anything else we should know', hint: 'Greyed-out example text inside the box.' },
  { key: 'logoUrl', label: 'Logo', type: 'image', scope: 'nick', phase: 3, nullable: true,
    hint: 'Shown in the widget header. PNG/SVG/WebP, ideally transparent.' },
  { key: 'introLine', label: 'Intro line', type: 'text', scope: 'client', phase: 3, nullable: true, max: 120,
    hint: 'Optional tagline shown under the header, e.g. "Same-day fitting available".' },
  { key: 'successHeading', label: 'Confirmation heading', type: 'text', scope: 'client', phase: 3, nullable: true, max: 60,
    default: 'Booking confirmed', hint: 'Shown after a successful booking.' },
  { key: 'successMessage', label: 'Confirmation message', type: 'text', scope: 'client', phase: 3, nullable: true, max: 160,
    default: 'A confirmation has been sent to your email address.', hint: 'The line under the confirmation heading.' },
  { key: 'theme', label: 'Theme colours', type: 'group', scope: 'nick', phase: 3, fields: [
    { key: 'bg', label: 'Background', type: 'color', default: '#0f1f3d' },
    { key: 'accent', label: 'Accent', type: 'color', default: '#f5a623' },
    { key: 'accentH', label: 'Accent (hover)', type: 'color', default: '#d4891a' },
    { key: 'accentFg', label: 'Accent text', type: 'color', default: '#0f1f3d' },
    { key: 'accentRgb', label: 'Accent RGB', type: 'text', default: '245, 166, 35', max: 20,
      hint: 'Comma-separated, must match the accent colour.' },
  ] },
  { key: 'workingHours', label: 'Opening hours', type: 'hours', scope: 'client', phase: 1, required: true, days: DOW },
  { key: 'bufferMinutes', label: 'Buffer between appointments (minutes)', type: 'int', scope: 'client', phase: 5, min: 0, max: 120, default: 0,
    hint: 'Gap kept free around each booking. 0 = back-to-back allowed.' },
  { key: 'lunchBreak', label: 'Daily break', type: 'timerange', scope: 'client', phase: 5, nullable: true,
    hint: 'A midday gap with no bookable slots, e.g. 12:30–13:30. Leave off for none.' },
  { key: 'cancellationCutoffMinutes', label: 'Cancellation cutoff (minutes)', type: 'int', scope: 'client', phase: 5, min: 0, max: 10080, nullable: true,
    hint: 'How close to the appointment a customer can still cancel/reschedule online. Leave blank to use the minimum-notice value.' },
  { key: 'locationType', label: 'Appointment type', type: 'select', scope: 'client', phase: 4, default: 'in_person',
    options: [{ value: 'in_person', label: 'In person' }, { value: 'phone', label: 'Phone call' }, { value: 'video', label: 'Video call' }],
    hint: 'Changes the wording on the widget, calendar event and emails.' },
  { key: 'locationDetail', label: 'Location detail', type: 'text', scope: 'client', phase: 4, nullable: true, max: 200,
    hint: 'In person: your address. Video: the meeting link. Phone: leave blank (we use the customer number).' },
  { key: 'phoneEnabled', label: 'Ask for phone number', type: 'bool', scope: 'client', phase: 4, default: true },
  { key: 'phoneRequired', label: 'Phone required', type: 'bool', scope: 'client', phase: 4, default: true },
  { key: 'noteEnabled', label: 'Show note field', type: 'bool', scope: 'client', phase: 4, default: true },
  { key: 'noteRequired', label: 'Note required', type: 'bool', scope: 'client', phase: 4, default: false },
  { key: 'addressEnabled', label: 'Ask for address', type: 'bool', scope: 'client', phase: 4, default: false,
    hint: 'Shows an address + postcode field (postcode checked via postcodes.io). Useful for home visits.' },
  { key: 'addressRequired', label: 'Address required', type: 'bool', scope: 'client', phase: 4, default: false },
  { key: 'addressLookup', label: 'Address lookup', type: 'select', scope: 'nick', phase: 4, default: 'postcode',
    options: [
      { value: 'postcode', label: 'Postcode check (free)' },
      { value: 'full', label: 'Full address finder (Postcoder — paid)' },
    ],
    hint: 'Free: validates the postcode and shows the area. Full: customers pick their exact address (Postcoder, 2 credits/UK lookup; needs POSTCODER_API_KEY secret).' },
  { key: 'customQuestions', label: 'Custom questions', type: 'questions', scope: 'client', phase: 4, default: [],
    hint: 'Extra questions shown on the booking form. Answers appear in the calendar event and your email.' },
  { key: 'workbenchEnabled', label: 'Staff workbench', type: 'bool', scope: 'nick', phase: 'workbench', default: false,
    hint: 'Enables the read-only day-view page for staff (bookmark URL with ?key=…).' },
  { key: 'workbenchToken', label: 'Workbench link token', type: 'text', scope: 'nick', phase: 'workbench', nullable: true, min: 32, max: 128, secret: true,
    hint: 'Secret token for the staff workbench URL (?key=…). At least 32 characters. Rotate if leaked.' },
];

const FIELD_BY_KEY = new Map(CONFIG_SCHEMA.map((f) => [f.key, f]));

// ── Type validators ────────────────────────────────────────────────────────────
// Each returns { value } (cleaned) or { error } (string). They never throw.

const TIME_RE  = /^([01]\d|2[0-3]):[0-5]\d$/;
const URL_RE   = /^https?:\/\/[^\s]+$/i;
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const TYPE_VALIDATORS = {
  text(value, field) {
    if (value == null || value === '') {
      if (field.nullable || !field.required) return { value: field.nullable ? null : (field.default ?? '') };
      return { error: `${field.label} is required` };
    }
    if (typeof value !== 'string') return { error: `${field.label} must be text` };
    const v = value.trim();
    if (field.min != null && v.length < field.min) return { error: `${field.label} must be at least ${field.min} characters` };
    if (field.max && v.length > field.max) return { error: `${field.label} must be ${field.max} characters or fewer` };
    return { value: v };
  },

  url(value, field) {
    if (value == null || value === '') return field.nullable ? { value: null } : { error: `${field.label} is required` };
    if (typeof value !== 'string' || !URL_RE.test(value.trim())) return { error: `${field.label} must start with http:// or https://` };
    return { value: value.trim() };
  },

  // An uploaded asset URL (logo, and later gallery/content images). Stored as a
  // plain URL string; the dashboard uploads the file to R2 and sets this value.
  image(value, field) {
    if (value == null || value === '') return { value: null };
    if (typeof value !== 'string' || !URL_RE.test(value.trim())) return { error: `${field.label} must be an uploaded image URL` };
    return { value: value.trim() };
  },

  int(value, field) {
    if (value == null || value === '') {
      if (field.nullable) return { value: null };
      if (field.default != null) return { value: field.default };
      return { error: `${field.label} is required` };
    }
    const n = Number(value);
    if (!Number.isInteger(n)) return { error: `${field.label} must be a whole number` };
    if (field.min != null && n < field.min) return { error: `${field.label} must be at least ${field.min}` };
    if (field.max != null && n > field.max) return { error: `${field.label} must be at most ${field.max}` };
    return { value: n };
  },

  bool(value) {
    return { value: value === true || value === 'true' || value === 1 || value === '1' };
  },

  select(value, field) {
    // options may be plain strings or { value, label } objects.
    const values = field.options.map((o) => (typeof o === 'object' ? o.value : o));
    if (value == null || value === '') return { value: field.default ?? values[0] };
    if (!values.includes(value)) return { error: `${field.label} must be one of: ${values.join(', ')}` };
    return { value };
  },

  // Tenant-defined extra questions. Array of { id, label, type, required, options? }.
  questions(value, field) {
    if (value == null || value === '') return { value: [] };
    if (!Array.isArray(value)) return { error: `${field.label} must be a list` };
    if (value.length > 12) return { error: 'Too many custom questions (max 12)' };
    const types = ['text', 'textarea', 'select', 'checkbox'];
    const out = [];
    const seen = new Set();
    for (const q of value) {
      if (!q || typeof q !== 'object') return { error: 'A custom question is malformed' };
      const label = String(q.label || '').trim();
      if (!label) return { error: 'Every custom question needs a label' };
      if (label.length > 100) return { error: `Question label too long: "${label.slice(0, 30)}…"` };
      const type = types.includes(q.type) ? q.type : 'text';
      let id = String(q.id || q.label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!id) id = `q${out.length + 1}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      const item = { id, label, type, required: q.required === true };
      if (type === 'select') {
        const opts = Array.isArray(q.options)
          ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 20)
          : [];
        if (opts.length === 0) return { error: `Dropdown question "${label}" needs at least one option` };
        item.options = opts;
      }
      out.push(item);
    }
    return { value: out };
  },

  color(value, field) {
    if (value == null || value === '') return { value: field.default };
    if (typeof value !== 'string' || !COLOR_RE.test(value.trim())) return { error: `${field.label} must be a hex colour like #0f1f3d` };
    return { value: value.trim().toLowerCase() };
  },

  group(value, field) {
    const obj = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const sub of field.fields) {
      const validator = TYPE_VALIDATORS[sub.type];
      const r = validator(obj[sub.key], sub);
      if (r.error) return { error: r.error };
      out[sub.key] = r.value;
    }
    return { value: out };
  },

  // An optional daily time window (e.g. a lunch break). null = no window.
  timerange(value, field) {
    const empty = value == null || value === '' ||
      (typeof value === 'object' && !value.start && !value.end);
    if (empty) return { value: null };
    if (typeof value !== 'object') return { error: `${field.label} is malformed` };
    const { start, end } = value;
    if (!TIME_RE.test(start || '') || !TIME_RE.test(end || '')) {
      return { error: `${field.label} must be HH:MM times` };
    }
    if (start >= end) return { error: `${field.label}: start must be before end` };
    return { value: { start, end } };
  },

  hours(value, field) {
    if (value == null || typeof value !== 'object') return { error: `${field.label} are required` };
    const allowed = new Set(field.days.map((d) => d.key));
    const out = {};
    for (const [day, hrs] of Object.entries(value)) {
      if (!allowed.has(day)) return { error: `Invalid day in opening hours: ${day}` };
      if (!hrs || typeof hrs !== 'object') return { error: `Opening hours for day ${day} are malformed` };
      const { open, close } = hrs;
      if (!TIME_RE.test(open || '') || !TIME_RE.test(close || '')) {
        return { error: `Opening hours for day ${day} must be HH:MM times` };
      }
      if (open >= close) return { error: `Opening time must be before closing time (day ${day})` };
      out[day] = { open, close };
    }
    if (Object.keys(out).length === 0) return { error: 'At least one open day is required' };
    return { value: out };
  },
};

// ── Public API ──────────────────────────────────────────────────────────────────

/** Field metadata for one scope, safe to send to the browser (no validators). */
export function schemaForScope(scope) {
  const fields = scope === 'client'
    ? CONFIG_SCHEMA.filter((f) => f.scope === 'client')
    : CONFIG_SCHEMA;
  // structuredClone-free shallow copy is fine — these are plain data objects.
  return JSON.parse(JSON.stringify(fields));
}

/** A complete config object built from schema defaults — the base for a new tenant. */
export function applyDefaults() {
  const out = {};
  for (const field of CONFIG_SCHEMA) {
    if (field.type === 'group') {
      out[field.key] = {};
      for (const sub of field.fields) out[field.key][sub.key] = sub.default ?? null;
    } else if (field.type === 'hours') {
      out[field.key] = { 1: { open: '09:00', close: '17:00' }, 2: { open: '09:00', close: '17:00' },
        3: { open: '09:00', close: '17:00' }, 4: { open: '09:00', close: '17:00' }, 5: { open: '09:00', close: '17:00' } };
    } else if (field.type === 'questions') {
      out[field.key] = [];
    } else if (field.default !== undefined) {
      out[field.key] = field.default;
    } else if (field.nullable) {
      out[field.key] = null;
    }
  }
  return out;
}

/**
 * Validate a partial set of incoming changes for a scope.
 * Rejects any key not allowed for that scope (whitelist). Returns the cleaned
 * patch (subset) or an error. Used for both full-object sends (dashboard) and
 * partial sends (future portal).
 */
export function validatePatch(input, scope = 'nick') {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Config must be an object' };
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) return { ok: false, error: `Unknown config field: ${key}` };
    if (scope === 'client' && field.scope !== 'client') {
      return { ok: false, error: `Field not editable at this level: ${key}` };
    }
    const r = TYPE_VALIDATORS[field.type](value, field);
    if (r.error) return { ok: false, error: r.error };
    patch[key] = r.value;
  }
  return { ok: true, patch };
}

/**
 * Validate a complete (merged) config before it is persisted, so we never write
 * a config that would break the booking page. Fills defaults for absent fields.
 */
export function validateFull(config) {
  if (!config || typeof config !== 'object') return { ok: false, error: 'Config must be an object' };
  const out = {};
  for (const field of CONFIG_SCHEMA) {
    const r = TYPE_VALIDATORS[field.type](config[field.key], field);
    if (r.error) return { ok: false, error: r.error };
    out[field.key] = r.value;
  }
  return { ok: true, config: out };
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}
