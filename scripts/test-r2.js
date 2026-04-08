/**
 * Standalone R2 (S3 API) smoke test — same client settings as api/submit-intake.js getS3().
 *
 * Does not call Notion or the intake form.
 *
 * Usage (from repo root):
 *   Set env vars (PowerShell example):
 *     $env:R2_ACCESS_KEY_ID="..."; $env:R2_SECRET_ACCESS_KEY="..."; $env:R2_BUCKET_NAME="..."
 *     $env:R2_ACCOUNT_ID="..."   # or $env:R2_ENDPOINT="https://<id>.r2.cloudflarestorage.com"
 *     node scripts/test-r2.js
 *
 *   Or with Node 20+ env file:
 *     node --env-file=.env.local scripts/test-r2.js
 *
 * Optional: R2_REGION, R2_JURISDICTION, R2_FORCE_PATH_STYLE=1, R2_PUBLIC_URL (for URL print only)
 */

'use strict';

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

function getR2Endpoint() {
  const explicit = (process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  if (!accountId) return '';
  const j = (process.env.R2_JURISDICTION || 'default').toLowerCase();
  if (j === 'eu') return `https://${accountId}.eu.r2.cloudflarestorage.com`;
  if (j === 'fedramp') return `https://${accountId}.fedramp.r2.cloudflarestorage.com`;
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function buildClient() {
  const endpoint = getR2Endpoint();
  if (!endpoint) {
    throw new Error('Set R2_ENDPOINT or R2_ACCOUNT_ID');
  }
  const e = endpoint.toLowerCase();
  if (e.includes('.r2.dev')) {
    console.warn('Warning: endpoint looks like a public r2.dev URL. Use …r2.cloudflarestorage.com');
  }
  const region = (process.env.R2_REGION || 'auto').trim();
  const forcePathStyle = process.env.R2_FORCE_PATH_STYLE === '1';
  return new S3Client({
    region,
    endpoint,
    forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId:     (process.env.R2_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
    },
  });
}

function requiredMissing() {
  const keys = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  return keys.filter((k) => !process.env[k] || !String(process.env[k]).trim());
}

async function main() {
  const missing = requiredMissing();
  if (missing.length) {
    console.error('Missing env:', missing.join(', '));
    console.error('Also need R2_ENDPOINT or R2_ACCOUNT_ID.');
    process.exit(1);
  }

  const bucket = process.env.R2_BUCKET_NAME.trim();
  const key = `health-check/neobookworm-r2-test-${Date.now()}.txt`;
  const body = Buffer.from(`neoBookworm R2 self-test OK — ${new Date().toISOString()}\n`, 'utf8');

  const client = buildClient();

  try {
    console.log('Endpoint host:', new URL(getR2Endpoint()).hostname);
    console.log('Bucket:', bucket);
    console.log('PutObject:', key);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket:      bucket,
        Key:         key,
        Body:        body,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
    console.log('PutObject: OK');
  } catch (err) {
    const meta = err.$metadata || {};
    console.error('PutObject: FAILED');
    console.error(err.message, err.name || '', meta.httpStatusCode != null ? `HTTP ${meta.httpStatusCode}` : '');
    console.error('Fix credentials, bucket name, endpoint (not r2.dev), and token permissions (Object Read & Write on this bucket).');
    process.exit(2);
  }

  const pub = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (pub) {
    console.log('Public URL (if bucket is public):', `${pub}/${key}`);
  } else {
    console.log('(R2_PUBLIC_URL not set — skipped public link hint)');
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log('DeleteObject (cleanup): OK');
  } catch (err) {
    console.warn('DeleteObject (cleanup) failed — remove manually:', key, err.message);
  }

  console.log('\nR2 S3 API test passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
