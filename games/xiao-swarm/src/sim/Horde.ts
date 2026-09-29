import { damp, type Point } from '@xiao/engine/sim';
import { ALIENS, type AlienId, type TargetPref } from '../data/aliens';
import type { AlienState, SoldierState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Rayon dans lequel un alien cherche une cible précise (au-delà : il marche vers la squad la plus proche). */
const SEEK_RADIUS = 700;

/**
 * IA de la horde : chaque alien choisit une cible selon sa préférence (GDD §11),
 * se dirige vers elle en évitant ses congénères, et attaque au contact.
 * Charge (beast) et slam (crab) sont les seules attaques à knockback (GDD §19).
 * Fonctionne avec N squads (battle royale) : chaque alien vise la plus proche.
 */
export class Horde {
  private readonly scratch: AlienState[] = [];
  private readonly scratchS: SoldierState[] = [];

  constructor(private readonly sim: Sim) {}

  get maxAliens(): number {
    const m = this.sim.mode.maxAliens;
    return m.base + m.perPlayer * this.sim.aliveSquads.length;
  }

  canSpawn(): boolean {
    return this.sim.aliens.length < this.maxAliens;
  }

  /** Spawn hors écran autour d'une squad, en groupe. */
  spawnNear(squad: Squad, type: AlienId, count: number, distance: number): void {
    const { rng, arena } = this.sim;
    const def = ALIENS[type];
    const c = squad.center;
    let origin: Point | null = null;
    for (let tries = 0; tries < 12 && !origin; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = distance + rng.range(60, 180);
      const p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
      if (arena.isFree(p, def.radius + 20)) origin = p;
    }
    if (!origin) return;
    for (let i = 0; i < count && this.canSpawn(); i++) {
      const p = { x: origin.x + rng.range(-50, 50), y: origin.y + rng.range(-50, 50), radius: def.radius };
      arena.constrain(p);
      const hp = def.hp * this.sim.alienHpMul;
      this.sim.aliens.push({
        kind: 'alien',
        id: this.sim.ids.get(),
        team: 'aliens',
        def,
        x: p.x,
        y: p.y,
        px: p.x,
        py: p.y,
        vx: 0,
        vy: 0,
        kx: 0,
        ky: 0,
        radius: def.radius,
        mass: def.mass,
        hp,
        maxHp: hp,
        alive: true,
        target: null,
        goalX: c.x,
        goalY: c.y,
        retarget: 0,
        attackCd: 0,
        chargeT: 0,
        chargeCd: 1,
        chargeDx: 0,
        chargeDy: 0,
        slamWind: 0,
        slamCd: 2,
      });
    }
  }

  update(dt: number): void {
    const { alienHash, soldierHash, arena, rng } = this.sim;
    if (this.sim.aliveSquads.length === 0) return;

    for (const a of this.sim.aliens) {
      if (!a.alive) continue;
      const def = a.def;

      // Ciblage (pas à chaque tick)
      a.retarget -= dt;
      if (a.retarget <= 0 || (a.target && !a.target.alive)) {
        this.pickTarget(a, def.target);
        a.retarget = 0.4 + rng.next() * 0.3;
      }
      const goalX = a.target ? a.target.x : a.goalX;
      const goalY = a.target ? a.target.y : a.goalY;
      let gx = goalX - a.x;
      let gy = goalY - a.y;
      const gd = Math.hypot(gx, gy) || 1;
      gx /= gd;
      gy /= gd;

      let speed = def.speed;
      if (def.charge) {
        a.chargeCd -= dt;
        if (a.chargeT > 0) {
          a.chargeT -= dt;
          gx = a.chargeDx;
          gy = a.chargeDy;
          speed *= def.charge.speedMul;
        } else if (a.chargeCd <= 0 && a.target && gd < def.charge.trigger) {
          a.chargeT = def.charge.duration;
          a.chargeCd = def.charge.cooldown;
          a.chargeDx = gx;
          a.chargeDy = gy;
        }
      }
      if (def.slam) {
        a.slamCd -= dt;
        if (a.slamWind > 0) {
          a.slamWind -= dt;
          speed = 0;
          if (a.slamWind <= 0) this.slam(a);
        } else if (a.slamCd <= 0 && a.target && gd < def.slam.radius * 0.8) {
          a.slamWind = 0.45;
        }
      }

      const contact = a.target ? a.radius + a.target.radius + 4 : 0;
      const go = gd > contact || a.chargeT > 0;
      const desiredX = go ? gx * speed : 0;
      const desiredY = go ? gy * speed : 0;

      // Séparation entre aliens
      let sx = 0;
      let sy = 0;
      for (const o of alienHash.query(a.x, a.y, a.radius + 50, this.scratch)) {
        if (o === a) continue;
        const dx = a.x - o.x;
        const dy = a.y - o.y;
        const min = a.radius + o.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const k = (min - d) / d;
        const w = o.mass / (a.mass + o.mass);
        sx += dx * k * w;
        sy += dy * k * w;
      }

      a.vx = damp(a.vx, desiredX, 8, dt);
      a.vy = damp(a.vy, desiredY, 8, dt);
      a.x += (a.vx + a.kx) * dt + sx * 0.5;
      a.y += (a.vy + a.ky) * dt + sy * 0.5;
      a.kx = damp(a.kx, 0, 6, dt);
      a.ky = damp(a.ky, 0, 6, dt);

      // Collisions avec les soldats (poussée pondérée par la masse) + attaque
      a.attackCd -= dt;
      for (const s of soldierHash.query(a.x, a.y, a.radius + 30, this.scratchS)) {
        if (!s.alive) continue;
        const dx = s.x - a.x;
        const dy = s.y - a.y;
        const min = a.radius + s.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= (min + 4) * (min + 4)) continue;
        if (d2 < min * min && d2 > 0) {
          const d = Math.sqrt(d2);
          const overlap = (min - d) / d;
          const total = a.mass + s.mass;
          a.x -= dx * overlap * (s.mass / total);
          a.y -= dy * overlap * (s.mass / total);
          s.x += dx * overlap * (a.mass / total);
          s.y += dy * overlap * (a.mass / total);
        }
        if (a.chargeT > 0 && def.charge) {
          const d = Math.sqrt(d2) || 1;
          s.kx += (dx / d) * def.charge.knockback;
          s.ky += (dy / d) * def.charge.knockback;
          this.sim.damageSoldier(s, def.damage);
          a.chargeT = 0;
          a.attackCd = def.attackCooldown;
        } else if (a.attackCd <= 0) {
          this.sim.damageSoldier(s, def.damage);
          a.attackCd = def.attackCooldown;
        }
      }

      arena.constrain(a);
    }
  }

  private slam(a: AlienState): void {
    const slam = a.def.slam!;
    this.sim.events.push({ t: 'slam', x: a.x, y: a.y, r: slam.radius });
    a.slamCd = slam.cooldown;
    for (const s of this.sim.soldierHash.query(a.x, a.y, slam.radius + 30, this.scratchS)) {
      const dx = s.x - a.x;
      const dy = s.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!s.alive || d > slam.radius + s.radius) continue;
      s.kx += (dx / d) * slam.knockback;
      s.ky += (dy / d) * slam.knockback;
      this.sim.damageSoldier(s, slam.damage);
    }
  }

  /**
   * Un alien s'en prend à la squad (de n'importe quel joueur) la plus proche : il choisit
   * son soldat selon sa préférence PARMI cette squad, sinon marche vers son centre.
   */
  private pickTarget(a: AlienState, pref: TargetPref): void {
    const nearestSquad = this.sim.nearestSquad(a.x, a.y);
    if (nearestSquad) {
      a.goalX = nearestSquad.center.x;
      a.goalY = nearestSquad.center.y;
    }
    a.target = null;
    if (pref === 'center') return;
    let bestScore = Infinity;
    for (const s of this.sim.soldierHash.query(a.x, a.y, SEEK_RADIUS, this.scratchS)) {
      if (!s.alive || (nearestSquad && s.owner !== nearestSquad.owner)) continue;
      const d = Math.hypot(s.x - a.x, s.y - a.y);
      if (d > SEEK_RADIUS) continue;
      let score = d;
      if (pref === 'medic' && s.def.id === 'medic') score -= 600;
      else if (pref === 'tank' && s.def.id === 'tank') score -= 600;
      else if (pref === 'weakest') score -= (1 - s.hp / s.maxHp) * 400;
      if (score < bestScore) {
        bestScore = score;
        a.target = s;
      }
    }
  }
}
