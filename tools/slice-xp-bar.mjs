// Barre d'expérience du HUD : à partir de art-src/experience bar.png (barre à moitié pleine : cadre + jauge bleue + fond sombre), produit
//   games/xiao-swarm/public/assets/ui/xp/frame.png : le cadre VIDE (600 × 83), reconstitué.
// (la jauge bleue, `ui/xp/fill.png`, est la jauge jaune de la timeline recolorée : voir tools/slice-timeline-ui.mjs.)
//
//   node tools/slice-xp-bar.mjs
//
// Cadre vide : la planche est symétrique, le capuchon droit (déjà vide) est recopié en miroir à gauche ; le milieu (où se trouvait la jauge)
// répète une tranche de fond lisse sur la hauteur du corps, les pastilles du haut / du bas du centre sont conservées.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'games/xiao-swarm/art-src/experience bar.png')));
const outDir = path.join(root, 'games/xiao-swarm/public/assets/ui/xp');
fs.mkdirSync(outDir, { recursive: true });
const W = src.width;
const H = src.height;
const at = (x, y) => (y * W + x) * 4;

/** Mesures de la planche (pixels). */
const BODY = [12, 71]; // lignes du corps du cadre (en dehors : seules les pastilles du centre)
const SLOT_Y = [25, 58]; // lignes de la jauge dans la zone sombre
const RIGHT_CAP = 412; // le cadre est vide à partir de cette colonne
const STRIP = [420, 470]; // tranche lisse de fond sombre, répétée au milieu
const FILL = { left: 30, cap: 48, mid: [100, 120] };

// ---------- 1. cadre vide ----------
const frame = new PNG({ width: W, height: H });
const copy = (dx, dy, sx, sy) => {
  for (let c = 0; c < 4; c++) frame.data[at(dx, dy) + c] = src.data[at(sx, sy) + c];
};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (x >= RIGHT_CAP) copy(x, y, x, y);
    else if (x < W - RIGHT_CAP) copy(x, y, W - 1 - x, y); // capuchon gauche : miroir du droit
    else if (y >= BODY[0] && y < BODY[1]) copy(x, y, STRIP[0] + ((x - (W - RIGHT_CAP)) % (STRIP[1] - STRIP[0])), y); // milieu : tranche répétée
    else copy(x, y, x, y); // pastilles du centre (haut / bas)
  }
fs.writeFileSync(path.join(outDir, 'frame.png'), PNG.sync.write(frame));

// ---------- mesures ----------
console.log(`frame.png ${W}×${H} ; zone sombre x 30..570, jauge y ${SLOT_Y[0]}..${SLOT_Y[1]} (centre ${(SLOT_Y[0] + SLOT_Y[1]) / 2})`);
