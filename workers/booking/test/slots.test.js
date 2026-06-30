import { describe, it, expect } from 'vitest';
import {
  londonWallToInstant,
  getWorkingSlots,
  filterAvailableSlots,
  wallSlotsToLabels,
} from '../src/calendar.js';
import { SLUG_CONFIG } from '../src/config.js';

const config = SLUG_CONFIG.hetyres;
const TZ = config.timezone;

function slotLabel(slot) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(slot.start);
}

function makeSlotsForDate(isoDate) {
  return getWorkingSlots(isoDate, config);
}

/** Morning of isoDate in London — before any lead-time cutoff for that day. */
function morningOf(isoDate) {
  return londonWallToInstant(`${isoDate}T06:00:00`, TZ).getTime();
}

describe('londonWallToInstant', () => {
  it('converts BST wall time to correct UTC instant', () => {
    const instant = londonWallToInstant('2026-06-23T08:30:00');
    expect(instant.toISOString()).toBe('2026-06-23T07:30:00.000Z');
  });

  it('converts GMT wall time to correct UTC instant', () => {
    const instant = londonWallToInstant('2026-01-12T08:30:00');
    expect(instant.toISOString()).toBe('2026-01-12T08:30:00.000Z');
  });
});

describe('getWorkingSlots', () => {
  it('returns 17 Monday slots from 08:30 to 16:30', () => {
    const slots = makeSlotsForDate('2026-07-06'); // Monday
    expect(slots).toHaveLength(17);
    expect(slotLabel(slots[0])).toBe('08:30');
    expect(slotLabel(slots[16])).toBe('16:30');
  });

  it('returns Saturday slots from 08:30 to 12:00', () => {
    const slots = makeSlotsForDate('2026-07-11'); // Saturday
    expect(slots.length).toBeGreaterThan(0);
    expect(slotLabel(slots[0])).toBe('08:30');
    expect(slotLabel(slots[slots.length - 1])).toBe('12:00');
  });

  it('returns empty array for Sunday', () => {
    expect(makeSlotsForDate('2026-07-12')).toEqual([]);
  });

  it('returns empty array for a past date', () => {
    expect(makeSlotsForDate('2020-01-06')).toEqual([]);
  });
});

describe('filterAvailableSlots', () => {
  const isoDate = '2026-07-06';
  const workingSlots = makeSlotsForDate(isoDate);
  const nowMs = morningOf(isoDate);

  function wallAt(time) {
    return `${isoDate}T${time}:00`;
  }

  function busyAt(startTime, endTime) {
    return {
      start: londonWallToInstant(wallAt(startTime)),
      end: londonWallToInstant(wallAt(endTime)),
    };
  }

  function labelsFromWall(wallSlots) {
    return wallSlots.map((w) => w.slice(11, 16));
  }

  it('removes exactly 09:00 and 09:30 when busy 09:00–10:00', () => {
    const available = filterAvailableSlots(workingSlots, [busyAt('09:00', '10:00')], config, nowMs);
    const labels = labelsFromWall(available);
    expect(labels).not.toContain('09:00');
    expect(labels).not.toContain('09:30');
    expect(labels).toContain('08:30');
    expect(labels).toContain('10:00');
    expect(available).toHaveLength(workingSlots.length - 2);
  });

  it('does not remove 08:30 when busy ends exactly at 08:30', () => {
    const available = filterAvailableSlots(workingSlots, [busyAt('08:00', '08:30')], config, nowMs);
    const labels = labelsFromWall(available);
    expect(labels).toContain('08:30');
    expect(available).toHaveLength(workingSlots.length);
  });

  it('drops slots in the past and within minimum notice', () => {
    const tuesday = '2026-06-30';
    const wednesday = '2026-07-01';
    const tueSlots = makeSlotsForDate(tuesday);
    const wedSlots = makeSlotsForDate(wednesday);
    // Tuesday 30 June 2026, 16:00 London (BST) + 120 min notice
    const queryAt = londonWallToInstant(`${tuesday}T16:00:00`, TZ).getTime();

    const tueAvailable = wallSlotsToLabels(
      filterAvailableSlots(tueSlots, [], config, queryAt),
      TZ,
    );
    const wedAvailable = wallSlotsToLabels(
      filterAvailableSlots(wedSlots, [], config, queryAt),
      TZ,
    );

    expect(tueAvailable).toEqual([]);
    expect(wedAvailable[0]).toBe('08:30');
    expect(wedAvailable).toContain('09:00');
  });

  it('keeps only slots at or after now + minLeadMinutes on the same day', () => {
    const iso = '2026-07-06';
    const slots = makeSlotsForDate(iso);
    // 10:00 query + 120 min → earliest bookable start 12:00
    const queryAt = londonWallToInstant(`${iso}T10:00:00`, TZ).getTime();
    const labels = wallSlotsToLabels(filterAvailableSlots(slots, [], config, queryAt), TZ);

    expect(labels).not.toContain('08:30');
    expect(labels).not.toContain('11:30');
    expect(labels[0]).toBe('12:00');
  });
});
