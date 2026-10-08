import { PICKUP } from '../config';

import type { SoldierState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Le soldat qui attire un objet au sol : son rayon et sa vitesse d'attraction viennent de la stat `magnet` de sa squad. */
export interface Attractor {
  soldier: SoldierState;
  squad: Squad;
  dist: number;
  /** Rayon d'attraction (px) de cette squad. */
  radius: number;
  /** Stat `magnet` de la squad : multiplie aussi le rayon de ramassage et la vitesse max d'un objet attiré. */
  stat: number;
}

/** Soldat vivant le plus proche de (x, y) qui peut l'attirer (`accept` : filtre, ex. une place libre pour une recrue). */
export function findAttractor(sim: Sim, x: number, y: number, accept?: (s: SoldierState, sq: Squad) => boolean): Attractor | undefined {
  let best: Attractor | undefined;
  for (const s of sim.soldierHash.query(x, y, PICKUP.magnetRadius * 2.6, sim.scratchSoldiers)) {
    if (!s.alive) continue;
    const squad = sim.squadOf(s.owner);
    if (!squad || (accept && !accept(s, squad))) continue;
    const stat = squad.stats.get('magnet');
    const radius = PICKUP.magnetRadius * stat;
    const dist = Math.hypot(s.x - x, s.y - y);
    if (dist > radius || (best && dist >= best.dist)) continue;
    best = { soldier: s, squad, dist, radius, stat };
  }
  return best;
}

/** Rayon (px) donné à l'attracteur d'un objet aspiré / attrapé (il suit sa squad sans limite de distance). */
export const MAGNET_BUFF_RADIUS = 1000;

/**
 * Objet aspiré par le power-up aimant : le soldat vivant de la squad `owner` le plus proche (sans limite de distance), ou undefined si la
 * squad n'a plus personne ou si `accept` refuse tous ses soldats (ex. recrue sans place libre ni blessé).
 */
export function pulledAttractor(sim: Sim, x: number, y: number, owner: string, accept?: (s: SoldierState, sq: Squad) => boolean): Attractor | undefined {
  const squad = sim.squadOf(owner);
  if (!squad) return undefined;
  let best: Attractor | undefined;
  for (const s of squad.soldiers) {
    if (!s.alive || (accept && !accept(s, squad))) continue;
    const dist = Math.hypot(s.x - x, s.y - y);
    if (!best || dist < best.dist) best = { soldier: s, squad, dist, radius: MAGNET_BUFF_RADIUS, stat: squad.stats.get('magnet') };
  }
  return best;
}

/**
 * Objet au sol (globe d'XP, recrue, power-up) qui commence à être attiré : il est « attrapé » pour de bon. Sa durée de vie ne décompte plus
 * et remonte au-dessus des seuils de clignotement (`PICKUP.caughtLife`) : il ne disparaît plus ni ne clignote pendant qu'il vole vers la squad.
 */
export function catchItem(item: { life: number; caught?: boolean; pulled?: string }, owner?: string): void {
  item.pulled ??= owner; // il suit désormais cette squad, où qu'elle aille (`pulledAttractor`)
  if (item.caught) return;
  item.caught = true;
  item.life = Math.max(item.life, PICKUP.caughtLife);
}

/** Le soldat est assez près pour ramasser l'objet (rayon de ramassage × stat `magnet`). */
export const inPickRange = (a: Attractor): boolean => a.dist < PICKUP.pickRadius * a.stat;

/**
 * Objet attrapé qui vole vers le soldat (`tx`, `ty`) : il part à `PICKUP.pullStart` px/s et accélère de `pullAccel` px/s² jusqu'à
 * `maxSpeed` (× `stat`, la stat `magnet` de la squad), bien plus vite qu'une squad : il ne peut pas être distancé. Commun aux globes d'XP,
 * recrues et power-ups (aimant compris).
 */
export function chase(item: { x: number; y: number; pullV?: number }, tx: number, ty: number, dist: number, stat: number, dt: number): void {
  if (dist < 1e-6) return;
  const v = Math.min(PICKUP.maxSpeed * stat, (item.pullV ?? PICKUP.pullStart) + PICKUP.pullAccel * stat * dt);
  item.pullV = v;
  const step = Math.min(dist, v * dt);
  item.x += ((tx - item.x) / dist) * step;
  item.y += ((ty - item.y) / dist) * step;
}
