// Touches du clavier du tutoriel : sépare art-src/keyboard.png (une touche bleue + les lettres W A S D / Z Q, sur fond transparent) en images.
//
//   node tools/slice-keyboard.mjs
//
// Écrit games/xiao-swarm/public/assets/ui/keys/key.png (la touche) et key_<LETTRE>.png (W, A, S, D, Z, Q). Les composantes de l'image sont repérées
// automatiquement (pixels non transparents connexes) : la plus grande est la touche, les autres sont les lettres, lues ligne par ligne de gauche à
// droite (W A S D puis Z Q). Réduction : touche ×0,5, lettres ×0,42 (elles se posent au centre de la touche sans être agrandies à l'affichage,
// `HudScene.makeHint`). Une touche choisie dans Options > Hotkeys sans lettre dessinée ici s'affiche en texte sur la même touche.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/keyboard.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/keys');
fs.mkdirSync(outDir, { recursive: true });

const CAP_SCALE = 0.5;
const LETTER_SCALE = 0.42;
const ROWS = [['W', 'A', 'S', 'D'], ['Z', 'Q']];
const PAD = 2;

// composantes connexes (8 voisins) des pixels non transparents
const { width: W, height: H, data } = src;
const seen = new Uint8Array(W * H);
const comps = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (seen[k] || data[k * 4 + 3] <= 20) continue;
    let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % W, cy = (c / W) | 0;
      n++;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (!seen[nk] && data[nk * 4 + 3] > 20) { seen[nk] = 1; stack.push(nk); }
        }
    }
    if (n > 30) comps.push({ box: [x0 - PAD, y0 - PAD, x1 + 1 + PAD, y1 + 1 + PAD], n });
  }
comps.sort((a, b) => b.n - a.n);
const [cap, ...letters] = comps;
const expected = ROWS.flat().length;
if (letters.length !== expected) throw new Error(`${letters.length} lettres trouvées, ${expected} attendues`);

// lettres : ligne du haut (4) puis ligne du bas (2), chacune de gauche à droite
const byY = [...letters].sort((a, b) => a.box[1] - b.box[1]);
const named = [];
let i = 0;
for (const row of ROWS) {
  const part = byY.slice(i, i + row.length).sort((a, b) => a.box[0] - b.box[0]);
  part.forEach((c, j) => named.push([row[j], c]));
  i += row.length;
}

/** Réduction par moyenne de surface (alpha prémultiplié) d'une zone de `src`. */
function crop(box, factor) {
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
          const inside = x >= 0 && y >= 0 && x < W && y < H;
          const k = (y * W + x) * 4;
          const al = inside ? src.data[k + 3] / 255 : 0;
          if (inside) { r += src.data[k] * al * cw; g += src.data[k + 1] * al * cw; b += src.data[k + 2] * al * cw; }
          a += al * cw;
          wt += cw;
        }
      const o = (oy * w + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  return out;
}

const write = (name, png) => {
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
  console.log(`${name} ${png.width}×${png.height}`);
};
write('key.png', crop(cap.box, CAP_SCALE));
for (const [letter, c] of named) write(`key_${letter}.png`, crop(c.box, LETTER_SCALE));
