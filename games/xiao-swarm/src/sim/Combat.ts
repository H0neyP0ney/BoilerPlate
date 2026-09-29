import { Pool } from '@xiao/engine/sim';
import type { WeaponDef } from '../data/classes';
import type { AlienState, Projectile, SoldierState, Unit } from './entities';
import type { Sim } from './Sim';

/** Plus grand rayon d'alien (crab) : marge de recherche dans la grille spatiale. */
const MAX_UNIT_RADIUS = 55;

/**
 * Tir automatique : chaque soldat vise l'ennemi le plus proche dans sa portée
 * (aliens, et soldats adverses si le mode est PvP), indépendamment de son
 * déplacement (GDD §9). Les projectiles sont des données ; l'affichage les dessine.
 */
export class Combat {
  readonly projectiles = new Pool<Projectile>(
    () => ({
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      damage: 0,
      pierce: 0,
      flame: false,
      texture: '',
      team: 'aliens',
      owner: '',
      hit: new Set(),
    }),
    undefined,
    (p) => p.hit.clear(),
  );
  private readonly scratchA: AlienState[] = [];
  private readonly scratchS: SoldierState[] = [];

  constructor(private readonly sim: Sim) {}

  update(dt: number): void {
    const { alienHash, soldierHash } = this.sim;
    const pvp = this.sim.mode.pvp;

    for (const squad of this.sim.squads) {
      const fireRate = squad.stats.get('fireRate');
      for (const s of squad.soldiers) {
        const weapon = s.def.weapon;
        s.cooldown -= dt * fireRate;
        s.retarget -= dt;
        if (s.retarget <= 0 || (s.target && !s.target.alive)) {
          let target: Unit | undefined = alienHash.nearest(s.x, s.y, weapon.range, (a) => a.alive, this.scratchA);
          if (!target && pvp) {
            target = soldierHash.nearest(s.x, s.y, weapon.range, (o) => o.alive && o.team !== s.team, this.scratchS);
          }
          s.target = target ?? null;
          s.retarget = 0.15;
        }
        const t = s.target;
        if (!t || !t.alive) {
          s.target = null;
          continue;
        }
        s.aim = Math.atan2(t.y - 10 - (s.y - 17), t.x - s.x);
        s.facing = Math.cos(s.aim) >= 0 ? 1 : -1;
        if (s.cooldown <= 0) {
          this.fire(s, t, weapon, squad.stats.get('damage'));
          s.cooldown += weapon.cooldown;
          if (s.cooldown < 0) s.cooldown = 0;
        }
      }
    }
    this.updateProjectiles(dt);
  }

  private fire(s: SoldierState, target: Unit, weapon: WeaponDef, damageMul: number): void {
    const { rng } = this.sim;
    const damage = weapon.damage * damageMul;
    const mx = s.x + s.facing * 4 + Math.cos(s.aim) * 30;
    const my = s.y - 17 + Math.sin(s.aim) * 30;

    if (weapon.kind === 'beam') {
      this.sim.events.push({ t: 'beam', x1: mx, y1: my, x2: target.x, y2: target.y - 10 });
      this.sim.damage(target, damage, s.owner, Math.cos(s.aim), Math.sin(s.aim));
      return;
    }

    const pellets = weapon.pellets ?? 1;
    const speed = weapon.projectileSpeed ?? 600;
    const life = weapon.life ?? (weapon.range / speed) * 1.15;
    const spread = weapon.spread ?? 0;
    for (let i = 0; i < pellets; i++) {
      const a = pellets > 1 ? s.aim + (i / (pellets - 1) - 0.5) * spread + rng.range(-0.04, 0.04) : s.aim + rng.range(-spread, spread);
      const p = this.projectiles.acquire();
      const k = rng.range(0.9, 1.05);
      p.x = p.px = mx;
      p.y = p.py = my;
      p.vx = Math.cos(a) * speed * k;
      p.vy = Math.sin(a) * speed * k;
      p.life = p.maxLife = life;
      p.damage = damage;
      p.pierce = weapon.pierce ?? 0;
      p.flame = weapon.kind === 'flame';
      p.texture = weapon.texture;
      p.team = s.team;
      p.owner = s.owner;
    }
  }

  private updateProjectiles(dt: number): void {
    const { alienHash, soldierHash } = this.sim;
    const pvp = this.sim.mode.pvp;
    this.projectiles.releaseWhere((p) => {
      p.life -= dt;
      if (p.life <= 0) return true;
      if (p.flame) {
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
      }
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const hitR = p.flame ? 14 + (1 - p.life / p.maxLife) * 16 : 4;
      const len = Math.hypot(p.vx, p.vy) || 1;
      for (const a of alienHash.query(p.x, p.y, hitR + MAX_UNIT_RADIUS, this.scratchA)) {
        if (!this.overlaps(p, a, hitR)) continue;
        this.sim.damage(a, p.damage, p.owner, p.vx / len, p.vy / len);
        if (p.pierce-- <= 0) return true;
      }
      if (pvp) {
        for (const s of soldierHash.query(p.x, p.y, hitR + MAX_UNIT_RADIUS, this.scratchS)) {
          if (s.team === p.team || !this.overlaps(p, s, hitR)) continue;
          this.sim.damage(s, p.damage, p.owner, p.vx / len, p.vy / len);
          if (p.pierce-- <= 0) return true;
        }
      }
      return false;
    });
  }

  private overlaps(p: Projectile, u: Unit, hitR: number): boolean {
    if (!u.alive || p.hit.has(u.id)) return false;
    const dx = u.x - p.x;
    const dy = u.y - 10 - p.y;
    const r = u.radius + hitR;
    if (dx * dx + dy * dy > r * r) return false;
    p.hit.add(u.id);
    return true;
  }

  clear(): void {
    this.projectiles.releaseAll();
  }
}
