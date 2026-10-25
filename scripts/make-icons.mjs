// Genereert public/icon-{180,192,512}.png: een pokerfiche op vilt. Geen afhankelijkheden.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [14, 20, 18], FELT = [20, 92, 60], RED = [200, 52, 52], WHITE = [240, 240, 235], DARK = [150, 36, 36];

function color(x, y) {
  // x,y in [-1,1]
  const r = Math.hypot(x, y);
  const a = Math.atan2(y, x);
  if (r > 0.98) return FELT;
  if (r > 0.80) return FELT;
  if (r > 0.78) return DARK;
  if (r > 0.58) {
    const seg = ((a + Math.PI) / (2 * Math.PI)) * 8;
    return seg - Math.floor(seg) < 0.42 ? WHITE : RED;
  }
  if (r > 0.53) return WHITE;
  if (r > 0.50) return RED;
  // spade-achtige ruit in het midden
  if (Math.abs(x) + Math.abs(y + 0.02) < 0.3) return WHITE;
  return RED;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / ss) / size) * 2 - 1;
          const c = color(x * 1.12, y * 1.12);
          acc = acc.map((v, i) => v + c[i]);
        }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (ss * ss));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

void BG;
for (const size of [180, 192, 512]) writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size));
console.log('iconen geschreven');
