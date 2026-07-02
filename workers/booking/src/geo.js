// Distance bands for mobile fitting — hardcoded until Session M4 moves these into tenant config.

export const DEPOT_ORIGIN = {
  lat: 51.565804,
  lon: -1.817368,
  label: 'Unit 5 Star West, Westmead Drive, Westlea, Swindon SN5 7SW',
};

export const MAX_RADIUS_MILES = 15;
export const ROAD_FACTOR = 1.3;

/** @type {{ maxMiles: number, travelEachWayMin: number }[]} */
export const DISTANCE_BANDS = [
  { maxMiles: 5, travelEachWayMin: 20 },
  { maxMiles: 10, travelEachWayMin: 35 },
  { maxMiles: 15, travelEachWayMin: 50 },
];

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Haversine straight-line distance in miles. */
export function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

function bandForRoadMiles(roadMiles) {
  for (const band of DISTANCE_BANDS) {
    if (roadMiles <= band.maxMiles) return band;
  }
  return null;
}

/**
 * Travel-each-way minutes for a stored band letter ('A' | 'B' | 'C').
 * Lets us re-derive the travel margin at confirm time (when we only have the
 * band stored on the booking, not the original travelEachWayMin).
 */
export function travelMinForBand(bandLetter) {
  const idx = { A: 0, B: 1, C: 2 }[bandLetter];
  if (idx == null) return null;
  return DISTANCE_BANDS[idx]?.travelEachWayMin ?? null;
}

export async function lookupPostcodeLatLon(postcode) {
  const normalised = postcode.replace(/\s+/g, '').toUpperCase();
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalised)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`postcodes.io returned ${res.status}`);
  const data = await res.json();
  if (!data?.result) return null;
  return { lat: data.result.latitude, lon: data.result.longitude };
}

/**
 * Resolve a UK postcode to a distance band from the depot.
 * @returns {Promise<{ inArea: true, band: string, travelEachWayMin: number, distanceMiles: number } | { inArea: false, distanceMiles?: number }>}
 */
export async function resolvePostcodeBand(postcode) {
  const coords = await lookupPostcodeLatLon(postcode);
  if (!coords) return { inArea: false };

  const straightMiles = haversineMiles(DEPOT_ORIGIN.lat, DEPOT_ORIGIN.lon, coords.lat, coords.lon);
  const roadMiles = straightMiles * ROAD_FACTOR;

  if (roadMiles > MAX_RADIUS_MILES) return { inArea: false, distanceMiles: Math.round(roadMiles * 10) / 10 };

  const band = bandForRoadMiles(roadMiles);
  if (!band) return { inArea: false, distanceMiles: Math.round(roadMiles * 10) / 10 };

  const bandLetter = band === DISTANCE_BANDS[0] ? 'A' : band === DISTANCE_BANDS[1] ? 'B' : 'C';
  return {
    inArea: true,
    band: bandLetter,
    travelEachWayMin: band.travelEachWayMin,
    distanceMiles: Math.round(roadMiles * 10) / 10,
  };
}
