import { damp, type Point } from '@xiao/engine/sim';
import { CROWD, DIFFICULTY, GRAB_IMMUNE, ZOMBIE_MUL } from '../config';
import { ALIENS, type AlienId, type TargetPref } from '../data/aliens';
import type { AlienState, Corpse, SoldierState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Rayon dans lequel un alien cherche une cible précise (au-delà : il marche vers la squad la plus proche). */
const SEEK_RADIUS = 700;
/** Places d'aliens en plus du plafond pour les costauds (voir `Horde.canSpawn`). */
const ELITE_RESERVE = 12;
/** La formation ramène vite le soldat à son slot : l'impulsion de la langue est majorée pour que la traction soit visible. */
const TONGUE_BOOST = 2.6;
/** Traction maximale de la langue (px avant majoration) : assez pour sortir l'unité de l'escouade, pas pour l'isoler. */
const TONGUE_MAX_PULL = 100;

/**
 * IA de la horde : chaque alien choisit une cible selon sa préférence (GDD §11),
 * se dirige vers elle en évitant ses congénères, et attaque au contact.
 * Charge (beast) et slam (crab) sont les seules attaques à knockback (GDD §19).
 * Fonctionne avec N squads (battle royale) : chaque alien vise la plus proche.
 */
export class Horde {
  private readonly scratch: AlienState[] = [];
  private readonly scratchS: SoldierState[] = [];
  private readonly steerV = { x: 0, y: 0 };

  constructor(private readonly sim: Sim) {}

  get maxAliens(): number {
    const m = this.sim.mode.maxAliens;
    return Math.round((m.base + m.perPlayer * this.sim.aliveSquads.length) * DIFFICULTY.alienCountMul);
  }

  /**
   * Plafond d'aliens. Les costauds (≥ 60 PV : slime bleu, bête, crabe) ont `ELITE_RESERVE` places de plus : sans ça, les
   * essaims de petits slimes remplissent le plafond en permanence et les gros n'apparaissent jamais.
   */
  canSpawn(type?: AlienId): boolean {
    const reserve = type && ALIENS[type].hp >= 60 ? ELITE_RESERVE : 0;
    return this.sim.aliens.length < this.maxAliens + reserve;
  }

  /** Spawn hors écran autour d'une squad, en groupe. */
  spawnNear(squad: Squad, type: AlienId, count: number, distance: number, hpMul = 1): void {
    const { rng, arena } = this.sim;
    const def = ALIENS[type];
    const c = squad.center;
    let origin: Point | null = null;
    // Jamais sur un joueur : hors de vue de TOUTES les squads vivantes (pas seulement celle qui reçoit la vague).
    const safe = distance * 0.85;
    const others = this.sim.aliveSquads;
    const farFromPlayers = (p: Point): boolean => others.every((o) => Math.hypot(o.center.x - p.x, o.center.y - p.y) - o.radius >= safe);
    let fallback: Point | null = null;
    for (let tries = 0; tries < 60 && !origin; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = distance + rng.range(60, 180);
      const p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
      if (!arena.isFree(p, def.radius + 20)) continue;
      if (farFromPlayers(p)) origin = p;
      else fallback ??= p;
    }
    origin ??= fallback;
    if (!origin) return;
    for (let i = 0; i < count && this.canSpawn(type); i++) {
      const p = { x: origin.x + rng.range(-50, 50), y: origin.y + rng.range(-50, 50), radius: def.radius };
      arena.constrain(p);
      const made = this.create(def, p.x, p.y, 1, false, hpMul);
      this.sim.aliens.push(made);
      this.announce(made);
    }
  }

  /** Crée un alien (vivant, pas encore dans la simulation). `hpFrac` : part de ses PV ; `revived` : déjà ressuscité une fois. */
  private create(def: (typeof ALIENS)[AlienId], x: number, y: number, hpFrac: number, revived: boolean, hpMul = 1): AlienState {
    const { rng } = this.sim;
    const c = this.sim.nearestSquad(x, y)?.center ?? { x, y };
    const maxHp = def.hp * this.sim.alienHpMul * (def.boss ? DIFFICULTY.bossHpMul : DIFFICULTY.alienHpMul) * hpMul * (revived ? ZOMBIE_MUL : 1);
    return {
      kind: 'alien',
      id: this.sim.ids.get(),
      team: 'aliens',
      def,
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      radius: def.radius,
      mass: def.mass,
      hp: maxHp * hpFrac,
      maxHp,
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
      lobCd: 1 + rng.next() * 1.5,
      tongueCd: 1.5 + rng.next() * 2,
      sprayCd: 1 + rng.next() * 1.5,
      rushCd: 1.5 + rng.next() * 2,
      rushWind: 0,
      rushT: 0,
      rushDx: 0,
      rushDy: 0,
      leapCd: def.leap ? def.leap.every / 2 : 0,
      leapT: 0,
      leapFromX: x,
      leapFromY: y,
      leapX: x,
      leapY: y,
      reviveCd: 1 + rng.next() * 2,
      castT: 0,
      castCorpse: 0,
      captive: null,
      trailCd: 0,
      revived,
    };
  }

  /** Fait apparaître un alien à un endroit précis (résurrection par un chaman), si le plafond le permet. */
  spawnAt(type: AlienId, x: number, y: number, hpFrac = 1, revived = false): void {
    if (!this.canSpawn(type)) return;
    this.sim.aliens.push(this.create(ALIENS[type], x, y, hpFrac, revived));
  }

  /** Annonce l'arrivée d'un boss (bandeau + flèche dans le HUD). */
  private announce(a: AlienState): void {
    if (a.def.boss) this.sim.events.push({ t: 'boss', id: a.id, alien: a.def.id, kind: a.def.boss.kind });
  }

  /** Flaque de slime la plus proche de `a` (libre, ou déjà choisie par `a`) dans un rayon `max`. */
  private nearestCorpse(a: AlienState, max: number): Corpse | undefined {
    let best: Corpse | undefined;
    let bestD = max;
    for (const c of this.sim.corpses) {
      if (c.claimed !== 0 && c.claimed !== a.id) continue;
      const d = Math.hypot(c.x - a.x, c.y - a.y);
      if (d > bestD) continue;
      best = c;
      bestD = d;
    }
    return best;
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
      let gd = Math.hypot(gx, gy) || 1;
      gx /= gd;
      gy /= gd;

      let speed = def.speed * DIFFICULTY.alienSpeedMul * this.sim.stasisAt(a.x, a.y);
      const power = a.revived ? ZOMBIE_MUL : 1; // zombie : dégâts ×3
      let contactOverride: number | undefined;
      // Slime de feu : sème des flammes derrière lui tant qu'il avance
      if (def.trail) {
        a.trailCd -= dt;
        if (a.trailCd <= 0 && Math.hypot(a.vx, a.vy) > 15) {
          this.sim.addFire(a.x, a.y + 4, def.trail.radius, def.trail.ttl, def.trail.dps);
          a.trailCd = def.trail.every;
        }
      }
      // Bulle : immobile tant qu'elle digère son prisonnier, qu'elle porte en elle
      if (def.capture && a.captive) {
        const s = a.captive;
        if (!s.alive || s.capturedBy !== a.id) a.captive = null;
        else {
          speed = 0;
          s.x = a.x;
          s.y = a.y;
          s.vx = s.vy = s.kx = s.ky = 0;
          this.sim.damageSoldier(s, def.capture.dps * dt, null, true);
        }
      }
      // Chaman : incante sur la flaque d'un slime mort, marche vers la flaque la plus proche, sinon reste en retrait
      if (def.revive) {
        const r = def.revive;
        a.reviveCd -= dt;
        if (a.castT > 0) {
          const c = this.sim.corpses.find((x) => x.id === a.castCorpse);
          if (!c) a.castT = 0; // la flaque a disparu : incantation annulée
          else {
            a.castT -= dt;
            speed = 0;
            if (a.castT <= 0) {
              this.sim.reviveCorpse(c, r.hpFrac);
              a.reviveCd = r.cooldown;
            }
          }
        } else if (a.reviveCd <= 0) {
          const c = this.nearestCorpse(a, r.range);
          if (c) {
            c.claimed = a.id;
            a.castCorpse = c.id;
            a.castT = r.cast;
          }
        }
        const goal = a.castT > 0 ? undefined : this.nearestCorpse(a, 700);
        if (goal) {
          gx = goal.x - a.x;
          gy = goal.y - a.y;
          gd = Math.hypot(gx, gy) || 1;
          gx /= gd;
          gy /= gd;
          contactOverride = r.range * 0.6;
        }
      }
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

      // Saut écrasant : préparation (télégraphe), vol jusqu'au point d'impact, écrasement, récupération. Rien d'autre pendant la séquence.
      if (def.leap) {
        const L = def.leap;
        if (a.leapT > 0) {
          const total = L.windup + L.flight + L.recover;
          const before = total - a.leapT;
          a.leapT = Math.max(0, a.leapT - dt);
          const elapsed = total - a.leapT;
          const land = L.windup + L.flight;
          if (elapsed > L.windup) {
            const k = Math.min(1, (elapsed - L.windup) / L.flight);
            a.x = a.leapFromX + (a.leapX - a.leapFromX) * k;
            a.y = a.leapFromY + (a.leapY - a.leapFromY) * k;
          }
          if (before < land && elapsed >= land) this.leapImpact(a);
          a.vx = a.vy = a.kx = a.ky = 0;
          continue;
        }
        a.leapCd -= dt;
        if (a.leapCd <= 0) this.startLeap(a); // vise la squad de sa cible, sinon la plus proche (le crabe vise un centre, pas un soldat)
      }

      // Charge télégraphiée : s'arrête, montre la zone (rushWind), puis fonce tout droit dans la direction verrouillée
      if (def.rush) {
        const r = def.rush;
        a.rushCd -= dt;
        if (a.rushWind > 0) {
          a.rushWind -= dt;
          speed = 0;
          if (a.rushWind <= 0) a.rushT = r.length / r.speed;
        } else if (a.rushT > 0) {
          a.rushT -= dt;
          gx = a.rushDx;
          gy = a.rushDy;
          speed = r.speed;
          this.rushHit(a);
        } else if (a.rushCd <= 0 && a.target && gd < r.length + 80) {
          a.rushWind = r.windup;
          a.rushCd = r.cooldown;
          a.rushDx = gx;
          a.rushDy = gy;
        }
      }
      // Soigneur : rayons de soin vers les alliés les plus blessés à portée
      if (def.healBeam) this.healAllies(a, dt);
      // Langue : attrape le soldat visé et le tire vers lui
      if (def.tongue) {
        a.tongueCd -= dt;
        if (a.tongueCd <= 0 && a.target && gd < def.tongue.range) {
          // cible déjà grabée (langue ou bulle) : immunisée, on retente bientôt
          a.tongueCd = this.tongue(a, a.target) ? def.tongue.cooldown * rng.range(0.85, 1.2) : 0.6;
        }
      }
      // Spray de boules qui repoussent
      if (def.spray) {
        a.sprayCd -= dt;
        if (a.sprayCd <= 0 && a.target && gd < def.spray.range) {
          this.sim.combat.spray(a, a.target);
          a.sprayCd = def.spray.cooldown * rng.range(0.85, 1.2);
        }
      }

      // Tireur en cloche : lance dès que la cible est à portée et se tient à distance au lieu de foncer dessus
      if (def.lob) {
        a.lobCd -= dt;
        if (a.lobCd <= 0 && a.target && gd < def.lob.range) {
          this.sim.combat.throwBlob(a, a.target);
          a.lobCd = def.lob.cooldown * rng.range(0.85, 1.2);
        }
      }
      // les tireurs (cloche, langue, spray) se tiennent à distance au lieu de foncer sur leur cible
      const hold = def.revive ? 380 : ((def.lob && !def.lob.keepMoving ? def.lob.range : undefined) ?? def.spray?.range ?? def.tongue?.range ?? def.healBeam?.hold);
      const contact = contactOverride ?? (hold && a.target ? hold * 0.8 : a.target ? a.radius + a.target.radius + 4 : 0);
      const go = (gd > contact && a.rushWind <= 0) || a.chargeT > 0 || a.rushT > 0;
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
      this.steerV.x = a.vx;
      this.steerV.y = a.vy;
      arena.steer(a.x, a.y, a.radius, this.steerV);
      a.vx = this.steerV.x;
      a.vy = this.steerV.y;
      a.x += (a.vx + a.kx) * dt + sx * 0.5;
      a.y += (a.vy + a.ky) * dt + sy * 0.5;
      a.kx = damp(a.kx, 0, 6, dt);
      a.ky = damp(a.ky, 0, 6, dt);

      // Collisions avec les soldats (poussée pondérée par la masse) + attaque
      a.attackCd -= dt;
      for (const s of soldierHash.query(a.x, a.y, a.radius + 30, this.scratchS)) {
        if (!s.alive || s.capturedBy) continue;
        const dx = s.x - a.x;
        const dy = s.y - a.y;
        const min = a.radius + s.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= (min + 4) * (min + 4)) continue;
        if (def.capture) {
          // au contact : avale le soldat (un seul à la fois) ; sans prisonnier elle ne fait rien d'autre
          if (!a.captive && s.invulnerable <= 0 && s.grabbed <= 0) {
            a.captive = s;
            s.capturedBy = a.id;
            this.sim.events.push({ t: 'capture', alien: a.id, soldier: s.id });
          }
          continue;
        }
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
          this.sim.damageSoldier(s, def.damage * power);
          a.chargeT = 0;
          a.attackCd = def.attackCooldown;
        } else if (a.attackCd <= 0) {
          this.sim.damageSoldier(s, def.damage * power);
          a.attackCd = def.attackCooldown;
        }
      }

      arena.constrain(a);
    }
  }

  /** Soigneur : soigne en continu les `targets` alliés blessés les plus abîmés à portée ; un événement par rayon toutes les 0,3 s (affichage). */
  private healAllies(a: AlienState, dt: number): void {
    const hb = a.def.healBeam!;
    const near = this.sim.alienHash.query(a.x, a.y, hb.range + 60, this.scratch);
    const wounded: AlienState[] = [];
    for (const o of near) {
      if (o === a || !o.alive || o.hp >= o.maxHp || Math.hypot(o.x - a.x, o.y - a.y) > hb.range) continue;
      wounded.push(o);
    }
    wounded.sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp);
    a.sprayCd -= dt; // sert ici de minuteur d'affichage des rayons
    const show = a.sprayCd <= 0;
    if (show) a.sprayCd = 0.3;
    for (const o of wounded.slice(0, hb.targets)) {
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * hb.pct * dt);
      if (show) this.sim.events.push({ t: 'healBeam', from: a.id, to: o.id, dur: 0.38 });
    }
  }

  /** Début d'un saut : vise là où la squad ciblée sera à l'impact (centre + vitesse moyenne × temps avant l'impact). */
  private startLeap(a: AlienState): void {
    const L = a.def.leap!;
    const squad = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
    if (!squad) return;
    let vx = 0;
    let vy = 0;
    let n = 0;
    for (const s of squad.soldiers) {
      if (!s.alive) continue;
      vx += s.vx;
      vy += s.vy;
      n++;
    }
    const lead = L.windup + L.flight;
    const p = { x: squad.center.x + (n ? vx / n : 0) * lead, y: squad.center.y + (n ? vy / n : 0) * lead, radius: a.radius };
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > L.maxDist) {
      p.x = a.x + (dx / d) * L.maxDist;
      p.y = a.y + (dy / d) * L.maxDist;
    }
    this.sim.arena.constrain(p);
    a.leapFromX = a.x;
    a.leapFromY = a.y;
    a.leapX = p.x;
    a.leapY = p.y;
    a.leapT = L.windup + L.flight + L.recover;
    a.leapCd = L.every;
  }

  /** Atterrissage : onde de choc (affichage) et mort de tout soldat écrasé sous la zone d'impact. */
  private leapImpact(a: AlienState): void {
    const L = a.def.leap!;
    this.sim.events.push({ t: 'slam', x: a.x, y: a.y, r: L.radius });
    for (const s of this.sim.soldierHash.query(a.x, a.y, L.radius + 30, this.scratchS)) {
      if (!s.alive || Math.hypot(s.x - a.x, s.y - a.y) > L.radius + s.radius) continue;
      this.sim.damageSoldier(s, s.hp + s.maxHp); // écrasé : tué d'un coup (sauf invulnérabilité d'une recrue fraîche)
    }
  }

  /** Soldats sur le passage du charger : gros dégâts + recul dans le sens de la charge (une seule fois chacun : invulnérabilité brève). */
  private rushHit(a: AlienState): void {
    const r = a.def.rush!;
    for (const s of this.sim.soldierHash.query(a.x, a.y, r.width / 2 + a.radius + 60, this.scratchS)) {
      if (!s.alive || s.invulnerable > 0) continue;
      const dx = s.x - a.x;
      const dy = s.y - a.y;
      const along = dx * a.rushDx + dy * a.rushDy;
      const lateral = Math.abs(dx * a.rushDy - dy * a.rushDx);
      if (along < -a.radius || along > a.radius + s.radius + 26 || lateral > r.width / 2 + s.radius) continue;
      this.sim.damageSoldier(s, r.damage);
      s.kx += (a.rushDx * r.knockback) / s.mass;
      s.ky += (a.rushDy * r.knockback) / s.mass;
      s.invulnerable = 0.6;
    }
  }

  /** Langue : tire le soldat vers l'alien d'une fraction de la distance (le recul est amorti par `CROWD.knockDamp`, donc déplacement = impulsion / amortissement). */
  private tongue(a: AlienState, s: SoldierState): boolean {
    if (s.capturedBy || s.grabbed > 0) return false;
    const t = a.def.tongue!;
    const dx = a.x - s.x;
    const dy = a.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const pull = Math.min(d * t.pull, TONGUE_MAX_PULL, Math.max(0, d - (a.radius + s.radius + 22)));
    s.kx += (dx / d) * pull * CROWD.knockDamp * TONGUE_BOOST;
    s.ky += (dy / d) * pull * CROWD.knockDamp * TONGUE_BOOST;
    s.grabbed = GRAB_IMMUNE;
    this.sim.damageSoldier(s, t.damage);
    this.sim.events.push({ t: 'tongue', alien: a.id, target: s.id, dur: 0.5 });
    return true;
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
