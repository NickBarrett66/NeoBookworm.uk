#!/usr/bin/env node
/**
 * Test the DVLA Vehicle Enquiry Service (VES) API.
 *
 * VES returns basic vehicle data by registration number using ONLY an
 * `x-api-key` header — no username/password/JWT (that auth flow is for DVLA's
 * other APIs). Fields include make, colour, engineCapacity, fuelType and year.
 * NOTE: VES does NOT return the vehicle model.
 *
 * Usage:
 *   node scripts/test-dvla-ves.mjs                 # UAT, default test VRN
 *   node scripts/test-dvla-ves.mjs AA19AAA         # UAT, custom VRN
 *   node scripts/test-dvla-ves.mjs AA19AAA prod    # production endpoint
 *
 * The API key can be passed via the DVLA_API_KEY env var (preferred) or falls
 * back to the dev key baked in below for a quick test.
 */

const API_KEY = process.env.DVLA_API_KEY || 'ycR0qyPuo27TbbWedhivp9cKVZsgAUHdUcdAJlt2';

const ENDPOINTS = {
  uat: 'https://uat.driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
  prod: 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
};

const vrn = (process.argv[2] || 'TE57VRN').toUpperCase().replace(/\s+/g, '');
const env = (process.argv[3] || 'uat').toLowerCase();
const url = ENDPOINTS[env] || ENDPOINTS.uat;

async function main() {
  console.log(`\nDVLA VES test`);
  console.log(`  env : ${env}  →  ${url}`);
  console.log(`  VRN : ${vrn}`);
  console.log(`  key : ${API_KEY.slice(0, 6)}…${API_KEY.slice(-4)}\n`);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ registrationNumber: vrn }),
    });
  } catch (err) {
    console.error('Network / fetch error:', err.message);
    process.exit(1);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  console.log(`HTTP ${res.status} ${res.statusText}\n`);

  if (!res.ok) {
    console.error('Request failed. Response body:');
    console.error(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    console.error(
      '\nCommon causes: 403 = wrong key / wrong environment (dev key must hit UAT); ' +
        '404 = VRN not found; 400 = malformed VRN; 429 = rate limited.'
    );
    process.exit(1);
  }

  // The four fields the site cares about.
  console.log('Basic vehicle data');
  console.log('  Make        :', data.make ?? '—');
  console.log('  Model       :', '(not provided by VES — needs a different data source)');
  console.log('  Engine size :', data.engineCapacity != null ? `${data.engineCapacity} cc` : '—');
  console.log('  Colour      :', data.colour ?? '—');
  console.log('  Fuel        :', data.fuelType ?? '—');
  console.log('  Year        :', data.yearOfManufacture ?? '—');

  console.log('\nFull response:');
  console.log(JSON.stringify(data, null, 2));
}

main();
