import { robustCentroid } from '@xiao/engine/sim';
import { CROWD, ORB_BLINK_TIME, REVIVE_TIME, SQUAD } from '../config';
import { ALIENS } from '../data/aliens';
import { UPGRADE_IDS } from '../data/progression';
import { CLASSES } from '../data/classes';
import type { AlienState, PowerUpState, Projectile, RecruitState, SoldierState, Unit, XpOrb } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';
import { AnchorPredictor } from './Prediction';
import { SNAPSHOT_EVERY, type AlienSnap, type ProjectileSnap, type RecruitSnap, type Snapshot, type SoldierSnap } from './Protocol';
import { TICK_RATE } from './Session';

/** Part de l'écart rattrapée à chaque tick client (0.5 = lissage rapide sans à-coups). */
const CATCH_UP = 0.5;
/** Au-delà de cet écart (px), on téléporte au lieu de lisser. */
const TELEPORT = 240;
/** Durée de vie approximative des projectiles côté client (cosmétique : flammes). */
const PROJECTILE_FADE = 0.5;

interface Goal {
  x: number;
  y: number;
  /** Dernière position reçue de l'hôte et vitesse (px/s) déduite de deux snapshots : le but avance à cette vitesse entre deux snapshots (objets au sol qui bougent). */
  sx?: number;
  sy?: number;
  vx?: number;
  vy?: number;
}

/** Durée (s) entre deux snapshots. */
const SNAPSHOT_DT = SNAPSHOT_EVERY / TICK_RATE;
/** Vitesse maximale (px/s) retenue pour l'extrapolation d'un objet au sol (au-delà : saut, pas un mouvement). */
const MAX_GROUND_SPEED = 2000;

/** Input du tick client courant, pour la prédiction de la squad locale. */
export interface LocalInput {
  n: number;
  mx: number;
  my: number;
}

/**
 * Reflet côté client de la simulation de l'hôte. Il écrit les snapshots reçus
 * DANS un `Sim` ordinaire (jamais avancé avec `step`) : le WorldView, le HUD et la
 * caméra le lisent comme une partie locale, sans savoir qu'elle vient du réseau.
 *
 * Entre deux snapshots (15 Hz), `step()` tourne à 30 Hz : les entités avancent à
 * leur vitesse connue (extrapolation) et se rapprochent de la dernière position
 * reçue (lissage), ce qui donne un mouvement fluide sans tampon d'interpolation.
 *
 * La squad du joueur local est PRÉDITE (`AnchorPredictor`) : ses soldats suivent l'ancre calculée tout de suite
 * avec l'input local, recalée sur l'hôte à chaque snapshot, au lieu d'attendre un aller-retour réseau.
 */
export class Mirror {
  private readonly soldiers = new Map<number, SoldierState>();
  private readonly aliens = new Map<number, AlienState>();
  private readonly recruits = new Map<number, RecruitState>();
  private readonly powerups = new Map<number, PowerUpState>();
  /** Globes d'XP persistants (par id) : lissés vers leur position hôte comme les recrues, au lieu de sauter à chaque snapshot. */
  private readonly orbs = new Map<number, XpOrb>();
  /** Projectiles persistants (par id du snapshot) : lissés comme les autres entités au lieu d'être recréés à chaque snapshot. */
  private readonly projectiles = new Map<number, Projectile>();
  private readonly goals = new WeakMap<object, Goal>();

  readonly predictor = new AnchorPredictor();

  constructor(
    readonly sim: Sim,
    private readonly localPlayer: PlayerId,
  ) {}

