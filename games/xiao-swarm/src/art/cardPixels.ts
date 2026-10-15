/**
 * Fonds des cartes d'upgrade en procédural : à partir de la carte rouge de base (`ui/cards/card_base.png`, 277 × 405 px = la planche
 * `art-src/card_upgrade.png` recadrée sur BOX puis réduite à EXPORT), on fabrique au lancement une carte par upgrade à sa couleur et la
 * carte prismatique « hologramme » (voir `cardTextures.ts`). Fonctions pures sur des pixels RGBA, sans Phaser ni DOM.
 *
 * C'est le portage de l'ancien `tools/slice-upgrade-cards.mjs` : les formules sont celles de la planche d'origine (repère `xo, yo` = pixels
 * de la planche avant recadrage et réduction), d'où les conversions `toSheet`.
 */

/** Zone de la planche d'origine conservée, et réduction appliquée à l'export (reprises de l'outil d'art). */
const BOX_X = 3;
const EXPORT = 0.6;
/** Plaque dorée du nom (repère de la planche) : son or et son liseré ne sont pas recolorés. */
const PLATE = [64, 518, 408, 632] as const;

/** Taille de la carte de base. */
export const CARD_BASE = { W: 277, H: 405 } as const;

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Pixel de la carte réduite → pixel de la planche d'origine. */
const toSheetX = (x: number): number => x / EXPORT + BOX_X;
const toSheetY = (y: number): number => y / EXPORT;

/** « Famille rouge » de la carte (corps, filet orange, voyants néon) ; autour de la plaque dorée, seul le rouge franc compte. */
function isRed(h: number, s: number, l: number, inPlate: boolean): boolean {
  return (inPlate ? h <= 10 || h >= 335 : h <= 32 || h >= 335) && s > 0.35 && l > 0.06;
}

function inPlate(xo: number, yo: number): boolean {
  return xo >= PLATE[0] && xo < PLATE[2] && yo >= PLATE[1] && yo < PLATE[3];
}

/** Recolore en place la famille rouge de la carte vers `color` (0xRRGGBB) ; le cadre d'acier et la plaque dorée ne bougent pas. */
export function recolorCard(data: Uint8ClampedArray, w: number, color: number): void {
  const [hc, sc, lc] = rgb2hsl((color >> 16) & 255, (color >> 8) & 255, color & 255);
  const lAdj = Math.min(0.62, Math.max(0.42, lc)); // la carte reste sombre même pour une couleur claire
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const p = i >> 2;
    const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    if (!isRed(h, s, l, inPlate(toSheetX(p % w), toSheetY(Math.floor(p / w))))) continue;
    const hh = h >= 335 ? h - 360 : h; // -25 … 32, autour du rouge
    const [r, g, b] = hsl2rgb(hc + (hh - 6) * 0.6, Math.min(1, s * (0.8 + 0.2 * sc)), Math.min(0.95, l * (lAdj / 0.62)));
    data[i] = Math.round(r);
    data[i + 1] = Math.round(g);
    data[i + 2] = Math.round(b);
  }
}

/**
 * Carte prismatique « hologramme » : l'arc-en-ciel se déroule en diagonale sur le corps et les voyants (teinte selon x + y) et un voile irisé
 * léger passe sur le cadre d'acier. La plaque dorée reste intacte. Les bandes de lumière blanche et les étincelles en croix ne sont plus dans
 * la texture : elles sont dessinées dynamiquement, au rythme du curseur (`view/HoloLight.ts`, `view/CardTilt.ts`).
 */
