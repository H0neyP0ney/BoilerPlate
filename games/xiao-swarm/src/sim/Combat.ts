import { Pool } from '@xiao/engine/sim';
import type { WeaponDef } from '../data/classes';
import type { AlienState, Projectile, SoldierState, Unit } from './entities';
import type { Sim } from './Sim';
import type { PlayerId, Team } from './types';

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
      lob: false,
      aoe: 0,
      knock: 0,
      rock: 0,
      rockTtl: 0,
      texture: '',
      team: 'aliens',
      owner: '',
      hit: new Set(),
    }),
    undefined,
    (p) => {
      // remise à zéro à la libération : un projectile recyclé ne doit garder aucun comportement du précédent
      p.hit.clear();
      p.lob = false;
      p.aoe = 0;
      p.knock = 0;
      p.rock = 0;
      p.flame = false;
    },
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
        if (s.capturedBy) continue; // avalé par une bulle : ne tire plus
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

    if (weapon.kind === 'grenade') {
      this.lob(s, target, weapon, damage, mx, my);
      return;
    }

    this.sim.events.push({ t: 'shot', id: s.id, cls: s.def.id, x: mx, y: my, aim: s.aim });
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
      p.lob = false;
      p.aoe = 0;
      p.knock = 0;
      p.texture = weapon.texture;
      p.team = s.team;
      p.owner = s.owner;
    }
  }

  /** Grenade : trajectoire droite au sol (l'arc n'est qu'un effet d'affichage), explosion à l'arrivée sur la cible anticipée. */
  private lob(s: SoldierState, target: Unit, weapon: WeaponDef, damage: number, mx: number, my: number): void {
    const { rng } = this.sim;
    const speed = weapon.projectileSpeed ?? 300;
    const flight = Math.min(1.4, Math.max(0.45, Math.hypot(target.x - mx, target.y - my) / speed));
    // vise où sera la cible à l'atterrissage, avec un léger écart
    const lx = target.x + target.vx * flight + rng.range(-14, 14);
    const ly = target.y + target.vy * flight + rng.range(-14, 14);
    this.launchLob(mx, my, lx, ly, flight, damage, weapon.aoe ?? 60, weapon.texture, s.team, s.owner);
  }

  /** Alien à tir en cloche (slime bleu) : boule visant la position anticipée d'un soldat, explosion au sol qui blesse les soldats. */
  throwBlob(a: AlienState, target: SoldierState): void {
    const lob = a.def.lob!;
    const { rng } = this.sim;
    const lx = target.x + target.vx * lob.flight + rng.range(-22, 22);
    const ly = target.y + target.vy * lob.flight + rng.range(-22, 22);
    const p = this.launchLob(a.x, a.y - a.radius * 0.6, lx, ly, lob.flight, lob.damage, lob.aoe, lob.texture, a.team, 'aliens');
    if (lob.rock) {
      p.rock = lob.rock.radius;
      p.rockTtl = lob.rock.ttl;
    }
  }

  /** Cracheur : un éventail de petites boules vers le soldat visé (elles blessent peu mais repoussent). */
  spray(a: AlienState, target: SoldierState): void {
    const sp = a.def.spray!;
    const { rng } = this.sim;
    const ox = a.x;
    const oy = a.y - a.radius * 0.5;
    const base = Math.atan2(target.y - 10 - oy, target.x - ox);
    for (let i = 0; i < sp.pellets; i++) {
      const ang = base + rng.range(-sp.spread / 2, sp.spread / 2);
      const speed = sp.speed * rng.range(0.75, 1.15);
      const p = this.projectiles.acquire();
      p.x = p.px = ox + Math.cos(ang) * a.radius * 0.8;
      p.y = p.py = oy + Math.sin(ang) * a.radius * 0.8;
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed;
      p.life = p.maxLife = sp.life * rng.range(0.85, 1.1);
      p.damage = sp.damage;
      p.pierce = 0;
      p.flame = false;
      p.lob = false;
      p.aoe = 0;
      p.knock = sp.push;
      p.texture = sp.texture;
      p.team = a.team;
      p.owner = 'aliens';
    }
  }

  private launchLob(mx: number, my: number, lx: number, ly: number, flight: number, damage: number, aoe: number, texture: string, team: Team, owner: PlayerId): Projectile {
    const p = this.projectiles.acquire();
    p.x = p.px = mx;
    p.y = p.py = my;
    p.vx = (lx - mx) / flight;
    p.vy = (ly - my) / flight;
    p.life = p.maxLife = flight;
    p.damage = damage;
    p.pierce = 0;
    p.flame = false;
    p.lob = true;
    p.aoe = aoe;
    p.knock = 0;
    p.texture = texture;
    p.team = team;
    p.owner = owner;
    return p;
  }

  private updateProjectiles(dt: number): void {
    const { alienHash, soldierHash } = this.sim;
    const pvp = this.sim.mode.pvp;
    this.projectiles.releaseWhere((p) => {
      if (!this.stepProjectile(p, dt, pvp, alienHash, soldierHash)) return false;
      // fin de course (touche, cible disparue, portée max) : l'affichage joue un petit impact
      if (!p.lob && !p.flame) this.sim.events.push({ t: 'impact', x: p.x, y: p.y, texture: p.texture });
      return true;
    });
  }

  /** Avance un projectile d'un pas ; renvoie true s'il doit être libéré. */
  private stepProjectile(p: Projectile, dt: number, pvp: boolean, alienHash: Sim['alienHash'], soldierHash: Sim['soldierHash']): boolean {
    {
      p.life -= dt;
      if (p.life <= 0) {
        if (p.lob) {
          // dernier pas jusqu'au point d'impact, puis explosion (dégâts de zone aux ennemis de son camp adverse)
          p.x += p.vx * (dt + p.life);
          p.y += p.vy * (dt + p.life);
          this.sim.addBlast(p.x, p.y, p.aoe, p.damage, p.team, p.owner);
          if (p.rock > 0) this.sim.addRock(p.x, p.y, p.rock, p.rockTtl);
        }
        return true;
      }
      if (p.flame) {
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
      }
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.lob) return false; // en l'air : rien ne l'arrête

      const hitR = p.flame ? 14 + (1 - p.life / p.maxLife) * 16 : 4;
      const len = Math.hypot(p.vx, p.vy) || 1;
      const fromAlien = p.team === 'aliens';
      if (!fromAlien) {
        for (const a of alienHash.query(p.x, p.y, hitR + MAX_UNIT_RADIUS, this.scratchA)) {
          if (!this.overlaps(p, a, hitR)) continue;
          this.sim.damage(a, p.damage, p.owner, p.vx / len, p.vy / len);
          if (p.pierce-- <= 0) return true;
        }
      }
      if (pvp || fromAlien) {
        for (const s of soldierHash.query(p.x, p.y, hitR + MAX_UNIT_RADIUS, this.scratchS)) {
          if (s.team === p.team || !this.overlaps(p, s, hitR)) continue;
          this.sim.damage(s, p.damage, p.owner, p.vx / len, p.vy / len);
          if (p.knock > 0) {
            s.kx += ((p.vx / len) * p.knock) / s.mass;
            s.ky += ((p.vy / len) * p.knock) / s.mass;
          }
          if (p.pierce-- <= 0) return true;
        }
      }
      return false;
    }
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
