// SMTP forwarder — /api/notify-landing-enquiry
// Called by the landing-enquiry Worker with X-Notify-Secret.
// The secret is validated by the bridge — the forwarder only passes it through.

export async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const target = `${env.VERCEL_BRIDGE_URL}/api/notify-landing-enquiry`;
  const headers = { 'Content-Type': request.headers.get('content-type') || 'application/json' };
  const notifySecret = request.headers.get('x-notify-secret');
  if (notifySecret) headers['X-Notify-Secret'] = notifySecret;

  const resp = await fetch(target, {
    method: 'POST',
    headers,
    body: await request.text(),
  });

  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' },
  });
}
