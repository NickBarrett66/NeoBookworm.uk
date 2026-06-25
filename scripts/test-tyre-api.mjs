// One-off proof-of-concept for UK Vehicle Data Global — TyreDetails API
// Usage: node scripts/test-tyre-api.mjs [VRM]
// Example: node scripts/test-tyre-api.mjs AB12CDE

const API_KEY = 'D16CD41D-51DE-4E5D-8F7F-152BDB87145C';
const BASE_URL = 'https://uk.api.vehicledataglobal.com/r2/lookup';

const vrm = process.argv[2];
if (!vrm) {
  console.error('Usage: node scripts/test-tyre-api.mjs <VRM>');
  console.error('Example: node scripts/test-tyre-api.mjs AB12CDE');
  process.exit(1);
}

const url = new URL(BASE_URL);
url.searchParams.set('ApiKey', API_KEY);
url.searchParams.set('PackageName', 'TyreDetails');
url.searchParams.set('Vrm', vrm.toUpperCase().replace(/\s/g, ''));

console.log(`\nLooking up tyre data for: ${vrm.toUpperCase()}`);
console.log(`URL: ${url}\n`);

const res = await fetch(url.toString());
const json = await res.json();

const status = json?.ResponseInformation?.StatusCode;
const message = json?.ResponseInformation?.StatusMessage;
const isSuccess = json?.ResponseInformation?.IsSuccessStatusCode;
const cost = json?.BillingInformation?.TransactionCost;
const balance = json?.BillingInformation?.AccountBalance;
const tyres = json?.Results?.TyreDetails?.TyreDetailsList;

console.log(`HTTP status:    ${res.status}`);
console.log(`API status:     ${status} — ${message}`);
console.log(`Success:        ${isSuccess}`);
if (cost != null)     console.log(`Transaction £:  ${cost}`);
if (balance != null)  console.log(`Account balance: £${balance}`);

if (tyres?.length) {
  console.log(`\nTyre fitments found: ${tyres.length}\n`);
  tyres.forEach((t, i) => {
    console.log(`--- Fitment ${i + 1} ${t.IsStandardFitmentForVehicle ? '(standard)' : '(optional)'} ---`);
    if (t.Vehicle?.ModelName) console.log(`  Model:        ${t.Vehicle.ModelName}`);
    if (t.Vehicle?.Year?.Uk)  console.log(`  UK Year:      ${t.Vehicle.Year.Uk}`);
    const f = t.Front?.Tyre;
    const r = t.Rear?.Tyre;
    if (f) console.log(`  Front tyre:   ${f.SizeDescription}  Load: ${f.LoadIndex}  Speed: ${f.SpeedIndex}  RunFlat: ${f.IsRunFlat}  Pressure: ${f.Pressure?.TyrePressure?.Psi ?? '?'} PSI`);
    if (r) console.log(`  Rear tyre:    ${r.SizeDescription}  Load: ${r.LoadIndex}  Speed: ${r.SpeedIndex}  RunFlat: ${r.IsRunFlat}  Pressure: ${r.Pressure?.TyrePressure?.Psi ?? '?'} PSI`);
    if (t.Hub?.Pcd)            console.log(`  PCD:          ${t.Hub.Pcd}`);
    if (t.Fixing?.TorqueNm)    console.log(`  Torque:       ${t.Fixing.TorqueNm} Nm`);
    console.log('');
  });
} else {
  console.log('\nNo tyre data returned.');
  console.log('\nFull response:');
  console.log(JSON.stringify(json, null, 2));
}
