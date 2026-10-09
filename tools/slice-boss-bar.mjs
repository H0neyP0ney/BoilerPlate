// Barre de vie du boss (HUD) :
//   games/xiao-swarm/public/assets/ui/boss/frame.png : le cadre à cornes de art-src/jauge_boss.png (500 × 76), sa jauge rouge remplacée par le fond sombre de la zone ;
//   games/xiao-swarm/public/assets/ui/boss/fill.png  : la jauge de la barre d'XP (ui/xp/fill.png, 53 × 32, 3-slice) recolorée en rouge.
//
//   node tools/slice-boss-bar.mjs      (à lancer après tools/slice-xp-bar.mjs, dont elle reprend la jauge)
//
// Mesures de la planche (pixels) : SLOT_ROWS = lignes intérieures de la zone sombre (contours noirs exclus), SLOT_X = colonnes de la zone, FILL_END = fin de la jauge
// dessinée dans la planche ; STRIP = tranche lisse du fond sombre, répétée pour effacer cette jauge. À reporter dans `BOSS_ART` (view/hudLayout.ts) si la planche change.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/jauge_boss.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/boss');
fs.mkdirSync(outDir, { recursive: true });
const W = src.width;
const H = src.height;
const at = (x, y) => (y * W + x) * 4;

const SLOT_ROWS = [31, 56];
const SLOT_X = [42, 458];
const FILL_END = 358;
const STRIP = [380, 440];

// ---------- 1. cadre vide : le fond sombre recouvre la jauge de la planche, ligne par ligne ----------
const frame = new PNG({ width: W, height: H });
src.data.copy(frame.data);
for (let y = SLOT_ROWS[0]; y < SLOT_ROWS[1]; y++)
  for (let x = SLOT_X[0]; x < FILL_END; x++) {
    const sx = STRIP[0] + ((x - SLOT_X[0]) % (STRIP[1] - STRIP[0]));
    for (let c = 0; c < 4; c++) frame.data[at(x, y) + c] = src.data[at(sx, y) + c];
  }
fs.writeFileSync(path.join(outDir, 'frame.png'), PNG.sync.write(frame));

// ---------- 2. jauge : celle de la barre d'XP, bleu → rouge ----------
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
const fill = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/public/assets/ui/xp/fill.png')));
for (let i = 0; i < fill.data.length; i += 4) {
  if (fill.data[i + 3] === 0) continue;
  const [h, s, l] = rgb2hsl(fill.data[i], fill.data[i + 1], fill.data[i + 2]);
  if (s < 0.15 || h < 150 || h > 270) continue; // contour sombre, reflets blancs : inchangés
  const [r, g, b] = hsl2rgb((h - 210) * 0.4, Math.min(1, s * 1.05), l); // le bleu moyen (210°) devient rouge (0°)
  fill.data[i] = Math.round(r); fill.data[i + 1] = Math.round(g); fill.data[i + 2] = Math.round(b);
}
fs.writeFileSync(path.join(outDir, 'fill.png'), PNG.sync.write(fill));
console.log(`frame.png ${W}×${H} ; fill.png ${fill.width}×${fill.height}`);
