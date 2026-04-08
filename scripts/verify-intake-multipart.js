/**
 * Verifies multipart parsing for api/submit-intake.js (no Notion/R2 calls).
 * Run from repo root: node scripts/verify-intake-multipart.js
 */

'use strict';

const { Readable } = require('stream');
const assert = require('assert');
const submitIntake = require('../api/submit-intake.js');
const { parseMultipart } = submitIntake._test;

function buildMultipart(boundary, parts) {
  const bufs = [];
  for (const p of parts) {
    bufs.push(Buffer.from(`--${boundary}\r\n`, 'utf8'));
    if (p.kind === 'field') {
      bufs.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`,
          'utf8',
        ),
      );
    } else {
      let cd = `Content-Disposition: form-data; name="${p.name}"`;
      if (p.filename !== undefined) {
        cd += `; filename="${p.filename}"`;
      }
      cd += `\r\nContent-Type: ${p.mime}\r\n\r\n`;
      bufs.push(Buffer.from(cd, 'utf8'));
      bufs.push(p.data);
      bufs.push(Buffer.from('\r\n', 'utf8'));
    }
  }
  bufs.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(bufs);
}

function mockReq(bodyBuf, boundary) {
  const req = Readable.from(bodyBuf);
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };
  return req;
}

function minimalHeic() {
  const b = Buffer.alloc(32);
  b.writeUInt32BE(32, 0);
  b.write('ftyp', 4);
  b.write('heic', 8);
  b.fill(0, 12);
  return b;
}

async function main() {
  const boundary = '----testBoundaryXYZ';

  // 1) Two JPEGs + text fields (mimics browser FormData)
  const jpegMini = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const body1 = buildMultipart(boundary, [
    { kind: 'field', name: 'bizName', value: 'Test Plumbing Ltd' },
    { kind: 'field', name: 'email', value: 'test@example.com' },
    {
      kind: 'file',
      name: 'photos',
      filename: 'one.jpg',
      mime: 'image/jpeg',
      data: jpegMini,
    },
    {
      kind: 'file',
      name: 'photos',
      filename: 'two.jpg',
      mime: 'image/jpeg',
      data: jpegMini,
    },
  ]);
  const p1 = await parseMultipart(mockReq(body1, boundary));
  assert.strictEqual(p1.fields.bizName, 'Test Plumbing Ltd');
  assert.strictEqual(p1.fields.email, 'test@example.com');
  assert.strictEqual(p1.files.photos.length, 2);
  assert.strictEqual(p1.files.photos[0].mimeType, 'image/jpeg');
  assert.strictEqual(p1.files.photos[1].buffer.length, jpegMini.length);
  console.log('ok: two photos + fields');

  // 2) Octet-stream + magic bytes → sniffed as image/jpeg
  const body2 = buildMultipart(boundary, [
    { kind: 'field', name: 'bizName', value: 'Acme' },
    {
      kind: 'file',
      name: 'photos',
      filename: 'phone.bin',
      mime: 'application/octet-stream',
      data: jpegMini,
    },
  ]);
  const p2 = await parseMultipart(mockReq(body2, boundary));
  assert.strictEqual(p2.files.photos.length, 1);
  assert.strictEqual(p2.files.photos[0].mimeType, 'image/jpeg');
  console.log('ok: octet-stream sniffed to image/jpeg');

  // 3) Missing filename → still stored with generated name
  const parts3 = [
    Buffer.from(`--${boundary}\r\n`, 'utf8'),
    Buffer.from(
      'Content-Disposition: form-data; name="bizName"\r\n\r\nSolo\r\n',
      'utf8',
    ),
    Buffer.from(`--${boundary}\r\n`, 'utf8'),
    Buffer.from(
      'Content-Disposition: form-data; name="photos"\r\nContent-Type: application/octet-stream\r\n\r\n',
      'utf8',
    ),
    jpegMini,
    Buffer.from('\r\n', 'utf8'),
    Buffer.from(`--${boundary}--\r\n`, 'utf8'),
  ];
  const body3 = Buffer.concat(parts3);
  const p3 = await parseMultipart(mockReq(body3, boundary));
  assert.strictEqual(p3.files.photos.length, 1);
  assert.ok(/upload-\d+-.+\.jpg/.test(p3.files.photos[0].filename), 'generated filename');
  console.log('ok: no filename part still yields one photo');

  // 4) HEIC brand ftyp
  const body4 = buildMultipart(boundary, [
    { kind: 'field', name: 'bizName', value: 'HEIC Co' },
    {
      kind: 'file',
      name: 'photos',
      filename: 'img.heic',
      mime: 'image/heic',
      data: minimalHeic(),
    },
  ]);
  const p4 = await parseMultipart(mockReq(body4, boundary));
  assert.strictEqual(p4.files.photos.length, 1);
  assert.strictEqual(p4.files.photos[0].mimeType, 'image/heic');
  console.log('ok: heic part preserved');

  // 5) Logo field separate from photos
  const body5 = buildMultipart(boundary, [
    { kind: 'field', name: 'bizName', value: 'Logo Biz' },
    {
      kind: 'file',
      name: 'logo',
      filename: 'mark.png',
      mime: 'image/png',
      data: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]),
    },
  ]);
  const p5 = await parseMultipart(mockReq(body5, boundary));
  assert.strictEqual(p5.files.logo.length, 1);
  assert.strictEqual(p5.files.logo[0].mimeType, 'image/png');
  console.log('ok: logo file distinct from photos');

  // 6) Empty stream + body fallback (simulates host that buffers to req.body)
  const emptyReq = Readable.from(Buffer.alloc(0));
  emptyReq.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  emptyReq.body = body1;
  const p6 = await parseMultipart(emptyReq);
  assert.strictEqual(p6.files.photos.length, 2);
  console.log('ok: fallback when stream empty but req.body is Buffer');

  console.log('\nAll multipart checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
