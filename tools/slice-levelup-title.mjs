// Titre « LEVEL UP! » de l'écran de choix d'upgrade : rogne art-src/levelup.png à son contenu et l'écrit dans
// games/xiao-swarm/public/assets/ui/levelup_title.png (affiché par scenes/LevelUpScene.ts).
//
//   node tools/slice-levelup-title.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/levelup.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui');
fs.mkdirSync(outDir, { recursive: true });

/** Réduction à l'export (le titre s'affiche à ~300 px de large). */
const EXPORT = 0.6;

let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
for (let y = 0; y < src.height; y++)
  for (let x = 0; x < src.width; x++)
    if (src.data[(y * src.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }

const w = Math.round((x1 - x0) * EXPORT);
const h = Math.round((y1 - y0) * EXPORT);
const out = new PNG({ width: w, height: h });
const sx = (x1 - x0) / w;
const sy = (y1 - y0) / h;
for (let oy = 0; oy < h; oy++)
  for (let ox = 0; ox < w; ox++) {
    let r = 0, g = 0, b = 0, a = 0, wt = 0;
    const fx0 = x0 + ox * sx, fx1 = fx0 + sx, fy0 = y0 + oy * sy, fy1 = fy0 + sy;
    for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++)
      for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
        const cw = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
        const i = (y * src.width + x) * 4;
        const al = src.data[i + 3] / 255;
        r += src.data[i] * al * cw; g += src.data[i + 1] * al * cw; b += src.data[i + 2] * al * cw; a += al * cw; wt += cw;
      }
    const o = (oy * w + ox) * 4;
    if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
    out.data[o + 3] = Math.round((a / wt) * 255);
  }
fs.writeFileSync(path.join(outDir, 'levelup_title.png'), PNG.sync.write(out));
console.log(`levelup_title.png ${w}×${h} (planche ${x1 - x0}×${y1 - y0})`);
