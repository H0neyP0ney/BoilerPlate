// Slots de progression des cartes d'upgrade : sépare art-src/slot_upgrade.png (deux slots, vide à gauche et plein à droite, sur le rouge de
// la carte) en deux images détourées.
//
//   node tools/slice-upgrade-slots.mjs
//
// Écrit games/xiao-swarm/public/assets/ui/slot_empty.png, slot_full.png et slot_empty_<id>.png (le slot vide recoloré à la couleur de chaque carte). Le fond rouge est retiré en remplissant depuis les bords de la
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
half(0, mid, 'slot_empty'); // sert de base aux variantes colorées
half(mid, W, 'slot_full');

// 4. slot vide à la couleur de chaque upgrade (même recoloration que les cartes : seule la teinte rouge change)
const COLORS = {
  damage: 0xff6a4a, fireRate: 0xffd166, hp: 0x6fdc6f, range: 0xffa07a, crit: 0xffe14a, speed: 0x7dd3ff,
  maxSquad: 0xb388ff, magnet: 0x5aa8ff, recruit: 0xff8fc8, xpGain: 0x4fe0d0, reinforce: 0xffa94d,
};
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const empty = PNG.sync.read(fs.readFileSync(path.join(outDir, 'slot_empty.png')));
for (const [id, color] of Object.entries(COLORS)) {
  const png = new PNG({ width: empty.width, height: empty.height });
  empty.data.copy(png.data);
  const [hc, sc] = rgb2hsl((color >> 16) & 255, (color >> 8) & 255, color & 255);
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (!((h <= 32 || h >= 335) && s > 0.35 && l > 0.03)) continue;
    const [r, g, b] = hsl2rgb(hc + ((h >= 335 ? h - 360 : h) - 6) * 0.6, Math.min(1, s * (0.8 + 0.2 * sc)), l);
    png.data[i] = Math.round(r); png.data[i + 1] = Math.round(g); png.data[i + 2] = Math.round(b);
  }
  fs.writeFileSync(path.join(outDir, `slot_empty_${id}.png`), PNG.sync.write(png));
}
console.log(`${Object.keys(COLORS).length} slots vides colorés`);
