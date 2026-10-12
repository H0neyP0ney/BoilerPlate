// Œuf des boss : rogne art-src/egg.png à son contenu (marge de 1 px) et l'écrit dans games/xiao-swarm/public/assets/aliens/egg.png
// (alien `boss_egg`, id de visuel `alien_boss_egg`), à sa taille d'origine (sans réduction). Le socle (nid) n'existe plus depuis le 11/10.
//
//   node tools/slice-egg.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/egg.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/aliens');
fs.mkdirSync(outDir, { recursive: true });

let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
for (let y = 0; y < src.height; y++)
  for (let x = 0; x < src.width; x++)
    if (src.data[(y * src.width + x) * 4 + 3] > 20) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
x0 = Math.max(0, x0 - 1);
y0 = Math.max(0, y0 - 1);
x1 = Math.min(src.width, x1 + 1);
y1 = Math.min(src.height, y1 + 1);
const w = x1 - x0;
const h = y1 - y0;
const out = new PNG({ width: w, height: h });
PNG.bitblt(src, out, x0, y0, w, h, 0, 0);
fs.writeFileSync(path.join(outDir, 'egg.png'), PNG.sync.write(out));
console.log(`egg.png : ${w}×${h} px`);
