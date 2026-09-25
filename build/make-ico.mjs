// Packs public/icons/icon-{16,32,48,256}.png into build/icon.ico (PNG-compressed ICO entries).
import { readFileSync, writeFileSync } from 'node:fs';

const sizes = [16, 32, 48, 256];
const images = sizes.map((s) => readFileSync(new URL(`../public/icons/icon-${s}.png`, import.meta.url)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s === 256 ? 0 : s, e);
  header.writeUInt8(s === 256 ? 0 : s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(new URL('./icon.ico', import.meta.url), Buffer.concat([header, ...images]));
console.log('build/icon.ico', offset, 'bytes');
