import { device } from '@xiao/engine';

/** Haut de la zone utile du HUD (sous la pill Poki sur mobile). */
export const hudTop = (): number => (device.isTouch ? 70 : 12);

/**
 * Jauge d'XP tout en bas de l'écran, centrée ; le niveau s'affiche centré juste au-dessus. Écran étroit : elle est un peu plus large.
 * (La timeline des vagues est tout en haut : `HudScene.drawWaveTimeline`.)
 */
export function xpBarLayout(width: number, height: number): { x: number; y: number; w: number; bottom: number } {
  const w = width < 700 ? Math.min(width - 160, 560) : Math.min(480, width - 340);
  const y = height - 24; // centre de la jauge (18 px de haut), le niveau est posé au-dessus
  const x = (width - w) / 2;
  return { x, y, w, bottom: y + 9 };
}
