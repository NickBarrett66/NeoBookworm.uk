import { describe, it, expect } from 'vitest';
import {
  verifyWorkbenchKey,
  groupWorkbenchBookings,
  formatWorkbenchBooking,
  workbenchSectionTitle,
  isValidPrepStatus,
} from '../src/workbench.js';
import { validatePatch } from '../src/schema.js';
import { renderWorkbenchRefusalPage, renderWorkbenchPage } from '../src/ui.js';

const baseConfig = {
  workbenchEnabled: true,
  workbenchToken: 'a'.repeat(32),
};

describe('verifyWorkbenchKey', () => {
  it('accepts a matching key', () => {
    const key = 'a'.repeat(32);
    expect(verifyWorkbenchKey(baseConfig, key)).toBe(true);
  });

  it('rejects when workbench is disabled', () => {
    expect(verifyWorkbenchKey({ ...baseConfig, workbenchEnabled: false }, 'a'.repeat(32))).toBe(false);
  });

  it('rejects wrong length key', () => {
    expect(verifyWorkbenchKey(baseConfig, 'short')).toBe(false);
  });

  it('rejects wrong value', () => {
    expect(verifyWorkbenchKey(baseConfig, 'b'.repeat(32))).toBe(false);
  });

  it('rejects missing token in config', () => {
    expect(verifyWorkbenchKey({ workbenchEnabled: true, workbenchToken: null }, 'a'.repeat(32))).toBe(false);
  });
});

describe('groupWorkbenchBookings', () => {
  const today = '2026-07-03';

  it('groups pending, today, tomorrow and upcoming', () => {
    const rows = [
      { id: '1', status: 'pending', type: 'mobile', slot_start: '2026-07-05T10:00:00', arrival_window: 'am', name: 'P' },
      { id: '2', status: 'confirmed', type: 'depot', slot_start: '2026-07-03T09:00:00', name: 'T' },
      { id: '3', status: 'confirmed', type: 'depot', slot_start: '2026-07-04T09:00:00', name: 'Tm' },
      { id: '4', status: 'confirmed', type: 'mobile', slot_start: '2026-07-06T14:00:00', arrival_window: 'pm', name: 'U' },
      { id: '5', status: 'cancelled', type: 'depot', slot_start: '2026-07-03T11:00:00', name: 'X' },
    ];
    const g = groupWorkbenchBookings(rows, today);
    expect(g.pending).toHaveLength(1);
    expect(g.pending[0].name).toBe('P');
    expect(g.today).toHaveLength(1);
    expect(g.today[0].name).toBe('T');
    expect(g.tomorrow).toHaveLength(1);
    expect(g.upcoming).toHaveLength(1);
    expect(g.upcoming[0].name).toBe('U');
  });
});

describe('formatWorkbenchBooking', () => {
  it('builds maps URL for mobile jobs', () => {
    const b = formatWorkbenchBooking({
      id: 'x',
      status: 'confirmed',
      type: 'mobile',
      slot_start: '2026-07-03T10:00:00',
      arrival_window: 'am',
      name: 'Jane',
      phone: '07700900000',
      email: 'j@example.com',
      address: '1 High St',
      postcode: 'SN1 1AA',
    });
    expect(b.mapsUrl).toContain('google.com/maps');
    expect(b.telHref).toBe('tel:07700900000');
    expect(b.typeLabel).toBe('Mobile');
  });

  it('includes prep status and internal note', () => {
    const b = formatWorkbenchBooking({
      id: 'x',
      status: 'confirmed',
      type: 'depot',
      slot_start: '2026-07-03T10:00:00',
      name: 'Jane',
      prep_status: 'ordered',
      internal_note: '205/55 R16',
    });
    expect(b.prepStatus).toBe('ordered');
    expect(b.internalNote).toBe('205/55 R16');
    expect(b.nextPrepStatus).toBe('ready');
    expect(b.prevPrepStatus).toBe('stock_checked');
    expect(b.isReady).toBe(false);
  });
});

describe('prep status helpers', () => {
  it('validates prep status vocabulary', () => {
    expect(isValidPrepStatus('ordered')).toBe(true);
    expect(isValidPrepStatus('shipped')).toBe(false);
  });

  it('builds not-ready section titles', () => {
    const bookings = [
      { prepStatus: 'new' },
      { prepStatus: 'ready' },
      { prepStatus: 'ordered' },
    ];
    expect(workbenchSectionTitle('Today', bookings, { showReadyCount: true }))
      .toBe('Today · 2 of 3 not ready');
    expect(workbenchSectionTitle('Today', [{ prepStatus: 'ready' }], { showReadyCount: true }))
      .toBe('Today');
  });
});

describe('schema workbench fields', () => {
  it('rejects workbenchToken shorter than 32 chars', () => {
    const r = validatePatch({ workbenchToken: 'tooshort' }, 'nick');
    expect(r.ok).toBe(false);
  });

  it('accepts a 32-char workbenchToken', () => {
    const r = validatePatch({ workbenchToken: 'a'.repeat(32) }, 'nick');
    expect(r.ok).toBe(true);
  });
});

describe('workbench pages', () => {
  it('refusal page is generic', () => {
    const html = renderWorkbenchRefusalPage();
    expect(html).toContain('Link not recognised');
    expect(html).toContain('noindex');
    expect(html).not.toContain('HE Tyres');
  });

  it('renders grouped sections with contact links', () => {
    const html = renderWorkbenchPage(
      { displayName: 'Test Biz', theme: { bg: '#000', accent: '#f00', accentFg: '#000', accentRgb: '255,0,0' } },
      'testbiz',
      'k'.repeat(32),
      {
        pending: [{ id: '1', timeLabel: 'Fri 4 Jul morning', type: 'mobile', typeLabel: 'Mobile', isPending: true,
          name: 'Pat', reg: 'AB12 CDE', phone: '07700900000', telHref: 'tel:07700900000', email: 'p@x.com',
          band: 'A', note: '205/55 R16', address: '1 High St', postcode: 'SN1 1AA',
          mapsUrl: 'https://maps.example', slotDate: '2026-07-04' }],
        today: [{ id: '2', timeLabel: '9:00am', type: 'depot', typeLabel: 'Depot', isPending: false,
          name: 'Today', reg: null, phone: '', telHref: null, email: '', band: null, note: null,
          address: null, postcode: null, mapsUrl: null, slotDate: '2026-07-03',
          prepStatus: 'new', prepLabel: 'New', advancePrepLabel: 'Check stock',
          nextPrepStatus: 'stock_checked', prevPrepStatus: null, internalNote: null, isReady: false }],
        tomorrow: [],
        upcoming: [],
        updatedAt: '2026-07-03T12:00:00.000Z',
      },
    );
    // Bench mode renders client-side from an inlined data blob, so assert the
    // page ships the data and the renderer's key labels/behaviour rather than
    // pre-rendered card markup.
    expect(html).toContain('Waiting on your yes');   // pending section heading
    expect(html).toContain('p@x.com');               // customer data inlined for the client renderer
    expect(html).toContain('07700900000');
    expect(html).toContain('Nothing booked today');
    expect(html).toContain('visibilitychange');
    expect(html).toContain('Private staff note');
    expect(html).toContain('Check stock');
    expect(html).toContain('Add a phone booking');   // walk-in / phone-booking flow
    expect(html).toContain('noindex');
  });
});
