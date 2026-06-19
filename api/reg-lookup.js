// api/reg-lookup.js
// Proxy for RegCheck SOAP API — returns vehicle data as JSON.
// Called by reg-test.html; will be reused by api/he-tyres-dvla.js.

const REGCHECK_ENDPOINT = 'http://www.regcheck.org.uk/api/reg.asmx';
const REGCHECK_USERNAME = 'NeoBookworm.uk';

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
  // RegCheck embeds a JSON object inside <vehicleJson> — richer and cleaner than the XML sibling
  const jsonMatch = xml.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/i);
  if (jsonMatch) {
    try {
      const v = JSON.parse(jsonMatch[1]);
      // Fields are either plain strings or { CurrentTextValue: "..." } objects
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
    } catch (e) { /* fall through */ }
  }
  // Fallback: plain XML tag extraction
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const reg = (
    (req.method === 'POST' ? req.body?.reg : req.query?.reg) || ''
  ).trim().toUpperCase().replace(/\s+/g, '');

  if (!reg) {
    return res.status(400).json({ error: 'reg parameter required' });
  }

  let soapResponse;
  try {
    const response = await fetch(REGCHECK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://regcheck.org.uk/Check',
      },
      body: buildSoapEnvelope(reg),
    });
    soapResponse = await response.text();
  } catch (err) {
    return res.status(502).json({ error: 'RegCheck request failed', detail: err.message });
  }

  // Surface SOAP faults clearly
  if (soapResponse.includes('<faultstring>')) {
    const fault = extractXmlValue(soapResponse, 'faultstring');
    return res.status(400).json({ error: 'RegCheck fault', detail: fault, raw: soapResponse });
  }

  const vehicle = parseVehicleXml(soapResponse);

  return res.status(200).json({
    reg,
    vehicle,
    _raw: soapResponse, // included for debugging — remove once field mapping is confirmed
  });
};
