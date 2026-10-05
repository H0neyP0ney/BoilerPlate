// Fonds des cartes d'upgrade : à partir de art-src/card_upgrade.png (carte rouge), une variante par upgrade, à la couleur de l'upgrade
// (`UPGRADES[id].color`, data/progression.ts).
//
//   node tools/slice-upgrade-cards.mjs
//
// Écrit dans games/xiao-swarm/public/assets/ui/cards/card_<id>.png. Seule la « famille rouge » de la carte est recolorée (corps, filet
// orange, voyants néon) : la teinte est remplacée par celle de l'upgrade, la luminosité ajustée pour garder un corps sombre. Le cadre
// d'acier bleu et la plaque dorée du nom (zone `PLATE`) restent identiques. Les mesures utiles au HUD (zones de texte) sont dans
// `games/xiao-swarm/src/view/upgradeCards.ts` ; elles sont exprimées dans le repère de l'image recadrée (CARD_W × CARD_H).
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
/** Plaque dorée du nom (planche, avant recadrage) : son or et son liseré ne sont pas recolorés. */
const PLATE = [64, 518, 408, 632];

// Couleurs des upgrades (data/progression.ts) : à garder en phase avec `UPGRADES[id].color`.
const COLORS = {
  damage: 0xff6a4a, fireRate: 0xffd166, hp: 0x6fdc6f, range: 0xffa07a, crit: 0xffe14a, speed: 0x7dd3ff,
  maxSquad: 0xb388ff, magnet: 0x5aa8ff, recruit: 0xff8fc8, xpGain: 0x4fe0d0, reinforce: 0xffa94d,
};

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

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

/** Copie de la planche dont la famille rouge est recolorée vers `color`. */
function recolor(color) {
  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);
  const [hc, sc, lc] = rgb2hsl((color >> 16) & 255, (color >> 8) & 255, color & 255);
  const lAdj = Math.min(0.62, Math.max(0.42, lc)); // la carte reste sombre même pour une couleur claire
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] === 0) continue;
      const [h, s, l] = rgb2hsl(src.data[i], src.data[i + 1], src.data[i + 2]);
      const inPlate = x >= PLATE[0] && x < PLATE[2] && y >= PLATE[1] && y < PLATE[3];
      // autour de la plaque dorée : seul le rouge franc est recoloré (le liseré orange de la plaque reste)
      const red = (inPlate ? h <= 10 || h >= 335 : h <= 32 || h >= 335) && s > 0.35 && l > 0.06;
      if (!red) continue;
      const hh = h >= 335 ? h - 360 : h; // -25 … 32, autour du rouge
      const [r, g, b] = hsl2rgb(hc + (hh - 6) * 0.6, Math.min(1, s * (0.8 + 0.2 * sc)), Math.min(0.95, l * (lAdj / 0.62)));
      out.data[i] = Math.round(r); out.data[i + 1] = Math.round(g); out.data[i + 2] = Math.round(b);
    }
  return out;
}

/**
 * Carte prismatique « hologramme » : l'arc-en-ciel se déroule en diagonale sur le corps et les voyants (teinte selon x + y), des bandes de
 * lumière brillante le traversent, un voile irisé léger passe sur le cadre d'acier et quelques étincelles en croix parsèment le corps.
 * La plaque dorée reste intacte. Graine fixe : le résultat est le même à chaque génération.
 */
function holo() {
  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] === 0) continue;
      const inPlate = x >= PLATE[0] && x < PLATE[2] && y >= PLATE[1] && y < PLATE[3];
      const [h, s, l] = rgb2hsl(src.data[i], src.data[i + 1], src.data[i + 2]);
      const red = (inPlate ? h <= 10 || h >= 335 : h <= 32 || h >= 335) && s > 0.35 && l > 0.06;
      const hue = (x * 0.42 + y * 0.3) % 360; // arc-en-ciel en diagonale
      const band = Math.pow(Math.max(0, Math.sin((x + y * 1.4) / 46)), 8); // bandes de lumière brillante
      if (red) {
        const [r, g, b] = hsl2rgb(hue, 0.78, Math.min(0.9, l * 1.15 + band * 0.32));
        out.data[i] = Math.round(r); out.data[i + 1] = Math.round(g); out.data[i + 2] = Math.round(b);
      } else if (!inPlate && s < 0.6) {
        // cadre d'acier : voile irisé (mélange « écran » avec l'arc-en-ciel, léger)
        const [r, g, b] = hsl2rgb(hue + 40, 0.9, 0.62);
        const k = 0.16 + band * 0.18;
        for (const [c, v] of [[0, r], [1, g], [2, b]]) out.data[i + c] = Math.round(255 - (255 - out.data[i + c]) * (255 - v * k) / 255);
      }
    }
  // étincelles : petites croix blanches, graine fixe
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 16; n++) {
    const cx = Math.round(70 + rnd() * 320);
    const cy = Math.round(80 + rnd() * 400);
    const len = 8 + rnd() * 10;
    for (let d = -len; d <= len; d++)
      for (const [dx, dy] of [[d, 0], [0, d]]) {
        const x = cx + Math.round(dx), y = cy + Math.round(dy);
        const i = (y * src.width + x) * 4;
        const a = (1 - Math.abs(d) / len) ** 1.5;
        for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] + (255 - out.data[i + c]) * a);
      }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = ((cy + dy) * src.width + cx + dx) * 4;
      const a = Math.max(0, 1 - Math.hypot(dx, dy) / 3);
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c] + (255 - out.data[i + c]) * a);
    }
  }
  return out;
}
fs.writeFileSync(path.join(outDir, 'card_prism.png'), PNG.sync.write(crop(holo(), BOX, EXPORT)));

for (const [id, color] of Object.entries(COLORS)) {
  const png = crop(recolor(color), BOX, EXPORT);
  fs.writeFileSync(path.join(outDir, `card_${id}.png`), PNG.sync.write(png));
}
const sample = PNG.sync.read(fs.readFileSync(path.join(outDir, 'card_damage.png')));
console.log(`${Object.keys(COLORS).length} cartes + card_prism, ${sample.width}×${sample.height} px (planche recadrée ${BOX[2] - BOX[0]}×${BOX[3] - BOX[1]})`);
