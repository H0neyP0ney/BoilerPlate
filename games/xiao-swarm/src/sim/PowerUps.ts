import { POWERUPS } from '../config';
import type { Field, PowerUpKind, PowerUpState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

const PICK_RADIUS = 34;
const KINDS: PowerUpKind[] = ['stim', 'magnet', 'heal', 'stasis', 'rockets'];
/** Stimpack : durée (s), facteur de vitesse de déplacement et de cadence. */
const STIM_TIME = 5; // facteurs : `STIM_SPEED` / `STIM_FIRE` (config.ts)
/** Aimant (coup unique) : rayon (px) autour de la squad dans lequel l'XP est aspirée. */
const MAGNET_RADIUS = 1000;
/** Globe de soin : rayon, durée (s) et part des PV max rendue par seconde. */
const HEAL_FIELD = { r: 127, ttl: 10, perSec: 0.12 };
/** Globe de stase : rayon, durée (s) et facteur de vitesse des aliens dedans. */
const STASIS_FIELD = { r: 150, ttl: 8, slow: 0.2 };
const ROCKETS = 30;

/**
 * Power-ups : de temps en temps un petit boost apparaît près d'une squad vivante et disparaît vite si personne ne le prend.
 * Ramassé par un soldat, il applique son effet à sa squad : stimpack, aimant à XP (coup unique), globe de soin (persistant), globe de
 * stase (persistant), rafale de roquettes. Seul l'hôte / le solo simule ; l'état passe dans les snapshots.
 */
export class PowerUps {
  readonly items: PowerUpState[] = [];
  readonly fields: Field[] = [];
  private timer: number = POWERUPS.first;

  constructor(private readonly sim: Sim) {}

  update(dt: number): void {
    const { rng } = this.sim;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rng.range(POWERUPS.every[0], POWERUPS.every[1]);
      this.spawn();
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      const s = this.sim.soldierHash.nearest(p.x, p.y, PICK_RADIUS, (o) => o.alive && !!this.sim.squadOf(o.owner));
      if (!s) continue;
      this.items.splice(i, 1);
      this.apply(p, this.sim.squadOf(s.owner)!);
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.fields.splice(i, 1);
        continue;
      }
      if (f.kind !== 'heal') continue;
      for (const sq of this.sim.squads) {
        for (const s of sq.soldiers) {
          if (!s.alive || s.hp >= s.maxHp || (s.x - f.x) ** 2 + (s.y - f.y) ** 2 > (f.r + s.radius) ** 2) continue;
          s.hp = Math.min(s.maxHp, s.hp + s.maxHp * HEAL_FIELD.perSec * dt);
        }
      }
    }
  }

  /** Apparition près d'une squad vivante au hasard, à distance de marche, sur un point libre. */
  private spawn(): void {
    if (this.items.length >= POWERUPS.max) return;
    const { rng, arena } = this.sim;
    const squads = this.sim.aliveSquads;
    if (squads.length === 0) return;
    const sq = rng.pick(squads);
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(200, 420);
      const p = { x: sq.center.x + Math.cos(a) * d, y: sq.center.y + Math.sin(a) * d };
      if (!arena.isFree(p, 30)) continue;
      const b = arena.bounds;
      if (p.x < b.minX + 60 || p.x > b.maxX - 60 || p.y < b.minY + 60 || p.y > b.maxY - 60) continue;
      this.items.push({ id: this.sim.ids.get(), kind: rng.pick(KINDS), x: p.x, y: p.y, life: POWERUPS.life });
      return;
    }
  }

  private apply(p: PowerUpState, squad: Squad): void {
    this.sim.events.push({ t: 'powerup', owner: squad.owner, kind: p.kind, x: p.x, y: p.y });
    switch (p.kind) {
      case 'stim':
        squad.buffs.stim = STIM_TIME;
        break;
      case 'magnet':
        this.sim.xp.magnetize(squad, MAGNET_RADIUS); // coup unique : aspire tout l'XP alentour, ne reste pas actif
        break;
      case 'heal':
        this.fields.push({ id: this.sim.ids.get(), kind: 'heal', x: p.x, y: p.y, r: HEAL_FIELD.r, ttl: HEAL_FIELD.ttl });
        break;
      case 'stasis':
        this.fields.push({ id: this.sim.ids.get(), kind: 'stasis', x: p.x, y: p.y, r: STASIS_FIELD.r, ttl: STASIS_FIELD.ttl });
        break;
      case 'rockets':
        this.sim.combat.barrage(squad, ROCKETS);
        break;
    }
  }

  /** Facteur de vitesse d'un alien à cet endroit (globes de stase : le plus fort l'emporte). */
  stasisAt(x: number, y: number): number {
    let k = 1;
    for (const f of this.fields) {
      if (f.kind === 'stasis' && (x - f.x) ** 2 + (y - f.y) ** 2 < f.r * f.r) k = Math.min(k, STASIS_FIELD.slow);
    }
    return k;
  }

  clear(): void {
    this.items.length = 0;
    this.fields.length = 0;
    this.timer = POWERUPS.first;
  }
}
