import type Phaser from 'phaser';

/**
 * Recoloration d'images au lancement (pas de planche à produire ni à livrer) : décale la teinte d'une plage de couleurs d'une texture
 * (ex. le corps bleu d'un monstre, sans toucher à sa corne beige) et en fait une nouvelle texture, mêmes frames.
 * Sert aux variantes de couleur : soldats de chaque joueur, boss déclinés d'une même planche (`recolor` d'un sprite du manifeste).
 */
export interface RecolorSpec {
  /** Décalage de teinte (degrés). */
  shift?: number;
  /** Teinte fixe (degrés) à la place d'un décalage : toute la plage prend cette teinte (couleur uniforme, ex. un corps bleu nuancé → jaune). */
  hue?: number;
  /** Plage de teintes concernée (degrés, 0-360) ; `hueMin > hueMax` = plage qui passe par 0 (ex. 330 → 30). Absent : toutes les teintes. */
  hueMin?: number;
  hueMax?: number;
  /** Fondu (degrés) de chaque côté de la plage : les teintes voisines sont décalées partiellement (évite une frontière nette). */
  feather?: number;
  /** Saturation × cette valeur sur les pixels décalés (1 = inchangée). */
  saturation?: number;
  /** Mélange avec du blanc (0 à 1) sur les pixels décalés. */
  lighten?: number;
}

/** Distance (degrés) de la teinte `h` à la plage [lo, hi] (0 dedans), plage circulaire. */
function hueDistance(h: number, lo: number, hi: number): number {
  const inside = lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi;
  if (inside) return 0;
  const d = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  return Math.min(d(h, lo), d(h, hi));
}

/**
 * Recolore des pixels RGBA en place. La teinte tourne sans changer la chroma ni le minimum de chaque pixel (luminosité et contours sombres
 * conservés) ; les gris (chroma < 0,12) et les noirs ne bougent pas.
 */
export function recolorPixels(data: Uint8ClampedArray, spec: RecolorSpec): void {
  const lo = spec.hueMin ?? 0;
  const hi = spec.hueMax ?? 360;
  const feather = spec.feather ?? 0;
  const sat = spec.saturation ?? 1;
  const light = spec.lighten ?? 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.12 || max < 0.1) continue; // gris : pas de teinte à décaler
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const dist = hueDistance(h, lo, hi);
    const w = dist === 0 ? 1 : feather > 0 && dist < feather ? 1 - dist / feather : 0;
    if (w === 0) continue;
    const delta = spec.hue !== undefined ? ((((spec.hue - h) % 360) + 540) % 360) - 180 : (spec.shift ?? 0); // teinte fixe : plus court chemin vers elle
    const nh = (((h + delta * w) % 360) + 360) % 360;
    // saturation : la chroma change autour du milieu du pixel (sa luminosité HSL reste la même)
    const mid = (max + min) / 2;
    const c = Math.min(d * (1 + (sat - 1) * w), 2 * Math.min(mid, 1 - mid));
    const m = mid - c / 2;
    const x = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    let [rr, gg, bb] = nh < 60 ? [c, x, 0] : nh < 120 ? [x, c, 0] : nh < 180 ? [0, c, x] : nh < 240 ? [0, x, c] : nh < 300 ? [x, 0, c] : [c, 0, x];
    rr += m;
    gg += m;
    bb += m;
    if (light > 0) {
      const k = light * w;
      rr += (1 - rr) * k;
      gg += (1 - gg) * k;
      bb += (1 - bb) * k;
    }
    data[i] = Math.round(rr * 255);
    data[i + 1] = Math.round(gg * 255);
    data[i + 2] = Math.round(bb * 255);
  }
}

/**
 * Copie la texture `srcKey` en la recolorant (`recolorPixels`) sous la clé `newKey`, avec les mêmes frames. Rien à faire si `newKey` existe
 * déjà. Renvoie faux si la source est absente ou illisible.
 */
export function recolorTexture(scene: Phaser.Scene, srcKey: string, newKey: string, spec: RecolorSpec): boolean {
  if (scene.textures.exists(newKey)) return true;
  if (!scene.textures.exists(srcKey)) return false;
  const tex = scene.textures.get(srcKey);
  const src = tex.getSourceImage() as CanvasImageSource & { width: number; height: number };
  if (!src?.width) return false;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorPixels(img.data, spec);
  ctx.putImageData(img, 0, 0);
  const nt = scene.textures.addCanvas(newKey, canvas);
  if (!nt) return false;
  for (const name of tex.getFrameNames()) {
    const f = tex.get(name);
    nt.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
  }
  return true;
}
