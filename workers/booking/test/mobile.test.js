import { describe, it, expect } from 'vitest';
import {
  londonWallToInstant,
  getWorkingSlots,
  filterAvailableSlots,
  wallSlotsToLabels,
} from '../src/calendar.js';
import { SLUG_CONFIG } from '../src/config.js';
import {
  computeBlockLengthMinutes,
  findGapsInRange,
  getWindowBounds,
  placeBlockInWindow,
} from '../src/mobile.js';

const config = SLUG_CONFIG.hetyres;
const TZ = config.timezone;
const isoDate = '2026-07-06'; // Monday

function morningOf(iso) {
  return londonWallToInstant(`${iso}T06:00:00`, TZ).getTime();
}

describe('computeBlockLengthMinutes', () => {
  it('band A block = 2×20 + 45 + 15 = 100 min', () => {
    expect(computeBlockLengthMinutes(20)).toBe(100);
  });

  it('band C block = 2×50 + 45 + 15 = 160 min', () => {
    expect(computeBlockLengthMinutes(50)).toBe(160);
  });
});

describe('placeBlockInWindow', () => {
  const nowMs = morningOf(isoDate);

  it('places a 100-min block in a free AM window', () => {
    const placement = placeBlockInWindow(isoDate, 'am', [], config, 100, nowMs);
    expect(placement).not.toBeNull();
    expect(placement.slotStart).toMatch(/^2026-07-06T08:30:00$/);
    expect(placement.slotEnd).toMatch(/^2026-07-06T10:10:00$/);
  });

  it('returns null when AM is fully busy', () => {
    const am = getWindowBounds(isoDate, 'am', config);
    const busy = [{ start: am.start, end: am.end }];
    const placement = placeBlockInWindow(isoDate, 'am', busy, config, 100, nowMs);
    expect(placement).toBeNull();
  });
});

describe('shared calendar resource (depot slots vs mobile block)', () => {
  it('a 100-min mobile block removes overlapping depot half-hour slots', () => {
    const workingSlots = getWorkingSlots(isoDate, config);
    const nowMs = morningOf(isoDate);

    const placement = placeBlockInWindow(isoDate, 'am', [], config, 100, nowMs);
    expect(placement).not.toBeNull();

    const busy = [{
      start: londonWallToInstant(placement.slotStart, TZ),
      end: londonWallToInstant(placement.slotEnd, TZ),
    }];

    const labels = wallSlotsToLabels(
      filterAvailableSlots(workingSlots, busy, config, nowMs),
      TZ,
    );

    expect(labels).not.toContain('08:30');
    expect(labels).not.toContain('09:00');
    expect(labels).not.toContain('09:30');
    expect(labels).toContain('10:30');
  });
});

describe('findGapsInRange', () => {
  it('finds a gap between two busy periods', () => {
    const start = londonWallToInstant(`${isoDate}T08:30:00`, TZ).getTime();
    const end = londonWallToInstant(`${isoDate}T12:00:00`, TZ).getTime();
    const busy = [
      {
        start: londonWallToInstant(`${isoDate}T09:00:00`, TZ),
        end: londonWallToInstant(`${isoDate}T09:30:00`, TZ),
      },
      {
        start: londonWallToInstant(`${isoDate}T10:30:00`, TZ),
        end: londonWallToInstant(`${isoDate}T11:00:00`, TZ),
      },
    ];
    const blockMs = 60 * 60_000;
    const gaps = findGapsInRange(start, end, busy, 0, blockMs, start);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].end - gaps[0].start).toBeGreaterThanOrEqual(blockMs);
  });
});
