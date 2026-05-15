// Vercel serverless function — receives quick contact form POST and sends email via SMTP.
//
// Required env vars (set in Vercel dashboard):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional:
//   TO_EMAIL  (defaults to neobookworm@icloud.com)
//   CF_ACCOUNT_ID, CF_API_TOKEN, D1_ENQUIRIES_ID (for D1 persistence)

const { randomUUID } = require('crypto');

async function insertContactToDB1(data) {
  const cfAccountId = process.env.CF_ACCOUNT_ID;
  const cfApiToken = process.env.CF_API_TOKEN;
  const d1DbId = process.env.D1_ENQUIRIES_ID;

  if (!cfAccountId || !cfApiToken || !d1DbId) {
    console.log('D1 not configured. Missing:', {
      account: !!cfAccountId,
      token: !!cfApiToken,
      dbId: !!d1DbId,
    });
    return { status: 'skipped', reason: 'D1 not configured' };
  }

  const enquiryId = randomUUID();
  const { name, trade, email, phone, message } = data;
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  const details = [trade, phone, message].filter(Boolean).join('\n\n');
  const payloadJson = JSON.stringify({ name, trade, email, phone, message });

  // Escape single quotes for SQL
  const escape = (str) => (str || '').replace(/'/g, "''");

  const sql = `INSERT INTO landing_enquiries (
    id, created_at, full_name, biz_name, email, start_option, source, details,
    payload_json, notion_status, email_status
  ) VALUES (
    '${escape(enquiryId)}',
    '${escape(now)}',
    '${escape(name)}',
    '${escape(trade || '(not provided)')}',
    '${escape(email)}',
    'contact_form',
    'contact_form',
    '${escape(details)}',
    '${escape(payloadJson)}',
    'pending',
    'pending'
  )`;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${d1DbId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('D1 insert error:', errorData);
      return { status: 'failed', reason: errorData };
    }

    const result = await response.json();
    if (!result.success) {
      console.error('D1 insert failed:', result.errors);
      return { status: 'failed', reason: result.errors };
    }

    const queryResult = result.result?.[0];
    if (!queryResult || !queryResult.success) {
      console.error('D1 query execution failed:', queryResult);
      return { status: 'failed', reason: 'Query execution failed' };
    }

    if (queryResult.meta?.changes !== 1) {
      console.error('D1 insert did not create a record:', queryResult.meta);
      return { status: 'failed', reason: `Expected 1 change, got ${queryResult.meta?.changes || 0}` };
    }

    console.log('Contact enquiry inserted into D1:', enquiryId);
    return { status: 'success', id: enquiryId };
  } catch (err) {
    console.error('D1 insert exception:', err);
    return { status: 'error', reason: err.message };
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const data = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { name, trade, email, phone, message } = data;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' });
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

  const d1Result = await insertContactToDB1(data);

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'neobookworm@icloud.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('SMTP not configured. Would have sent:\n' + emailBody);
    return res.status(200).json({
      ok: true,
      note: 'SMTP not configured — logged only',
      d1: d1Result
    });
  }

  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"NeoBookworm Enquiry" <${smtpUser}>`,
      to: toEmail,
      replyTo: email,
      subject: `New enquiry from ${name} — ${trade || 'NeoBookworm.uk'}`,
      text: emailBody,
    });

    return res.status(200).json({ ok: true, d1: d1Result });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
};
