/**
 * Renders the Nishchit mark (assets/favicon.svg) to the PNG sizes Chrome needs, with no
 * dependencies: shapes are drawn analytically with 4x4 supersampling and written as PNG.
 *   node scripts/make-extension-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const OUT = new URL('../extension/icons/', import.meta.url);
const BLUE = [0x1d, 0x4e, 0xd8];
const SS = 4;

// favicon.svg, in its 34x34 viewBox
const inRoundRect = (x, y) => {
  const r = 9;
  const cx = Math.min(Math.max(x, r), 34 - r);
  const cy = Math.min(Math.max(y, r), 34 - r);
  return x >= 0 && y >= 0 && x <= 34 && y <= 34 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const nearSegment = (x, y, x1, x2, yy, halfWidth) => {
  const px = Math.min(Math.max(x, x1), x2);
  return (x - px) ** 2 + (y - yy) ** 2 <= halfWidth ** 2;
};
const isWhite = (x, y) =>
  nearSegment(x, y, 8, 13, 17, 1.5) ||
  nearSegment(x, y, 21, 26, 17, 1.5) ||
  Math.abs(Math.hypot(x - 17, y - 17) - 3.2) <= 1.1;

function render(size) {
  const rows = [];
  for (let py = 0; py < size; py += 1) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0
    for (let px = 0; px < size; px += 1) {
      let cover = 0;
      let white = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = ((px + (sx + 0.5) / SS) / size) * 34;
          const y = ((py + (sy + 0.5) / SS) / size) * 34;
          if (!inRoundRect(x, y)) continue;
          cover += 1;
          if (isWhite(x, y)) white += 1;
        }
      }
      const n = SS * SS;
      const w = cover ? white / cover : 0;
      const o = 1 + px * 4;
      for (let c = 0; c < 3; c += 1) row[o + c] = Math.round(BLUE[c] * (1 - w) + 255 * w);
      row[o + 3] = Math.round((cover / n) * 255);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function png(size, raw) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`icon${size}.png`, OUT), render(size));
  console.log(`extension/icons/icon${size}.png`);
}
