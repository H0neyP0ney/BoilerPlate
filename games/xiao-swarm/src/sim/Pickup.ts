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

/** Le soldat est assez près pour ramasser l'objet (rayon de ramassage × stat `magnet`). */
export const inPickRange = (a: Attractor): boolean => a.dist < PICKUP.pickRadius * a.stat;

/** Attire l'objet vers le soldat : plus il est proche, plus il accélère ; vitesse plafonnée (plafond × stat `magnet`). */
export function pullToward(item: { x: number; y: number }, a: Attractor, dt: number): void {
  if (a.dist < 1e-6) return;
  const k = Math.min(1, dt * (5 + (1 - a.dist / a.radius) * 10));
  const step = Math.min(a.dist * k, PICKUP.maxSpeed * a.stat * dt);
  item.x += ((a.soldier.x - item.x) / a.dist) * step;
  item.y += ((a.soldier.y - item.y) / a.dist) * step;
}
