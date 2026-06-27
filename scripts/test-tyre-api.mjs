// VDG API smoke test — VehicleDetails + TyreDetails
// Usage: set VDG_API_KEY=your-key && node scripts/test-tyre-api.mjs [VRM]
// Example: node scripts/test-tyre-api.mjs AB12CDE

const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const { lookupVehicleAndTyres } = require('../api/_lib/vdg');

const apiKey = process.env.VDG_API_KEY;
const vrm = process.argv[2];

if (!apiKey) {
  console.error('Set VDG_API_KEY in the environment (same value as Vercel).');
  process.exit(1);
}
if (!vrm) {
  console.error('Usage: node scripts/test-tyre-api.mjs <VRM>');
  console.error('Example: node scripts/test-tyre-api.mjs AB12CDE');
  process.exit(1);
}

function formatTyreLine(label, side) {
  if (!side) return `${label}:   —`;
  const pressure = side.pressurePsi != null ? `${side.pressurePsi} PSI` : '? PSI';
  const runFlat = side.runFlat === true ? 'true' : side.runFlat === false ? 'false' : '—';
  let line = `${label}:   ${side.size || '—'}  Load: ${side.loadIndex || '—'}  Speed: ${side.speedIndex || '—'}  RunFlat: ${runFlat}  Pressure: ${pressure}`;
  if (side.rim) line += `  Rim: ${side.rim}`;
  return line;
}

const result = await lookupVehicleAndTyres(apiKey, vrm);

console.log(`\nLookup: ${result.reg || vrm.toUpperCase()}`);
if (result.sandboxNote) console.log(`Note:   ${result.sandboxNote}`);

if (!result.ok) {
  console.error('Failed:', result.error, result.detail || '');
  if (result.packages) console.error(JSON.stringify(result.packages, null, 2));
  process.exit(1);
}

const v = result.vehicle || {};
console.log('\nVehicle:');
console.log(`  Make:   ${v.make || '—'}`);
console.log(`  Model:  ${v.model || '—'}`);
console.log(`  Colour: ${v.colour || '—'}`);
console.log(`  Year:   ${v.year || '—'}`);

if (result.tyreSize) console.log(`\nStandard fitment size: ${result.tyreSize}`);

console.log(`\nTyre fitments found: ${result.tyres.length}\n`);
result.tyres.forEach((t, i) => {
  console.log(`--- Fitment ${i + 1} ${t.standard ? '(standard)' : '(optional)'} ---`);
  if (t.modelName) console.log(`  Model:        ${t.modelName}`);
  if (t.yearUk) console.log(`  UK Year:      ${t.yearUk}`);
  console.log(`  ${formatTyreLine('Front tyre', t.front)}`);
  console.log(`  ${formatTyreLine('Rear tyre', t.rear)}`);
  if (t.pcd) console.log(`  PCD:          ${t.pcd}`);
  if (t.torqueNm != null) console.log(`  Torque:       ${t.torqueNm} Nm`);
  console.log('');
});
