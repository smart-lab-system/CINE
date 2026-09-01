#!/usr/bin/env node
/**
 * Generates the two placeholder PNGs this app needs (window icon, tray
 * icon) with zero dependencies — just Node's built-in zlib, so this can
 * run anywhere without pulling in an image library for two solid-colour
 * squares.
 *
 * Deliberately minimal: a solid `--primary` (#26317A, Deep Indigo — see
 * apps/web/src/app/globals.css) square. Good enough to be recognizable in
 * a taskbar and a title bar during dev-mode verification; a real mark
 * (the gradient+"E" glyph from the approved mockup) is a design pass for
 * later, not a blocker for Phase 1.
 *
 * Re-run with `node electron/resources/generate-icons.mjs` if the colour
 * ever changes.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRIMARY_RGB = [0x26, 0x31, 0x7a]; // #26317A

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function solidColorPng(size, [r, g, b]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB (no alpha needed for a solid square)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // One filter byte (0 = None) + 3 bytes/pixel, per scanline.
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

writeFileSync(join(__dirname, 'icon.png'), solidColorPng(256, PRIMARY_RGB));
writeFileSync(join(__dirname, 'tray-icon.png'), solidColorPng(32, PRIMARY_RGB));

console.log('Wrote icon.png (256x256) and tray-icon.png (32x32).');
