// Découpe la planche de l'UI de timeline (art-src/timeline_next_boss.png) en images séparées pour le HUD :
//
//   node tools/slice-timeline-ui.mjs
//
// Écrit dans games/xiao-swarm/public/assets/ui/timeline/ : frame (barre + capsule du prochain boss + disque), fill (jauge jaune, 9-slice),
// arrow (flèche de position), tick_off / tick_on (crans de vague à venir / passés), ring (jauge circulaire, affichée en radial).
// Réduction par moyenne de surface (alpha prémultiplié). Les mesures de la planche d'origine sont dans `games/xiao-swarm/src/view/timelineArt.ts`.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/timeline_next_boss.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/timeline');
fs.mkdirSync(outDir, { recursive: true });

/** Facteur de réduction commun (les pièces s'affichent ensuite à `échelle / EXPORT`). */
const EXPORT = 0.8;

/** [x0, y0, x1, y1] dans la planche, facteur propre (par défaut EXPORT). */
const PIECES = {
  // le haut de l'anneau (planche, y ≥ 170) déborde dans le bas du cadre : effacé
  frame: { box: [6, 2, 997, 179], erase: [[561, 168, 714, 179]] },
  tick_off: { box: [243, 212, 253, 251] },
  tick_on: { box: [266, 212, 277, 251] },
  arrow: { box: [306, 203, 369, 257] },
  // la jauge jaune (46 px de haut dans la planche) est ramenée à 39,9 px, la hauteur utile de la barre ; la jauge circulaire à 152 px, le diamètre extérieur de la bande grise du disque
  fill: { box: [414, 204, 490, 250], factor: EXPORT * (39.9 / 46) },
  ring: { box: [561, 170, 714, 322], factor: EXPORT * (152 / 153) },
};

function crop(box, factor, erase = []) {
  const [x0, y0, x1, y1] = box;
  const w = Math.max(1, Math.round((x1 - x0) * factor));
  const h = Math.max(1, Math.round((y1 - y0) * factor));
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
          const al = erase.some(([ex0, ey0, ex1, ey1]) => x >= ex0 && x < ex1 && y >= ey0 && y < ey1) ? 0 : src.data[i + 3] / 255;
          r += src.data[i] * al * cw; g += src.data[i + 1] * al * cw; b += src.data[i + 2] * al * cw; a += al * cw; wt += cw;
        }
      const o = (oy * w + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  return out;
}

for (const [name, p] of Object.entries(PIECES)) {
  const png = crop(p.box, p.factor ?? EXPORT, p.erase);
  fs.writeFileSync(path.join(outDir, `${name}.png`), PNG.sync.write(png));
  console.log(`${name}.png ${png.width}×${png.height}`);
}

// ---------- jauge d'XP : la jauge jaune de la timeline recolorée en bleu (ui/xp/fill.png, 3-slice comme l'originale) ----------
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
{
  const yellow = PNG.sync.read(fs.readFileSync(path.join(outDir, 'fill.png')));
  for (let i = 0; i < yellow.data.length; i += 4) {
    if (yellow.data[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(yellow.data[i], yellow.data[i + 1], yellow.data[i + 2]);
    if (s < 0.25 || h < 15 || h > 75) continue; // seuls le jaune et l'orange changent (contour sombre et reflets blancs restent)
    const [r, g, b] = hsl2rgb(205 + (h - 45) * 0.7, Math.min(1, s * 1.05), l);
    yellow.data[i] = Math.round(r); yellow.data[i + 1] = Math.round(g); yellow.data[i + 2] = Math.round(b);
  }
  const xpDir = path.join(root, 'games/xiao-swarm/public/assets/ui/xp');
  fs.mkdirSync(xpDir, { recursive: true });
  fs.writeFileSync(path.join(xpDir, 'fill.png'), PNG.sync.write(yellow));
  console.log(`xp/fill.png ${yellow.width}×${yellow.height} (jauge jaune en bleu)`);
}
