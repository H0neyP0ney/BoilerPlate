// Freezebot : réduit art-src/freezebot.png (drone qui plane au centre du globe de stase) pour le jeu.
//
//   node tools/slice-freezebot.mjs
//
// Écrit games/xiao-swarm/public/assets/fx/freezebot.png (réduction par moyenne de surface, EXPORT × la taille de la planche).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/freezebot.png')));
const EXPORT = 0.5; // 202 px → 101 px : assez pour un affichage à ~52 px, même en écran HD
const w = Math.round(src.width * EXPORT), h = Math.round(src.height * EXPORT);
const out = new PNG({ width: w, height: h });
const k = 1 / EXPORT;
for (let oy = 0; oy < h; oy++)
  for (let ox = 0; ox < w; ox++) {
    let r = 0, g = 0, b = 0, a = 0, wt = 0;
    const fx0 = ox * k, fx1 = fx0 + k, fy0 = oy * k, fy1 = fy0 + k;
    for (let y = Math.floor(fy0); y < Math.min(src.height, Math.ceil(fy1)); y++)
      for (let x = Math.floor(fx0); x < Math.min(src.width, Math.ceil(fx1)); x++) {
        const kk = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
        const i = (y * src.width + x) * 4, al = src.data[i + 3] / 255;
        r += src.data[i] * al * kk; g += src.data[i + 1] * al * kk; b += src.data[i + 2] * al * kk; a += al * kk; wt += kk;
      }
    const o = (oy * w + ox) * 4;
    if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
    out.data[o + 3] = Math.round((a / wt) * 255);
  }
const dir = path.join(root, 'games/xiao-swarm/public/assets/fx');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'freezebot.png'), PNG.sync.write(out));
console.log(`freezebot ${w}×${h} dans ${path.relative(root, dir)}`);
