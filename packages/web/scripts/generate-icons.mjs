#!/usr/bin/env node
// Generates the PWA icons (public/icons/icon-{192,512}.png) without any image
// dependency: pixels are drawn directly and encoded as PNG with node:zlib.
// Re-run after changing the mark: node scripts/generate-icons.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAPER = [0xfa, 0xf8, 0xf4];
const COBALT = [0x1f, 0x3f, 0xbf];

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, [r, g, b]) => {
    const i = (y * size + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  const r = size * 0.17;
  const stroke = size * 0.075;
  const c1 = { x: size * 0.34, y: size * 0.5 }; // filled dot
  const c2 = { x: size * 0.69, y: size * 0.5 }; // ring
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d1 = Math.hypot(x - c1.x, y - c1.y);
      const d2 = Math.hypot(x - c2.x, y - c2.y);
      const ink = d1 <= r || Math.abs(d2 - r) <= stroke / 2;
      set(x, y, ink ? COBALT : PAPER);
    }
  }
  return px;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'icons',
);
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  writeFileSync(file, encodePng(drawIcon(size), size));
  console.log(`wrote ${file}`);
}
