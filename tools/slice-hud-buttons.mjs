// Découpe la planche des boutons du HUD (art-src/bouton pause sound musique.png) en images séparées :
//
//   node tools/slice-hud-buttons.mjs
//
// Écrit dans games/xiao-swarm/public/assets/ui/hud/ :
//   button.png  le bouton SANS icône (les deux barres de pause sont effacées, le fond du bouton est reconstitué ligne par ligne) ;
//   pause.png, sound.png, music.png  les icônes seules (contour sombre compris), à poser au centre du bouton.
// Le fond des icônes (dégradé bleu) est retiré en comparant chaque pixel à la couleur du fond de sa ligne, mesurée sur les bords de la zone :
// plus le pixel s'en écarte, plus il est opaque. Réduction par moyenne de surface. Les repères (centre de l'icône dans le bouton) sont
// écrits dans la console : ils sont repris dans `view/hudButtons.ts` (HUD_BUTTON_ART).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/bouton pause sound musique.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/hud');
fs.mkdirSync(outDir, { recursive: true });
const W = src.width;
const H = src.height;

/** Réduction des images exportées (elles s'affichent ensuite à `échelle / EXPORT`). */
const EXPORT = 0.5;

/** Bouton de pause : cadre complet, zone sombre (là où est l'icône), colonnes d'où lire le fond de chaque ligne. */
const BUTTON = { box: [15, 19, 218, 210], slot: [56, 52, 178, 182], bgCols: [60, 172] };
/** Tuiles des icônes son / musique (fond bleu opaque) : colonnes de fond prises à 4 px des bords. */
const TILES = {
  sound: { box: [251, 60, 363, 168] },
  music: { box: [395, 57, 501, 171] },
};

const pix = (x, y) => {
  const i = (y * W + x) * 4;
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
};
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Boîte (élargie de `pad`) des pixels crème de l'icône dans `zone` : limite l'extraction à l'icône elle-même (pas aux bords de la zone). */
function creamBox(zone, pad = 8) {
  const [x0, y0, x1, y1] = zone;
  let a = x1, b = y1, c = x0, d = y0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const p = pix(x, y);
      if (p[3] > 200 && p[0] > 200 && p[1] > 190 && p[2] > 140) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x + 1); d = Math.max(d, y + 1); }
    }
  return [Math.max(x0, a - pad), Math.max(y0, b - pad), Math.min(x1, c + pad), Math.min(y1, d + pad)];
}

/** Fond de la ligne y : moyenne des pixels des deux colonnes de référence. */
function rowBg(y, c0, c1) {
  const a = pix(c0, y);
  const b = pix(c1, y);
  return [0, 1, 2].map((k) => (a[k] + b[k]) / 2);
}

/**
 * Icône : opacité = écart au fond de la ligne (le contour sombre compte, il se détache du fond), couleur dé-mélangée du fond.
 * @returns { rgba: Uint8Array (largeur x1-x0), box de l'icône dans la zone }
 */
function extractIcon(zone, bgCols, tileAlphaMin = 0) {
  const [x0, y0, x1, y1] = zone;
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8Array(w * h * 4);
  const mask = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) {
    const bg = rowBg(y, bgCols[0], bgCols[1]);
    for (let x = x0; x < x1; x++) {
      const p = pix(x, y);
      if (p[3] < tileAlphaMin) continue;
      const a = smooth(10, 28, dist(p, bg));
      if (a <= 0) continue;
      const o = ((y - y0) * w + (x - x0)) * 4;
      for (let k = 0; k < 3; k++) out[o + k] = Math.max(0, Math.min(255, Math.round(bg[k] + (p[k] - bg[k]) / a)));
      out[o + 3] = Math.round(a * 255);
      mask[(y - y0) * w + (x - x0)] = 1;
    }
  }
  return { rgba: out, mask, w, h };
}

