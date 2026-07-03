// Hardcoded fallback — used if D1 is unavailable or slug not yet in DB.
// New tenants should be added as D1 rows via migrations, not here.
export const SLUG_CONFIG = {
  hetyres: {
    displayName: 'HE Tyres',
    homeUrl: 'https://neobookworm.uk/he-tyres/',
    theme: {
      bg:        '#1a2336',
      accent:    '#ec7325',
      accentH:   '#d35f17',
      accentFg:  '#1a2336',
      accentRgb: '236, 115, 37',
    },
    calendarId: null,
    slotDuration: 30,
    minLeadMinutes: 120,
    maxAdvanceDays: 60,
    timezone: 'Europe/London',
    regLookup: true,
    mobileBooking: true,
    addressEnabled: true,
    addressRequired: true,
    addressLookup: 'full',
    workingHours: {
      1: { open: '08:30', close: '17:00' },
      2: { open: '08:30', close: '17:00' },
      3: { open: '08:30', close: '17:00' },
      4: { open: '08:30', close: '17:00' },
      5: { open: '08:30', close: '17:00' },
      6: { open: '08:30', close: '12:30' },
    },
  },

  neobookworm: {
    displayName: 'NeoBookworm',
    homeUrl: 'https://neobookworm.uk',
    theme: {
      bg:        '#0f1f3d',
      accent:    '#f5a623',
      accentH:   '#d4891a',
      accentFg:  '#0f1f3d',
      accentRgb: '245, 166, 35',
    },
    calendarId: 'c_44a4cefa0af749692e9941bf12924e253c573b55a6858cbf15c7b4568c2952a4@group.calendar.google.com',
    slotDuration: 30,
    minLeadMinutes: 120,
    maxAdvanceDays: 30,
    timezone: 'Europe/London',
    regLookup: false,
    workingHours: {
      1: { open: '09:00', close: '17:30' },
      2: { open: '09:00', close: '17:30' },
      3: { open: '09:00', close: '17:30' },
      4: { open: '09:00', close: '17:30' },
      5: { open: '09:00', close: '17:30' },
    },
  },
};

const KV_TTL = 3600; // 1 hour

// SQLite has no native boolean, so `json_set(..., true)` in migrations stores an
// integer 1 (and false → 0). JS strict checks like `config.mobileBooking === true`
// would then fail. Coerce known boolean flags back to real booleans on read.
const BOOLEAN_CONFIG_KEYS = [
  'mobileBooking',
  'addressEnabled',
  'addressRequired',
  'phoneEnabled',
  'phoneRequired',
  'noteEnabled',
  'noteRequired',
  'regLookup',
  'workbenchEnabled',
];

function normalizeConfig(config) {
  if (!config || typeof config !== 'object') return config;
  for (const key of BOOLEAN_CONFIG_KEYS) {
    if (key in config && typeof config[key] !== 'boolean') {
      config[key] = config[key] === 1 || config[key] === '1' || config[key] === true;
    }
  }
  return config;
}

export async function getConfig(slug, env) {
  // 1. KV cache
  if (env?.TOKEN_CACHE) {
    try {
      const cached = await env.TOKEN_CACHE.get(`tenant:${slug}`, 'json');
      if (cached) return normalizeConfig(cached);
    } catch (e) {
      console.warn('[config] KV read failed:', e.message);
    }
  }

  // 2. D1
  if (env?.DB) {
    try {
      const row = await env.DB.prepare('SELECT config_json FROM tenants WHERE slug = ?').bind(slug).first();
      if (row) {
        const config = JSON.parse(row.config_json);
        if (env.TOKEN_CACHE) {
          await env.TOKEN_CACHE.put(`tenant:${slug}`, row.config_json, { expirationTtl: KV_TTL }).catch(() => {});
        }
        return normalizeConfig(config);
      }
    } catch (e) {
      console.warn('[config] D1 read failed:', e.message);
    }
  }

  // 3. Hardcoded fallback
  return SLUG_CONFIG[slug] ?? null;
}
