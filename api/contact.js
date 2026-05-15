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
    console.log('D1 not configured. Skipping database insert.');
    return;
  }

  const enquiryId = randomUUID();
  const { name, trade, email, phone, message } = data;

  const sql = `INSERT INTO contact_enquiries (id, name, trade, email, phone, message)
               VALUES (?, ?, ?, ?, ?, ?)`;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${d1DbId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          params: [enquiryId, name, trade || null, email, phone || null, message],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('D1 insert error:', errorData);
      return;
    }

    const result = await response.json();
    if (!result.success) {
      console.error('D1 insert failed:', result.errors);
      return;
    }

    console.log('Contact enquiry inserted into D1:', enquiryId);
  } catch (err) {
    console.error('D1 insert exception:', err);
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

  await insertContactToDB1(data);

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'neobookworm@icloud.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('SMTP not configured. Would have sent:\n' + emailBody);
    return res.status(200).json({ ok: true, note: 'SMTP not configured — logged only' });
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
};
