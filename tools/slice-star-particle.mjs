// Particule « étoile » (cartes prismatiques du choix d'upgrade) : rogne art-src/star.png à son contenu et l'écrit dans
// games/xiao-swarm/public/assets/fx/star.png (texture `fx_star`, blanche : l'émetteur la teinte).
//
//   node tools/slice-star-particle.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/star.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/fx');
fs.mkdirSync(outDir, { recursive: true });

/** Réduction à l'export (la particule s'affiche à ~18 px : 48 px suffisent, même en haute densité). */
const SIZE = 48;

let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
for (let y = 0; y < src.height; y++)
  for (let x = 0; x < src.width; x++)
    if (src.data[(y * src.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }

// boîte carrée centrée sur l'étoile (la particule tourne autour de son centre)
const side = Math.max(x1 - x0, y1 - y0) + 2;
const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
const bx = cx - side / 2, by = cy - side / 2;
const out = new PNG({ width: SIZE, height: SIZE });
const s = side / SIZE;
for (let oy = 0; oy < SIZE; oy++)
  for (let ox = 0; ox < SIZE; ox++) {
    let r = 0, g = 0, b = 0, a = 0, wt = 0;
    const fx0 = bx + ox * s, fx1 = fx0 + s, fy0 = by + oy * s, fy1 = fy0 + s;
    for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++)
      for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
        const cw = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
        const inside = x >= 0 && y >= 0 && x < src.width && y < src.height;
        const i = (y * src.width + x) * 4;
        const al = inside ? src.data[i + 3] / 255 : 0;
        if (inside) { r += src.data[i] * al * cw; g += src.data[i + 1] * al * cw; b += src.data[i + 2] * al * cw; }
        a += al * cw; wt += cw;
      }
    const o = (oy * SIZE + ox) * 4;
    if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
    out.data[o + 3] = Math.round((a / wt) * 255);
  }
fs.writeFileSync(path.join(outDir, 'star.png'), PNG.sync.write(out));
console.log(`star.png ${SIZE}×${SIZE}`);
