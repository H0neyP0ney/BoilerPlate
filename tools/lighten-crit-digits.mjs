// Éclaircit le jaune des chiffres de critique (glyphes `public/assets/fx/crit/*.png`, affichés par Fx.crit).
//
//   node tools/lighten-crit-digits.mjs [part]      part : part d'éclaircissement du jaune, 0-1 (défaut 0.3)
//
// Les glyphes d'origine sont sauvegardés une fois dans games/xiao-swarm/art-src/crit-original/ ; chaque exécution repart de cette copie
// (relancer l'outil avec une autre valeur ne cumule donc pas). Seuls les pixels jaunes / jaune-orangé sont modifiés (contour sombre,
// bulle et reflets blancs restent tels quels) : la luminosité monte de `part` vers le blanc, la saturation baisse un peu.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'games/xiao-swarm/public/assets/fx/crit');
const backup = path.join(root, 'games/xiao-swarm/art-src/crit-original');
const amount = Number(process.argv[2] ?? 0.3);
const names = [...'0123456789'].concat('bang');

fs.mkdirSync(backup, { recursive: true });

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

let changed = 0;
for (const name of names) {
  const file = path.join(dir, `${name}.png`);
  const saved = path.join(backup, `${name}.png`);
  if (!fs.existsSync(saved)) fs.copyFileSync(file, saved);
  const png = PNG.sync.read(fs.readFileSync(saved));
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(png.data[i], png.data[i + 1], png.data[i + 2]);
    if (h < 25 || h > 65 || s < 0.45 || l < 0.3) continue; // jaune / jaune-orangé clair seulement
    const [r, g, b] = hsl2rgb(h, s * (1 - amount * 0.35), l + (1 - l) * amount);
    png.data[i] = Math.round(r); png.data[i + 1] = Math.round(g); png.data[i + 2] = Math.round(b);
    changed++;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}
console.log(`${names.length} glyphes, ${changed} pixels éclaircis (part ${amount})`);
