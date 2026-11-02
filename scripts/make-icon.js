// Generates assets/tray.png (a small cream blob with two dark eyes). Run: node scripts/make-icon.js
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const N = 32;
const px = Buffer.alloc(N * N * 4);

function set(x, y, r, g, b, a) {
  const i = (y * N + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const dx = (x + 0.5 - 16) / 13;
    const dy = (y + 0.5 - 18) / 11;
    const d = dx * dx + dy * dy;
    if (d <= 1) set(x, y, 255, 250, 242, 255);
    if (d > 1 && d <= 1.12) set(x, y, 229, 220, 203, 255);
    for (const ex of [11, 21]) {
      const ex2 = (x + 0.5 - ex) ** 2 + (y + 0.5 - 17) ** 2;
      if (ex2 <= 6) set(x, y, 43, 40, 36, 255);
    }
  }
}

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}

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
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'tray.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
