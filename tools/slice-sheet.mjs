// Découpe une planche "de présentation" (persos placés librement, étiquettes, ombres au sol)
// en planche de jeu propre : une grille de cases identiques, persos alignés sur les pieds.
//
//   node tools/slice-sheet.mjs <config.json>
//
// Le config décrit, pour chaque animation, la zone de la planche où chercher ses frames :
// {
//   "input": "gunner_sheet.png",          // relatif au config
//   "output": "../public/assets/soldiers/gunner.png",
//   "scale": 0.5,                          // réduction finale
//   "anims": { "idle": { "box": [x0, y0, x1, y1], "frames": 4, "alphaMin"?: 200 }, ... }
// }
//
// Traitement :
//  1. ombres au sol retirées (gris peu saturé relié au fond transparent, arrêté par le contour sombre) ;
//  2. dans chaque zone : composantes connexes ; les N plus grandes = les frames (triées de gauche à droite) ;
//     les petits morceaux colorés proches (flash, douilles, "!") y sont rattachés, la poussière grise est ignorée ;
//  3. ancrage = centre des pieds (bas de la frame principale) ; toutes les frames dans des cases de même
//     taille, pieds au même point ; réduction avec moyenne des pixels ;
//  4. écrit le PNG + un .json (taille de case, ancrage, frames par animation) pour le manifeste d'assets.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const configPath = process.argv[2];
if (!configPath) {
  console.error('usage: node tools/slice-sheet.mjs <config.json>');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dir = path.dirname(configPath);
const src = PNG.sync.read(fs.readFileSync(path.resolve(dir, cfg.input)));
const W = src.width;
const H = src.height;
const d = src.data;
const idx = (x, y) => (y * W + x) * 4;

// ---------- 1. Suppression des ombres au sol ----------
const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const sat = (i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
const alphaMin = cfg.alphaMin ?? 24;
const isShadowLike = (i) => d[i + 3] > 0 && sat(i) < (cfg.shadowMaxSat ?? 22) && lum(i) > (cfg.shadowMinLum ?? 38) && lum(i) < (cfg.shadowMaxLum ?? 140);
{
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (d[idx(x, y) + 3] < alphaMin) { seen[y * W + x] = 1; stack.push(x, y); }
  let removed = 0;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
      const i = idx(nx, ny);
      if (!isShadowLike(i)) continue;
      seen[ny * W + nx] = 1;
      d[i + 3] = 0;
      removed++;
      stack.push(nx, ny);
    }
  }
  console.log(`ombres retirées : ${removed} px`);
}

// ---------- 2. Frames par composantes connexes ----------
function components(box, minAlpha = alphaMin) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== -1 || d[idx(x0 + x, y0 + y) + 3] < minAlpha) continue;
      const c = { id: comps.length, pixels: [], minX: Infinity, minY: Infinity, maxX: -1, maxY: -1, satSum: 0 };
      const stack = [x, y];
      label[y * w + x] = c.id;
      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        const i = idx(x0 + cx, y0 + cy);
        c.pixels.push(cx + x0, cy + y0);
        c.satSum += sat(i);
        c.minX = Math.min(c.minX, cx + x0);
        c.maxX = Math.max(c.maxX, cx + x0);
        c.minY = Math.min(c.minY, cy + y0);
        c.maxY = Math.max(c.maxY, cy + y0);
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || label[ny * w + nx] !== -1) continue;
            if (d[idx(x0 + nx, y0 + ny) + 3] < minAlpha) continue;
            label[ny * w + nx] = c.id;
            stack.push(nx, ny);
          }
      }
      c.area = c.pixels.length / 2;
      c.meanSat = c.satSum / c.area;
      comps.push(c);
    }
  }
  return comps;
}

