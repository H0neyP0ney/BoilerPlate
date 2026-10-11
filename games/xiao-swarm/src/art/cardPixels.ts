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

/** Mélange `c` vers le blanc de `a` (0 à 1). */
function whiten(data: Uint8ClampedArray, i: number, a: number): void {
  for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] + (255 - data[i + c]) * a);
}

/**
 * Carte prismatique « hologramme » : l'arc-en-ciel se déroule en diagonale sur le corps et les voyants (teinte selon x + y), des bandes de
 * lumière brillante le traversent, un voile irisé léger passe sur le cadre d'acier et quelques étincelles en croix parsèment le corps.
 * La plaque dorée reste intacte. Graine fixe : le résultat est le même à chaque lancement.
 */
export function holoCard(data: Uint8ClampedArray, w: number): void {
  const h = data.length / 4 / w;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const p = i >> 2;
    const xo = toSheetX(p % w);
    const yo = toSheetY(Math.floor(p / w));
    const plate = inPlate(xo, yo);
    const [hh, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    const hue = (xo * 0.42 + yo * 0.3) % 360; // arc-en-ciel en diagonale
    const band = Math.pow(Math.max(0, Math.sin((xo + yo * 1.4) / 46)), 8); // bandes de lumière brillante
    if (isRed(hh, s, l, plate)) {
      const [r, g, b] = hsl2rgb(hue, 0.78, Math.min(0.9, l * 1.15 + band * 0.32));
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
    } else if (!plate && s < 0.6) {
      // cadre d'acier : voile irisé (mélange « écran » avec l'arc-en-ciel, léger)
      const [r, g, b] = hsl2rgb(hue + 40, 0.9, 0.62);
      const k = 0.16 + band * 0.18;
      for (const [c, v] of [[0, r], [1, g], [2, b]] as const) data[i + c] = Math.round(255 - ((255 - data[i + c]) * (255 - v * k)) / 255);
    }
  }
  // étincelles : petites croix blanches, graine fixe (mêmes tirages que l'outil d'origine)
  let seed = 12345;
  const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let n = 0; n < 16; n++) {
    const cx = Math.round(70 + rnd() * 320);
    const cy = Math.round(80 + rnd() * 400);
    const len = 8 + rnd() * 10;
    // boîte de la croix dans la carte réduite (+1 px de marge)
    const x0 = Math.max(0, Math.floor((cx - len - BOX_X) * EXPORT) - 1);
    const x1 = Math.min(w - 1, Math.ceil((cx + len - BOX_X) * EXPORT) + 1);
    const y0 = Math.max(0, Math.floor((cy - len) * EXPORT) - 1);
    const y1 = Math.min(h - 1, Math.ceil((cy + len) * EXPORT) + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] === 0) continue;
        const dx = toSheetX(x) - cx;
        const dy = toSheetY(y) - cy;
        // bras horizontal et vertical (1 px d'épaisseur dans la planche, donc ~0,6 px ici) puis cœur lumineux
        const armH = Math.abs(dx) < len ? (1 - Math.abs(dx) / len) ** 1.5 * Math.max(0, 1 - Math.abs(dy) * EXPORT * 1.2) : 0;
        const armV = Math.abs(dy) < len ? (1 - Math.abs(dy) / len) ** 1.5 * Math.max(0, 1 - Math.abs(dx) * EXPORT * 1.2) : 0;
        if (armH > 0) whiten(data, i, armH);
        if (armV > 0) whiten(data, i, armV);
        const core = Math.max(0, 1 - Math.hypot(dx, dy) / 3);
        if (core > 0) whiten(data, i, core);
      }
  }
}
