import { device } from '@xiao/engine';

/** Haut de la zone utile du HUD (sous la pill Poki sur mobile). */
export const hudTop = (): number => (device.isTouch ? 70 : 12);

/**
 * Jauge d'XP tout en haut de l'écran, centrée entre les boutons du coin haut gauche (son, musique) et haut droit (pause) ;
 * le niveau s'affiche centré juste au-dessus. Écran étroit : elle est un peu plus large. Partagé par le HUD et la fenêtre de
 * level up (les upgrades s'affichent juste dessous).
 */
export function xpBarLayout(width: number): { x: number; y: number; w: number; bottom: number } {
  const top = hudTop();
  const w = width < 700 ? Math.min(width - 160, 560) : Math.min(480, width - 340);
  const y = top + 36; // sous le niveau (centré au-dessus, ~30 px)
  const x = (width - w) / 2;
  return { x, y, w, bottom: y + 9 };
}
