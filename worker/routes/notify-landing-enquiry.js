// Landing enquiry notifications — /api/notify-landing-enquiry
// Called by the landing-enquiry Worker (X-Notify-Secret) for single enquiries and digests.

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

async function sendNotification(env, fields, notionPageId) {
  const toEmail = env.TO_EMAIL || DEFAULT_TO;

  const notionUrl = notionPageId
    ? `https://www.notion.so/${notionPageId.replace(/-/g, '')}`
    : null;

  const emailBody = [
    'New landing page enquiry — NeoBookworm',
    '=======================================',
    `Name:          ${fields.fullName    || ''}`,
    `Business:      ${fields.bizName     || ''}`,
    `Email:         ${fields.email       || ''}`,
    `Current URL:   ${fields.currentUrl  || '(not provided)'}`,
    `Start option:  ${fields.startOption || '(not set)'}`,
    `Source:        ${fields.source      || '(not set)'}`,
    ...(notionUrl ? ['', `Notion record: ${notionUrl}`] : []),
    '',
    'Notes / details:',
    fields.details || '(none)',
    '',
    '---------------------------------------',
    `Sent via neobookworm.uk/${(fields.source || 'landing').replace('-landing', '')}`,
  ].join('\n');

  if (!gmailConfigured(env)) {
    console.log('[notify-landing-enquiry] Gmail not configured — would have sent:\n' + emailBody);
    return;
  }

  await sendViaGmail(env, {
    to: toEmail,
    replyTo: fields.email,
    subject: `New enquiry — ${fields.bizName || fields.fullName || 'landing page'}`,
    body: emailBody,
  });

  console.log('[notify-landing-enquiry] notification email sent to', toEmail);
}

async function sendDigest(env, rows) {
  const toEmail = env.TO_EMAIL || DEFAULT_TO;

  const lines = [
    'NeoBookworm — landing enquiries needing attention',
    '==================================================',
    `${rows.length} row(s) with a failed sync leg as of ${new Date().toUTCString()}`,
    '',
  ];

  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.biz_name || r.email || r.id}`);
    lines.push(`   ID:         ${r.id}`);
    lines.push(`   Created:    ${r.created_at}`);
    lines.push(`   Email:      ${r.email || '(none)'}`);
    lines.push(`   Source:     ${r.source || '(none)'}`);
    if (r.notion_status) {
      lines.push(`   Notion:     ${r.notion_status}${r.notion_error ? ` — ${r.notion_error}` : ''}`);
    }
    lines.push(`   Email leg:  ${r.email_status}${r.email_error  ? ` — ${r.email_error}`  : ''}`);
    lines.push('');
  });

  lines.push('---------------------------------------');
  lines.push('Use the wrangler command in the Worker README to query D1 directly.');

  const emailBody = lines.join('\n');

  if (!gmailConfigured(env)) {
    console.log('[notify-landing-enquiry] Gmail not configured — digest would have sent:\n' + emailBody);
    return;
  }

  await sendViaGmail(env, {
    to: toEmail,
    subject: 'NeoBookworm: landing enquiries needing attention',
    body: emailBody,
  });

  console.log('[notify-landing-enquiry] digest email sent to', toEmail, `(${rows.length} rows)`);
}

export async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const notifySecret = env.NOTIFY_SECRET;
  if (!notifySecret) {
    console.error('[notify-landing-enquiry] NOTIFY_SECRET env var not set');
    return json({ error: 'Notify endpoint not configured.' }, 500);
  }

  const providedSecret = request.headers.get('x-notify-secret');
  if (!providedSecret || providedSecret !== notifySecret) {
    console.warn('[notify-landing-enquiry] Invalid or missing X-Notify-Secret');
    return json({ error: 'Unauthorised.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400);

  if (body.type === 'digest') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return json({ ok: true, sent: false });

    try {
      await sendDigest(env, rows);
    } catch (mailErr) {
      console.error('[notify-landing-enquiry] Digest email error:', mailErr.message);
      return json({ error: 'Failed to send digest email.' }, 500);
    }
    return json({ ok: true, sent: true, count: rows.length });
  }

  const { fullName, bizName, email, startOption, source, currentUrl, details, notionPageId } = body;

  const fields = {
    fullName:    fullName    ? String(fullName).trim()    : '',
    bizName:     bizName     ? String(bizName).trim()     : '',
    email:       email       ? String(email).trim()       : '',
    startOption: startOption ? String(startOption).trim() : '',
    source:      source      ? String(source).trim()      : 'landing',
    currentUrl:  currentUrl  ? String(currentUrl).trim()  : '',
    details:     details     ? String(details).trim()     : '',
  };

  try {
    await sendNotification(env, fields, notionPageId || null);
  } catch (mailErr) {
    console.error('[notify-landing-enquiry] Email error:', mailErr.message);
    return json({ error: 'Failed to send notification email.' }, 500);
  }

  return json({ ok: true });
}
