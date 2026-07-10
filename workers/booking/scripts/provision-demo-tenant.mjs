// Provision a consequence-free DEMO booking tenant for a pitch site.
//
// Repeatable across pitch sites: edit the TENANT block, run:
//   node scripts/provision-demo-tenant.mjs
// then apply the emitted SQL and bust the KV cache:
//   npx wrangler d1 execute bookings --remote --file scripts/provision-<slug>.sql
//   npx wrangler kv key delete "tenant:<slug>" --binding TOKEN_CACHE --remote
//
// demoMode:true runs the full booking flow with NO side effects (no Google
// Calendar event, no DB row, no email). Config is validated against the live
// schema, so a bad value fails here instead of bricking the widget.

import { applyDefaults, validateFull } from '../src/schema.js';
import { writeFileSync } from 'fs';

// ── EDIT PER SITE ───────────────────────────────────────────────────────────
const TENANT = {
  slug: 'smart-tyres-demo',
  displayName: 'Smart Tyres Gloucester',
  demoMode: true,          // consequence-free — keep true for every pitch demo
  mobileBooking: false,    // depot-only
  regLookup: false,        // avoid real DVLA calls in a demo
  slotDuration: 30,
  minLeadMinutes: 60,
  maxAdvanceDays: 30,
  timezone: 'Europe/London',
  workingHours: {
    '1': { open: '09:00', close: '18:00' },
    '2': { open: '09:00', close: '18:00' },
    '3': { open: '09:00', close: '18:00' },
    '4': { open: '09:00', close: '18:00' },
    '5': { open: '09:00', close: '18:00' },
    '6': { open: '09:00', close: '16:30' },
  },
  phoneEnabled: true,
  phoneRequired: false,
  noteEnabled: true,
  noteLabel: 'Tyre size or reg (if you have it)',
  addressEnabled: false,
  successHeading: 'Slot reserved',
  successMessage: 'This is a demo — no real booking was made. On the live site a confirmation lands in your inbox.',
  theme: { bg: '#0c0f16', accent: '#1f6fe6', accentH: '#1657ba', accentFg: '#ffffff', accentRgb: '31, 111, 230' },
};
// ─────────────────────────────────────────────────────────────────────────────

const merged = { ...applyDefaults(), ...TENANT };
const res = validateFull(merged);
if (!res.ok) { console.error('INVALID CONFIG:', res.error); process.exit(1); }
if (res.config.demoMode !== true) {
  console.error('demoMode was stripped by validateFull — is it a CONFIG_SCHEMA field?');
  process.exit(1);
}

const esc = JSON.stringify(res.config).replace(/'/g, "''");
const sql =
  `INSERT INTO tenants (slug, config_json, updated_at) VALUES ('${TENANT.slug}', '${esc}', datetime('now'))\n` +
  `  ON CONFLICT(slug) DO UPDATE SET config_json = excluded.config_json, updated_at = datetime('now');\n`;

writeFileSync(new URL(`./provision-${TENANT.slug}.sql`, import.meta.url), sql);
console.log(`OK  slug=${TENANT.slug}  name="${res.config.displayName}"  demoMode=${res.config.demoMode}  mobile=${res.config.mobileBooking}`);
console.log(`wrote scripts/provision-${TENANT.slug}.sql`);
