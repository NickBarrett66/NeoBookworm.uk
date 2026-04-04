// Vercel serverless function — receives quick contact form POST and sends email via SMTP.
//
// Required env vars (set in Vercel dashboard):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional:
//   TO_EMAIL  (defaults to nick@neobookworm.uk)

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

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'nick@neobookworm.uk';

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
