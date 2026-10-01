import { Pool } from '@xiao/engine/sim';
import { STIM_FIRE, ZOMBIE_MUL } from '../config';
import type { WeaponDef } from '../data/classes';
import type { AlienState, Projectile, SoldierState, Unit } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';
import type { PlayerId, Team } from './types';

/** Plus grand rayon d'alien (crab) : marge de recherche dans la grille spatiale. */
const MAX_UNIT_RADIUS = 55;
/** Rafale de roquettes : délai (s) entre deux roquettes (30 roquettes ≈ 3,6 s). */
const BARRAGE_INTERVAL = 0.12;
/** Roquettes du power-up : vitesse (px/s, ligne droite), rayon d'explosion, sprite (art/fx.ts). */
const ROCKET_SPEED = 720;
const ROCKET_AOE = 58;
export const ROCKET_TEXTURE = 'fx_rocket';

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
      puddle: 0,
      puddleTtl: 0,
      puddleSlow: 1,
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
      p.puddle = 0;
      p.flame = false;
    },
  );
  /** Rafales en cours (power-up roquettes) : roquettes restantes et délai avant la prochaine. */
  private readonly barrages: { owner: PlayerId; left: number; total: number; t: number }[] = [];
  private readonly scratchA: AlienState[] = [];
  private readonly scratchS: SoldierState[] = [];

  constructor(private readonly sim: Sim) {}

  update(dt: number): void {
    const { alienHash, soldierHash } = this.sim;
    const pvp = this.sim.mode.pvp;

    for (const squad of this.sim.squads) {
      const fireRate = squad.stats.get('fireRate') * (squad.buffs.stim > 0 ? STIM_FIRE : 1);
      const rangeMul = squad.stats.get('range');
      for (const s of squad.soldiers) {
        if (s.capturedBy) continue; // avalé par une bulle : ne tire plus
        const weapon = s.def.weapon;
        s.cooldown -= dt * fireRate;
        s.retarget -= dt;
        if (s.retarget <= 0 || (s.target && !s.target.alive)) {
          let target: Unit | undefined = alienHash.nearest(s.x, s.y, weapon.range * rangeMul, (a) => a.alive, this.scratchA);
          if (!target && pvp) {
            target = soldierHash.nearest(s.x, s.y, weapon.range * rangeMul, (o) => o.alive && o.team !== s.team, this.scratchS);
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
          this.fire(s, t, weapon, squad.stats.get('damage'), rangeMul);
          s.cooldown += weapon.cooldown;
          if (s.cooldown < 0) s.cooldown = 0;
        }
      }
    }
    this.updateBarrages(dt);
    this.updateProjectiles(dt);
  }

  private fire(s: SoldierState, target: Unit, weapon: WeaponDef, damageMul: number, rangeMul = 1): void {
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
    const life = weapon.life ?? ((weapon.range * rangeMul) / speed) * 1.15;
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
    const n = lob.count ?? 1;
    const scatter = n > 1 ? 70 : 22; // plusieurs blobs : ils retombent éparpillés autour de la cible
    for (let i = 0; i < n; i++) {
      const lx = target.x + target.vx * lob.flight + rng.range(-scatter, scatter);
      const ly = target.y + target.vy * lob.flight + rng.range(-scatter, scatter);
      const p = this.launchLob(a.x, a.y - a.radius * 0.6, lx, ly, lob.flight * rng.range(0.92, 1.1), lob.damage * (a.revived ? ZOMBIE_MUL : 1), lob.aoe, lob.texture, a.team, 'aliens');
      if (lob.rock) {
        p.rock = lob.rock.radius;
        p.rockTtl = lob.rock.ttl;
      }
    }
  }

  /**
   * Cracheur : quelques boules en cloche autour de la position du soldat visé (anticipation réduite : `lead`). Chacune a son
   * télégraphe ; l'impact blesse sans repousser et laisse une flaque qui ralentit les soldats.
   */
  spray(a: AlienState, target: SoldierState): void {
    const sp = a.def.spray!;
    const { rng } = this.sim;
    for (let i = 0; i < sp.pellets; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = Math.sqrt(rng.next()) * sp.scatter;
      const lx = target.x + target.vx * sp.flight * sp.lead + Math.cos(ang) * dist;
      const ly = target.y + target.vy * sp.flight * sp.lead + Math.sin(ang) * dist * 0.7;
      const flight = sp.flight * rng.range(0.92, 1.1);
      const p = this.launchLob(a.x, a.y - a.radius * 0.6, lx, ly, flight, sp.damage * (a.revived ? ZOMBIE_MUL : 1), sp.aoe, sp.texture, a.team, 'aliens');
      p.puddle = sp.puddle.radius;
      p.puddleTtl = sp.puddle.ttl;
      p.puddleSlow = sp.puddle.slow;
    }
  }

  /**
   * Rafale de roquettes (power-up) : `count` roquettes tirées par les gunners de la squad, l'une après l'autre (une toutes les
   * `BARRAGE_INTERVAL` s : c'est le tir qui est étalé dans le temps, pas la vitesse des roquettes) en LIGNE DROITE vers des aliens
   * proches (ou éparpillées autour de la squad s'il n'y en a pas) ; elles explosent en zone au premier alien touché ou au point visé.
   */
  barrage(squad: Squad, count: number): void {
    this.barrages.push({ owner: squad.owner, left: count, total: count, t: 0 });
  }

  private updateBarrages(dt: number): void {
    for (let i = this.barrages.length - 1; i >= 0; i--) {
      const b = this.barrages[i];
      const squad = this.sim.squadOf(b.owner);
      if (!squad || !squad.alive) {
        this.barrages.splice(i, 1);
        continue;
      }
      b.t -= dt;
      while (b.t <= 0 && b.left > 0) {
        this.fireRocket(squad, b.total - b.left);
        b.left--;
        b.t += BARRAGE_INTERVAL;
      }
      if (b.left <= 0) this.barrages.splice(i, 1);
    }
  }

  private fireRocket(squad: Squad, index: number): void {
    const { rng } = this.sim;
    const gunners = squad.soldiers.filter((s) => s.alive && s.def.id === 'gunner');
    const shooters = gunners.length > 0 ? gunners : squad.soldiers.filter((s) => s.alive);
    if (shooters.length === 0) return;
    const src = shooters[index % shooters.length];
    const targets = this.sim.aliens.filter((a) => a.alive && Math.hypot(a.x - squad.center.x, a.y - squad.center.y) < 650);
    const t = targets.length > 0 ? rng.pick(targets) : undefined;
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(80, 300);
    const mx = src.x;
    const my = src.y - 17;
    // roquette en ligne droite : vise où sera la cible à l'arrivée ; explose au premier alien touché ou au point visé
    const reach = t ? Math.hypot(t.x - mx, t.y - my) / ROCKET_SPEED : 0;
    const lx = (t ? t.x + t.vx * reach : squad.center.x + Math.cos(ang) * r) + rng.range(-12, 12);
    const ly = (t ? t.y + t.vy * reach : squad.center.y + Math.sin(ang) * r) + rng.range(-12, 12);
    const flight = Math.max(0.08, Math.hypot(lx - mx, ly - my) / ROCKET_SPEED);
    const p = this.projectiles.acquire();
    p.x = p.px = mx;
    p.y = p.py = my;
    p.vx = (lx - mx) / flight;
    p.vy = (ly - my) / flight;
    p.life = p.maxLife = flight;
    p.damage = 20 * squad.stats.get('damage');
    p.pierce = 0;
    p.flame = false;
    p.lob = false;
    p.aoe = ROCKET_AOE;
    p.knock = 0;
    p.texture = ROCKET_TEXTURE;
    p.team = src.team;
    p.owner = src.owner;
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
      if (!p.lob && !p.flame && p.aoe <= 0) this.sim.events.push({ t: 'impact', x: p.x, y: p.y, texture: p.texture });
      return true;
    });
  }

  /** Avance un projectile d'un pas ; renvoie true s'il doit être libéré. */
  private stepProjectile(p: Projectile, dt: number, pvp: boolean, alienHash: Sim['alienHash'], soldierHash: Sim['soldierHash']): boolean {
    {
      p.life -= dt;
      if (p.life <= 0) {
        if (p.lob || p.aoe > 0) {
          // dernier pas jusqu'au point d'impact, puis explosion (dégâts de zone aux ennemis de son camp adverse)
          p.x += p.vx * (dt + p.life);
          p.y += p.vy * (dt + p.life);
          // crachat : pas de recul (la flaque ralentit à la place) ; les autres boules repoussent comme avant
          this.sim.addBlast(p.x, p.y, p.aoe, p.damage, p.team, p.owner, p.puddle > 0 ? 0 : 300, p.puddle > 0 ? 'spit' : p.texture === 'fx_blob_green' ? 'acid' : undefined);
          if (p.puddle > 0) this.sim.addPuddle(p.x, p.y, p.puddle, p.puddleTtl, p.puddleSlow);
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
          if (p.aoe > 0) {
            // roquette : explose au premier alien touché (dégâts de zone, celui-ci compris)
            this.sim.addBlast(p.x, p.y, p.aoe, p.damage, p.team, p.owner, 300);
            return true;
          }
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
    this.barrages.length = 0;
    this.projectiles.releaseAll();
  }
}
