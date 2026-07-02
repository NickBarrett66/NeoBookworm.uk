import { describe, it, expect } from 'vitest';
import {
  haversineMiles,
  DEPOT_ORIGIN,
  MAX_RADIUS_MILES,
  ROAD_FACTOR,
  DISTANCE_BANDS,
} from '../src/geo.js';

describe('haversineMiles', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMiles(DEPOT_ORIGIN.lat, DEPOT_ORIGIN.lon, DEPOT_ORIGIN.lat, DEPOT_ORIGIN.lon)).toBe(0);
  });

  it('depot to SN1 2BL is inside band A after road factor', () => {
    // Swindon town centre-ish — well within 5 mi road distance
    const miles = haversineMiles(DEPOT_ORIGIN.lat, DEPOT_ORIGIN.lon, 51.56, -1.78) * ROAD_FACTOR;
    expect(miles).toBeLessThan(DISTANCE_BANDS[0].maxMiles);
    expect(miles).toBeLessThan(MAX_RADIUS_MILES);
  });

  it('a point beyond 15 mi road distance is out of area', () => {
    // Bath-ish — clearly outside 15 mi
    const miles = haversineMiles(DEPOT_ORIGIN.lat, DEPOT_ORIGIN.lon, 51.38, -2.36) * ROAD_FACTOR;
    expect(miles).toBeGreaterThan(MAX_RADIUS_MILES);
  });
});
