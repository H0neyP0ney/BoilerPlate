import { clamp } from '@xiao/engine/sim';
import { DIFFICULTY, RECRUIT } from '../config';
import type { UpgradeId } from '../data/progression';
import type { UpgradeOrbState } from './entities';
import { catchItem, chase, findAttractor, inPickRange, pulledAttractor } from './Pickup';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Durée (s) de la chute d'un globe d'upgrade qui sort de l'œuf (saut en cloche, comme une recrue) et distance de chute (px). */
export const ORB_FALL_TIME = RECRUIT.hopTime;
const ORB_FALL_DIST: [number, number] = [50, 100]; // autour de l'œuf détruit : à portée d'un soldat
/**
 * Globes d'upgrade : sortent d'un œuf de boss détruit (`burst`), retombent autour de lui puis attendent leur joueur. Chacun est RÉSERVÉ à un joueur (`owner`) : aucune
 * autre squad ne peut l'attirer ni le ramasser, et il ne disparaît jamais. Le ramasser donne une upgrade au hasard (`Squad.grantRandomUpgrade`).
 */
export class UpgradeOrbs {
  readonly items: UpgradeOrbState[] = [];

  constructor(private readonly sim: Sim) {}

  /** Globe de `owner` (qui donnera `upgrade`) qui retombe en (x, y) + distance dans la direction `angle`. */
  drop(owner: string, upgrade: UpgradeId, x: number, y: number, angle: number): UpgradeOrbState {
    const rng = this.sim.rng;
    const dist = rng.range(ORB_FALL_DIST[0], ORB_FALL_DIST[1]);
    const o: UpgradeOrbState = {
      id: this.sim.ids.get(),
      owner,
      upgrade,
      x,
      y,
      px: x,
      py: y,
      life: 1e9,
      age: 0,
      hop: { vx: (Math.cos(angle) * dist) / ORB_FALL_TIME, vy: (Math.sin(angle) * dist) / ORB_FALL_TIME, t: ORB_FALL_TIME },
    };
    this.items.push(o);
    return o;
  }

  /** Un œuf de boss est détruit en (x, y) : `chestOrbs` globes par squad vivante tombent autour de lui, chacun réservé à son joueur. */
  burst(x: number, y: number): void {
    const squads = this.sim.aliveSquads;
    const each = Math.max(0, Math.round(DIFFICULTY.chestOrbs));
    const total = squads.length * each;
    const turn = this.sim.rng.range(0, Math.PI * 2);
    let k = 0;
    for (const sq of squads) {
      const given: UpgradeId[] = []; // des upgrades différentes pour un même joueur tant que possible
      for (let n = 0; n < each; n++) {
        const upgrade = sq.pickRandomUpgrade(given);
        if (!upgrade) break; // tout est déjà au maximum
        given.push(upgrade);
        this.drop(sq.owner, upgrade, x, y, turn + ((k++ + this.sim.rng.range(-0.2, 0.2)) / total) * Math.PI * 2);
      }
    }
    this.sim.events.push({ t: 'chestOpened', x, y });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const o = this.items[i];
      o.px = o.x;
      o.py = o.y;
      o.age += dt;
      const squad = this.sim.squadOf(o.owner);
      if (!squad) {
        this.items.splice(i, 1); // son joueur a quitté la partie
        continue;
      }
      // chute : en l'air, ni aimant ni ramassage
      if (o.hop) {
        const { minX, maxX, minY, maxY } = this.sim.arena.bounds;
        o.x = clamp(o.x + o.hop.vx * dt, minX, maxX);
        o.y = clamp(o.y + o.hop.vy * dt, minY, maxY);
        o.hop.t -= dt;
        if (o.hop.t <= 0) o.hop = undefined;
        continue;
      }
      if (o.age < DIFFICULTY.chestOrbGrace) continue; // imprenable la première seconde : on le voit d'abord retomber
      // seule sa propre squad l'attire (rayon et vitesse : stat `magnet`) ; une fois attrapé, il la suit sans limite de distance
      const accept = (_s: unknown, sq: Squad): boolean => sq.owner === o.owner;
      const a = (o.pulled ? pulledAttractor(this.sim, o.x, o.y, o.pulled, accept) : undefined) ?? findAttractor(this.sim, o.x, o.y, accept);
      if (!a) continue; // squad anéantie : il attend son retour
      catchItem(o, o.owner);
      if (inPickRange(a)) {
        this.items.splice(i, 1);
        a.squad.grantUpgrade(o.upgrade, o.x, o.y);
        continue;
      }
      chase(o, a.soldier.x, a.soldier.y, a.dist, a.stat, dt);
    }
  }

  /** Aimant (power-up) : les globes de CETTE squad à moins de `radius` px sont aspirés vers elle. */
  magnetize(squad: Squad, radius: number): void {
    for (const o of this.items) {
      if (o.owner !== squad.owner || o.hop || o.age < DIFFICULTY.chestOrbGrace || Math.hypot(squad.center.x - o.x, squad.center.y - o.y) > radius) continue;
      catchItem(o, squad.owner);
    }
  }

  clear(): void {
    this.items.length = 0;
  }
}
