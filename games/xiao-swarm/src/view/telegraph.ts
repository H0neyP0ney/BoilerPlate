import type Phaser from 'phaser';
import { FX } from '../fxParams';

/**
 * Télégraphes des attaques d'aliens (charge, saut, boules en cloche, kamikaze, pics du lurker, Scarab, stalactites, murs du bâtisseur) :
 * une couleur par type (`FX.telegraph.<type>Color`, réglable dans la visionneuse de particules). Chacun se remplit en deux couches (zone
 * entière qui fonce + zone intérieure qui grandit, progression `k` 0 → 1) qui donnent ensemble exactement `FX.telegraph.full` d'opacité au
 * moment de l'impact (`teleOuter` / `teleInner`).
 */
export type TelegraphKind = 'rush' | 'leap' | 'lob' | 'fuse' | 'lurk' | 'burrow' | 'stalactite' | 'wall';

/** Types de télégraphe, dans l'ordre de la visionneuse (libellé affiché). */
export const TELEGRAPH_KINDS: { kind: TelegraphKind; label: string }[] = [
  { kind: 'rush', label: 'Charge (rhino, chargeur)' },
  { kind: 'leap', label: 'Saut (crabe)' },
  { kind: 'lob', label: 'Boules en cloche' },
  { kind: 'fuse', label: 'Kamikaze' },
  { kind: 'lurk', label: 'Pics du lurker' },
  { kind: 'burrow', label: 'Sortie du Scarab' },
  { kind: 'stalactite', label: 'Stalactites' },
  { kind: 'wall', label: 'Murs du bâtisseur' },
];

/** Couleur (remplissage et contour) d'un type de télégraphe. */
export const teleColor = (kind: TelegraphKind): number => FX.telegraph[`${kind}Color`];

/** Opacité de la zone entière d'un télégraphe (progression `k` 0 → 1). */
export const teleOuter = (k: number): number => 0.15 + 0.25 * k;

/** Opacité de la zone intérieure qui grandit : avec `teleOuter(1)` (0,4), elle donne `FX.telegraph.full` d'opacité à k = 1. */
export const teleInner = (k: number): number => 0.2 + (1 - (1 - FX.telegraph.full) / (1 - teleOuter(1)) - 0.2) * k;

/** Télégraphe en ellipse (vue de dessus : hauteur = 0,7 × largeur) de rayon `r`, rempli à `k`. */
export function drawTeleEllipse(g: Phaser.GameObjects.Graphics, kind: TelegraphKind, x: number, y: number, r: number, k: number, pulse = 0, lineW = 3): void {
  const c = teleColor(kind);
  g.fillStyle(c, teleOuter(k) + pulse).fillEllipse(x, y, r * 2, r * 1.4);
  g.fillStyle(c, teleInner(k)).fillEllipse(x, y, r * 2 * k, r * 1.4 * k);
  g.lineStyle(lineW, c, 0.5 + 0.4 * k).strokeEllipse(x, y, r * 2, r * 1.4);
}
