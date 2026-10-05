// Barre de vie du boss (HUD) : à partir de art-src/jauge_boss.png (cadre organique + jauge rouge à moitié pleine), produit
//   games/xiao-swarm/public/assets/ui/boss/frame.png : le cadre VIDE (488 × 113), reconstitué ;
//   games/xiao-swarm/public/assets/ui/boss/fill.png  : la jauge de la timeline (ui/timeline/fill.png, 3-slice) recolorée en rouge.
//
//   node tools/slice-boss-bar.mjs      (à lancer après tools/slice-timeline-ui.mjs, dont elle reprend la jauge)
//
// Cadre vide : la planche est symétrique, la moitié droite (déjà vide) est recopiée en miroir à gauche ; dans la zone sombre du milieu
// (lignes SLOT_ROWS), on répète une tranche lisse du fond sombre ; les ornements (haut / bas, centre) sont conservés tels quels.
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

/** Mesures de la planche (pixels). */
const SLOT_ROWS = [45, 76]; // lignes de la zone sombre, contours noirs compris
const RIGHT_FROM = 352; // à partir de cette colonne, le cadre est vide
const STRIP = [380, 440]; // tranche lisse du fond sombre

// ---------- 1. cadre vide ----------
const frame = new PNG({ width: W, height: H });
const copy = (dx, dy, sx, sy) => {
  for (let c = 0; c < 4; c++) frame.data[at(dx, dy) + c] = src.data[at(sx, sy) + c];
};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const inSlot = y >= SLOT_ROWS[0] && y < SLOT_ROWS[1];
    if (x >= RIGHT_FROM) copy(x, y, x, y);
    else if (x < W - RIGHT_FROM) copy(x, y, W - 1 - x, y); // moitié gauche : miroir de la droite
    else if (inSlot) copy(x, y, STRIP[0] + ((x - (W - RIGHT_FROM)) % (STRIP[1] - STRIP[0])), y); // milieu : fond sombre répété
    else copy(x, y, x, y); // ornements du milieu
  }
fs.writeFileSync(path.join(outDir, 'frame.png'), PNG.sync.write(frame));

// ---------- 2. jauge rouge : la jauge jaune de la timeline, teinte décalée vers le rouge ----------
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
const fill = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/public/assets/ui/timeline/fill.png')));
for (let i = 0; i < fill.data.length; i += 4) {
  if (fill.data[i + 3] === 0) continue;
  const [h, s, l] = rgb2hsl(fill.data[i], fill.data[i + 1], fill.data[i + 2]);
  if (s < 0.25 || h < 15 || h > 75) continue; // seuls le jaune et l'orange changent (contour sombre et reflets blancs restent)
  const [r, g, b] = hsl2rgb(2 + (h - 45) * 0.35, Math.min(1, s * 1.05), l);
  fill.data[i] = Math.round(r); fill.data[i + 1] = Math.round(g); fill.data[i + 2] = Math.round(b);
}
fs.writeFileSync(path.join(outDir, 'fill.png'), PNG.sync.write(fill));

// ---------- mesures : bornes de la zone sombre sur la ligne médiane ----------
const ym = 60;
let l0 = -1, r0 = -1;
for (let x = 30; x < W - 30; x++) {
  const i = at(x, ym);
  if (src.data[i] + src.data[i + 1] + src.data[i + 2] < 25 && src.data[i + 3] > 200) { if (l0 < 0) l0 = x; r0 = x; }
}
console.log(`frame.png ${W}×${H} ; fill.png ${fill.width}×${fill.height} ; contours noirs de la zone sombre sur la ligne ${ym} : x=${l0}..${r0} ; lignes de la zone ${SLOT_ROWS[0]}..${SLOT_ROWS[1]}`);
