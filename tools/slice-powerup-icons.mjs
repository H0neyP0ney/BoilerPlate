// Icônes des power-ups : découpe art-src/powerups.png (6 icônes sur fond transparent, grille 3 × 2) en une image par power-up.
//
//   node tools/slice-powerup-icons.mjs
//
// Écrit dans games/xiao-swarm/public/assets/ui/powerups/<kind>.png (rognées au contenu + 2 px, réduction par moyenne de surface).
// Ordre de la planche : stim, magnet, heal / stasis, rockets, reroll.
// Écrit aussi public/assets/fx/rocket.png : la fusée de la planche, tournée pour pointer vers la DROITE, = projectile `fx_rocket` du power-up Rocket barrage.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/powerups.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/powerups');
fs.mkdirSync(outDir, { recursive: true });

/** Réduction à l'export (~150 px dans la planche → ~75 px : assez pour le globe et le texte flottant). */
const EXPORT = 0.5;
const KINDS = [['stim', 'magnet', 'heal'], ['stasis', 'rockets', 'reroll']];
const cw = src.width / 3, ch = src.height / 2;

/** Boîte englobante des pixels non transparents d'une case de la grille. */
function bounds(col, row) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = Math.floor(row * ch); y < Math.floor((row + 1) * ch); y++)
    for (let x = Math.floor(col * cw); x < Math.floor((col + 1) * cw); x++)
      if (src.data[(y * src.width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  return [x0, y0, x1, y1];
}

function crop(box, factor, pad = 2) {
  const [x0, y0, x1, y1] = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
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
          const k = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
          const inside = x >= 0 && y >= 0 && x < src.width && y < src.height;
          const i = (y * src.width + x) * 4;
          const al = inside ? src.data[i + 3] / 255 : 0;
          if (inside) { r += src.data[i] * al * k; g += src.data[i + 1] * al * k; b += src.data[i + 2] * al * k; }
          a += al * k; wt += k;
        }
      const o = (oy * w + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  return out;
}

KINDS.forEach((kinds, row) => kinds.forEach((kind, col) => {
  fs.writeFileSync(path.join(outDir, `${kind}.png`), PNG.sync.write(crop(bounds(col, row), EXPORT)));
}));
console.log(`6 icônes dans ${path.relative(root, outDir)}`);

// ---------- Projectile du Rocket barrage : la fusée de la planche (pointe en haut à droite, 45°) tournée de 45° horaire = pointe vers la droite ----------
const ROCKET_LENGTH = 38; // largeur finale (px) du projectile ; affiché à FX.rocket.scale
{
  const [x0, y0, x1, y1] = bounds(1, 1);
  const w0 = x1 - x0, h0 = y1 - y0;
  const R = Math.ceil(Math.hypot(w0, h0)); // côté du carré qui contient la rotation
  const ang = Math.PI / 4;
  const c = Math.cos(ang), sn = Math.sin(ang);
  const rot = new PNG({ width: R, height: R });
  const sample = (fx, fy) => {
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy, wgt] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
      const x = ix + dx, y = iy + dy;
      if (x < x0 || y < y0 || x >= x1 || y >= y1) continue;
      const i = (y * src.width + x) * 4, al = (src.data[i + 3] / 255) * wgt;
      r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al;
    }
    return [a > 0 ? r / a : 0, a > 0 ? g / a : 0, a > 0 ? b / a : 0, a];
  };
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      // rotation horaire de `ang` (écran : y vers le bas) : on remonte du pixel de sortie vers la source
      const dx = x - R / 2, dy = y - R / 2;
      const sx = c * dx + sn * dy + x0 + w0 / 2, sy = -sn * dx + c * dy + y0 + h0 / 2;
      const [r, g, b, a] = sample(sx, sy);
      const o = (y * R + x) * 4;
      rot.data[o] = Math.round(r); rot.data[o + 1] = Math.round(g); rot.data[o + 2] = Math.round(b); rot.data[o + 3] = Math.round(a * 255);
    }
  // rognage au contenu puis réduction
  let rx0 = R, ry0 = R, rx1 = 0, ry1 = 0;
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) if (rot.data[(y * R + x) * 4 + 3] > 16) { rx0 = Math.min(rx0, x); ry0 = Math.min(ry0, y); rx1 = Math.max(rx1, x + 1); ry1 = Math.max(ry1, y + 1); }
  const fxDir = path.join(root, 'games/xiao-swarm/public/assets/fx');
  fs.mkdirSync(fxDir, { recursive: true });
  const cw2 = rx1 - rx0, ch2 = ry1 - ry0;
  const k = ROCKET_LENGTH / cw2;
  const ow = Math.round(cw2 * k) + 4, oh = Math.round(ch2 * k) + 4;
  const out = new PNG({ width: ow, height: oh });
  for (let oy = 0; oy < oh; oy++)
    for (let ox = 0; ox < ow; ox++) {
      let r = 0, g = 0, b = 0, a = 0, wt = 0;
      const fx0 = rx0 + (ox - 2) / k, fx1 = fx0 + 1 / k, fy0 = ry0 + (oy - 2) / k, fy1 = fy0 + 1 / k;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++)
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          const kk = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
          const inside = x >= 0 && y >= 0 && x < R && y < R;
          const i = (y * R + x) * 4, al = inside ? rot.data[i + 3] / 255 : 0;
          if (inside) { r += rot.data[i] * al * kk; g += rot.data[i + 1] * al * kk; b += rot.data[i + 2] * al * kk; }
          a += al * kk; wt += kk;
        }
      const o = (oy * ow + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  fs.writeFileSync(path.join(fxDir, 'rocket.png'), PNG.sync.write(out));
  console.log(`fusée ${ow}×${oh} dans ${path.relative(root, fxDir)}`);
}
