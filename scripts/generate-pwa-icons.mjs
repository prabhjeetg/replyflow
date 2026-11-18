import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    rgbaBuffer.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = maskable ? 0.2 : 0.12;
  const radius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      // Background rounded rect check
      let insideBg = true;
      if (radius > 0) {
        const cx = x < radius ? radius : x > size - radius ? size - radius : x;
        const cy = y < radius ? radius : y > size - radius ? size - radius : y;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > radius * radius) {
          insideBg = false;
        }
      }

      if (!insideBg) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Gradient background (#0F172A -> #1E1B4B)
      const t = (nx + ny) * 0.5;
      let r = Math.round(15 + (30 - 15) * t);
      let g = Math.round(23 + (27 - 23) * t);
      let b = Math.round(42 + (75 - 42) * t);

      // Chat bubble geometry inside safe zone
      const bx0 = pad + 0.08;
      const bx1 = 1 - pad - 0.08;
      const by0 = pad + 0.1;
      const by1 = 1 - pad - 0.18;
      const br = 0.08;

      let inBubble = false;
      if (nx >= bx0 && nx <= bx1 && ny >= by0 && ny <= by1) {
        const rx = nx < bx0 + br ? bx0 + br : nx > bx1 - br ? bx1 - br : nx;
        const ry = ny < by0 + br ? by0 + br : ny > by1 - br ? by1 - br : ny;
        const dx = nx - rx;
        const dy = ny - ry;
        if (dx * dx + dy * dy <= br * br) inBubble = true;
      }

      // Bubble tail triangle
      const tailX0 = bx0 + 0.12;
      const tailX1 = bx0 + 0.28;
      const tailY0 = by1 - 0.01;
      const tailY1 = by1 + 0.11;
      if (nx >= tailX0 && nx <= tailX1 && ny >= tailY0 && ny <= tailY1) {
        const progress = (ny - tailY0) / (tailY1 - tailY0);
        if (nx <= tailX1 - progress * (tailX1 - tailX0)) {
          inBubble = true;
        }
      }

      if (inBubble) {
        // Indigo gradient (#6366F1 -> #4F46E5)
        r = Math.round(99 - 20 * t);
        g = Math.round(102 - 32 * t);
        b = Math.round(241 - 12 * t);

        // White lightning / reply bolt inside bubble
        const cx = (bx0 + bx1) * 0.5;
        const cy = (by0 + by1) * 0.5;
        const lx = nx - cx;
        const ly = ny - cy;
        const inTopBolt = ly >= -0.14 && ly <= 0.01 && lx >= -0.07 - ly * 0.45 && lx <= 0.03 - ly * 0.15;
        const inBotBolt = ly > -0.01 && ly <= 0.14 && lx >= -0.03 - ly * 0.15 && lx <= 0.07 - ly * 0.45;
        if (inTopBolt || inBotBolt) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.resolve('public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180, false));
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderIcon(192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderIcon(512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderIcon(512, true));
console.log('Generated PWA PNG icons in public/');
