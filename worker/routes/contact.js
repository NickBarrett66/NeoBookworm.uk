// SMTP forwarder — /api/contact
// Forwards the browser's POST to the Vercel bridge and relays the response.
// No secret header needed: this is a public-facing form endpoint.

export async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const target = `${env.VERCEL_BRIDGE_URL}/api/contact`;
  const resp = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') || 'application/json' },
    body: await request.text(),
  });

  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' },
  });
}