  apply(snap: Snapshot): void {
    const { sim } = this;
    sim.tick = snap.tick;
    sim.waves.setTime(snap.time, snap.cursor);
    sim.choiceT = snap.choiceT;

    const seenSoldiers = new Set<number>();
    for (const sq of snap.squads) {
      const squad = sim.addPlayer(sq.owner);
      squad.kills = sq.kills;
      squad.slot = sq.slot;
      squad.dealt = sq.dealt;
      squad.level = sq.level;
      squad.xp = sq.xp;
      squad.offer = sq.offer.length ? sq.offer.map((i) => UPGRADE_IDS[i]) : null;
      squad.offerPrism = sq.offerPrism;
      squad.rerolls = sq.rerolls;
      squad.buffs.stim = sq.stim;
      UPGRADE_IDS.forEach((id, i) => (squad.picked[id] = sq.picked[i]));
      squad.stats.reset();
      squad.stats.add('maxSquad', { flat: sq.maxSize - SQUAD.baseMaxSize });
      // `isHealing` = arrêtée depuis assez longtemps ET un Medic présent.
      squad.stillTime = sq.healing ? CROWD.stillDelay + 1 : 0;
      if (sq.owner === this.localPlayer) {
        const frozen = snap.choiceT > 0;
        this.predictor.reconcile(sim.arena, sq.anchorX, sq.anchorY, sq.speed, sq.ack, 1 / TICK_RATE, sq.soldiers.length > 0, frozen);
        squad.anchor.x = this.predictor.anchor.x;
        squad.anchor.y = this.predictor.anchor.y;
      }
      squad.soldiers.length = 0;
      for (const u of sq.soldiers) {
        seenSoldiers.add(u.id);
        squad.soldiers.push(this.upsertSoldier(u, sq.owner));
      }
    }
    prune(this.soldiers, seenSoldiers);
    // Joueurs partis : leur squad n'est plus dans le snapshot.
    for (let i = sim.squads.length - 1; i >= 0; i--) {
      if (!snap.squads.some((sq) => sq.owner === sim.squads[i].owner)) sim.squads.splice(i, 1);
    }

    const seenAliens = new Set<number>();
    sim.aliens.length = 0;
    for (const a of snap.aliens) {
      seenAliens.add(a.id);
      sim.aliens.push(this.upsertAlien(a));
    }
    prune(this.aliens, seenAliens);
    // bulles : le prisonnier est le soldat dont `capturedBy` est l'id de la bulle
    for (const a of sim.aliens) a.captive = null;
    for (const s of this.soldiers.values()) if (s.capturedBy) { const b = this.aliens.get(s.capturedBy); if (b) b.captive = s; }

    const seenRecruits = new Set<number>();
    sim.recruits.items.length = 0;
    for (const r of snap.recruits) {
      seenRecruits.add(r.id);
      sim.recruits.items.push(this.upsertRecruit(r));
    }
    prune(this.recruits, seenRecruits);

    const seenOrbs = new Set<number>();
    sim.xp.orbs.length = 0;
    for (const o of snap.orbs) {
      seenOrbs.add(o.id);
      sim.xp.orbs.push(this.upsertOrb(o));
    }
    prune(this.orbs, seenOrbs);

    sim.reviveZones.length = 0;
    for (const z of snap.zones) sim.reviveZones.push({ owner: z.owner, x: z.x, y: z.y, r: z.r, progress: z.progress * REVIVE_TIME });

    sim.powerups.items.length = 0;
    const seenPowerups = new Set<number>();
    for (const p of snap.powerups) {
      seenPowerups.add(p.id);
      sim.powerups.items.push(this.upsertPowerup(p));
    }
    prune(this.powerups, seenPowerups);
    sim.powerups.fields.length = 0;
    for (const f of snap.fields) sim.powerups.fields.push({ ...f });

    sim.puddles.length = 0;
    for (const p of snap.puddles) sim.puddles.push({ ...p });
    sim.walls.length = 0;
    for (const w of snap.walls) sim.walls.push({ id: w.id, x: w.x, y: w.y, angle: w.angle, length: w.length, rockR: w.r, ttl: w.ttl, t: w.t, dur: w.dur });
    sim.arena.rocks.length = 0;
    for (const k of snap.rocks) sim.arena.rocks.push({ id: k.id, x: k.x, y: k.y, radius: k.r, ttl: k.ttl });

    // projectiles : persistants (retrouvés par id), lissés vers leur position hôte ; absents du snapshot = détruits
    const seenProj = new Set<number>();
    for (const p of snap.projectiles) {
      if (seenProj.has(p.id)) continue; // collision d'id (modulo 65536) : extrêmement rare, ignorée
      seenProj.add(p.id);
      this.upsertProjectile(p);
    }
    for (const [id, p] of this.projectiles) {
      if (seenProj.has(id)) continue;
      this.projectiles.delete(id);
      sim.combat.projectiles.release(p);
    }
    for (const sq of sim.squads) if (sq.soldiers.length > 0) robustCentroid(sq.soldiers, sq.radius * 1.6, sq.center);
  }

