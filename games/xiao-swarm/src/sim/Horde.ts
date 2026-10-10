import { damp, type Point } from '@xiao/engine/sim';
import { CHASE, CROWD, DIFFICULTY, RELOCATE, ALIEN_SPAWN_HOLD, FREEZE, GRAB_IMMUNE, MELEE_REACH } from '../config';
import { ALIENS, zombieStats, type AlienId, type TargetPref } from '../data/aliens';
import type { AlienState, Corpse, SoldierState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Bulle qui a capturé un soldat : elle l'éloigne de la squad jusqu'à `CAPTURE_DRAG_DIST` px au-delà de son rayon, à cette part de sa vitesse. */
const CAPTURE_DRAG_DIST = 150;
/** Marge (px) entre deux lurkers enterrés, en plus de leurs hitbox : ils ne s'enterrent jamais tous au même endroit, ils se répartissent autour de la squad. */
const LURKER_SPACING = 70;
/** Au bout de ce délai (s) à chercher une place, un lurker se contente de `LURKER_MIN_SPACING` px d'écart (un groupe ne met pas des secondes à s'enterrer). */
const LURKER_PATIENCE = 0.8;
const LURKER_MIN_SPACING = 20;
const CAPTURE_DRAG_SPEED = 0.28; // 0,35 avant l'intégration du ×1,25 de vitesse (ancien `alienSpeedMul`) à la vitesse de base des aliens
/** Rayon dans lequel un alien cherche une cible précise (au-delà : il marche vers la squad la plus proche). */
const SEEK_RADIUS = 700;
/** Chaman : px de distance « gagnés » par PV de base du cadavre (un Spitter de 60 PV passe devant un slime 200 px plus près). */
const CORPSE_SIZE_PREF = 4;
/** Places d'aliens en plus du plafond pour les costauds (voir `Horde.canSpawn`). */
const ELITE_RESERVE = 12;
/** La formation ramène vite le soldat à son slot : l'impulsion de la langue est majorée pour que la traction soit visible. */
const TONGUE_BOOST = 2.6;
/** Traction maximale de la langue (px avant majoration) : assez pour sortir l'unité de l'escouade, pas pour l'isoler. */
const TONGUE_MAX_PULL = 100;

/**
 * IA de la horde : chaque alien choisit une cible selon sa préférence (GDD §11),
 * se dirige vers elle en évitant ses congénères, et attaque au contact.
 * Slam (crab) et charge (rhinocéros) sont les seules attaques à knockback (GDD §19).
 * Fonctionne avec N squads (battle royale) : chaque alien vise la plus proche.
 */
export class Horde {
  private readonly scratch: AlienState[] = [];
  private readonly scratchS: SoldierState[] = [];
  private readonly steerV = { x: 0, y: 0 };

  constructor(private readonly sim: Sim) {}

  get maxAliens(): number {
    const m = this.sim.mode.maxAliens;
    return Math.round(m.base + m.perPlayer * this.sim.aliveSquads.length);
  }

  /**
   * Plafond d'aliens à l'apparition (`ModeDef.maxAliens`). Les costauds (≥ 60 PV) ont `ELITE_RESERVE` places de plus : sans ça, les
   * essaims de petits aliens remplissent le plafond en permanence et les gros n'apparaissent jamais. Un boss apparaît toujours.
   */
  canSpawn(type?: AlienId): boolean {
    if (type && ALIENS[type].boss) return true; // carte pleine : un boss était sauté sans bruit (et la timeline repartait sans lui)
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
    const esc = this.sim.escalation; // +10 % par boss déjà tué
    const maxHp = def.hp * hpMul * (revived ? zombieStats().hpMul : 1) * esc;
    const maxShield = def.shield ? maxHp * def.shield.pct : 0;
    this.sim.metrics.spawnedHp += maxHp * hpFrac + maxShield;
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
      shield: maxShield,
      maxShield,
      shieldT: def.shield ? def.shield.regenDelay : 0,
      alive: true,
      target: null,
      goalX: c.x,
      goalY: c.y,
      farT: 0,
      flank: 0,
      sinkT: 0,
      retarget: 0,
      attackCd: 0,
      slamWind: 0,
      slamCd: 2,
      lobCd: 1 + rng.next() * 1.5,
      tongueCd: 1.5 + rng.next() * 2,
      sprayCd: 1 + rng.next() * 1.5,
      cloudCd: def.cloud ? def.cloud.every * rng.range(0.4, 0.8) : def.frost ? def.frost.every * rng.range(0.3, 0.6) : 0,
      rushCd: 1.5 + rng.next() * 2,
      rushWind: 0,
      rushT: 0,
      rushDx: 0,
      rushHits: new Set<number>(),
      rushDy: 0,
      rushX: x,
      rushY: y,
      leapCd: def.leap ? def.leap.every / 2 : def.burrow ? def.burrow.every * 0.6 : 0, // le même compteur sert à l'enfouissement du Scarab
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
      enraged: 0,
      noXp: this.sim.waves.replaying, // rejeu de vague pendant un combat de boss : pas de globe d'XP (mais des recrues possibles)
      noRecruit: false,
      instant: false,
      esc,
      revives: 0,
      reviveLock: 0,
      age: 0,
      swarmCd: def.swarm ? def.swarm.every : 0,
      lurkBlockT: 0,
      swarmT: 0,
      swarmAcc: 0,
      lurkPhase: 0,
      lurkT: 0,
      spikeAng: 0,
    };
  }

  /**
   * Fait apparaître `count` aliens en groupe, tous au même endroit : à `radius` px de `center`, dans une direction tirée au hasard
   * (à l'écran : tutoriel). Renvoie ceux qui ont été créés. Un point occupé par le décor est rapproché de `center`.
   */
  spawnAround(center: Point, type: AlienId, count: number, radius: number, angle?: number): AlienState[] {
    const { rng, arena } = this.sim;
    const def = ALIENS[type];
    const out: AlienState[] = [];
    const a = angle ?? rng.range(0, Math.PI * 2); // `angle` imposé : le tutoriel annonce d'où viennent les premiers aliens
    let origin = { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
    for (let tries = 0; tries < 8 && !arena.isFree(origin, def.radius + 10); tries++) {
      const r = radius * (1 - 0.08 * (tries + 1));
      origin = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
    }
    for (let i = 0; i < count && this.canSpawn(type); i++) {
      const p = { x: origin.x + rng.range(-40, 40), y: origin.y + rng.range(-40, 40), radius: def.radius };
      arena.constrain(p);
      const made = this.create(def, p.x, p.y, 1, false);
      this.sim.aliens.push(made);
      out.push(made);
    }
    return out;
  }

  /**
   * Fait apparaître `count` aliens EN CERCLE autour de `center` : régulièrement répartis sur un anneau de `radius` px (départ à l'angle
   * `start`), l'escouade se retrouve encerclée. Un point occupé par le décor est rapproché de `center`. Renvoie ceux qui ont été créés.
   */
  spawnRing(center: Point, type: AlienId, count: number, radius: number, start: number): AlienState[] {
    const { rng, arena } = this.sim;
    const def = ALIENS[type];
    const out: AlienState[] = [];
    for (let i = 0; i < count && this.canSpawn(type); i++) {
      const a = start + (i / count) * Math.PI * 2;
      let r = radius;
      let p = { x: center.x + Math.cos(a) * r + rng.range(-12, 12), y: center.y + Math.sin(a) * r + rng.range(-12, 12), radius: def.radius };
      for (let tries = 0; tries < 8 && !arena.isFree(p, def.radius + 10); tries++) {
        r = radius * (1 - 0.08 * (tries + 1));
        p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, radius: def.radius };
      }
      arena.constrain(p);
      const made = this.create(def, p.x, p.y, 1, false);
      this.sim.aliens.push(made);
      out.push(made);
    }
    return out;
  }

  /** Fait apparaître un alien à un endroit précis (invocation ou résurrection par un chaman), si le plafond le permet ; il ne donne jamais d'XP. */
  spawnAt(type: AlienId, x: number, y: number, hpFrac = 1, revived = false, instant = false): void {
    if (!this.canSpawn(type)) return;
    const made = this.create(ALIENS[type], x, y, hpFrac, revived);
    made.instant = instant; // surgit sur place : pas de trou d'apparition, ni de délai avant d'agir
    made.noXp = true; // invoqué (essaim de la Gling Mère) ou ressuscité (chaman) : ne laisse jamais de globe d'XP
    made.noRecruit = true; // ni de recrue
    this.sim.aliens.push(made);
  }

  /** Œuf d'un boss tué : sur le cadavre (ramené hors des obstacles), sur place, 1000 PV exacts, sans XP ni recrue. Ne dépend pas du plafond d'aliens. */
  spawnEgg(x: number, y: number): void {
    const def = ALIENS.boss_egg;
    const p = { x, y, radius: def.radius };
    this.sim.arena.constrain(p);
    const egg = this.create(def, p.x, p.y, 1, false);
    egg.maxHp = egg.hp = def.hp; // exacts : ni escalade ni multiplicateur
    egg.instant = true; // pas de trou d'apparition, ni de délai avant d'être ciblable
    egg.noXp = true;
    egg.noRecruit = true;
    this.sim.aliens.push(egg);
  }

  /** `count` aliens enragés (niveau 1 : plus rapides, attaquent plus vite) qui surgissent sur place en cercle autour de (x, y) : araignées des boules du Giant Crab. */
  spawnEnragedRing(type: AlienId, x: number, y: number, count: number): void {
    const start = this.sim.rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const ang = start + (i / count) * Math.PI * 2;
      const p = { x: x + Math.cos(ang) * 32, y: y + Math.sin(ang) * 22, radius: ALIENS[type].radius };
      this.sim.arena.constrain(p);
      const before = this.sim.aliens.length;
      this.spawnAt(type, p.x, p.y, 1, false, true);
      if (this.sim.aliens.length > before) this.sim.aliens[this.sim.aliens.length - 1].enraged = 1;
    }
  }

  /**
   * Gèle le soldat `s` (`FREEZE.hp` PV de gel) : il ne bouge plus, ne tire plus et sort du contrôle de foule, mais reste attaquable par
   * les aliens ; les tirs alliés le dégèlent (`Sim.chipIce`). Pas d'alien « glaçon » : c'est un état du soldat, dessiné sur sa vue.
   */
  freezeSoldier(s: SoldierState): void {
    if (this.sim.ending) return; // séquence de fin : plus personne ne gèle
    s.frozen = FREEZE.hp;
    s.iceInvuln = FREEZE.invuln; // le temps de voir la glace se former : elle n'est pas brisée dans la même rafale
    s.vx = s.vy = s.kx = s.ky = 0;
    s.target = null;
  }

  /** Annonce l'arrivée d'un boss (bandeau + flèche dans le HUD). */
  private announce(a: AlienState): void {
    if (a.def.boss) this.sim.events.push({ t: 'boss', id: a.id, alien: a.def.id, kind: a.def.boss.kind });
  }

  /** Flaque de slime la plus proche de `a` (libre, ou déjà choisie par `a`) dans un rayon `max`. */
  private nearestCorpse(a: AlienState, max: number): Corpse | undefined {
    let best: Corpse | undefined;
    let bestD = Infinity;
    for (const c of this.sim.corpses) {
      if (c.claimed !== 0 && c.claimed !== a.id) continue;
      const d = Math.hypot(c.x - a.x, c.y - a.y);
      if (d > max) continue;
      const score = d - ALIENS[c.type].hp * CORPSE_SIZE_PREF; // les gros aliens d'abord, à distance comparable
      if (score >= bestD) continue;
      best = c;
      bestD = score;
    }
    return best;
  }

  /** Vitesse d'écoulement des cooldowns spéciaux d'un boss enragé (−30 % par niveau, plancher à −90 %). */
  private cdRate(a: AlienState): number {
    return (a.enraged ? 1 / Math.max(0.1, 1 - DIFFICULTY.bossEnrageCooldownCut * a.enraged) : 1) * a.esc;
  }

  /**
   * Alien qui sort de son trou d'apparition (`ALIEN_SPAWN_HOLD` s après son arrivée, comme l'animation `EMERGE_*` de view/UnitViews.ts) :
   * immobile et INVULNÉRABLE, les soldats ne le visent pas. Pas pour le lurker (il creuse son propre trou) ni un ressuscité (il sort de sa flaque).
   */
  /**
   * Enfouissement (`BURIED`) : 'full' = totalement enterré (Scarab sous terre : intouchable, invisible), 'semi' = semi-enterré (lurker en
   * embuscade : 50 % des dégâts), 'none' sinon, y compris pendant les animations (s'enterrer, se déterrer : 100 % des dégâts).
   */
  burial(a: AlienState): 'none' | 'semi' | 'full' {
    if (a.def.burrow && a.lurkPhase === 2) return 'full';
    if (a.def.lurk && a.lurkPhase >= 2 && a.lurkPhase <= 4) return 'semi';
    return 'none';
  }

  /** Les soldats peuvent le viser et le toucher : ni dans son trou d'apparition, ni totalement enterré. */
  targetable(a: AlienState): boolean {
    return !this.isEmerging(a) && this.burial(a) !== 'full';
  }

  isEmerging(a: AlienState): boolean {
    return !a.def.lurk && !a.revived && !a.instant && !a.def.projectile && a.age < ALIEN_SPAWN_HOLD;
  }

  update(dt: number): void {
    const { alienHash, soldierHash, arena, rng } = this.sim;
    if (this.sim.aliveSquads.length === 0) return;

    for (const a of this.sim.aliens) {
      if (!a.alive) continue;
      const def = a.def;

      // Œuf de boss : immobile et inoffensif, il attend d'être détruit
      if (def.egg) {
        a.vx = a.vy = a.kx = a.ky = 0;
        continue;
      }

      // Bouclier (Scarab) : se régénère vite une fois qu'il n'a plus subi de dégâts depuis `regenDelay` s
      if (def.shield && a.maxShield > 0) {
        a.shieldT += dt;
        if (a.shieldT >= def.shield.regenDelay && a.shield < a.maxShield) a.shield = Math.min(a.maxShield, a.shield + (a.maxShield / def.shield.regenTime) * dt);
      }

      if (def.projectile) {
        this.updateOrb(a, dt); // orbe de glace : file tout droit, gèle le premier soldat touché
        continue;
      }
      // s'enterre avant d'être déplacé (recyclage des traînards) : immobile, n'attaque plus
      if (a.sinkT > 0) {
        a.vx = a.vy = a.kx = a.ky = 0;
        continue;
      }

      // Ciblage (pas à chaque tick)
      a.retarget -= dt;
      if (a.retarget <= 0 || (a.target && !a.target.alive)) {
        this.pickTarget(a, def.target);
        a.retarget = 0.4 + rng.next() * 0.3;
      }
      if (def.lurk) {
        this.updateLurker(a, dt);
        continue;
      }
      if (def.burrow && this.updateBurrow(a, dt)) continue; // enterré / en train de ressortir : rien d'autre
      const goalX = a.target ? a.target.x : a.goalX;
      const goalY = a.target ? a.target.y : a.goalY;
      let gx = goalX - a.x;
      let gy = goalY - a.y;
      let gd = Math.hypot(gx, gy) || 1;
      gx /= gd;
      gy /= gd;

      let speed = def.speed * this.sim.stasisAt(a.x, a.y) * a.esc;
      if (def.burrow && a.lurkPhase === 4) {
        // Scarab ressorti : fonce tout droit vers le point anticipé (direction verrouillée), sans s'arrêter au contact
        gx = a.rushDx;
        gy = a.rushDy;
        gd = Infinity;
      }
      // mode contournement (traînard tiré au sort) : vers le point où la squad sera, sur son flanc (`gd` reste la vraie distance : portées inchangées)
      if (a.flank !== 0 && this.chaseDir(a, goalX, goalY, gd, speed)) {
        gx = this.steerV.x;
        gy = this.steerV.y;
      }
      if (def.dash && a.target && gd < def.dash.range) speed *= def.dash.speedMul;
      const power = (a.revived ? zombieStats().dmgMul : 1) * a.esc; // zombie : bonus de dégâts (config) ; escalade : +10 % par boss tué
      a.age += dt;
      if (def.boss) {
        const level = Math.floor(a.age / DIFFICULTY.bossEnrageEvery); // un boss qui traîne s'enrage toutes les `every` s, sans fin
        if (level > a.enraged) {
          a.enraged = level;
          this.sim.events.push({ t: 'bossEnrage', id: a.id, alien: def.id, level });
        }
      }
      if (a.revived) speed *= zombieStats().speedMul; // enragé : plus rapide, attaque plus vite
      else if (a.enraged) speed *= 1 + DIFFICULTY.bossEnrageSpeed * a.enraged;
      const rate = (a.revived ? zombieStats().attackMul : 1 + DIFFICULTY.bossEnrageAttack * a.enraged) * a.esc; // cadence d'attaque (cooldowns écoulés plus vite)
      const cdRate = this.cdRate(a); // capacités spéciales (slam, saut, charge) : cooldown réduit
      let contactOverride: number | undefined;
      /** Bulle qui emporte son prisonnier à l'écart de la squad (vitesse imposée, remplace le déplacement normal). */
      let drag: { x: number; y: number } | null = null;
      // Slime de feu : sème des flammes derrière lui tant qu'il avance
      if (def.trail) {
        a.trailCd -= dt;
        if (a.trailCd <= 0 && Math.hypot(a.vx, a.vy) > 15) {
          this.sim.addFire(a.x, a.y + 4, def.trail.radius, def.trail.ttl, def.trail.dps * a.esc);
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
          this.sim.damageSoldier(s, def.capture.dps * a.esc * dt, null, true);
          // elle tire sa proie à l'écart de la squad (pour la dévorer tranquille), puis s'immobilise
          const sq = this.sim.squadOf(s.owner);
          if (sq) {
            const ax = a.x - sq.center.x;
            const ay = a.y - sq.center.y;
            const ad = Math.hypot(ax, ay) || 1;
            if (ad < sq.radius + CAPTURE_DRAG_DIST) drag = { x: (ax / ad) * def.speed * CAPTURE_DRAG_SPEED, y: (ay / ad) * def.speed * CAPTURE_DRAG_SPEED };
          }
        }
      }
      // Chaman : incante sur la flaque d'un slime mort, marche vers la flaque la plus proche, sinon reste en retrait
      if (def.revive) {
        const r = def.revive;
        a.reviveCd -= dt;
        if (a.reviveLock > 0) a.reviveLock -= dt; // repos après `maxRevives` résurrections
        if (a.castT > 0) {
          const c = this.sim.corpses.find((x) => x.id === a.castCorpse);
          if (!c) a.castT = 0; // la flaque a disparu : incantation annulée
          else {
            a.castT -= dt;
            speed = 0;
            if (a.castT <= 0) {
              this.sim.reviveCorpse(c, r.hpFrac);
              a.reviveCd = r.cooldown;
              if (++a.revives >= r.maxRevives) {
                a.revives = 0;
                a.reviveLock = r.lockout; // 3 résurrections : plus aucune pendant `lockout` s
              }
            }
          }
        } else if (a.reviveCd <= 0 && a.reviveLock <= 0) {
          const c = this.nearestCorpse(a, r.range);
          if (c) {
            c.claimed = a.id;
            a.castCorpse = c.id;
            a.castT = r.cast;
          }
        }
        const goal = a.castT > 0 || a.reviveLock > 0 ? undefined : this.nearestCorpse(a, 700); // au repos, il ne court plus après les flaques
        if (goal) {
          gx = goal.x - a.x;
          gy = goal.y - a.y;
          gd = Math.hypot(gx, gy) || 1;
          gx /= gd;
          gy /= gd;
          contactOverride = r.range * 0.6;
        }
      }
      // Boss Gling : toutes les `every` s il s'arrête et fait apparaître ses glings en continu pendant `duration` s
      let swarming = false;
      if (def.swarm) {
        const w = def.swarm;
        if (a.swarmT > 0) {
          swarming = true;
          a.swarmT -= dt;
          a.swarmAcc += dt;
          const gap = w.duration / w.count;
          while (a.swarmAcc >= gap) {
            a.swarmAcc -= gap;
            const ang = rng.range(0, Math.PI * 2);
            const d = a.radius * rng.range(0.9, 1.3);
            const p = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d * 0.7, radius: ALIENS[w.spawn].radius };
            arena.constrain(p);
            this.spawnAt(w.spawn, p.x, p.y);
          }
        } else if ((a.swarmCd -= dt) <= 0) {
          a.swarmT = w.duration;
          a.swarmAcc = 0;
          a.swarmCd = w.every;
        }
      }
      if (def.slam) {
        a.slamCd -= dt * cdRate;
        if (a.slamWind > 0) {
          a.slamWind -= dt;
          speed = 0;
          if (a.slamWind <= 0) this.slam(a);
        } else if (a.slamCd <= 0 && a.target && gd < def.slam.radius * 0.8) {
          a.slamWind = 0.45;
        }
      }

      // Couronne de pics (Giant Crab) : immobile pendant le télégraphe et la poussée des pics
      if (def.spikeRing && a.lurkPhase !== 0 && this.updateSpikeRing(a, dt)) {
        a.vx = a.vy = a.kx = a.ky = 0;
        if (a.leapT > 0) a.leapT = Math.max(0, a.leapT - dt); // la récupération du saut continue pendant les pics
        continue;
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
          if (before < land && elapsed >= land) {
            this.leapImpact(a);
            if (def.spikeRing) this.startSpikeRing(a); // à la réception : la couronne de pics se prépare
          }
          a.vx = a.vy = a.kx = a.ky = 0;
          continue;
        }
        a.leapCd -= dt * cdRate;
        if (a.leapCd <= 0) this.startLeap(a); // vise la squad de sa cible, sinon la plus proche (le crabe vise un centre, pas un soldat)
      }

      // Charge télégraphiée : s'arrête, montre la zone (rushWind), puis fonce tout droit dans la direction verrouillée
      if (def.rush) {
        const r = def.rush;
        a.rushCd -= dt * cdRate;
        if (a.rushWind > 0) {
          a.rushWind -= dt;
          speed = 0;
          if (a.rushWind <= 0) {
            a.rushT = r.length / r.speed;
            a.rushHits.clear();
            a.trailCd = 0; // la traînée commence dès le départ de la charge
          }
        } else if (a.rushT > 0) {
          a.rushT -= dt;
          gx = a.rushDx;
          gy = a.rushDy;
          speed = r.speed;
          this.rushHit(a);
          if (r.trail) {
            a.trailCd -= dt;
            if (a.trailCd <= 0) {
              this.rushTrail(a, r.trail);
              a.trailCd = r.trail.every;
            }
          }
          if (a.rushT <= 0 && r.burst) this.rushBurst(a, r.burst); // fin de la charge : orbes dans toutes les directions
        } else if (a.rushCd <= 0 && a.target && gd < r.length + 80) {
          a.rushWind = r.windup;
          a.rushCd = r.cooldown;
          a.rushDx = gx;
          a.rushDy = gy;
          a.rushX = a.x;
          a.rushY = a.y;
        }
      }
      // Langue : attrape le soldat visé et le tire vers lui
      if (def.tongue) {
        a.tongueCd -= dt * rate;
        if (a.tongueCd <= 0 && a.target && gd < def.tongue.range) {
          // cible déjà grabée (langue ou bulle) : immunisée, on retente bientôt
          a.tongueCd = this.tongue(a, a.target) ? def.tongue.cooldown * rng.range(0.85, 1.2) : 0.6;
        }
      }
      // Spray de boules qui repoussent
      if (def.spray) {
        a.sprayCd -= dt * rate;
        if (a.sprayCd <= 0 && a.target && gd < def.spray.range) {
          this.sim.combat.spray(a, a.target);
          a.sprayCd = def.spray.cooldown * rng.range(0.85, 1.2);
        }
      }
      // Nuage ralentissant posé sur la squad visée, un peu en avant de sa course
      if (def.cloud) {
        a.cloudCd -= dt * rate;
        if (a.cloudCd <= 0 && a.target) {
          const C = def.cloud;
          const at = this.sim.squadOf(a.target.owner)?.center ?? a.target;
          if (Math.hypot(at.x - a.x, at.y - a.y) < C.range) {
            this.sim.addPuddle(at.x + a.target.vx * C.lead, at.y + a.target.vy * C.lead, C.radius, C.ttl, C.slow);
            a.cloudCd = C.every;
          } else a.cloudCd = 0.5; // trop loin : il retente bientôt
        }
      }
      // Flocons à distance : petits nuages de glace autour de la squad visée (y entrer = gelé)
      if (def.frost) {
        a.cloudCd -= dt * rate;
        const sq = a.cloudCd <= 0 && a.target ? this.sim.squadOf(a.target.owner) : undefined;
        if (sq) {
          const F = def.frost;
          if (Math.hypot(sq.center.x - a.x, sq.center.y - a.y) < F.range) {
            // bord réel de la squad : le soldat le plus éloigné de son centre (la formation s'étale plus que son rayon théorique)
            let edge = sq.radius;
            for (const s of sq.soldiers) if (s.alive && !s.capturedBy && !s.frozen) edge = Math.max(edge, Math.hypot(s.x - sq.center.x, s.y - sq.center.y) + s.radius);
            const start = rng.range(0, Math.PI * 2);
            for (let i = 0; i < F.count; i++) {
              const ang = start + (i / F.count) * Math.PI * 2 + rng.range(-0.3, 0.3); // 3 nuages d'un coup, répartis tout autour
              const d = edge + F.radius + rng.range(F.gap[0], F.gap[1]);
              this.sim.addPuddle(sq.center.x + Math.cos(ang) * d, sq.center.y + Math.sin(ang) * d, F.radius, F.ttl, 1, true);
            }
            a.cloudCd = F.every * rng.range(0.9, 1.15);
          } else a.cloudCd = 0.5;
        }
      }

      // Tireur en cloche : lance dès que la cible est à portée et se tient à distance au lieu de foncer dessus
      if (def.lob) {
        a.lobCd -= dt * rate;
        // cible « centre » (Giant Crab) : pas de soldat visé, on lance sur le soldat le plus proche du centre de la squad (il en porte la vitesse : tir devant la squad)
        const lobTarget = a.target ?? this.centerSoldier(a);
        if (a.lobCd <= 0 && lobTarget && gd < def.lob.range) {
          this.sim.combat.throwBlob(a, lobTarget);
          a.lobCd = def.lob.cooldown * rng.range(0.85, 1.2);
        }
      }
      // Slime de glace : tire sa boucle de glace dès que la cible est à portée, et se tient à distance
      if (def.ice) {
        a.lobCd -= dt * rate;
        if (a.lobCd <= 0 && a.target && gd < def.ice.range) {
          this.sim.combat.iceShot(a, a.target);
          a.lobCd = def.ice.cooldown * rng.range(0.85, 1.2);
        }
      }
      // Bâtisseur : télégraphe puis fait surgir des murs en arc autour de la squad, côté opposé au lanceur
      if (def.wall) {
        a.lobCd -= dt * rate;
        if (a.lobCd <= 0 && a.target && gd < def.wall.range) {
          this.castWalls(a, a.target);
          a.lobCd = def.wall.cooldown * rng.range(0.85, 1.2);
        }
      }
      // les tireurs (cloche, langue, spray) se tiennent à distance au lieu de foncer sur leur cible
      const hold = def.revive ? 380 : ((def.lob && !def.lob.keepMoving ? def.lob.range : undefined) ?? def.spray?.range ?? def.tongue?.range ?? def.wall?.range ?? def.ice?.range);
      const contact = contactOverride ?? (hold && a.target ? hold * 0.8 : a.target ? a.radius + a.target.radius + MELEE_REACH : 0);
      const go = (gd > contact && a.rushWind <= 0) || a.rushT > 0;
      const emerging = swarming || this.isEmerging(a); // sort du sol : immobile le temps de l'animation d'apparition
      const desiredX = emerging ? 0 : drag ? drag.x : go ? gx * speed : 0;
      const desiredY = emerging ? 0 : drag ? drag.y : go ? gy * speed : 0;

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
      a.attackCd -= dt * rate;
      for (const s of soldierHash.query(a.x, a.y, a.radius + 30, this.scratchS)) {
        if (!s.alive || s.capturedBy) continue; // avalé par une bulle : intouchable (un soldat gelé, lui, reste attaquable)
        const dx = s.x - a.x;
        const dy = s.y - a.y;
        const min = a.radius + s.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= (min + MELEE_REACH) * (min + MELEE_REACH)) continue; // portée de mêlée (et de capture d'une bulle)
        if (def.capture) {
          // au contact : avale le soldat (un seul à la fois) ; sans prisonnier elle ne fait rien d'autre
          if (!a.captive && !s.capturedBy && !s.frozen && s.invulnerable <= 0 && s.grabbed <= 0) {
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
        if (a.attackCd <= 0 && def.cleave) {
          this.cleave(a, def.damage * power);
          a.attackCd = def.attackCooldown;
        } else if (a.attackCd <= 0) {
          if (def.oneShot) this.sim.damageSoldier(s, s.hp + s.shield + 1, null, false); // un coup = un mort
          else this.sim.damageSoldier(s, def.damage * power);
          a.attackCd = def.attackCooldown;
        }
      }

      arena.constrain(a);
    }
    this.relocateStragglers(dt);
  }

  /**
   * Recyclage des traînards (`RELOCATE`, méthode Vampire Survivors) : l'alien trop loin depuis trop longtemps s'arrête et s'enterre
   * (`sinkT`, `RELOCATE.sink` s), puis il est remplacé par un alien neuf (nouvel identifiant : il sort du sol comme une apparition de
   * vague) placé hors écran devant la squad la plus proche, avec ses PV, son bouclier, son escalade et ses marques (pas d'XP, pas de
   * recrue). À la même place dans la liste : l'ordre ne change pas.
   */
  private relocateStragglers(dt: number): void {
    const { aliens, metrics } = this.sim;
    for (let i = 0; i < aliens.length; i++) {
      const a = aliens[i];
      const sq = this.sim.nearestSquad(a.x, a.y);
      if (!sq) return;
      if (a.sinkT <= 0) {
        // pas encore en train de s'enterrer : assez loin depuis assez longtemps ?
        if (!a.alive || a.def.boss || a.def.egg || a.def.projectile || a.captive || a.castT > 0 || a.lurkPhase > 0 || Math.hypot(a.x - sq.center.x, a.y - sq.center.y) < RELOCATE.far) {
          a.farT = 0;
          continue;
        }
        if ((a.farT += dt) < RELOCATE.after) continue;
        if (this.sim.rng.chance(RELOCATE.flankChance)) {
          // contournement : il garde sa place mais coupe la route de la squad, sur un flanc ; répit de `flankFor` s avant un nouveau tirage
          if (a.flank === 0) a.flank = (this.sim.rng.chance(0.5) ? 1 : -1) * this.sim.rng.range(0.4, 1);
          a.farT = -RELOCATE.flankFor;
        } else a.sinkT = RELOCATE.sink; // il s'arrête et s'enterre
        continue;
      }
      if (!a.alive) continue;
      a.sinkT = Math.max(1e-3, a.sinkT - dt); // sous terre (reste > 0 : immobile) tant qu'il n'a pas trouvé où ressortir
      if (a.sinkT > 1e-3) continue;
      const p = this.aheadOf(sq, a.radius);
      if (!p) continue; // pas de place libre : il reste sous terre, on réessaie au tick suivant
      const spawned = metrics.spawnedHp;
      const made = this.create(a.def, p.x, p.y, 1, a.revived);
      metrics.spawnedHp = spawned; // un déplacement, pas des PV en plus (mesures d'équilibrage)
      made.maxHp = a.maxHp;
      made.hp = a.hp;
      made.maxShield = a.maxShield;
      made.shield = a.shield;
      made.esc = a.esc;
      made.noXp = a.noXp;
      made.noRecruit = a.noRecruit;
      made.revives = a.revives;
      made.reviveLock = a.reviveLock;
      aliens[i] = made;
    }
  }

  /**
   * Mode contournement (`CHASE`) : direction dans `steerV`, vers `t` (le soldat visé, sinon le centre de la squad la plus proche : les
   * aliens hors de `SEEK_RADIUS` n'ont pas de cible). La course de la squad est prolongée (vitesse et virage actuels : ligne droite ou
   * arc de cercle) ; l'alien vise le premier point de cette course qu'il peut atteindre à temps (sinon celui dont il est le moins en
   * retard), décalé sur son flanc. Faux si la squad ne court pas (poursuite directe).
   */
  private chaseDir(a: AlienState, tx: number, ty: number, gd: number, speed: number): boolean {
    const sq = a.target ? this.sim.squadOf(a.target.owner) : this.sim.nearestSquad(a.x, a.y);
    if (!sq) return false;
    const { vel } = sq;
    const vs = Math.hypot(vel.x, vel.y);
    if (vs < CHASE.minSpeed) return false;
    const ux = vel.x / vs;
    const uy = vel.y / vs;
    const w = Math.max(-CHASE.maxTurn, Math.min(CHASE.maxTurn, sq.turn));
    let bestX = tx;
    let bestY = ty;
    let bestGap = Infinity;
    for (let s = CHASE.step; s <= CHASE.horizon + 1e-6; s += CHASE.step) {
      // déplacement le long de la course : avance (sin) et dérive latérale (1 − cos) d'un arc de rayon vs / w
      const fwd = Math.abs(w) < 1e-3 ? vs * s : (Math.sin(w * s) / w) * vs;
      const side = Math.abs(w) < 1e-3 ? 0 : ((1 - Math.cos(w * s)) / w) * vs;
      const px = tx + ux * fwd - uy * side;
      const py = ty + uy * fwd + ux * side;
      const gap = Math.hypot(px - a.x, py - a.y) - speed * s;
      if (gap < bestGap) {
        bestGap = gap;
        bestX = px;
        bestY = py;
      }
      if (gap <= 0) break; // atteignable à temps : premier point d'interception
    }
    const off = a.flank * CHASE.flank * Math.min(1, Math.max(0, (gd - CHASE.flankNear) / CHASE.flankFade));
    const ax = bestX - uy * off - a.x;
    const ay = bestY + ux * off - a.y;
    const d = Math.hypot(ax, ay);
    if (d < 1) return false;
    this.steerV.x = ax / d;
    this.steerV.y = ay / d;
    return true;
  }

  /** Lance un alien-projectile (`def.projectile`, ex. orbe de glace) depuis (`x`, `y`) dans la direction (`dx`, `dy`) normalisée. */
  launch(type: AlienId, x: number, y: number, dx: number, dy: number): void {
    const def = ALIENS[type];
    const spawned = this.sim.metrics.spawnedHp;
    const o = this.create(def, x, y, 1, false);
    this.sim.metrics.spawnedHp = spawned; // un projectile, pas une menace à équilibrer
    o.hp = o.maxHp = def.hp; // PV exacts, sans multiplicateur de difficulté
    o.noXp = o.noRecruit = true;
    o.rushDx = dx;
    o.rushDy = dy;
    o.lurkT = def.projectile!.life;
    o.vx = dx * def.speed;
    o.vy = dy * def.speed;
    this.sim.aliens.push(o);
  }

  /** Orbe de glace en vol : tout droit, au-dessus du décor ; au contact d'un soldat dégâts + gel puis il se brise, sinon il se brise en fin de course. */
  private updateOrb(a: AlienState, dt: number): void {
    const P = a.def.projectile!;
    a.age += dt;
    const sp = a.def.speed * this.sim.stasisAt(a.x, a.y);
    a.vx = a.rushDx * sp;
    a.vy = a.rushDy * sp;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    const b = this.sim.arena.bounds;
    const fire = P.kind === 'fire';
    const T = a.def.trail;
    if (T) {
      a.trailCd -= dt; // orbe de feu : traînée de flammes au sol, comme le slime de feu
      if (a.trailCd <= 0) {
        this.sim.addFire(a.x, a.y + 6, T.radius, T.ttl, T.dps * a.esc);
        a.trailCd = T.every;
      }
    }
    if ((a.lurkT -= dt) <= 0 || a.x < b.minX || a.x > b.maxX || a.y < b.minY || a.y > b.maxY) {
      a.alive = false;
      if (fire) this.sim.events.push({ t: 'explosion', x: a.x, y: a.y, r: 50, style: 'fire' });
      else this.sim.events.push({ t: 'freeze', x: a.x, y: a.y, r: P.ring * 0.6 }); // se brise en fin de course
      return;
    }
    for (const s of this.sim.soldierHash.query(a.x, a.y, a.radius + 30, this.scratchS)) {
      if (!s.alive || s.capturedBy || Math.hypot(s.x - a.x, s.y - a.y) > a.radius + s.radius) continue;
      this.sim.damageSoldier(s, a.def.damage * a.esc);
      if (fire) {
        // éclate : brûle le soldat touché (dégâts + flamme à ses pieds)
        if (T) this.sim.addFire(s.x, s.y + 4, T.radius * 1.4, T.ttl, T.dps * a.esc);
        this.sim.events.push({ t: 'explosion', x: a.x, y: a.y, r: 50, style: 'fire' });
      } else this.sim.freezeHit(s, P.ring); // éclate : gèle le soldat touché (onde et éclats : événement `freeze`)
      a.alive = false;
      return;
    }
  }

  /** Point hors écran devant une squad (sa direction de course ± `RELOCATE.cone`), libre de décor et loin de toutes les squads. */
  private aheadOf(sq: Squad, radius: number): Point | null {
    const { rng, arena } = this.sim;
    const moving = Math.hypot(sq.vel.x, sq.vel.y) >= RELOCATE.minSpeed;
    const heading = moving ? Math.atan2(sq.vel.y, sq.vel.x) : rng.range(0, Math.PI * 2);
    const safe = RELOCATE.distance * 0.85;
    for (let tries = 0; tries < 12; tries++) {
      const ang = heading + (moving ? rng.range(-RELOCATE.cone, RELOCATE.cone) : rng.range(0, Math.PI * 2));
      const d = RELOCATE.distance + rng.range(0, 150);
      const p = { x: sq.center.x + Math.cos(ang) * d, y: sq.center.y + Math.sin(ang) * d };
      if (!arena.isFree(p, radius + 20)) continue;
      if (this.sim.aliveSquads.every((o) => Math.hypot(o.center.x - p.x, o.center.y - p.y) - o.radius >= safe)) return p;
    }
    return null;
  }

  /** Début de la couronne de pics (`def.spikeRing`) : télégraphe `aim` s, angle de départ tiré au hasard. */
  private startSpikeRing(a: AlienState): void {
    const R = a.def.spikeRing!;
    a.spikeAng = this.sim.rng.next() * ((Math.PI * 2) / R.rays);
    a.lurkPhase = 3;
    a.lurkT = R.aim;
  }

  /**
   * Couronne de pics (`def.spikeRing`), lancée par `startSpikeRing` à la réception d'un saut. Phases (`lurkPhase`, envoyées au client) : 0 repos,
   * 3 télégraphe (`aim` s), 4 poussée des pics (`sweep` s). Renvoie vrai tant qu'elle occupe l'alien.
   */
  private updateSpikeRing(a: AlienState, dt: number): boolean {
    const R = a.def.spikeRing!;
    const { soldierHash } = this.sim;
    if (a.lurkPhase === 3) {
      a.spikeAng += (R.turn / R.aim) * dt; // le télégraphe tourne autour du crabe, puis les pics sont lâchés dans la direction atteinte
      if ((a.lurkT -= dt) <= 0) {
        a.lurkPhase = 4;
        a.lurkT = R.sweep;
      }
      return true;
    }
    // 4 : les pics s'étendent, chaque soldat est blessé une fois quand un front passe sur lui
    const prevF = a.lurkT >= R.sweep ? -30 : (1 - a.lurkT / R.sweep) * R.length;
    a.lurkT -= dt;
    const curF = (1 - Math.max(0, a.lurkT) / R.sweep) * R.length;
    const power = (a.revived ? zombieStats().dmgMul : 1) * a.esc;
    for (const s of soldierHash.query(a.x, a.y, R.length + 40, this.scratchS)) {
      if (!s.alive) continue;
      const dx = s.x - a.x;
      const dy = s.y - a.y;
      for (let i = 0; i < R.rays; i++) {
        const ang = a.spikeAng + (i * Math.PI * 2) / R.rays;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const along = dx * cos + dy * sin;
        const across = Math.abs(-dx * sin + dy * cos);
        if (along > prevF && along <= curF && across <= R.width / 2 + s.radius * 0.6) {
          this.sim.damageSoldier(s, R.damage * power);
          break; // une seule fois par passage de front
        }
      }
    }
    if (a.lurkT <= 0) {
      a.lurkPhase = 0;
    }
    return true;
  }

  /** Autre lurker (enterré, qui s'enterre ou qui ressort) dont la hitbox, plus une marge, recouvre l'endroit où `a` voudrait s'enterrer ; le plus proche, sinon null. */
  private lurkerInTheWay(a: AlienState, spacing: number): AlienState | null {
    let best: AlienState | null = null;
    let bestD = Infinity;
    for (const o of this.sim.aliens) {
      if (o === a || !o.alive || !o.def.lurk || o.lurkPhase === 0) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < a.radius + o.radius + spacing && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /**
   * Lurker : en route vers le point où la squad SERA, s'enterre, attend qu'elle passe à portée, vise puis lance une ligne de pics
   * qui s'étend progressivement (chaque soldat est blessé une fois quand le front passe sur lui).
   */
  private updateLurker(a: AlienState, dt: number): void {
    const L = a.def.lurk!;
    const { arena, soldierHash } = this.sim;
    a.attackCd -= dt; // délai entre deux lignes de pics
    switch (a.lurkPhase) {
      case 0: {
        const sq = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
        if (!sq) break;
        let vx = 0;
        let vy = 0;
        let n = 0;
        for (const s of sq.soldiers) {
          if (!s.alive) continue;
          vx += s.vx;
          vy += s.vy;
          n++;
        }
        const px = sq.center.x + (n ? vx / n : 0) * L.lead;
        const py = sq.center.y + (n ? vy / n : 0) * L.lead;
        const d = Math.hypot(px - a.x, py - a.y) || 1;
        const dSquad = Math.hypot(sq.center.x - a.x, sq.center.y - a.y);
        const blocker = this.lurkerInTheWay(a, a.lurkBlockT > LURKER_PATIENCE ? LURKER_MIN_SPACING : LURKER_SPACING); // un autre lurker enterré (ou qui s'enterre / ressort) à cet endroit : on ne s'enterre pas dessus
        if (blocker) a.lurkBlockT += dt;
        if (!blocker && (d < L.digRange || dSquad < L.trigger * 0.7)) {
          a.lurkBlockT = 0;
          a.lurkPhase = 1;
          a.lurkT = L.digTime;
          a.vx = a.vy = 0;
          break;
        }
        const speed = a.def.speed * this.sim.stasisAt(a.x, a.y);
        let tx = (px - a.x) / d;
        let ty = (py - a.y) / d;
        if (blocker) {
          // s'écarte de la hitbox du lurker enterré (poussée dominante) tout en gardant le cap sur la squad, puis s'enterrera ailleurs
          const bx = a.x - blocker.x;
          const by = a.y - blocker.y;
          const bd = Math.hypot(bx, by) || 1;
          tx += (bx / bd) * 0.9; // poussée plus faible que le cap sur la squad : il glisse sur le côté sans s'éloigner
          ty += (by / bd) * 0.9;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
        }
        a.vx = damp(a.vx, tx * speed, 8, dt);
        a.vy = damp(a.vy, ty * speed, 8, dt);
        this.steerV.x = a.vx;
        this.steerV.y = a.vy;
        arena.steer(a.x, a.y, a.radius, this.steerV);
        a.vx = this.steerV.x;
        a.vy = this.steerV.y;
        break;
      }
      case 1:
        if ((a.lurkT -= dt) <= 0) {
          a.lurkPhase = 2;
          a.lurkT = L.wait;
        }
        break;
      case 2: {
        a.lurkT -= dt;
        let prey: SoldierState | null = null;
        let bestD = L.trigger;
        if (a.attackCd <= 0) {
          for (const s of soldierHash.query(a.x, a.y, L.trigger, this.scratchS)) {
            if (!s.alive || s.capturedBy) continue; // un soldat gelé reste attaquable
            const d = Math.hypot(s.x - a.x, s.y - a.y);
            if (d < bestD) {
              bestD = d;
              prey = s;
            }
          }
        }
        if (prey) {
          a.spikeAng = Math.atan2(prey.y + prey.vy * L.aim - a.y, prey.x + prey.vx * L.aim - a.x);
          a.lurkPhase = 3;
          a.lurkT = L.aim;
        } else if (a.lurkT <= 0) {
          a.lurkPhase = 5;
          a.lurkT = L.rise;
        }
        break;
      }
      case 3:
        if ((a.lurkT -= dt) <= 0) {
          a.lurkPhase = 4;
          a.lurkT = L.sweep;
        }
        break;
      case 4: {
        const prevF = a.lurkT >= L.sweep ? -30 : (1 - a.lurkT / L.sweep) * L.length;
        a.lurkT -= dt;
        const curF = (1 - Math.max(0, a.lurkT) / L.sweep) * L.length;
        const cos = Math.cos(a.spikeAng);
        const sin = Math.sin(a.spikeAng);
        const power = (a.revived ? zombieStats().dmgMul : 1) * a.esc;
        for (const s of soldierHash.query(a.x, a.y, L.length + 40, this.scratchS)) {
          if (!s.alive) continue;
          const dx = s.x - a.x;
          const dy = s.y - a.y;
          const along = dx * cos + dy * sin;
          const across = Math.abs(-dx * sin + dy * cos);
          if (along > prevF && along <= curF && across <= L.width / 2 + s.radius * 0.6) this.sim.damageSoldier(s, L.damage * power);
        }
        if (a.lurkT <= 0) {
          a.lurkPhase = 2;
          a.lurkT = L.rewait; // a déjà tiré : si la squad est sortie de portée, il ressort vite (sinon il retire dès `cooldown` écoulé)
          a.attackCd = L.cooldown;
        }
        break;
      }
      default: // 5 : ressort
        if ((a.lurkT -= dt) <= 0) a.lurkPhase = 0;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    arena.constrain(a);
  }

  /**
   * Scarab : téléportation sous terre derrière la squad. Phases (`lurkPhase`) : 0 normal (compte à rebours `leapCd`), 1 s'enterre (`dig`), 2 sous terre
   * (`wait`, le trou se forme derrière la squad : position dans `leapX/leapY`, `leapT` = temps restant pour le réseau), 3 ressort (`rise`, onde de choc
   * à l'arrivée). Renvoie vrai quand le boss est occupé (aucune autre action).
   */
  private updateBurrow(a: AlienState, dt: number): boolean {
    const B = a.def.burrow!;
    switch (a.lurkPhase) {
      case 0: {
        a.leapT = 0;
        const cd = a.leapCd;
        a.leapCd -= dt * this.cdRate(a);
        // il marche vers la squad : petite pluie de stalactites à mi-chemin du compte à rebours
        const W = a.def.stalactites?.walk;
        if (W && cd > B.every / 2 && a.leapCd <= B.every / 2) this.castStalactites(a, W.count, W.onSoldiers);
        const sq = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
        if (a.leapCd <= 0 && sq && sq.alive) {
          a.lurkPhase = 1;
          a.lurkT = B.dig;
          a.vx = a.vy = a.kx = a.ky = 0;
        }
        return false;
      }
      case 1:
        a.vx = a.vy = a.kx = a.ky = 0;
        if ((a.lurkT -= dt) <= 0) {
          a.lurkPhase = 2;
          a.lurkT = B.wait;
          this.aimBurrow(a);
        }
        a.leapT = Math.max(0.05, a.lurkT + B.wait);
        return true;
      case 2: {
        a.vx = a.vy = a.kx = a.ky = 0;
        const before = a.lurkT;
        a.lurkT -= dt;
        // le télégraphe suit la squad ; `lock` s avant la sortie, sa direction se fige : il continue d'avancer sur cet axe au rythme de la
        // squad (part de sa vitesse le long de l'axe), donc filer tout droit ne suffit pas, il faut s'écarter sur le côté
        if (a.lurkT > B.lock) this.aimBurrow(a);
        else {
          const sq = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
          if (before > B.lock) {
            const n = sq ? Math.hypot(sq.vel.x, sq.vel.y) : 0;
            a.rushDx = n > 1 ? sq!.vel.x / n : 0; // direction figée (squad immobile : le télégraphe ne bouge plus)
            a.rushDy = n > 1 ? sq!.vel.y / n : 0;
          }
          if (sq) {
            const along = (sq.vel.x * a.rushDx + sq.vel.y * a.rushDy) * dt;
            const p = { x: a.leapX + a.rushDx * along, y: a.leapY + a.rushDy * along, radius: a.radius * 0.6 };
            this.sim.arena.constrain(p);
            a.leapX = p.x;
            a.leapY = p.y;
          }
        }
        if (a.lurkT <= 0) {
          a.x = a.leapX;
          a.y = a.leapY;
          a.px = a.x;
          a.py = a.y;
          a.lurkPhase = 3;
          a.lurkT = B.rise;
          this.burrowImpact(a);
          this.aimLunge(a);
        }
        a.leapT = Math.max(0.05, a.lurkT);
        return true;
      }
      case 3: {
        // ressort en avançant déjà vers le point anticipé (direction verrouillée)
        const sp = a.def.speed * this.sim.stasisAt(a.x, a.y) * a.esc * (1 + DIFFICULTY.bossEnrageSpeed * a.enraged);
        a.vx = a.rushDx * sp;
        a.vy = a.rushDy * sp;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        this.sim.arena.constrain(a);
        if ((a.lurkT -= dt) <= 0) {
          a.lurkPhase = 4;
          a.lurkT = B.lunge;
          a.leapT = 0;
          a.leapCd = B.every;
          if (a.def.stalactites) this.castStalactites(a); // une fois sorti : pluie de stalactites
        } else a.leapT = Math.max(0.05, a.lurkT);
        return true;
      }
      default: {
        // 4 : fonce tout droit vers le point anticipé (déplacement normal, direction imposée dans `update`) jusqu'à le dépasser
        a.leapT = 0;
        a.lurkT -= dt;
        const ahead = (a.leapX - a.x) * a.rushDx + (a.leapY - a.y) * a.rushDy;
        if (ahead <= 0 || a.lurkT <= 0) a.lurkPhase = 0;
        return false;
      }
    }
  }

  /**
   * Scarab qui ressort : point visé = où sera la squad dans `burrow.lead` s (centre + vitesse de course, `Squad.vel`), mémorisé dans
   * `leapX` / `leapY` ; direction verrouillée dans `rushDx` / `rushDy` (il ne la change plus jusqu'à l'atteindre).
   */
  private aimLunge(a: AlienState): void {
    const B = a.def.burrow!;
    const sq = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
    const px = sq ? sq.center.x + sq.vel.x * B.lead : a.x;
    const py = sq ? sq.center.y + sq.vel.y * B.lead : a.y;
    const d = Math.hypot(px - a.x, py - a.y);
    if (d < 1) {
      a.rushDx = 1;
      a.rushDy = 0;
      a.leapX = a.x; // déjà dessus : la ruée s'arrête aussitôt
      a.leapY = a.y;
      return;
    }
    a.rushDx = (px - a.x) / d;
    a.rushDy = (py - a.y) / d;
    a.leapX = px;
    a.leapY = py;
  }

  /**
   * Point de sortie : le centre de la squad, tel quel (pas d'anticipation : c'est au joueur de bouger). Sur un obstacle, le point libre le
   * plus proche autour (anneaux de 60 et 120 px), sinon ramené dans la carte.
   */
  private aimBurrow(a: AlienState): void {
    const sq = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
    if (!sq) return;
    const c = sq.center;
    const r = a.radius * 0.6;
    for (const d of [0, 60, 120]) {
      for (let k = 0; k < (d === 0 ? 1 : 8); k++) {
        const ang = (k / 8) * Math.PI * 2;
        const p = { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d };
        if (this.sim.arena.isFree(p, r)) {
          a.leapX = p.x;
          a.leapY = p.y;
          return;
        }
      }
    }
    const p = { x: c.x, y: c.y, radius: a.radius };
    this.sim.arena.constrain(p);
    a.leapX = p.x;
    a.leapY = p.y;
  }

  /**
   * Pluie de stalactites (`def.stalactites`) sur la squad visée : d'abord sur des soldats tirés au hasard (leur position du moment), puis au
   * hasard autour de son centre (`count` / `onSoldiers` : la pluie de sortie par défaut, `walk` en marchant) ; les zones ne se chevauchent pas trop (essais), chaque impact est décalé du précédent de `stagger` s.
   */
  private castStalactites(a: AlienState, count = a.def.stalactites!.count, onSoldiers = a.def.stalactites!.onSoldiers): void {
    const S = a.def.stalactites!;
    const { rng } = this.sim;
    const sq = (a.target && this.sim.squadOf(a.target.owner)) || this.sim.nearestSquad(a.x, a.y);
    if (!sq) return;
    const soldiers = sq.soldiers.filter((s) => s.alive);
    const spots: Point[] = [];
    const clear = (p: Point): boolean => spots.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= S.radius * 1.4);
    for (let i = 0; i < onSoldiers && soldiers.length > 0; i++) {
      const s = soldiers.splice(Math.floor(rng.next() * soldiers.length), 1)[0];
      if (clear(s)) spots.push({ x: s.x, y: s.y });
    }
    for (let tries = 0; spots.length < count && tries < count * 8; tries++) {
      const ang = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * S.spread;
      const p = { x: sq.center.x + Math.cos(ang) * d, y: sq.center.y + Math.sin(ang) * d * 0.8 };
      if (clear(p)) spots.push(p);
    }
    spots.forEach((p, i) => this.sim.addStalactite(p.x, p.y, S.radius, S.delay + i * S.stagger, S.damage * a.esc, S.knockback));
  }

  /** Surgissement : onde de choc autour du trou (recul + dégâts aux soldats dans le rayon). */
  private burrowImpact(a: AlienState): void {
    const B = a.def.burrow!;
    this.sim.events.push({ t: 'slam', x: a.x, y: a.y, r: B.radius });
    for (const s of this.sim.soldierHash.query(a.x, a.y, B.radius + 30, this.scratchS)) {
      const dx = s.x - a.x;
      const dy = s.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!s.alive || d > B.radius + s.radius) continue;
      s.kx += (dx / d) * B.knockback;
      s.ky += (dy / d) * B.knockback;
      this.sim.damageSoldier(s, B.damage * a.esc);
    }
  }

  /** Murs autour de la squad visée : `count` murs tangents à un arc de rayon `ring`, devant elle (sa direction de fuite : celle où elle court, sinon à l'opposé du lanceur). */
  private castWalls(a: AlienState, target: SoldierState): void {
    const w = a.def.wall!;
    const { rng } = this.sim;
    const cx = target.x + target.vx * w.windup;
    const cy = target.y + target.vy * w.windup;
    const moving = Math.hypot(target.vx, target.vy) > 40;
    const away = moving ? Math.atan2(target.vy, target.vx) : Math.atan2(cy - a.y, cx - a.x);
    for (let i = 0; i < w.count; i++) {
      const ang = away + (i - (w.count - 1) / 2) * w.spread + rng.range(-0.12, 0.12);
      // hors carte ou sur un obstacle : on le rapproche de la squad, et à défaut on ne le pose pas
      for (const k of [1, 0.8, 0.6]) {
        const px = cx + Math.cos(ang) * w.ring * k;
        const py = cy + Math.sin(ang) * w.ring * k;
        if (!this.sim.wallFits(px, py, ang + Math.PI / 2, w.length, w.rock.radius)) continue;
        this.sim.addWall(px, py, ang + Math.PI / 2, w.length, w.windup, w.rock.radius, w.rock.ttl);
        break;
      }
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
      this.sim.damageSoldier(s, s.hp + s.maxHp, null, false); // écrasé : tué d'un coup (sauf invulnérabilité d'une recrue fraîche)
    }
  }

  /** Rhinocéros jumeaux : flamme (`fire`) ou nuage de gel (`frost`) laissé au sol pendant la charge. */
  private rushTrail(a: AlienState, T: NonNullable<NonNullable<AlienState['def']['rush']>['trail']>): void {
    if (T.kind === 'fire') this.sim.addFire(a.x, a.y + 4, T.radius, T.ttl, T.dps * a.esc);
    else this.sim.addPuddle(a.x, a.y + 4, T.radius, T.ttl, 1, true);
  }

  /** Rhinocéros jumeaux : à la fin de la charge, `count` orbes partent dans autant de directions régulières (le premier dans le sens de la charge). */
  private rushBurst(a: AlienState, B: NonNullable<NonNullable<AlienState['def']['rush']>['burst']>): void {
    const base = Math.atan2(a.rushDy, a.rushDx);
    for (let i = 0; i < B.count; i++) {
      const ang = base + (i / B.count) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      this.launch(B.orb, a.x + dx * (a.radius + 10), a.y + dy * (a.radius + 10), dx, dy);
    }
    this.sim.events.push({ t: 'slam', x: a.x, y: a.y, r: 130 }); // onde de départ des orbes (anneau et secousse)
  }

  /** Soldats sur le passage du charger : gros dégâts + recul dans le sens de la charge (une seule fois chacun par charge : `rushHits`). */
  private rushHit(a: AlienState): void {
    const r = a.def.rush!;
    for (const s of this.sim.soldierHash.query(a.x, a.y, r.width / 2 + a.radius + 60, this.scratchS)) {
      if (!s.alive || a.rushHits.has(s.id)) continue;
      const dx = s.x - a.x;
      const dy = s.y - a.y;
      const along = dx * a.rushDx + dy * a.rushDy;
      const lateral = Math.abs(dx * a.rushDy - dy * a.rushDx);
      if (along < -a.radius || along > a.radius + s.radius + 26 || lateral > r.width / 2 + s.radius) continue;
      this.sim.damageSoldier(s, r.damage * a.esc);
      s.kx += (a.rushDx * r.knockback) / s.mass;
      s.ky += (a.rushDy * r.knockback) / s.mass;
      a.rushHits.add(s.id); // une seule fois par charge (pas d'invulnérabilité : les autres aliens peuvent le frapper)
    }
  }

  /** Langue : tire le soldat vers l'alien d'une fraction de la distance (le recul est amorti par `CROWD.knockDamp`, donc déplacement = impulsion / amortissement). */
  private tongue(a: AlienState, s: SoldierState): boolean {
    if (s.capturedBy || s.frozen > 0 || s.grabbed > 0) return false;
    const t = a.def.tongue!;
    const dx = a.x - s.x;
    const dy = a.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const pull = Math.min(d * t.pull, TONGUE_MAX_PULL, Math.max(0, d - (a.radius + s.radius + 22)));
    s.kx += (dx / d) * pull * CROWD.knockDamp * TONGUE_BOOST;
    s.ky += (dy / d) * pull * CROWD.knockDamp * TONGUE_BOOST;
    s.grabbed = GRAB_IMMUNE;
    this.sim.damageSoldier(s, t.damage * a.esc);
    this.sim.events.push({ t: 'tongue', alien: a.id, target: s.id, dur: 0.5 });
    return true;
  }

  /** Mêlée en zone (`def.cleave`) : `dmg` à tous les soldats à portée, en un seul coup. */
  private cleave(a: AlienState, dmg: number): void {
    const r = a.def.cleave!;
    this.sim.events.push({ t: 'cleave', x: a.x, y: a.y, r });
    for (const s of this.sim.soldierHash.query(a.x, a.y, r + 30, this.scratchS)) {
      if (!s.alive || s.capturedBy || Math.hypot(s.x - a.x, s.y - a.y) > r + s.radius) continue;
      this.sim.damageSoldier(s, dmg);
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
      if (slam.stun) s.stun = Math.max(s.stun, slam.stun);
      this.sim.damageSoldier(s, slam.damage * a.esc);
    }
  }

  /** Soldat vivant le plus proche du centre de la squad la plus proche (cible de tir des aliens qui visent « le centre »). */
  private centerSoldier(a: AlienState): SoldierState | null {
    const sq = this.sim.nearestSquad(a.x, a.y);
    if (!sq) return null;
    let best: SoldierState | null = null;
    let bestD = Infinity;
    for (const s of sq.soldiers) {
      if (!s.alive || s.capturedBy) continue;
      const d = Math.hypot(s.x - sq.center.x, s.y - sq.center.y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
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
    // soldat avalé par une bulle : intouchable, aucun alien ne le vise (un soldat gelé reste visé, sauf par les bulles) ;
    // chaque bulle préfère un soldat que les autres bulles ne visent pas
    const claimed = a.def.capture ? this.sim.aliens.filter((o) => o !== a && o.alive && o.def.capture && o.target).map((o) => o.target!) : [];
    for (const s of this.sim.soldierHash.query(a.x, a.y, SEEK_RADIUS, this.scratchS)) {
      if (!s.alive || (nearestSquad && s.owner !== nearestSquad.owner)) continue;
      if (s.capturedBy || (a.def.capture && s.frozen > 0)) continue;
      const d = Math.hypot(s.x - a.x, s.y - a.y);
      if (d > SEEK_RADIUS) continue;
      let score = d;
      if (pref === 'specialist' && s.def.id !== 'trooper') score -= 600;
      if (claimed.includes(s)) score += 900; // déjà visé par une autre bulle : seulement s'il n'y a personne d'autre
      if (score < bestScore) {
        bestScore = score;
        a.target = s;
      }
    }
  }
}
