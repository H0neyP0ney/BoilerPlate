// Icônes des upgrades : découpe art-src/icon_upgrade.png (11 icônes sur fond transparent, deux rangées) en une image par upgrade.
//
//   node tools/slice-upgrade-icons.mjs
//
// Écrit dans games/xiao-swarm/public/assets/ui/upgrades/<id>.png (rognées au contenu + 2 px, réduction par moyenne de surface). Les boîtes
// ci-dessous sont les zones de la planche (une icône chacune, éventuelles étincelles détachées comprises).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/icon_upgrade.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/upgrades');
fs.mkdirSync(outDir, { recursive: true });

/** Réduction à l'export (les icônes font ~140 px dans la planche, ~85 px exportées : assez pour la carte et le texte flottant). */
const EXPORT = 0.6;

/** [x0, y0, x1, y1] de chaque icône dans la planche. */
const ICONS = {
  damage: [28, 21, 164, 155], // épée +
  fireRate: [220, 22, 360, 163], // balles
  hp: [419, 34, 563, 153], // cœur +
  range: [622, 18, 766, 164], // cible
  crit: [824, 21, 982, 166], // explosion
  speed: [15, 190, 138, 313], // botte
  reinforce: [172, 191, 316, 310], // escouade +
  magnet: [343, 196, 476, 312], // aimant
  recruit: [506, 189, 645, 326], // casque +1
  xpGain: [676, 182, 818, 333], // globe d'XP
  maxSquad: [829, 175, 976, 320], // escouade MAX
};

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
          const cw = (Math.min(x + 1, fx1) - Math.max(x, fx0)) * (Math.min(y + 1, fy1) - Math.max(y, fy0));
          const inside = x >= 0 && y >= 0 && x < src.width && y < src.height;
          const i = (y * src.width + x) * 4;
          const al = inside ? src.data[i + 3] / 255 : 0;
          if (inside) { r += src.data[i] * al * cw; g += src.data[i + 1] * al * cw; b += src.data[i + 2] * al * cw; }
          a += al * cw; wt += cw;
        }
      const o = (oy * w + ox) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round((a / wt) * 255);
    }
  return out;
}

for (const [id, box] of Object.entries(ICONS)) {
  const png = crop(box, EXPORT);
  fs.writeFileSync(path.join(outDir, `${id}.png`), PNG.sync.write(png));
}
console.log(`${Object.keys(ICONS).length} icônes dans ${path.relative(root, outDir)}`);
