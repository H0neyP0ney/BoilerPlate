// Slots de progression des cartes d'upgrade : sépare art-src/slot_upgrade.png (deux slots, vide à gauche et plein à droite, sur le rouge de
// la carte) en deux images détourées.
//
//   node tools/slice-upgrade-slots.mjs
//
// Écrit games/xiao-swarm/public/assets/ui/slot_empty.png et slot_full.png (le slot vide à la couleur de chaque carte est fabriqué au lancement par src/art/cardTextures.ts). Le fond rouge est retiré en remplissant depuis les bords de la
// planche tout ce qui est « rouge de fond » ; sur le pourtour des slots (contour noir), l'opacité est déduite du rouge restant (anti-crénelage).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/slot_upgrade.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui');
fs.mkdirSync(outDir, { recursive: true });
const W = src.width;
const H = src.height;
const px = (x, y) => (y * W + x) * 4;

/** Rouge de fond : rouge franc, ni vert ni bleu (le fond va de 119,13,6 à 170,26,1 avec la lueur en bas). */
const isBg = (i) => src.data[i] >= 95 && src.data[i + 1] <= 45 && src.data[i + 2] <= 22 && src.data[i] > src.data[i + 1] * 3;

// 1. fond = pixels « rouge de fond » connectés aux bords de la planche
const bg = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
while (stack.length) {
  const y = stack.pop();
  const x = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H || bg[y * W + x] || !isBg(px(x, y))) continue;
  bg[y * W + x] = 1;
  stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
}

// 2. alpha : 0 sur le fond ; juste à côté du fond, déduit du rouge qui reste dans un pixel noir (noir mélangé au rouge de fond)
const out = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = px(x, y);
    if (bg[y * W + x]) continue;
    let nearBg = false;
    for (let dy = -2; dy <= 2 && !nearBg; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && bg[yy * W + xx]) { nearBg = true; break; }
    }
    let a = 255;
    let [r, g, b] = [src.data[i], src.data[i + 1], src.data[i + 2]];
    if (nearBg && g < 40) {
      const k = Math.min(1, Math.max(0, 1 - r / 125));
      a = Math.round(255 * Math.min(1, k * 1.15));
      [r, g, b] = [4, 0, 0]; // le contour est noir
    }
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = a;
  }

// 3. découpe en deux moitiés, rognées à leur contenu
function half(x0, x1, name) {
  let a0 = x1, b0 = H, a1 = x0, b1 = 0;
  for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (out.data[px(x, y) + 3] > 30) { a0 = Math.min(a0, x); b0 = Math.min(b0, y); a1 = Math.max(a1, x + 1); b1 = Math.max(b1, y + 1); }
  const w = a1 - a0, h = b1 - b0;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) png.data[(y * w + x) * 4 + c] = out.data[px(a0 + x, b0 + y) + c];
  fs.writeFileSync(path.join(outDir, `${name}.png`), PNG.sync.write(png));
  console.log(`${name}.png ${w}×${h}`);
}
const mid = Math.floor(W / 2);
half(0, mid, 'slot_empty'); // base des variantes colorées (fabriquées au lancement)
half(mid, W, 'slot_full');
