// Assemble plusieurs planches en GRILLE (une par animation : idle, walk, death…) en UNE planche de jeu :
// cases de même taille, pieds alignés d'une planche à l'autre, réduction finale. Un sprite du catalogue
// n'a qu'une texture, donc idle + walk + death doivent finir dans le même PNG.
//
//   node tools/pack-grids.mjs <config.json>
//
// {
//   "output": "../public/assets/soldiers/gunner.png",     // relatif au config
//   "scale": 0.6,                                          // réduction finale (moyenne de pixels)
//   "cols": 8,                                             // optionnel : colonnes de la planche de sortie
//   "sheets": [
//     { "name": "idle",  "input": "gunner_idle.png",  "cols": 4, "rows": 4, "ref": 0 },
//     { "name": "death", "input": "gunner_death.png", "cols": 4, "rows": 4 }
//   ]
// }
//
// Alignement : `ref` (défaut 0) = frame de référence de la planche ; ses pieds (bas du personnage, centre des
// jambes) sont posés au même point dans toutes les planches. Les autres frames gardent leur position relative
// (la marche ne « tremble » donc pas, et un personnage qui tombe reste où il tombe).
//
// Option par planche : "cleanShadow": true retire l'ombre portée brune/sombre peinte sous le personnage (le jeu dessine la sienne) :
// pixels sombres et chauds (rouge > bleu) reliés au fond transparent ; le contour du personnage, lui, est froid ou coloré.
//
// Option par planche : "flipX": true retourne chaque frame horizontalement (planche dessinée à l'envers en X).
//
// Sortie : le PNG (planches empilées, `cols` colonnes) et un .json à côté (taille de case, ancrage des pieds,
// première frame et nombre de frames de chaque animation) pour écrire l'entrée du manifeste d'assets.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const configPath = process.argv[2];
if (!configPath) {
  console.error('usage: node tools/pack-grids.mjs <config.json>');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dir = path.dirname(configPath);
const scale = cfg.scale ?? 1;
const ALPHA = 40;

/** Retourne horizontalement chaque case de la grille (miroir dans la case, pas de la planche entière). */
function flipCells(png, cols, rows) {
  const cw = Math.floor(png.width / cols);
  const ch = Math.floor(png.height / rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw >> 1; x++) {
          const a = ((r * ch + y) * png.width + c * cw + x) * 4;
          const b = ((r * ch + y) * png.width + c * cw + (cw - 1 - x)) * 4;
          for (let k = 0; k < 4; k++) [png.data[a + k], png.data[b + k]] = [png.data[b + k], png.data[a + k]];
        }
}

/** Retire l'ombre au sol : pixels sombres à dominante chaude, reliés (4-voisins) au fond transparent. */
function removeShadow(png) {
  const { width: W, height: H, data: d } = png;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] < 24) { seen[y * W + x] = 1; stack.push(x, y); }
  const isShadow = (i) => d[i + 3] > 0 && d[i] > d[i + 2] + 3 && 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 120;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
      const i = (ny * W + nx) * 4;
      if (!isShadow(i)) continue;
      seen[ny * W + nx] = 1;
      d[i + 3] = 0;
      stack.push(nx, ny);
    }
  }
}

// ---------- 1. Lecture des planches et mesure des pieds ----------
const sheets = cfg.sheets.map((s) => {
  const png = PNG.sync.read(fs.readFileSync(path.resolve(dir, s.input)));
  const cw = Math.floor(png.width / s.cols);
  const ch = Math.floor(png.height / s.rows);
  const ref = s.ref ?? 0;
  if (s.cleanShadow) removeShadow(png);
  if (s.flipX) flipCells(png, s.cols, s.rows);
  const rx = (ref % s.cols) * cw;
  const ry = Math.floor(ref / s.cols) * ch;
  let bottom = -1;
  let top = ch;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) if (png.data[((ry + y) * png.width + rx + x) * 4 + 3] > ALPHA) {
      bottom = Math.max(bottom, y);
      top = Math.min(top, y);
    }
  // centre horizontal des jambes : 20 % du bas du personnage
  let sx = 0;
  let n = 0;
  for (let y = Math.floor(bottom - (bottom - top) * 0.2); y <= bottom; y++)
    for (let x = 0; x < cw; x++) if (png.data[((ry + y) * png.width + rx + x) * 4 + 3] > ALPHA) {
      sx += x;
      n++;
    }
  if (n === 0) throw new Error(`${s.input}: frame de référence ${ref} vide`);
  return { ...s, png, cw, ch, feetX: sx / n, feetY: bottom };
});

