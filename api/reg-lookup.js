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

function extractXmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
}

function parseVehicleXml(xml) {
  return {
    make:               extractXmlValue(xml, 'Make'),
    model:              extractXmlValue(xml, 'Model'),
    colour:             extractXmlValue(xml, 'Colour'),
    year:               extractXmlValue(xml, 'YearOfManufacture'),
    fuelType:           extractXmlValue(xml, 'FuelType'),
    engineCapacity:     extractXmlValue(xml, 'EngineCapacity'),
    transmission:       extractXmlValue(xml, 'Transmission'),
    bodyStyle:          extractXmlValue(xml, 'BodyStyle'),
    doors:              extractXmlValue(xml, 'NumberOfDoors'),
    motExpiry:          extractXmlValue(xml, 'MotExpiry'),
    taxExpiry:          extractXmlValue(xml, 'TaxExpiry'),
    description:        extractXmlValue(xml, 'VehicleDescription'),
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
