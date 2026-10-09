import { device } from '@xiao/engine';

/** Haut de la zone utile du HUD (sous la pill Poki sur mobile). */
export const hudTop = (): number => (device.isTouch ? 70 : 12);

/** Échelle de la barre d'XP par rapport à sa largeur d'origine (480 px) : 1,1 puis -30 % = 0,77. */
const XP_GROW = 0.77;

/** Dimensions de l'image du cadre de la barre d'XP (`ui_xp_frame`, art-src/experience bar.png) et de sa zone sombre (pixels de la planche). */
export const XP_ART = { W: 600, H: 83, slotX0: 30, slotX1: 570, slotH: 33, fillCap: 14 }; // fillCap : capuchons du 3-slice de la jauge (pixels de ui_xp_fill)

/**
 * Barre d'XP tout en bas de l'écran, centrée ; le niveau s'affiche centré juste au-dessus. Écran étroit : elle est un peu plus large.
 * `w` = largeur affichée du cadre, `k` = échelle de l'image, `y` = centre de la barre. (La timeline des vagues est tout en haut : `TimelineHud`.)
 */
export function xpBarLayout(width: number, height: number): { x: number; y: number; w: number; k: number; bottom: number } {
  const w = Math.min((width < 700 ? Math.min(width - 160, 560) : Math.min(480, width - 340)) * XP_GROW, width - 24); // XP_GROW
  const k = w / XP_ART.W;
  const y = height - 12 - (XP_ART.H / 2) * k; // 12 px de marge sous le cadre
  const x = (width - w) / 2;
  return { x, y, w, k, bottom: y + (XP_ART.H / 2) * k };
}

/**
 * Barre de vie du boss : cadre à cornes (`ui_boss_frame`, art-src/jauge_boss.png vidé de sa jauge) et jauge de la barre d'XP recolorée en rouge (`ui_boss_fill`, 53 × 32,
 * capuchons de 14 px), produits par tools/slice-boss-bar.mjs. Mesures du cadre (pixels de la planche) : zone sombre de `slotX0` à `slotX1`, centrée en `slotCy`, de hauteur `slotH`.
 */
export const BOSS_ART = { W: 500, H: 76, slotX0: 42, slotX1: 458, slotCy: 43.5, slotH: 25, fillCap: 14, bottom: 66 };
