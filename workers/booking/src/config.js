export const SLUG_CONFIG = {
  hetyres: {
    displayName: 'HE Tyres',
    homeUrl: 'https://hetyres.co.uk',
    calendarId: null, // falls back to env.GOOGLE_CALENDAR_ID
    slotDuration: 30,
    minLeadMinutes: 60, // can't book a slot starting within the next hour
    maxAdvanceDays: 60, // furthest ahead a slot can be booked
    timezone: 'Europe/London',
    workingHours: {
      1: { open: '08:30', close: '17:00' }, // Mon
      2: { open: '08:30', close: '17:00' },
      3: { open: '08:30', close: '17:00' },
      4: { open: '08:30', close: '17:00' },
      5: { open: '08:30', close: '17:00' }, // Fri
      6: { open: '08:30', close: '12:30' }, // Sat
    },
  },
};

export function getConfig(slug) {
  return SLUG_CONFIG[slug] ?? null;
}
