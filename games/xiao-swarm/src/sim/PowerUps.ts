import { POWERUPS, STIM_TIME } from '../config';
import type { Field, PowerUpKind, PowerUpState } from './entities';
import { catchItem, chase, findAttractor, inPickRange, pulledAttractor } from './Pickup';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

const KINDS: PowerUpKind[] = ['stim', 'magnet', 'heal', 'stasis', 'rockets'];
/** Stimpack : durée (s), facteur de vitesse de déplacement et de cadence. */
/** Aimant (coup unique) : rayon (px) autour de la squad dans lequel XP, recrues et power-ups sont aspirés : toute la carte (08/10 ; 1000 avant). */
const MAGNET_RADIUS = Infinity;
/** Globe de soin : rayon, durée (s) et part des PV max rendue par seconde. */
const HEAL_FIELD = { r: 167, ttl: 10, perSec: 0.24 }; // rayon +10 % (152 avant le 07/10)
/** Globe de stase : rayon, durée (s) et facteur de vitesse des aliens dedans. */
const STASIS_FIELD = { r: 382.5, ttl: 8, slow: 0.2 }; // rayon −15 % (450 avant le 08/10)
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

  /** Pose un power-up à un endroit précis (tutoriel : `forced` = il ne disparaît pas tant qu'il n'est pas ramassé). */
  drop(kind: PowerUpKind, x: number, y: number, forced = false): PowerUpState {
    const p: PowerUpState = { id: this.sim.ids.get(), kind, x, y, life: forced ? 1e6 : POWERUPS.life };
    this.items.push(p);
    return p;
  }

  update(dt: number): void {
    const { rng } = this.sim;
    if (!this.sim.tutorial?.active) {
      // pendant le tutoriel, aucun power-up au hasard : seuls ceux du script apparaissent
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rng.range(POWERUPS.every[0], POWERUPS.every[1]);
        this.spawn();
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (!p.caught) p.life -= dt; // attrapé : il ne disparaît plus
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      // attiré par le soldat le plus proche dont la squad a l'aimant (stat `magnet` : rayon d'attraction, de ramassage et vitesse)
      const pulled = p.pulled ? pulledAttractor(this.sim, p.x, p.y, p.pulled) : undefined; // aspiré par le power-up aimant : vole vers la squad
      if (p.pulled && !pulled) p.pulled = undefined;
      const a = pulled ?? findAttractor(this.sim, p.x, p.y);
      if (!a) continue;
      catchItem(p, a.squad.owner); // attiré : il ne disparaît plus ni ne clignote, et suit cette squad
      if (!inPickRange(a)) {
        chase(p, a.soldier.x, a.soldier.y, a.dist, a.stat, dt); // accélère jusqu'à une vitesse max très rapide
        continue;
      }
      this.items.splice(i, 1);
      this.apply(p, a.squad);
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
        this.sim.xp.magnetize(squad, MAGNET_RADIUS); // coup unique : aspire tout l'XP, les recrues et les autres power-ups alentour, ne reste pas actif
        this.sim.recruits.magnetize(squad, MAGNET_RADIUS);
        this.magnetize(squad, MAGNET_RADIUS);
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

  /** Aimant : les power-ups à moins de `radius` px de la squad sont aspirés vers elle (le power-up aimant lui-même vient d'être ramassé). */
  private magnetize(squad: Squad, radius: number): void {
    for (const p of this.items) {
      if (Math.hypot(squad.center.x - p.x, squad.center.y - p.y) > radius) continue;
      p.pulled = squad.owner;
      catchItem(p); // il ne disparaît pas en route
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
