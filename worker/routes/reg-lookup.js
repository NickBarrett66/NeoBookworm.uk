// RegCheck SOAP proxy — Worker ES module version.
// G5: must return Access-Control-Allow-Origin: * in its own Response headers
// (the _headers file only covers static assets, not Worker route responses).

const REGCHECK_ENDPOINT = 'http://www.regcheck.org.uk/api/reg.asmx';
const REGCHECK_USERNAME = 'NeoBookworm.uk';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function buildSoapEnvelope(reg) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Check xmlns="http://regcheck.org.uk">
      <RegistrationNumber>${reg}</RegistrationNumber>
      <username>${REGCHECK_USERNAME}</username>
    </Check>
  </soap:Body>
</soap:Envelope>`;
}

function parseVehicleXml(xml) {
  const jsonMatch = xml.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/i);
  if (jsonMatch) {
    try {
      const v = JSON.parse(jsonMatch[1]);
      const get = (f) => {
        if (!f) return null;
        if (typeof f === 'string') return f || null;
        if (typeof f === 'object' && f.CurrentTextValue !== undefined)
          return f.CurrentTextValue !== '' ? String(f.CurrentTextValue) : null;
        return null;
      };
      return {
        make:           get(v.CarMake)    || v.MakeDescription  || null,
        model:          get(v.CarModel)   || v.ModelDescription || null,
        colour:         v.Colour          || null,
        year:           v.RegistrationYear || null,
        fuelType:       get(v.FuelType),
        engineSize:     get(v.EngineSize),
        transmission:   get(v.Transmission),
        bodyStyle:      get(v.BodyStyle),
        doors:          get(v.NumberOfDoors),
        seats:          get(v.NumberOfSeats),
        vin:            v.VehicleIdentificationNumber || null,
        insuranceGroup: v.VehicleInsuranceGroup
                          ? `${v.VehicleInsuranceGroup}/${v.VehicleInsuranceGroupOutOf}`
                          : null,
        description:    v.Description || null,
        imageUrl:       v.ImageUrl     || null,
      };
    } catch { /* fall through */ }
  }
  const get = (tag) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
    return m ? m[1].trim() || null : null;
  };
  return {
    make:        get('MakeDescription'),
    model:       get('ModelDescription'),
    colour:      get('Colour'),
    year:        get('RegistrationYear'),
    fuelType:    get('FuelType'),
    description: get('Description'),
  };
}

export async function handle(request, env, ctx, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let reg = '';
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      reg = (body?.reg || '').trim().toUpperCase().replace(/\s+/g, '');
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
  } else {
    reg = (url.searchParams.get('reg') || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  if (!reg) {
    return json({ error: 'reg parameter required' }, 400);
  }

  let soapResponse;
  try {
    const response = await fetch(REGCHECK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction':   'http://regcheck.org.uk/Check',
      },
      body: buildSoapEnvelope(reg),
    });
    soapResponse = await response.text();
  } catch (err) {
    return json({ error: 'RegCheck request failed', detail: err.message }, 502);
  }

  if (soapResponse.includes('<faultstring>')) {
    const faultMatch = soapResponse.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
    const fault = faultMatch ? faultMatch[1].trim() : 'Unknown fault';
    return json({ error: 'RegCheck fault', detail: fault, raw: soapResponse }, 400);
  }

  const vehicle = parseVehicleXml(soapResponse);
  return json({ reg, vehicle, _raw: soapResponse });
}
