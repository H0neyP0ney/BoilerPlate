// Décale la teinte d'une image PNG (recolorer une planche de sprites : slime vert → rose, etc.).
//
//   node tools/hue-shift.mjs <entrée.png> <sortie.png> <degrés> [saturation=1] [teinteMin teinteMax] [éclaircissement=0]
//
// `teinteMin teinteMax` (°, 0-360) : seuls les pixels dont la teinte est dans cet intervalle changent (ex. 170 260 : le corps bleu d'une bête, sans toucher à sa corne
// beige). `éclaircissement` (0 à 1) : mélange avec du blanc, sur les mêmes pixels.
//
// Les pixels transparents restent transparents ; luminosité et contours sombres sont conservés.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [input, output, deg, sat = '1', hueMin, hueMax, light = '0'] = process.argv.slice(2);
if (!input || !output || deg === undefined) {
  console.error('usage: node tools/hue-shift.mjs <entrée.png> <sortie.png> <degrés> [saturation]');
  process.exit(1);
}
const shift = Number(deg);
const satMul = Number(sat);
const lo = hueMin === undefined ? 0 : Number(hueMin);
const hi = hueMax === undefined ? 360 : Number(hueMax);
const lighten = Number(light);
const png = PNG.sync.read(fs.readFileSync(input));

const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const hslToRgb = (h, s, l) => {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

for (let i = 0; i < png.data.length; i += 4) {
  if (png.data[i + 3] === 0) continue;
  const [h, s, l] = rgbToHsl(png.data[i], png.data[i + 1], png.data[i + 2]);
  if (s > 0.05 && (h < lo || h > hi)) continue; // hors de l'intervalle de teintes : pixel laissé tel quel
  const [r, g, b] = hslToRgb((h + shift + 360) % 360, Math.min(1, s * satMul), l + (1 - l) * lighten);
  png.data[i] = Math.round(r);
  png.data[i + 1] = Math.round(g);
  png.data[i + 2] = Math.round(b);
}
fs.writeFileSync(output, PNG.sync.write(png));
console.log(`${output} : teinte ${shift > 0 ? '+' : ''}${shift}°`);
