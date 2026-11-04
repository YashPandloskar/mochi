// Generates assets/icon.png (512x512, the app and installer icon): the mochi blob on a soft rounded square.
// Run: node scripts/make-app-icon.js
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const N = 512;
const SS = 3; // samples per axis, for smooth edges
const px = Buffer.alloc(N * N * 4);
const u = N / 32; // the 32px tray design, scaled

function sample(x, y) {
  // rounded square background
  const cx = Math.abs(x - N / 2) - (N / 2 - 36 * (N / 512) - 70);
  const cy = Math.abs(y - N / 2) - (N / 2 - 36 * (N / 512) - 70);
  const out = Math.hypot(Math.max(cx, 0), Math.max(cy, 0)) + Math.min(Math.max(cx, cy), 0) - 70;
  if (out > 0) return [0, 0, 0, 0];
  let c = [58, 46, 40, 255];
  const bx = 16 + (x / u - 16) / 0.68; // the blob sits smaller inside the square
  const by = 17.5 + (y / u - 17.5) / 0.68;
  const dx = (bx - 16) / 13;
  const dy = (by - 18) / 11;
  const d = dx * dx + dy * dy;
  if (d <= 1.12) c = [229, 220, 203, 255];
  if (d <= 1) c = [255, 250, 242, 255];
  for (const ex of [11, 21]) {
    if ((bx - ex) ** 2 + (by - 17) ** 2 <= 6) c = [43, 40, 36, 255];
  }
  return c;
}

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
      }
    }
    const i = (y * N + x) * 4;
    if (a > 0) {
      px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a;
    }
    px[i + 3] = a / (SS * SS);
  }
}

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
