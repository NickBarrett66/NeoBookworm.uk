// Contact form — /api/contact
// Public POST from contact.html. Persists to D1 and notifies Nick via Gmail API.

import { queryD1, enquiriesDb } from '../_lib/d1.js';
import { sendViaGmail } from '../_lib/gmail.js';

const DEFAULT_TO = 'neobookworm@icloud.com';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function gmailConfigured(env) {
  return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

async function insertContactToD1(env, data) {
  if (!env.CF_API_TOKEN) {
    console.log('D1 not configured. Missing CF_API_TOKEN');
    return { status: 'skipped', reason: 'D1 not configured' };
  }

  const enquiryId = crypto.randomUUID();
  const { name, trade, email, phone, message } = data;
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const details = [trade, phone, message].filter(Boolean).join('\n\n');
  const payloadJson = JSON.stringify({ name, trade, email, phone, message });

  try {
    await queryD1(env, enquiriesDb(env),
      `INSERT INTO landing_enquiries (
         id, created_at, full_name, biz_name, email, start_option, source, details,
         payload_json, notion_status, email_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        enquiryId, now, name, trade || '(not provided)', email,
        'contact_form', 'contact_form', details, payloadJson,
        'pending', 'pending',
      ]);
    console.log('Contact enquiry inserted into D1:', enquiryId);
    return { status: 'success', id: enquiryId };
  } catch (err) {
    console.error('D1 insert exception:', err);
    return { status: 'error', reason: err.message };
  }
}

export async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
  if (!data || typeof data !== 'object') return json({ error: 'Invalid request body' }, 400);

  const { name, trade, email, phone, message } = data;
  if (!name || !email || !message) {
    return json({ error: 'Name, email and message are required.' }, 400);
  }

  const emailBody = [
    'New enquiry from NeoBookworm.uk',
    '================================',
    `Name:    ${name}`,
    `Trade:   ${trade || '(not provided)'}`,
    `Email:   ${email}`,
    `Phone:   ${phone || '(not provided)'}`,
    '',
    'Message:',
    message,
    '',
    '--------------------------------',
    'Sent via the quick contact form on neobookworm.uk',
  ].join('\n');

  const d1Result = await insertContactToD1(env, data);
  const toEmail = env.TO_EMAIL || DEFAULT_TO;

  if (!gmailConfigured(env)) {
    console.log('Gmail not configured. Would have sent:\n' + emailBody);
    return json({ ok: true, note: 'SMTP not configured — logged only', d1: d1Result });
  }

  try {
    await sendViaGmail(env, {
      to: toEmail,
      replyTo: email,
      subject: `New enquiry from ${name} — ${trade || 'NeoBookworm.uk'}`,
      body: emailBody,
    });
    return json({ ok: true, d1: d1Result });
  } catch (err) {
    console.error('Email send error:', err);
    return json({ error: 'Failed to send email. Please try again.' }, 500);
  }
}
