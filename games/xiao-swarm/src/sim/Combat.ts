import { Pool } from '@xiao/engine/sim';
import { CRIT_MAX, CRIT_MUL, STIM_FIRE, DIFFICULTY } from '../config';
import { ALIENS } from '../data/aliens';
import type { WeaponDef } from '../data/classes';
import { projectileTexture } from '../data/damageTiers';
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
      id: 0,
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
      crit: false,
      lob: false,
      aoe: 0,
      knock: 0,
      puddle: 0,
      puddleTtl: 0,
      puddleSlow: 1,
      freeze: 0,
      texture: '',
      team: 'aliens',
      owner: '',
      hit: new Set(),
    }),
    (p) => {
      p.id = this.sim.ids.get(); // nouvel identifiant à chaque réutilisation d'un objet du pool
    },
    (p) => {
      // remise à zéro à la libération : un projectile recyclé ne doit garder aucun comportement du précédent
      p.hit.clear();
      p.lob = false;
      p.aoe = 0;
      p.knock = 0;
      p.puddle = 0;
      p.freeze = 0;
      p.flame = false;
      p.crit = false;
    },
  );
  /** Rafales en cours (power-up roquettes) : roquettes restantes et délai avant la prochaine. */
  /** Rafales en cours (une par joueur) ; `recent` = ids des aliens visés par les dernières roquettes (pour ne pas viser deux fois de suite le même). */
  private readonly barrages: { owner: PlayerId; left: number; total: number; t: number; recent: number[] }[] = [];
  private readonly scratchA: AlienState[] = [];
  private readonly scratchS: SoldierState[] = [];

  constructor(private readonly sim: Sim) {}

  update(dt: number): void {
    const { alienHash, soldierHash } = this.sim;
    const pvp = this.sim.mode.pvp;

    for (const squad of this.sim.squads) {
      const fireRate = squad.stats.get('fireRate') * (squad.buffs.stim > 0 ? STIM_FIRE : 1);
      const rangeMul = squad.stats.get('range');
      // upgrades Esprit d'équipe (+x % de dégâts par soldat vivant) et Dernier rempart (+x % par soldat manquant sous la taille max)
      const stand = squad.stats.get('lastStand');
      squad.lastStand = stand > 0 && squad.missing > 0;
      const damageMul = squad.stats.get('damage') * (1 + squad.stats.get('teamSpirit') * squad.soldiers.length + stand * squad.missing);
      for (const s of squad.soldiers) {
        if (s.capturedBy || s.frozen > 0 || s.stun > 0) continue; // avalé par une bulle, gelé ou étourdi : ne tire plus
        const weapon = s.def.weapon;
        s.cooldown -= dt * fireRate;
        s.retarget -= dt;
        if (s.retarget <= 0 || (s.target && !s.target.alive)) {
          const range = weapon.range * rangeMul;
          // cible la plus proche, sans priorité : un alien (pas dans son trou d'apparition ni totalement enterré : intouchable) ou le
          // glaçon d'un allié gelé (les coups alliés le brisent) ; une bulle qui a avalé un allié est un alien comme un autre
          const ice = soldierHash.nearest(s.x, s.y, range, (o) => o.alive && o.frozen > 0 && o !== s && this.sim.allied(s.owner, o), this.scratchS);
          const alien = alienHash.nearest(s.x, s.y, range, (a) => a.alive && this.sim.horde.targetable(a), this.scratchA);
          let target: Unit | undefined = ice && alien ? (Math.hypot(ice.x - s.x, ice.y - s.y) < Math.hypot(alien.x - s.x, alien.y - s.y) ? ice : alien) : (ice ?? alien);
          if (!target && pvp) {
            target = soldierHash.nearest(s.x, s.y, weapon.range * rangeMul, (o) => o.alive && o.team !== s.team, this.scratchS);
          }
          s.target = target ?? null;
          s.retarget = 0.15;
        }
        const t = s.target;
        if (!t || !t.alive || (t.kind === 'soldier' && t.frozen <= 0 && this.sim.allied(s.owner, t))) {
          s.target = null; // cible perdue (ou allié déjà dégelé)
          continue;
        }
        s.aim = Math.atan2(t.y - 10 - (s.y - 17), t.x - s.x);
        s.facing = Math.cos(s.aim) >= 0 ? 1 : -1;
        if (s.cooldown <= 0) {
          this.fire(s, t, weapon, damageMul, rangeMul, Math.min(CRIT_MAX, squad.stats.get('crit')) / 100);
          s.cooldown += weapon.cooldown;
          if (s.cooldown < 0) s.cooldown = 0;
        }
      }
    }
    this.updateBarrages(dt);
    this.updateProjectiles(dt);
  }

  /** Tirage de critique (stat `crit` de la squad) : aucun tirage de `rng` tant que la chance est nulle. */
  private rollCrit(chance: number): boolean {
    return chance > 0 && this.sim.rng.chance(Math.min(1, chance));
  }

  private fire(s: SoldierState, target: Unit, weapon: WeaponDef, damageMul: number, rangeMul = 1, critChance = 0): void {
    const { rng } = this.sim;
    const damage = weapon.damage * damageMul;
    // bouche du canon à 30 px devant le soldat ; si la cible est plus près (mêlée), elle est ramenée en deçà de la cible : sinon la balle
    // naîtrait derrière l'ennemi et le raterait
    const reach = Math.hypot(target.x - s.x, target.y - 10 - (s.y - 17));
    const k = Math.min(1, reach / 60);
    const mx = s.x + s.facing * 4 * k + Math.cos(s.aim) * 30 * k;
    const my = s.y - 17 + Math.sin(s.aim) * 30 * k;

    if (weapon.kind === 'beam') {
      const crit = this.rollCrit(critChance);
      this.sim.events.push({ t: 'beam', x1: mx, y1: my, x2: target.x, y2: target.y - 10 });
      if (crit) this.sim.events.push({ t: 'crit', x: target.x, y: target.y - 10, dmg: damage * CRIT_MUL });
      this.sim.damage(target, crit ? damage * CRIT_MUL : damage, s.owner, Math.cos(s.aim), Math.sin(s.aim));
      return;
    }

    if (weapon.kind === 'grenade') {
      const crit = this.rollCrit(critChance);
      this.lob(s, target, weapon, crit ? damage * CRIT_MUL : damage, mx, my, crit);
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
      p.crit = this.rollCrit(critChance);
      p.damage = p.crit ? damage * CRIT_MUL : damage;
      p.pierce = weapon.pierce ?? 0;
      p.flame = weapon.kind === 'flame';
      p.lob = false;
      p.aoe = 0;
      p.knock = 0;
      p.texture = projectileTexture(weapon.texture, damageMul); // blaster bleu : couleur selon le palier de dégâts
      p.team = s.team;
      p.owner = s.owner;
    }
  }

  /** Grenade : trajectoire droite au sol (l'arc n'est qu'un effet d'affichage), explosion à l'arrivée sur la cible anticipée. */
  private lob(s: SoldierState, target: Unit, weapon: WeaponDef, damage: number, mx: number, my: number, crit = false): void {
    const { rng } = this.sim;
    const speed = weapon.projectileSpeed ?? 300;
    const flight = Math.min(1.4, Math.max(0.45, Math.hypot(target.x - mx, target.y - my) / speed));
    // vise où sera la cible à l'atterrissage, avec un léger écart
    const lx = target.x + target.vx * flight + rng.range(-14, 14);
    const ly = target.y + target.vy * flight + rng.range(-14, 14);
    this.launchLob(mx, my, lx, ly, flight, damage, weapon.aoe ?? 60, weapon.texture, s.team, s.owner).crit = crit;
  }

  /** Alien à tir en cloche (slime bleu) : boule visant la position anticipée d'un soldat, explosion au sol qui blesse les soldats. */
  throwBlob(a: AlienState, target: SoldierState): void {
    const lob = a.def.lob!;
    const { rng } = this.sim;
    const n = lob.count ?? 1;
    const scatter = lob.scatter ?? (n > 1 ? 70 : 22); // plusieurs blobs : ils retombent éparpillés autour de la cible
    this.sim.events.push({ t: 'alienShot', id: a.id, alien: a.def.id, x: a.x, y: a.y - a.radius * 0.6 });
    for (let i = 0; i < n; i++) {
      const lead = lob.lead ? rng.range(lob.lead[0], lob.lead[1]) : 1; // part de l'anticipation (au hasard : pas toujours pile devant)
      const lx = target.x + target.vx * lob.flight * lead + rng.range(-scatter, scatter);
      const ly = target.y + target.vy * lob.flight * lead + rng.range(-scatter, scatter);
      this.launchLob(a.x, a.y - a.radius * 0.6, lx, ly, lob.flight * rng.range(0.92, 1.1), lob.damage * (a.revived ? DIFFICULTY.zombieDmgMul : 1) * a.esc, lob.aoe, lob.texture, a.team, 'aliens');
    }
  }

  /**
   * Slime de glace : lance un orbe de glace (alien-projectile `ice.orb`, destructible) en ligne droite vers la squad visée, avec une
   * anticipation partielle (`lead` × son déplacement pendant le trajet) ; il gèle le soldat qu'il touche.
   */
  iceShot(a: AlienState, target: SoldierState): void {
    const ice = a.def.ice!;
    const speed = ALIENS[ice.orb].speed;
    const squad = this.sim.squadOf(target.owner);
    const mx = a.x;
    const my = a.y - a.radius * 0.6;
    let vx = 0;
    let vy = 0;
    if (squad) {
      let n = 0;
      for (const s of squad.soldiers) {
        if (!s.alive || s.capturedBy || s.frozen > 0) continue;
        vx += s.vx;
        vy += s.vy;
        n++;
      }
      if (n > 0) {
        vx /= n;
        vy /= n;
      }
    }
    const base = squad?.center ?? target;
    const travel = Math.hypot(base.x - mx, base.y - my) / speed;
    const c = { x: base.x + vx * travel * ice.lead, y: base.y + vy * travel * ice.lead };
    const d = Math.hypot(c.x - mx, c.y - my) || 1;
    this.sim.events.push({ t: 'alienShot', id: a.id, alien: a.def.id, x: mx, y: my });
    this.sim.horde.launch(ice.orb, mx, a.y, (c.x - mx) / d, (c.y - my) / d); // posé au sol sous la bouche (il flotte au-dessus de son ombre)
  }

  /**
   * Cracheur : quelques boules en cloche autour de la position du soldat visé (anticipation réduite : `lead`). Chacune a son
   * télégraphe ; l'impact blesse sans repousser et laisse une flaque qui ralentit les soldats.
   */
  spray(a: AlienState, target: SoldierState): void {
    const sp = a.def.spray!;
    const { rng } = this.sim;
    this.sim.events.push({ t: 'alienShot', id: a.id, alien: a.def.id, x: a.x, y: a.y - a.radius * 0.6 });
    for (let i = 0; i < sp.pellets; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = Math.sqrt(rng.next()) * sp.scatter;
      const lx = target.x + target.vx * sp.flight * sp.lead + Math.cos(ang) * dist;
      const ly = target.y + target.vy * sp.flight * sp.lead + Math.sin(ang) * dist * 0.7;
      const flight = sp.flight * rng.range(0.92, 1.1);
      const p = this.launchLob(a.x, a.y - a.radius * 0.6, lx, ly, flight, sp.damage * (a.revived ? DIFFICULTY.zombieDmgMul : 1) * a.esc, sp.aoe, sp.texture, a.team, 'aliens');
      if (sp.puddle) {
        p.puddle = sp.puddle.radius;
        p.puddleTtl = sp.puddle.ttl;
        p.puddleSlow = sp.puddle.slow;
      }
    }
  }

  /**
   * Rafale de roquettes (power-up) : `count` roquettes tirées par les gunners de la squad, l'une après l'autre (une toutes les
   * `BARRAGE_INTERVAL` s : c'est le tir qui est étalé dans le temps, pas la vitesse des roquettes) en LIGNE DROITE vers des aliens
   * proches (ou éparpillées autour de la squad s'il n'y en a pas) ; elles explosent en zone au premier alien touché ou au point visé.
   */
  barrage(squad: Squad, count: number): void {
    // une seule rafale par joueur : un 2e ramassage allonge la rafale en cours au lieu d'en lancer une en parallèle (roquettes doublées)
    const running = this.barrages.find((b) => b.owner === squad.owner);
    if (running) {
      running.left += count;
      running.total += count;
      return;
    }
    this.barrages.push({ owner: squad.owner, left: count, total: count, t: 0, recent: [] });
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
        this.fireRocket(squad, b.total - b.left, b.recent);
        b.left--;
        b.t += BARRAGE_INTERVAL;
      }
      if (b.left <= 0) this.barrages.splice(i, 1);
    }
  }

  /** Une seule roquette, tirée par UN soldat ; chacune vise un alien différent des dernières (jamais deux roquettes sur la même cible d'affilée). */
  private fireRocket(squad: Squad, index: number, recent: number[]): void {
    const { rng } = this.sim;
    const gunners = squad.soldiers.filter((s) => s.alive && s.def.id === 'trooper');
    const shooters = gunners.length > 0 ? gunners : squad.soldiers.filter((s) => s.alive);
    if (shooters.length === 0) return;
    const src = shooters[index % shooters.length];
    const targets = this.sim.aliens.filter((a) => a.alive && Math.hypot(a.x - squad.center.x, a.y - squad.center.y) < 650);
    const fresh = targets.filter((a) => !recent.includes(a.id));
    const t = fresh.length > 0 ? rng.pick(fresh) : targets.length > 0 ? rng.pick(targets) : undefined;
    if (t) {
      recent.push(t.id);
      if (recent.length > Math.min(8, Math.max(0, targets.length - 1))) recent.shift();
    }
    const ang = rng.range(0, Math.PI * 2);
    const r = DIFFICULTY.rocketIdleRange * rng.range(0.85, 1.15); // sans cible : elle continue loin dans une direction au hasard
    const mx = src.x;
    const my = src.y - 17;
    // roquette en ligne droite : vise où sera la cible à l'arrivée ; explose au premier alien touché ou au point visé
    const reach = t ? Math.hypot(t.x - mx, t.y - my) / ROCKET_SPEED : 0;
    const lx = (t ? t.x + t.vx * reach : mx + Math.cos(ang) * r) + rng.range(-12, 12);
    const ly = (t ? t.y + t.vy * reach : my + Math.sin(ang) * r) + rng.range(-12, 12);
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
          // crachat (et toute boule à flaque) : pas de recul ; les autres boules repoussent comme avant
          const spit = p.puddle > 0 || p.texture === 'fx_spit';
          this.sim.addBlast(p.x, p.y, p.aoe, p.damage, p.team, p.owner, spit ? 0 : 300, spit ? 'spit' : p.texture === 'fx_blob_green' ? 'acid' : undefined);
          if (p.crit) this.sim.events.push({ t: 'crit', x: p.x, y: p.y - 10, dmg: p.damage });
          if (p.puddle > 0) this.sim.addPuddle(p.x, p.y, p.puddle, p.puddleTtl, p.puddleSlow);
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
          if (!this.sim.horde.targetable(a) || !this.overlaps(p, a, hitR)) continue; // dans son trou ou sous terre : la balle passe au-dessus
          if (p.aoe > 0) {
            // roquette : explose au premier alien touché (dégâts de zone, celui-ci compris)
            this.sim.addBlast(p.x, p.y, p.aoe, p.damage, p.team, p.owner, 300);
            return true;
          }
          this.sim.damage(a, p.damage, p.owner, p.vx / len, p.vy / len);
          if (p.crit && !p.flame) this.sim.events.push({ t: 'crit', x: a.x, y: a.y - 10, dmg: p.damage }); // flammes : pas d'effet (un par tick de brûlure)
          if (p.pierce-- <= 0) return true;
        }
      }
      if (!fromAlien) {
        // balle alliée sur un soldat gelé : elle brise un peu sa glace (`Sim.damage` → `chipIce`)
        for (const s of soldierHash.query(p.x, p.y, hitR + MAX_UNIT_RADIUS, this.scratchS)) {
          if (s.frozen <= 0 || !this.sim.allied(p.owner, s) || !this.overlaps(p, s, hitR)) continue;
          if (p.aoe > 0) {
            this.sim.addBlast(p.x, p.y, p.aoe, p.damage, p.team, p.owner, 300); // roquette : elle explose (la glace compte 1 coup)
            return true;
          }
          this.sim.damage(s, p.damage, p.owner);
          if (p.pierce-- <= 0) return true;
        }
      }
      if (pvp || fromAlien) {
        for (const s of soldierHash.query(p.x, p.y, hitR + MAX_UNIT_RADIUS, this.scratchS)) {
          if (s.team === p.team || !this.overlaps(p, s, hitR)) continue;
          if (p.freeze > 0) {
            if (p.damage > 0) this.sim.damage(s, p.damage, p.owner, p.vx / len, p.vy / len); // faibles dégâts
            this.sim.freezeHit(s, p.freeze); // la boucle de glace éclate : seul le soldat touché est pris dans un glaçon
            return true;
          }
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
