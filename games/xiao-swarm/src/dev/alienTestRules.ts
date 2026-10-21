import { ALIENS, type AlienId } from '../data/aliens';
import { SQUAD } from '../config';

/**
 * Règles du test d'un alien (dev, `dev/alienTest.ts`) : fichier pur, sans DOM ni Phaser, pour que `sim:combat` les vérifie.
 *
 * Deux modes (deux boutons de la vue d'unités) :
 *  - `ratio` : l'alien contre une squad de Troopers dont l'effectif suit ses PV, pour un duel à peu près réaliste. Base : 2 Troopers contre un slime (`RATIO_BASE_SOLDIERS` contre
 *    `RATIO_BASE_ALIEN`) ; effectif = 2 × PV de l'alien ÷ PV du slime, arrondi, au moins 1 et au plus `RATIO_MAX_SOLDIERS` (un boss de 17 000 PV en demanderait ~480 : plafonné à la squad maximale).
 *  - `tank` : 1 Trooper à `TANK_MUL` × ses PV contre l'alien à `TANK_MUL` × ses PV (bouclier compris) : le même rapport de force qu'un duel normal, mais assez long pour observer le combat sans mourir.
 */
export type AlienTestMode = 'ratio' | 'tank';

export const RATIO_BASE_ALIEN: AlienId = 'slime';
export const RATIO_BASE_SOLDIERS = 2;
export const RATIO_MAX_SOLDIERS = 40;
export const TANK_MUL = 10;

/** Effectif imposé du mode `ratio` pour certains aliens (le calcul sur les PV les surestime) : le chargeur est affronté par 5 Troopers. */
export const RATIO_OVERRIDE: Partial<Record<AlienId, number>> = { charger: 5 };

/** Nombre de Troopers du mode `ratio` face à `alien`. */
export function ratioSoldiers(alien: AlienId): number {
  const fixed = RATIO_OVERRIDE[alien];
  if (fixed !== undefined) return fixed;
  const raw = (RATIO_BASE_SOLDIERS * ALIENS[alien].hp) / ALIENS[RATIO_BASE_ALIEN].hp;
  return Math.max(1, Math.min(RATIO_MAX_SOLDIERS, Math.round(raw)));
}

/** Effectif de la squad du test : celui du mode `ratio`, un seul Trooper (×`TANK_MUL` PV) en mode `tank`. */
export function testSoldiers(alien: AlienId, mode: AlienTestMode): number {
  return mode === 'tank' ? 1 : ratioSoldiers(alien);
}

/** Taille maximale de squad à prévoir pour `n` soldats (au moins la taille de base) : un test de 30 Troopers ne doit pas dépasser la squad maximale. */
export function squadCapFor(n: number): number {
  return Math.max(SQUAD.baseMaxSize, n);
}
