// build/cursor-source.png (checkerboard baked in, no alpha) → public/icons/cursor-{32,64}.png
// Background = gray (low saturation), arrow = saturated green: alpha follows saturation,
// which also gives soft, anti-aliased edges. Prints the hotspot (arrow tip) for the CSS.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const src = PNG.sync.read(readFileSync(new URL('./cursor-source.png', import.meta.url)));
const { width: W, height: H, data } = src;

const alpha = new Float32Array(W * H);
let minX = W, minY = H, maxX = 0, maxY = 0;
let tip = null;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    const a = Math.min(1, Math.max(0, (sat - 25) / 45));
    alpha[y * W + x] = a;
    if (a > 0.5) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (!tip || x + y < tip.x + tip.y) tip = { x, y };
    }
  }
}

function render(size) {
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const scale = size / Math.max(bw, bh);
  const out = new PNG({ width: size, height: size });
  // Area-average downscale with premultiplied alpha.
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      const x0 = minX + ox / scale, x1 = minX + (ox + 1) / scale;
      const y0 = minY + oy / scale, y1 = minY + (oy + 1) / scale;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) { n++; continue; }
          const i = (y * W + x) * 4;
          const al = alpha[y * W + x];
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
        }
      }
      const o = (oy * size + ox) * 4;
      out.data[o] = a ? r / a : 0;
      out.data[o + 1] = a ? g / a : 0;
      out.data[o + 2] = a ? b / a : 0;
      out.data[o + 3] = n ? Math.round((a / n) * 255) : 0;
    }
  }
  writeFileSync(new URL(`../public/icons/cursor-${size}.png`, import.meta.url), PNG.sync.write(out));
  return { x: Math.round((tip.x - minX) * scale), y: Math.round((tip.y - minY) * scale) };
}

const h32 = render(32);
render(64);
console.log('bounds', { minX, minY, maxX, maxY }, 'tip', tip, 'hotspot@32', h32);
