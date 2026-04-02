exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { name, trade, email, phone, message } = data;

  if (!name || !email || !message) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Name, email and message are required.' }),
    };
  }

  // Build plain-text email body
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

  // Use Netlify's built-in email sending via environment variable SMTP config,
  // OR fall back to mailto-style by returning the data for logging.
  // Primary method: Nodemailer via SMTP (set env vars in Netlify dashboard).
  // SMTP env vars needed: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'nick@neobookworm.uk';

  if (!smtpHost || !smtpUser || !smtpPass) {
    // SMTP not yet configured — log and return success so form still works during dev
    console.log('SMTP not configured. Would have sent:\n' + emailBody);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, note: 'SMTP not configured — logged only' }),
    };
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Email send error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to send email. Please try again.' }),
    };
  }
};
