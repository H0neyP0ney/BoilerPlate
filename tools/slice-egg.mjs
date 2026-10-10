// Œuf des boss et son socle (nid) : sépare art-src/egg_socle.png en deux images rognées à leur contenu, réduites de moitié, écrites dans
// games/xiao-swarm/public/assets/aliens/egg.png (alien `boss_egg`, id de visuel `alien_boss_egg`) et egg_socle.png (posé sous l'œuf par view/UnitViews.ts).
// Le haut de la planche est l'œuf, le bas le socle : on les sépare à la première ligne entièrement transparente entre les deux.
//
//   node tools/slice-egg.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/egg_socle.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/aliens');
fs.mkdirSync(outDir, { recursive: true });

const alphaAt = (x, y) => src.data[(y * src.width + x) * 4 + 3];
const rowHasInk = (y) => {
  for (let x = 0; x < src.width; x++) if (alphaAt(x, y) > 20) return true;
  return false;
};

// bandes de lignes non vides : la 1re est l'œuf, la dernière le socle
const bands = [];
for (let y = 0, start = -1; y <= src.height; y++) {
  const ink = y < src.height && rowHasInk(y);
  if (ink && start < 0) start = y;
  if (!ink && start >= 0) {
    bands.push([start, y]);
    start = -1;
  }
}
if (bands.length < 2) throw new Error(`2 éléments attendus (œuf, socle), ${bands.length} trouvé(s)`);
const [egg, socle] = [bands[0], bands[bands.length - 1]];

/** Rogne la bande [y0, y1) à son contenu horizontal et la réduit de moitié (moyenne 2×2, couleurs pondérées par l'opacité). */
function crop([y0, y1], name) {
  let x0 = src.width, x1 = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < src.width; x++) if (alphaAt(x, y) > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); }
  const w = Math.ceil((x1 - x0) / 2), h = Math.ceil((y1 - y0) / 2);
  const out = new PNG({ width: w, height: h });
  for (let oy = 0; oy < h; oy++)
    for (let ox = 0; ox < w; ox++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const x = x0 + ox * 2 + dx, y = y0 + oy * 2 + dy;
          if (x >= src.width || y >= y1) continue;
          const i = (y * src.width + x) * 4, al = src.data[i + 3];
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al;
        }
      const o = (oy * w + ox) * 4;
      out.data[o] = a ? r / a : 0; out.data[o + 1] = a ? g / a : 0; out.data[o + 2] = a ? b / a : 0; out.data[o + 3] = a / 4;
    }
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(out));
  console.log(`${name} : ${w}×${h} px`);
}
crop(egg, 'egg.png');
crop(socle, 'egg_socle.png');