const attachDist = cfg.attachDistance ?? 40;
const frames = {}; // anim -> [{ parts: comps[], anchor: {x,y} }]
for (const [name, a] of Object.entries(cfg.anims)) {
  // alphaMin par anim : plus haut pour casser les ponts de lueur semi-transparente entre frames
  const comps = components(a.box, a.alphaMin ?? alphaMin).sort((p, q) => q.area - p.area);
  const bodies = comps.slice(0, a.frames).sort((p, q) => p.minX - q.minX);
  if (bodies.length < a.frames) console.warn(`⚠ ${name} : ${bodies.length}/${a.frames} frames trouvées`);
  const list = bodies.map((b) => ({ main: b, parts: [b] }));
  for (const c of comps.slice(a.frames)) {
    if (c.area < 6) continue;
    const colorful = c.meanSat > (cfg.attachMinSat ?? 60);
    if (!colorful) continue; // poussière grise, fumée : ignorées
    let best = null;
    let bestD = attachDist;
    for (const f of list) {
      const b = f.main;
      const dx = Math.max(b.minX - c.maxX, 0, c.minX - b.maxX);
      const dy = Math.max(b.minY - c.maxY, 0, c.minY - b.maxY);
      const dist = Math.hypot(dx, dy);
      if (dist < bestD) {
        bestD = dist;
        best = f;
      }
    }
    if (best) best.parts.push(c);
  }
  // Ancrage : centre horizontal des pixels les plus bas de la frame principale (les pieds), bas de celle-ci.
  for (const f of list) {
    const b = f.main;
    const band = Math.max(4, Math.round((b.maxY - b.minY) * 0.12));
    let sx = 0;
    let n = 0;
    for (let i = 0; i < b.pixels.length; i += 2) {
      if (b.pixels[i + 1] >= b.maxY - band) {
        sx += b.pixels[i];
        n++;
      }
    }
    f.anchor = { x: Math.round(sx / n), y: b.maxY + (cfg.footPadding ?? 0) };
  }
  frames[name] = list;
  console.log(`${name.padEnd(12)} ${list.length} frames, parties : ${list.map((f) => f.parts.length).join(',')}`);
}

// ---------- 3. Cases alignées ----------
let left = 0;
let right = 0;
let up = 0;
let down = 0;
for (const list of Object.values(frames))
  for (const f of list)
    for (const p of f.parts) {
      left = Math.max(left, f.anchor.x - p.minX);
      right = Math.max(right, p.maxX - f.anchor.x + 1);
      up = Math.max(up, f.anchor.y - p.minY);
      down = Math.max(down, p.maxY - f.anchor.y + 1);
    }
const pad = 2;
const s = cfg.scale ?? 1;
const cellW = Math.ceil((left + right) * s) + pad * 2;
const cellH = Math.ceil((up + down) * s) + pad * 2;
const animNames = Object.keys(frames);
const cols = Math.max(...animNames.map((n) => frames[n].length));
const out = new PNG({ width: cellW * cols, height: cellH * animNames.length });
out.data.fill(0);

// Rendu d'une frame, réduite par moyenne (alpha prémultiplié) : chaque pixel de sortie
// échantillonne un carré 1/s × 1/s de la source.
function blit(f, cellX, cellY) {
  const mask = new Set();
  for (const p of f.parts) for (let i = 0; i < p.pixels.length; i += 2) mask.add(p.pixels[i + 1] * W + p.pixels[i]);
  const originX = f.anchor.x - left;
  const originY = f.anchor.y - up;
  const step = 1 / s;
  for (let oy = 0; oy < cellH - pad * 2; oy++) {
    for (let ox = 0; ox < cellW - pad * 2; ox++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const sx0 = originX + ox * step;
      const sy0 = originY + oy * step;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy0 + step); yy++)
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx0 + step); xx++) {
          n++;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !mask.has(yy * W + xx)) continue;
          const i = idx(xx, yy);
          const al = d[i + 3] / 255;
          r += d[i] * al;
          g += d[i + 1] * al;
          b += d[i + 2] * al;
          a += al;
        }
      if (a === 0) continue;
      const o = ((cellY + pad + oy) * out.width + cellX + pad + ox) * 4;
      out.data[o] = Math.round(r / a);
      out.data[o + 1] = Math.round(g / a);
      out.data[o + 2] = Math.round(b / a);
      out.data[o + 3] = Math.round((a / n) * 255);
    }
  }
}

const meta = { frameWidth: cellW, frameHeight: cellH, columns: cols, originX: (pad + left * s) / cellW, originY: (pad + up * s) / cellH, anims: {} };
animNames.forEach((name, row) => {
  meta.anims[name] = frames[name].map((_, col) => row * cols + col);
  frames[name].forEach((f, col) => blit(f, col * cellW, row * cellH));
});

const outPath = path.resolve(dir, cfg.output);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, PNG.sync.write(out, { colorType: 6 }));
fs.writeFileSync(outPath.replace(/\.png$/, '.json'), JSON.stringify(meta, null, 2));
console.log(`→ ${path.relative(process.cwd(), outPath)} : ${out.width}×${out.height}, case ${cellW}×${cellH}, ancrage (${meta.originX.toFixed(3)}, ${meta.originY.toFixed(3)}), ${(fs.statSync(outPath).size / 1024).toFixed(0)} Ko`);
