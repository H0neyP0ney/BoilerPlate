// Boutons Armory / Skins de l'écran titre : coupe art-src/armory_outfits.png (arsenal à gauche, vestiaire à droite), rogne chaque coffre à son contenu
// et l'écrit réduit dans games/xiao-swarm/public/assets/ui/btn_armory.png et btn_skins.png (option `sprite` de Button : l'image + le libellé posé sur sa plaque).
//
//   node tools/slice-armory-buttons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/armory_outfits.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui');

/** Réduction à l'export (les boutons s'affichent à ~170 px de large). */
const EXPORT = 0.7;
const PARTS = [
  { name: 'btn_armory', from: 0, to: 271 },
  { name: 'btn_skins', from: 271, to: src.width },
];

for (const part of PARTS) {
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++)
    for (let x = part.from; x < part.to; x++)
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
  fs.writeFileSync(path.join(outDir, `${part.name}.png`), PNG.sync.write(out));
  console.log(`${part.name}.png ${w}×${h}`);
}
