import { device } from '@xiao/engine';
import { settings } from '../settings';

/** Haut de la zone utile du HUD (sous la pill Poki sur mobile). */
export const hudTop = (): number => (device.isTouch ? 70 : 12);

/**
 * Jauge d'XP tout en haut de l'écran, centrée entre les boutons du coin haut gauche (outils de dev) et haut droit
 * (options, pause). Écran étroit : elle passe sous la rangée de boutons. Partagé par le HUD et la fenêtre de level up
 * (les upgrades s'affichent juste dessous).
 */
export function xpBarLayout(width: number): { x: number; y: number; w: number; bottom: number } {
  const top = hudTop();
  // mode debug (dev) : la rangée de boutons des outils de dev occupe le haut gauche → la jauge passe dessous (sous le compteur de FPS)
  const devRow = import.meta.env.DEV && settings.debugMode;
  const narrow = width < 700 || devRow;
  const w = narrow ? Math.min(width - 110, 560) : Math.min(480, width - 340);
  const y = devRow ? top + 90 : narrow ? top + 78 : top + 12;
  const x = (width - w) / 2 + (narrow ? 34 : 0); // place pour « Niv. X » à gauche
  return { x, y, w, bottom: y + 9 };
}