  /** Un tick client : prédiction de la squad locale, extrapolation + lissage du reste, recalcul du centre des squads. */
  step(dt: number, local?: LocalInput): void {
    const { sim } = this;
    const predicting = !!local;
    if (local) this.predictor.step(sim.arena, local.n, local.mx, local.my, dt, sim.choiceT > 0);
    const predicted = predicting && this.predictor.active;
    for (const sq of sim.squads) {
      if (predicted && sq.owner === this.localPlayer) {
        // la squad locale suit l'ancre prédite : pas d'extrapolation à la vitesse reçue (elle est déjà dans le décalage)
        sq.anchor.x = this.predictor.anchor.x;
        sq.anchor.y = this.predictor.anchor.y;
        for (const s of sq.soldiers) this.followPredicted(s);
      } else {
        for (const s of sq.soldiers) this.follow(s, dt);
      }
      if (sq.soldiers.length > 0) robustCentroid(sq.soldiers, sq.radius * 1.6, sq.center);
    }
    for (const a of sim.aliens) {
      this.follow(a, dt);
      // compteurs de télégraphes : la sim hôte les décompte à chaque tick, on fait pareil entre deux snapshots (sinon ils avancent par paliers de 66 ms)
      if (a.slamWind > 0) a.slamWind = Math.max(0, a.slamWind - dt);
      if (a.rushWind > 0) a.rushWind = Math.max(0, a.rushWind - dt); // négatif après la charge : on n'y touche pas
      if (a.leapT > 0) a.leapT = Math.max(0, a.leapT - dt);
      if (a.castT > 0) a.castT = Math.max(0, a.castT - dt);
      if (a.lurkT > 0) a.lurkT = Math.max(0, a.lurkT - dt);
    }
    // éléments au sol à durée décroissante (la disparition réelle vient du snapshot : on s'arrête à 0, jamais en dessous)
    const tick = (o: { ttl: number }): void => {
      if (o.ttl > 0) o.ttl = Math.max(0, o.ttl - dt);
    };
    for (const w of sim.walls) if (w.t > 0) w.t = Math.max(0, w.t - dt); // télégraphe d'un mur : `t` décompte jusqu'à l'apparition des rochers
    for (const p of sim.puddles) tick(p);
    for (const k of sim.arena.rocks) tick(k);
    for (const f of sim.powerups.fields) tick(f);
    for (const p of sim.powerups.items) {
      if (p.life > 0) p.life = Math.max(0, p.life - dt);
      const g = this.goals.get(p);
      if (g) this.approach(p, this.advance(g, dt)); // power-up aspiré par l'aimant : glisse au lieu de sauter à chaque snapshot
    }
    for (const r of sim.recruits.items) {
      r.px = r.x;
      r.py = r.y;
      r.life -= dt;
      const g = this.goals.get(r);
      if (g) this.approach(r, this.advance(g, dt)); // le but avance à la vitesse déduite des snapshots (recrue aspirée, saut d'apparition)
    }
    for (const o of sim.xp.orbs) {
      o.px = o.x;
      o.py = o.y;
      const g = this.goals.get(o);
      if (g) this.approach(o, this.advance(g, dt)); // un globe attiré par un soldat glisse vers sa nouvelle position au lieu de sauter à la cadence des snapshots
    }
    for (const p of sim.combat.projectiles.active) {
      p.px = p.x;
      p.py = p.y;
      const g = this.goals.get(p);
      if (g) {
        g.x += p.vx * dt; // le but avance à la vitesse du projectile, le projectile le rattrape (lissage)
        g.y += p.vy * dt;
        this.approach(p, g);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.life = Math.max(0, p.life - (p.lob ? dt : dt / PROJECTILE_FADE)); // en cloche : vrai temps de vol (télégraphe)
    }
  }

  // ---------- Entités ----------

  private upsertSoldier(u: SoldierSnap, owner: string): SoldierState {
    let s = this.soldiers.get(u.id);
    if (!s) {
      const def = CLASSES[u.cls];
      s = {
        kind: 'soldier',
        id: u.id,
        owner,
        team: owner,
        def,
        x: u.x,
        y: u.y,
        px: u.x,
        py: u.y,
        vx: 0,
        vy: 0,
        kx: 0,
        ky: 0,
        radius: def.radius,
        mass: def.mass,
        hp: u.hp,
        maxHp: u.maxHp,
        shield: 0,
        maxShield: 0,
        alive: true,
        slotX: 0,
        slotY: 0,
        gain: 0,
        cooldown: 0,
        retarget: 0,
        target: null,
        facing: u.facing,
        aim: u.aim,
        invulnerable: 0,
        capturedBy: 0,
        frozen: 0,
        iceInvuln: 0,
        stun: 0,
        grabbed: 0,
      };
      this.soldiers.set(u.id, s);
    }
    s.vx = u.vx;
    s.vy = u.vy;
    s.hp = u.hp;
    s.maxHp = u.maxHp;
    s.maxShield = 0; // plus aucun bouclier de soldat (seuls certains aliens en ont)
    s.shield = 0;
    s.aim = u.aim;
    s.facing = u.facing;
    // La vue ne teste que « a-t-il une cible ? » (pose de tir) : il se cible lui-même.
    s.target = u.target ? s : null;
    s.stun = u.stunned ? 1 : 0;
    s.invulnerable = u.invulnerable ? 1 : 0;
    s.capturedBy = u.capturedBy;
    s.frozen = u.frozen;
    this.setGoal(s, u.x, u.y);
    return s;
  }

  private upsertAlien(a: AlienSnap): AlienState {
    let s = this.aliens.get(a.id);
    if (!s) {
      const def = ALIENS[a.type];
      s = {
        kind: 'alien',
        id: a.id,
        team: 'aliens',
        def,
        x: a.x,
        y: a.y,
        px: a.x,
        py: a.y,
        vx: 0,
        vy: 0,
        kx: 0,
        ky: 0,
        radius: def.radius,
        mass: def.mass,
        hp: a.hp,
        maxHp: a.maxHp,
        shield: 0,
        maxShield: 0,
        shieldT: 0,
        alive: true,
        target: null,
        goalX: a.x,
        goalY: a.y,
        retarget: 0,
        attackCd: 0,
        slamWind: 0,
        slamCd: 0,
        lobCd: 0,
        tongueCd: 0,
        sprayCd: 0,
        cloudCd: 0,
        rushCd: 0,
        rushWind: 0,
        rushT: 0,
        rushDx: 0,
        rushHits: new Set<number>(),
        rushDy: 0,
        rushX: a.x,
        rushY: a.y,
        leapCd: 0,
        leapT: 0,
        leapFromX: a.x,
        leapFromY: a.y,
        leapX: a.x,
        leapY: a.y,
        reviveCd: 0,
        castT: 0,
        castCorpse: 0,
        trailCd: 0,
        captive: null,
        revived: false,
        enraged: 0,
        noXp: false,
        noRecruit: false,
        age: 0,
        esc: 1,
        revives: 0,
        reviveLock: 0,
        swarmCd: 0,
        swarmT: 0,
        swarmAcc: 0,
        lurkPhase: 0,
        lurkT: 0,
        spikeAng: 0,
      };
      this.aliens.set(a.id, s);
    }
    s.vx = a.vx;
    s.vy = a.vy;
    s.hp = a.hp;
    s.maxHp = a.maxHp;
    s.maxShield = s.def.shield ? a.maxHp * s.def.shield.pct : 0;
    s.shield = a.shield * s.maxShield;
    s.slamWind = a.slamWind;
    s.rushWind = a.rushWind;
    s.rushT = a.rushing ? 1 : 0;
    s.rushDx = a.rushDx;
    s.rushDy = a.rushDy;
    s.rushX = a.rushX;
    s.rushY = a.rushY;
    s.leapT = a.leapT;
    s.leapX = a.leapX;
    s.leapY = a.leapY;
    s.castT = a.castT;
    s.castCorpse = a.castCorpse;
    s.revived = a.zombie;
    s.enraged = a.enraged;
    s.lurkPhase = a.lurkPhase;
    s.lurkT = a.lurkT;
    s.spikeAng = a.spikeAng;
    this.setGoal(s, a.x, a.y);
    return s;
  }

  private upsertOrb(o: { id: number; x: number; y: number; value: number; blink: boolean }): XpOrb {
    let s = this.orbs.get(o.id);
    if (!s) {
      s = { id: o.id, x: o.x, y: o.y, px: o.x, py: o.y, value: o.value, life: 10 };
      this.orbs.set(o.id, s);
    }
    s.value = o.value;
    s.life = o.blink ? ORB_BLINK_TIME / 2 : ORB_BLINK_TIME * 2; // seul compte « sous le seuil de clignotement ou non » : l'hôte le décide
    this.retarget(s, o.x, o.y);
    return s;
  }

  private upsertRecruit(r: RecruitSnap): RecruitState {
    let s = this.recruits.get(r.id);
    if (!s) {
      s = { id: r.id, cls: r.cls, x: r.x, y: r.y, px: r.x, py: r.y, life: r.life };
      this.recruits.set(r.id, s);
    }
    s.life = r.life;
    this.retarget(s, r.x, r.y);
    return s;
  }

  private upsertPowerup(p: { id: number; kind: PowerUpState['kind']; x: number; y: number; life: number }): PowerUpState {
    let s = this.powerups.get(p.id);
    if (!s) {
      s = { id: p.id, kind: p.kind, x: p.x, y: p.y, life: p.life };
      this.powerups.set(p.id, s);
    }
    s.kind = p.kind;
    s.life = p.life;
    this.retarget(s, p.x, p.y);
    return s;
  }

  /** Nouvelle position hôte d'un objet au sol : le but y saute, et sa vitesse est déduite du déplacement depuis le snapshot précédent. */
  private retarget(u: object, x: number, y: number): void {
    const g = this.goals.get(u);
    if (!g || g.sx === undefined || g.sy === undefined) {
      this.goals.set(u, { x, y, sx: x, sy: y, vx: 0, vy: 0 });
      return;
    }
    let vx = (x - g.sx) / SNAPSHOT_DT;
    let vy = (y - g.sy) / SNAPSHOT_DT;
    if (Math.hypot(vx, vy) > MAX_GROUND_SPEED) vx = vy = 0;
    g.x = g.sx = x;
    g.y = g.sy = y;
    g.vx = vx;
    g.vy = vy;
  }

  /** Fait avancer le but d'un objet au sol à sa vitesse estimée (entre deux snapshots). */
  private advance(g: Goal, dt: number): Goal {
    g.x += (g.vx ?? 0) * dt;
    g.y += (g.vy ?? 0) * dt;
    return g;
  }

  private upsertProjectile(snap: ProjectileSnap): void {
    let p = this.projectiles.get(snap.id);

    if (!p) {
      p = this.sim.combat.projectiles.acquire();
      this.projectiles.set(snap.id, p);
      p.id = snap.id;
      p.x = p.px = snap.x;
      p.y = p.py = snap.y;
    }
    this.goals.set(p, { x: snap.x, y: snap.y }); // position hôte : le projectile glisse vers elle (pas de saut à chaque snapshot)
    p.vx = snap.vx;
    p.vy = snap.vy;
    p.texture = snap.texture;
    p.flame = snap.flame;
    p.lob = snap.lob;
    p.aoe = snap.aoe;
    p.team = snap.alien ? 'aliens' : '';
    p.maxLife = snap.lob ? snap.flight : 1;
    p.life = snap.age * p.maxLife;
  }

  // ---------- Lissage ----------

  private setGoal(u: Unit, x: number, y: number): void {
    const g = this.goals.get(u);
    if (g) {
      g.x = x;
      g.y = y;
    } else {
      this.goals.set(u, { x, y });
    }
  }

  private follow(u: Unit, dt: number): void {
    const g = this.goals.get(u);
    u.px = u.x;
    u.py = u.y;
    if (!g) return;
    g.x += u.vx * dt;
    g.y += u.vy * dt;
    this.approach(u, g);
  }

  /** Soldat de la squad locale : but = position hôte du dernier snapshot + déplacement prédit de l'ancre depuis. */
  private followPredicted(u: Unit): void {
    const g = this.goals.get(u);
    u.px = u.x;
    u.py = u.y;
    if (!g) return;
    this.approachTo(u, g.x + this.predictor.dx, g.y + this.predictor.dy);
  }

  private approach(u: { x: number; y: number }, g: Goal): void {
    this.approachTo(u, g.x, g.y);
  }

  private approachTo(u: { x: number; y: number }, gx: number, gy: number): void {
    const dx = gx - u.x;
    const dy = gy - u.y;
    if (dx * dx + dy * dy > TELEPORT * TELEPORT) {
      u.x = gx;
      u.y = gy;
      return;
    }
    u.x += dx * CATCH_UP;
    u.y += dy * CATCH_UP;
  }
}

function prune<V>(map: Map<number, V>, keep: Set<number>): void {
  for (const id of map.keys()) if (!keep.has(id)) map.delete(id);
}
