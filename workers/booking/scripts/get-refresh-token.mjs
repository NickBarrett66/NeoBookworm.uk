// Run once: node scripts/get-refresh-token.mjs
// Reads oauth-client-secret.json, opens browser, prints refresh_token.
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';

const creds = JSON.parse(readFileSync(new URL('../oauth-client-secret.json', import.meta.url)));
const { client_id, client_secret } = creds.installed || creds.web;
const REDIRECT = 'http://localhost:4321';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for redirect on http://localhost:4321 ...\n');

const server = createServer(async (req, res) => {
  const code = new URL(req.url, 'http://localhost').searchParams.get('code');
  if (!code) { res.end('No code'); return; }
  res.end('<h1>Done — check your terminal</h1>');
  server.close();

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id, client_secret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code'
    })
  });
  const data = await resp.json();
  console.log('=== COPY THESE VALUES ===');
  console.log('refresh_token:', data.refresh_token);
  console.log('access_token (short-lived, ignore):', data.access_token);
}).listen(4321);
