// Carte d'upgrade de base : art-src/card_upgrade.png (carte rouge) recadrée et réduite → games/xiao-swarm/public/assets/ui/cards/card_base.png.
//
//   node tools/slice-upgrade-cards.mjs
//
// Une seule image est livrée : les 14 cartes à la couleur de chaque upgrade et la carte prismatique « hologramme » sont fabriquées au lancement
// par `src/art/cardPixels.ts` / `cardTextures.ts` (plus de PNG par upgrade). Les constantes BOX / EXPORT ci-dessous (et la plaque dorée PLATE) sont reprises
// dans `cardPixels.ts` : à garder en phase. Les mesures utiles au HUD (zones de texte) sont dans `src/view/upgradeCards.ts` ; elles sont
// exprimées dans le repère de l'image recadrée (CARD_W × CARD_H).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/card_upgrade.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/cards');
fs.mkdirSync(outDir, { recursive: true });

/** Zone utile de la planche (le reste est transparent) et réduction à l'export. */
const BOX = [3, 0, 464, 675];
const EXPORT = 0.6;

/** Réduction par moyenne de surface (alpha prémultiplié) d'une zone de `img`. */
function crop(img, box, factor) {
  const [x0, y0, x1, y1] = box;
  const w = Math.round((x1 - x0) * factor);
  const h = Math.round((y1 - y0) * factor);
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
          const i = (y * img.width + x) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al * cw; g += img.data[i + 1] * al * cw; b += img.data[i + 2] * al * cw; a += al * cw; wt += cw;
        }
      const o = (oy * w + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  return out;
}

const base = crop(src, BOX, EXPORT);
fs.writeFileSync(path.join(outDir, 'card_base.png'), PNG.sync.write(base));
console.log(`card_base ${base.width}×${base.height} px (planche recadrée ${BOX[2] - BOX[0]}×${BOX[3] - BOX[1]})`);