/** Réduction par moyenne de surface d'une zone RGBA (alpha prémultiplié). */
function shrink(rgba, w, h, factor) {
  const ow = Math.max(1, Math.round(w * factor));
  const oh = Math.max(1, Math.round(h * factor));
  const out = new PNG({ width: ow, height: oh });
  const sx = w / ow;
  const sy = h / oh;
  for (let oy = 0; oy < oh; oy++)
    for (let ox = 0; ox < ow; ox++) {
      let r = 0, g = 0, b = 0, a = 0, wt = 0;
      const fx0 = ox * sx, fx1 = fx0 + sx, fy0 = oy * sy, fy1 = fy0 + sy;
      for (let y = Math.floor(fy0); y < Math.min(h, Math.ceil(fy1)); y++)
        for (let x = Math.floor(fx0); x < Math.min(w, Math.ceil(fx1)); x++) {
          const cw = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
          const i = (y * w + x) * 4;
          const al = rgba[i + 3] / 255;
          r += rgba[i] * al * cw; g += rgba[i + 1] * al * cw; b += rgba[i + 2] * al * cw; a += al * cw; wt += cw;
        }
      const o = (oy * ow + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  return out;
}

/** Rogne une image RGBA à sa boîte non transparente (+ `pad`) ; renvoie aussi le décalage de la boîte dans l'image d'origine. */
function trim(rgba, w, h, pad = 2) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w, x1 + pad); y1 = Math.min(h, y1 + pad);
  const tw = x1 - x0;
  const th = y1 - y0;
  const out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) for (let k = 0; k < 4; k++) out[(y * tw + x) * 4 + k] = rgba[((y0 + y) * w + x0 + x) * 4 + k];
  return { rgba: out, w: tw, h: th, x0, y0 };
}

function write(name, png) {
  fs.writeFileSync(path.join(outDir, `${name}.png`), PNG.sync.write(png));
  console.log(`${name}.png ${png.width}×${png.height}`);
}

// ---------- Bouton vide + icône de pause ----------
{
  const slot = creamBox(BUTTON.slot);
  const [sx0, sy0, sx1, sy1] = slot;
  const icon = extractIcon(slot, BUTTON.bgCols);
  // l'icône est effacée du bouton : zone de l'icône élargie de 3 px, remplie avec le fond de la ligne
  const dil = new Uint8Array(icon.w * icon.h);
  for (let y = 0; y < icon.h; y++)
    for (let x = 0; x < icon.w; x++) {
      if (!icon.mask[y * icon.w + x]) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && xx >= 0 && yy < icon.h && xx < icon.w) dil[yy * icon.w + xx] = 1;
      }
    }
  const clean = Buffer.from(src.data);
  for (let y = sy0; y < sy1; y++) {
    const bg = rowBg(y, BUTTON.bgCols[0], BUTTON.bgCols[1]);
    for (let x = sx0; x < sx1; x++) {
      if (!dil[(y - sy0) * icon.w + (x - sx0)]) continue;
      const i = (y * W + x) * 4;
      clean[i] = Math.round(bg[0]); clean[i + 1] = Math.round(bg[1]); clean[i + 2] = Math.round(bg[2]); clean[i + 3] = 255;
    }
  }
  const [bx0, by0, bx1, by1] = BUTTON.box;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const region = new Uint8Array(bw * bh * 4);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) for (let k = 0; k < 4; k++) region[(y * bw + x) * 4 + k] = clean[((by0 + y) * W + bx0 + x) * 4 + k];
  write('button', shrink(region, bw, bh, EXPORT));

  const t = trim(icon.rgba, icon.w, icon.h);
  write('pause', shrink(t.rgba, t.w, t.h, EXPORT));
  // centre de l'icône dans le bouton (pixels de la planche, repère = coin haut gauche du bouton)
  const cx = sx0 + t.x0 + t.w / 2 - bx0;
  const cy = sy0 + t.y0 + t.h / 2 - by0;
  console.log(`bouton ${bw}×${bh} (planche) ; centre de l'icône de pause : ${cx.toFixed(1)}, ${cy.toFixed(1)} ; taille ${t.w}×${t.h}`);
}

// ---------- Icônes son / musique ----------
for (const [name, tile] of Object.entries(TILES)) {
  const [x0, y0, x1, y1] = tile.box;
  const icon = extractIcon(creamBox(tile.box), [x0 + 4, x1 - 5], 200);
  const t = trim(icon.rgba, icon.w, icon.h);
  write(name, shrink(t.rgba, t.w, t.h, EXPORT));
  console.log(`${name} : ${t.w}×${t.h} (planche)`);
}
