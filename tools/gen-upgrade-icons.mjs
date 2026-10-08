// Icônes PROVISOIRES des upgrades qui n'ont pas encore d'image dans art-src/icon_upgrade.png (dessin procédural, à remplacer par les
// vraies icônes : ajouter leur boîte dans tools/slice-upgrade-icons.mjs et retirer l'upgrade d'ici).
//
//   node tools/gen-upgrade-icons.mjs
//
// Écrit games/xiao-swarm/public/assets/ui/upgrades/<id>.png (88 px, contour sombre façon dessin animé, anticrénelage par sur-échantillonnage).
// Chaque icône est une pile de formes définies par leur distance signée (négative à l'intérieur) : contour = distance < OUTLINE.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/upgrades');
fs.mkdirSync(outDir, { recursive: true });

const SIZE = 88;
const SS = 4; // sur-échantillonnage par axe
const OUTLINE = 5;
const DARK = [24, 20, 36];

// --- distances signées (repère : pixels de l'icône, origine en haut à gauche) ---
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const box = (cx, cy, hw, hh, round = 0) => (x, y) => {
  const dx = Math.abs(x - cx) - hw + round;
  const dy = Math.abs(y - cy) - hh + round;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - round;
};
/** Polygone convexe (sommets dans le sens horaire à l'écran). */
const poly = (pts) => (x, y) => {
  let d = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const nx = by - ay;
    const ny = ax - bx;
    const l = Math.hypot(nx, ny);
    d = Math.max(d, ((x - ax) * nx + (y - ay) * ny) / l);
  }
  return d;
};
const union = (...fs) => (x, y) => Math.min(...fs.map((f) => f(x, y)));
const minus = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
const ring = (cx, cy, r, w) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w;

/** Couche : forme, couleur de remplissage, contour (par défaut oui), dégradé vertical clair → sombre. */
const L = (sdf, color, outline = true) => ({ sdf, color, outline });

function shade([r, g, b], y) {
  const k = 1.18 - (y / SIZE) * 0.36; // plus clair en haut
  return [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)];
}

function render(layers) {
  const png = new PNG({ width: SIZE, height: SIZE });
  for (let py = 0; py < SIZE; py++)
    for (let px = 0; px < SIZE; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          let col = null;
          for (const l of layers) {
            const d = l.sdf(x, y);
            if (d < 0) col = shade(l.color, y);
            else if (l.outline && d < OUTLINE) col = DARK;
          }
          if (col) { r += col[0]; g += col[1]; b += col[2]; a++; }
        }
      const o = (py * SIZE + px) * 4;
      if (a > 0) { png.data[o] = r / a; png.data[o + 1] = g / a; png.data[o + 2] = b / a; }
      png.data[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  return png;
}

// --- icônes ---
/** Soldat stylisé (casque + épaules), centré en (cx, cy), échelle s. */
function soldier(cx, cy, s, color) {
  return [
    L(box(cx, cy + 26 * s, 17 * s, 15 * s, 11 * s), color), // épaules
    L(circle(cx, cy + 2 * s, 12 * s), [255, 224, 189]), // visage
    L(minus(circle(cx, cy, 15 * s), box(cx, cy + 14 * s, 22 * s, 10 * s)), color), // casque
    L(union(circle(cx - 4.5 * s, cy + 7 * s, 2 * s), circle(cx + 4.5 * s, cy + 7 * s, 2 * s)), DARK, false), // yeux
  ];
}

const ICONS = {
  // Esprit d'équipe : trois soldats côte à côte (vert lime)
  teamSpirit: [
    ...soldier(20, 34, 0.85, [120, 170, 60]),
    ...soldier(68, 34, 0.85, [120, 170, 60]),
    ...soldier(44, 26, 1.1, [168, 224, 74]),
  ],
  // Dernier rempart : panneau de danger rouge avec « ! »
  lastStand: [
    L(poly([[44, 8], [82, 76], [6, 76]]), [224, 48, 79]),
    L(box(44, 42, 5, 15, 4), [255, 245, 235], false),
    L(circle(44, 66, 5.5), [255, 245, 235], false),
  ],
  // Chasseur de boss : crâne dans un viseur (magenta)
  bossHunter: [
    L(ring(44, 44, 32, 4), [224, 90, 224]),
    L(union(box(44, 7, 4, 9), box(44, 81, 4, 9), box(7, 44, 9, 4), box(81, 44, 9, 4)), [224, 90, 224]),
    L(union(circle(44, 40, 18), box(44, 56, 11, 8, 3)), [240, 236, 228]),
    L(union(circle(37, 41, 5.5), circle(51, 41, 5.5)), DARK, false),
    L(poly([[44, 47], [47.5, 53], [40.5, 53]]), DARK, false),
    L(union(box(40, 61, 1.2, 3), box(48, 61, 1.2, 3)), DARK, false),
  ],
};

for (const [id, layers] of Object.entries(ICONS)) {
  fs.writeFileSync(path.join(outDir, `${id}.png`), PNG.sync.write(render(layers)));
}
console.log(`${Object.keys(ICONS).length} icônes provisoires : ${Object.keys(ICONS).join(', ')}`);
