import { describe, it, expect } from 'vitest';
import {
  londonWallToInstant,
  getWorkingSlots,
  filterAvailableSlots,
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
    const slots = makeSlotsForDate('2026-06-22'); // Monday
    expect(slots).toHaveLength(17);
    expect(slotLabel(slots[0])).toBe('08:30');
    expect(slotLabel(slots[16])).toBe('16:30');
  });

  it('returns Saturday slots from 08:30 to 12:00', () => {
    const slots = makeSlotsForDate('2026-06-27'); // Saturday
    expect(slots.length).toBeGreaterThan(0);
    expect(slotLabel(slots[0])).toBe('08:30');
    expect(slotLabel(slots[slots.length - 1])).toBe('12:00');
  });

  it('returns empty array for Sunday', () => {
    expect(makeSlotsForDate('2026-06-21')).toEqual([]);
  });

  it('returns empty array for a past date', () => {
    expect(makeSlotsForDate('2020-01-06')).toEqual([]);
  });
});

describe('filterAvailableSlots', () => {
  const isoDate = '2026-06-22';
  const workingSlots = makeSlotsForDate(isoDate);

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
    const available = filterAvailableSlots(workingSlots, [busyAt('09:00', '10:00')], config);
    const labels = labelsFromWall(available);
    expect(labels).not.toContain('09:00');
    expect(labels).not.toContain('09:30');
    expect(labels).toContain('08:30');
    expect(labels).toContain('10:00');
    expect(available).toHaveLength(workingSlots.length - 2);
  });

  it('does not remove 08:30 when busy ends exactly at 08:30', () => {
    const available = filterAvailableSlots(workingSlots, [busyAt('08:00', '08:30')], config);
    const labels = labelsFromWall(available);
    expect(labels).toContain('08:30');
    expect(available).toHaveLength(workingSlots.length);
  });
});
