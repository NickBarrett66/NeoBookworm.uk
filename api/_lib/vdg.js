// api/_lib/vdg.js
// Vehicle Data Global (VDG) UK lookup — VehicleDetails + TyreDetails packages.

const VDG_BASE_URL = 'https://uk.api.vehicledataglobal.com/r2/lookup';

function normalizeReg(reg) {
  return String(reg || '').trim().toUpperCase().replace(/\s+/g, '');
}

function parseTyreSide(side) {
  const tyre = side?.Tyre;
  if (!tyre) return null;
  return {
    size: tyre.SizeDescription || null,
    loadIndex: tyre.LoadIndex || null,
    speedIndex: tyre.SpeedIndex || null,
    runFlat: tyre.IsRunFlat ?? null,
    pressurePsi: tyre.Pressure?.TyrePressure?.Psi ?? null,
    rim: side.Rim?.SizeDescription || null,
  };
}

function parseTyreFitment(entry) {
  return {
    standard: entry.IsStandardFitmentForVehicle ?? null,
    modelName: entry.Vehicle?.ModelName || null,
    yearUk: entry.Vehicle?.Year?.Uk ?? null,
    front: parseTyreSide(entry.Front),
    rear: parseTyreSide(entry.Rear),
    pcd: entry.Hub?.Pcd || null,
    torqueNm: entry.Fixing?.TorqueNm ?? null,
  };
}

function parseVehicleDetails(results) {
  const vd = results?.VehicleDetails;
  if (!vd) return null;

  const id = vd.VehicleIdentification || {};
  const colour = vd.VehicleHistory?.ColourDetails?.CurrentColour || null;

  return {
    make: id.DvlaMake || null,
    model: id.DvlaModel || null,
    colour,
    year: id.YearOfManufacture ?? null,
    fuelType: id.DvlaFuelType || null,
    bodyType: id.DvlaBodyType || null,
    engineCapacity: vd.DvlaTechnicalDetails?.EngineCapacityCc ?? null,
    firstRegistered: id.DateFirstRegisteredInUk || id.DateFirstRegistered || null,
  };
}

function parseTyreDetails(results) {
  const list = results?.TyreDetails?.TyreDetailsList;
  if (!Array.isArray(list) || !list.length) return [];
  return list.map(parseTyreFitment);
}

function sandboxHint(reg, statusCode, statusMessage) {
  if (statusCode !== 6 && statusMessage !== 'SandboxValidationFailure') return null;
  if (reg.includes('A')) return null;
  return 'Trial/sandbox keys only accept registrations containing the letter A (e.g. AB12CDE). Your own plate will work once the account moves off sandbox.';
}

async function fetchPackage(apiKey, reg, packageName) {
  const url = new URL(VDG_BASE_URL);
  url.searchParams.set('ApiKey', apiKey);
  url.searchParams.set('PackageName', packageName);
  url.searchParams.set('Vrm', reg);

  const response = await fetch(url.toString());
  const json = await response.json();
  const info = json?.ResponseInformation || {};

  return {
    packageName,
    httpStatus: response.status,
    statusCode: info.StatusCode,
    statusMessage: info.StatusMessage,
    success: info.IsSuccessStatusCode === true,
    results: json?.Results || {},
    billing: json?.BillingInformation || null,
    raw: json,
  };
}

async function lookupVehicleAndTyres(apiKey, regInput) {
  const reg = normalizeReg(regInput);
  if (!reg) {
    return { ok: false, status: 400, error: 'reg parameter required' };
  }

  const [vehicleRes, tyreRes] = await Promise.all([
    fetchPackage(apiKey, reg, 'VehicleDetails'),
    fetchPackage(apiKey, reg, 'TyreDetails'),
  ]);

  const vehicle = vehicleRes.success ? parseVehicleDetails(vehicleRes.results) : null;
  const tyres = tyreRes.success ? parseTyreDetails(tyreRes.results) : [];

  const sandboxNote = sandboxHint(reg, vehicleRes.statusCode, vehicleRes.statusMessage)
    || sandboxHint(reg, tyreRes.statusCode, tyreRes.statusMessage);

  if (!vehicle && !tyres.length) {
    const detail = vehicleRes.statusMessage || tyreRes.statusMessage || 'No data returned';
    return {
      ok: false,
      status: 400,
      reg,
      error: 'Lookup failed',
      detail,
      sandboxNote,
      packages: {
        vehicle: {
          statusCode: vehicleRes.statusCode,
          statusMessage: vehicleRes.statusMessage,
        },
        tyres: {
          statusCode: tyreRes.statusCode,
          statusMessage: tyreRes.statusMessage,
        },
      },
    };
  }

  const standardFitment = tyres.find((t) => t.standard) || tyres[0] || null;

  return {
    ok: true,
    status: 200,
    reg,
    vehicle,
    tyres,
    tyreSize: standardFitment?.front?.size || null,
    sandboxNote,
    packages: {
      vehicle: {
        statusCode: vehicleRes.statusCode,
        statusMessage: vehicleRes.statusMessage,
      },
      tyres: {
        statusCode: tyreRes.statusCode,
        statusMessage: tyreRes.statusMessage,
      },
    },
    _raw: {
      vehicle: vehicleRes.raw,
      tyres: tyreRes.raw,
    },
  };
}

module.exports = {
  VDG_BASE_URL,
  normalizeReg,
  lookupVehicleAndTyres,
};