// ---------- 2. Case commune et ancrage ----------
const ax = Math.ceil(Math.max(...sheets.map((s) => s.feetX)));
const ay = Math.ceil(Math.max(...sheets.map((s) => s.feetY)));
for (const s of sheets) {
  s.dx = ax - Math.round(s.feetX);
  s.dy = ay - s.feetY;
}
const cellW = Math.max(...sheets.map((s) => s.dx + s.cw));
const cellH = Math.max(...sheets.map((s) => s.dy + s.ch));
// colonnes de la planche de sortie : `cols` du config (ex. 8 pour rester sous 2048 px de haut avec beaucoup de frames), sinon celles des planches
const cols = cfg.cols ?? Math.max(...sheets.map((s) => s.cols));

// ---------- 3. Assemblage (pleine résolution) ----------
const totalRows = sheets.reduce((n, s) => n + Math.ceil((s.cols * s.rows) / cols), 0);
const big = new PNG({ width: cols * cellW, height: totalRows * cellH });
const anims = {};
let frameIndex = 0;
let rowBase = 0;
for (const s of sheets) {
  const count = s.frames ?? s.cols * s.rows;
  anims[s.name] = { first: frameIndex, count };
  for (let f = 0; f < count; f++) {
    const sc = f % s.cols;
    const sr = Math.floor(f / s.cols);
    const idx = frameIndex + f;
    const ox = (idx % cols) * cellW + s.dx;
    const oy = Math.floor(idx / cols) * cellH + s.dy;
    for (let y = 0; y < s.ch; y++)
      for (let x = 0; x < s.cw; x++) {
        const si = ((sr * s.ch + y) * s.png.width + sc * s.cw + x) * 4;
        const di = ((oy + y) * big.width + ox + x) * 4;
        big.data[di] = s.png.data[si];
        big.data[di + 1] = s.png.data[si + 1];
        big.data[di + 2] = s.png.data[si + 2];
        big.data[di + 3] = s.png.data[si + 3];
      }
  }
  frameIndex += count;
  rowBase += Math.ceil(count / cols);
}
const rows = Math.ceil(frameIndex / cols);

// ---------- 4. Réduction par moyenne pondérée (alpha prémultiplié), case par case ----------
const outCellW = Math.round(cellW * scale);
const outCellH = Math.round(cellH * scale);
const sxr = cellW / outCellW;
const syr = cellH / outCellH;
const out = new PNG({ width: cols * outCellW, height: rows * outCellH });
for (let cy = 0; cy < rows; cy++)
  for (let cx = 0; cx < cols; cx++)
    for (let y = 0; y < outCellH; y++)
      for (let x = 0; x < outCellW; x++) {
        const x0 = x * sxr;
        const x1 = (x + 1) * sxr;
        const y0 = y * syr;
        const y1 = (y + 1) * syr;
        let r = 0, g = 0, b = 0, a = 0, w = 0;
        for (let yy = Math.floor(y0); yy < Math.min(cellH, Math.ceil(y1)); yy++) {
          const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
          for (let xx = Math.floor(x0); xx < Math.min(cellW, Math.ceil(x1)); xx++) {
            const wgt = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
            const i = ((cy * cellH + yy) * big.width + cx * cellW + xx) * 4;
            const al = big.data[i + 3] / 255;
            r += big.data[i] * al * wgt;
            g += big.data[i + 1] * al * wgt;
            b += big.data[i + 2] * al * wgt;
            a += al * wgt;
            w += wgt;
          }
        }
        const o = ((cy * outCellH + y) * out.width + cx * outCellW + x) * 4;
        if (a > 0) {
          out.data[o] = Math.round(r / a);
          out.data[o + 1] = Math.round(g / a);
          out.data[o + 2] = Math.round(b / a);
          out.data[o + 3] = Math.round((a / w) * 255);
        }
      }

// ---------- 5. Écriture ----------
const outPath = path.resolve(dir, cfg.output);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, PNG.sync.write(out, { colorType: 6 }));
const meta = {
  frameWidth: outCellW,
  frameHeight: outCellH,
  originX: +(ax / cellW).toFixed(3),
  originY: +((ay + 1) / cellH).toFixed(3),
  cols,
  frames: frameIndex,
  anims,
};
fs.writeFileSync(outPath.replace(/\.png$/, '.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), outPath)} : ${out.width}x${out.height}, ${frameIndex} frames de ${outCellW}x${outCellH}, ${(fs.statSync(outPath).size / 1024).toFixed(0)} Ko`);
console.log(JSON.stringify(meta));