export function holoCard(data: Uint8ClampedArray, w: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const p = i >> 2;
    const xo = toSheetX(p % w);
    const yo = toSheetY(Math.floor(p / w));
    const plate = inPlate(xo, yo);
    const [hh, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    const hue = (xo * 0.42 + yo * 0.3) % 360; // arc-en-ciel en diagonale
    if (isRed(hh, s, l, plate)) {
      const [r, g, b] = hsl2rgb(hue, 0.78, Math.min(0.9, l * 1.15));
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
    } else if (!plate && s < 0.6) {
      // cadre d'acier : voile irisé (mélange « écran » avec l'arc-en-ciel, léger)
      const [r, g, b] = hsl2rgb(hue + 40, 0.9, 0.62);
      const k = 0.2;
      for (const [c, v] of [[0, r], [1, g], [2, b]] as const) data[i + c] = Math.round(255 - ((255 - data[i + c]) * (255 - v * k)) / 255);
    }
  }
}

/**
 * Carré prismatique d'une carte d'upgrade (prise prismatique) : le slot plein d'origine (`ui_slot_full`) repeint par un dégradé à quatre coins (rose en haut à gauche,
 * jaune en haut à droite, bleu en bas à gauche, vert en bas à droite), en gardant son relief (la luminosité du pixel d'origine) et son contour.
 */
// (n'est plus appelée au lancement : `ui/slot_prism.png` en est la sortie ; reste pour refaire l'image si `slot_full.png` change)
const SLOT_CORNERS = { tl: [255, 40, 170], tr: [255, 225, 0], bl: [20, 120, 255], br: [20, 225, 80] } as const;
export function holoSlot(data: Uint8ClampedArray, w: number): void {
  const h = data.length / 4 / w;
  // boîte du slot (le dégradé couvre le carré, pas l'image entière)
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < w * h; p++) {
    if (data[p * 4 + 3] === 0) continue;
    const x = p % w;
    const y = Math.floor(p / w);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const p = i >> 2;
    const u = Math.min(1, Math.max(0, ((p % w) - x0) / bw));
    const v = Math.min(1, Math.max(0, (Math.floor(p / w) - y0) / bh));
    const [, , lo] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    const mix = [0, 1, 2].map((c) => {
      const top = SLOT_CORNERS.tl[c] * (1 - u) + SLOT_CORNERS.tr[c] * u;
      const bottom = SLOT_CORNERS.bl[c] * (1 - u) + SLOT_CORNERS.br[c] * u;
      return top * (1 - v) + bottom * v;
    });
    // couleurs pastel mais nettes : saturation 0,8, clarté plus haute (0,6 à 0,72), avec un peu du relief d'origine (creux un peu plus sombres, reflets un peu plus clairs)
    const [h] = rgb2hsl(mix[0], mix[1], mix[2]);
    const [r, g, b] = hsl2rgb(h, 0.8, Math.min(0.72, Math.max(0.6, 0.66 + (lo - 0.5) * 0.3)));
    // le contour noir d'origine (pixels très sombres du slot) est conservé : on ne colorie que l'intérieur, avec un petit fondu au bord
    const t = Math.min(1, Math.max(0, (lo - 0.08) / 0.2));
    data[i] = Math.round(data[i] * (1 - t) + r * t);
    data[i + 1] = Math.round(data[i + 1] * (1 - t) + g * t);
    data[i + 2] = Math.round(data[i + 2] * (1 - t) + b * t);
  }
}

/**
 * Slot vide d'une carte (`ui/slot_empty.png`, rouge) recoloré à la couleur de la carte : même recoloration que `recolorCard`, sans plaque
 * dorée à préserver et sans toucher à la luminosité.
 */
export function recolorSlot(data: Uint8ClampedArray, color: number): void {
  const [hc, sc] = rgb2hsl((color >> 16) & 255, (color >> 8) & 255, color & 255);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    if (!((h <= 32 || h >= 335) && s > 0.35 && l > 0.03)) continue;
    const [r, g, b] = hsl2rgb(hc + ((h >= 335 ? h - 360 : h) - 6) * 0.6, Math.min(1, s * (0.8 + 0.2 * sc)), l);
    data[i] = Math.round(r);
    data[i + 1] = Math.round(g);
    data[i + 2] = Math.round(b);
  }
}
