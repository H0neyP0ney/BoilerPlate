import { damp, robustCentroid } from '@xiao/engine/sim';
import { COINS, CROWD, ORB_BLINK_TIME, RELOCATE, REVIVE_TIME, SQUAD, ELECTRO } from '../config';
import { ALIENS, shieldOf } from '../data/aliens';
import { UPGRADE_IDS } from '../data/progression';
import { skinFromIndex } from '../data/skins';
import { trailFromIndex } from '../data/trails';
import { CLASSES } from '../data/classes';
import type { AlienState, GemState, PowerUpState, Projectile, RecruitState, SoldierState, UpgradeOrbState, Unit, XpOrb } from '../sim/entities';
import type { Sim } from '../sim/Sim';
import type { Squad } from '../sim/Squad';
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

/** Gain moyen de rejoint de slot (`CROWD.gainMin + gainSpread / 2`) : le gain propre à chaque soldat n'est pas transmis, l'écart est corrigé par le snapshot. */
const CROWD_GAIN = CROWD.gainMin + CROWD.gainSpread * 0.5;
/** Part de l'écart (état hôte rejoué contre état simulé) fondue à chaque snapshot, et écart (px) au-delà duquel on recale d'un coup. */
const SOLDIER_BLEND = 0.4;
const SOLDIER_SNAP = 80;
/** Vitesse (px/s) sous laquelle un soldat est « au repos » (son slot se lit directement) et écart de slot (px) au-delà duquel on le considère réattribué. */
const SLOT_REST = 8;
const SLOT_TOLERANCE = 30;

/** État de foule simulé chez le client pour un soldat de ma squad : position, vitesse et slot visé (relatif à l'ancre). */
interface CrowdState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
}

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
  /** Globes d'upgrade des coffres (par id) : lissés comme les recrues, chute en cloche comprise. */
  private readonly upgradeOrbs = new Map<number, UpgradeOrbState>();
  private readonly coins = new Map<number, GemState>();
  private readonly powerups = new Map<number, PowerUpState>();
  /** Globes d'XP persistants (par id) : lissés vers leur position hôte comme les recrues, au lieu de sauter à chaque snapshot. */
  private readonly orbs = new Map<number, XpOrb>();
  /** Projectiles persistants (par id du snapshot) : lissés comme les autres entités au lieu d'être recréés à chaque snapshot. */
  private readonly projectiles = new Map<number, Projectile>();
  private readonly goals = new WeakMap<object, Goal>();

  readonly predictor = new AnchorPredictor();

  /** Soldat reflété (par id) : `ClientSession` y lit la classe et la visée d'un tir reçu en binaire (`Snapshot.shots`). */
  soldier(id: number): SoldierState | undefined {
    return this.soldiers.get(id);
  }

  constructor(
    readonly sim: Sim,
    private readonly localPlayer: PlayerId,
  ) {}

  /** Monde figé chez l'hôte (pause de choix d'upgrade, écran de fin : son tick n'avance plus) : rien n'est extrapolé ni décompté. */
  private frozen = false;

  /** Aliens du snapshot SUIVANT déjà reçu (tampon d'interpolation) et écart de temps (s) : leur vitesse = vers où ils vont. */
  private nextAliens?: Map<number, AlienSnap>;
  private nextDt = 0;
  private curSeq = 0;
  /** Dernière position reçue de chaque alien (repli quand le snapshot suivant n'est pas encore là). */
  private readonly lastAlienPos = new Map<number, { x: number; y: number; seq: number }>();

  /**
   * Vrai quand la squad locale est lue sans passer par le tampon d'interpolation (`applyLocal`, appelée à la réception de chaque snapshot) :
   * la réconciliation travaille sur l'ancre et l'`ack` les plus récents, pas sur ceux d'il y a `INTERP_DELAY_MS` de plus.
   */
  directLocal = false;
  /** Pause de choix d'upgrade vue dans le dernier snapshot reçu (sans délai) : la prédiction s'arrête avec l'hôte, pas 100 ms plus tard. */
  private localChoiceT = 0;

  /** Ancre et soldats de MA squad, tirés du snapshot qui vient d'arriver (sans passer par le tampon). Le reste attend `apply`. */
  applyLocal(snap: Snapshot): void {
    const sq = snap.squads.find((s) => s.owner === this.localPlayer);
    const squad = this.sim.squads.find((s) => s.owner === this.localPlayer); // jamais créée ici : l'ordre des squads est celui de `apply`
    if (!sq || !squad) return;
    this.localChoiceT = snap.choiceT;
    this.applyLocalSquad(squad, sq, snap.choiceT > 0);
  }

  /** Réconciliation de l'ancre prédite et reprise des positions hôte des soldats d'une squad (la mienne : prédiction ; une autre : suivi simple). */
  private applyLocalSquad(squad: Squad, sq: Snapshot['squads'][number], frozen: boolean, seen?: Set<number>): void {
    if (sq.owner === this.localPlayer) {
      this.predictor.reconcile(this.sim.arena, sq.anchorX, sq.anchorY, sq.speed, sq.ack, 1 / TICK_RATE, sq.soldiers.length > 0, frozen);
      squad.anchor.x = this.predictor.anchor.x;
      squad.anchor.y = this.predictor.anchor.y;
    }
    squad.soldiers.length = 0;
    for (const u of sq.soldiers) {
      seen?.add(u.id);
      const s = this.upsertSoldier(u, sq.owner);
      squad.soldiers.push(s);
      if (sq.owner === this.localPlayer) this.reconcileSoldier(s, u, sq.anchorX, sq.anchorY);
    }
  }

  /** Soldat de ma squad dans un état où l'hôte le déplace lui-même (gelé, étourdi, bulle, saut, souffle) : il suit sa position hôte, sans modèle de foule. */
  private static hostDriven(s: SoldierState): boolean {
    return s.frozen > 0 || s.stun > 0 || !!s.capturedBy || s.jumpT > 0 || s.knockT > 0;
  }

  /** Modèles de foule locaux des soldats de ma squad (état simulé au tick client courant). */
  private readonly crowd = new WeakMap<SoldierState, CrowdState>();

  /**
   * Un soldat de ma squad est simulé ici avec la MÊME loi que chez l'hôte (rejoint son slot avec inertie : `Squad.update`), en suivant l'ancre prédite.
   * À chaque snapshot : état hôte (positions et vitesses à l'instant de l'`ack`) puis rejeu des inputs pas encore acquittés le long de l'ancre rejouée
   * (`predictor.path`), donc un état à l'instant client courant, cohérent dans le temps : la squad accélère et freine comme chez l'hôte, sans attendre
   * l'aller-retour, et sans le décalage rigide « position hôte périmée + déplacement de l'ancre » qui la faisait avancer d'un bloc au départ puis repartir à
   * l'arrêt. L'écart avec l'état simulé jusque-là est fondu (comme l'ancre).
   */
  private reconcileSoldier(s: SoldierState, u: SoldierSnap, anchorX: number, anchorY: number): void {
    if (Mirror.hostDriven(s)) {
      this.crowd.delete(s);
      return;
    }
    // slot visé : la loi donne v ≈ (slot − position) × gain, donc slot ≈ position + v / gain (relatif à l'ancre hôte). Exact au repos et à vitesse de croisière,
    // faux pendant une accélération ou un freinage : on garde alors le slot connu, sauf s'il s'est vraiment déplacé (soldat tué ou recruté : la formation est réattribuée)
    const old = this.crowd.get(s);
    const estX = u.x + u.vx / CROWD_GAIN - anchorX;
    const estY = u.y + u.vy / CROWD_GAIN - anchorY;
    const atRest = u.vx * u.vx + u.vy * u.vy < SLOT_REST * SLOT_REST;
    const moved = old ? (estX - old.sx) ** 2 + (estY - old.sy) ** 2 > SLOT_TOLERANCE * SLOT_TOLERANCE : true;
    const sx = old && !atRest && !moved ? old.sx : estX;
    const sy = old && !atRest && !moved ? old.sy : estY;
    const n: CrowdState = { x: u.x, y: u.y, vx: u.vx, vy: u.vy, sx, sy };
    const dtTick = 1 / TICK_RATE;
    for (const p of this.predictor.path) this.crowdStep(n, p.x, p.y, this.predictor.anchorSpeed, dtTick, s.radius);
    if (!old || (n.x - old.x) ** 2 + (n.y - old.y) ** 2 > SOLDIER_SNAP * SOLDIER_SNAP) {
      this.crowd.set(s, n);
      return;
    }
    old.x += (n.x - old.x) * SOLDIER_BLEND;
    old.y += (n.y - old.y) * SOLDIER_BLEND;
    old.vx += (n.vx - old.vx) * SOLDIER_BLEND;
    old.vy += (n.vy - old.vy) * SOLDIER_BLEND;
    old.sx = sx;
    old.sy = sy;
  }

  /** Un pas de la loi de foule d'un soldat (celle de `Squad.update`, sans séparation ni répulsion des aliens : ils sont corrigés par le snapshot). */
  private crowdStep(c: CrowdState, ax: number, ay: number, speed: number, dt: number, radius: number): void {
    const target = { x: ax + c.sx, y: ay + c.sy, radius: radius + CROWD.wallMargin * 0.4 };
    this.sim.arena.constrain(target);
    let dX = (target.x - c.x) * CROWD_GAIN;
    let dY = (target.y - c.y) * CROWD_GAIN;
    const maxSpeed = speed * CROWD.maxSpeedMul;
    const l = Math.hypot(dX, dY);
    if (l > maxSpeed) {
      dX = (dX / l) * maxSpeed;
      dY = (dY / l) * maxSpeed;
    }
    c.vx = damp(c.vx, dX, CROWD.velDamp, dt);
    c.vy = damp(c.vy, dY, CROWD.velDamp, dt);
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const me = { x: c.x, y: c.y, radius };
    this.sim.arena.constrain(me);
    c.x = me.x;
    c.y = me.y;
  }

  /**
   * `next` : snapshot suivant, déjà dans le tampon du client. Les aliens n'envoient plus leur vitesse (v43) : elle est déduite de leur
   * position dans `next` (vraie interpolation entre deux snapshots), sinon de leur position précédente (extrapolation).
   */
  apply(snap: Snapshot, next?: Snapshot): void {
    const { sim } = this;
    this.curSeq = snap.seq;
    this.nextDt = next ? (next.seq - snap.seq) / TICK_RATE : 0;
    this.nextAliens = next && this.nextDt > 0 ? new Map(next.aliens.map((a) => [a.id, a])) : undefined;
    this.frozen = snap.choiceT > 0 || snap.tick === sim.tick;
    sim.tick = snap.tick;
    sim.waves.setTime(snap.time, snap.cursor);
    sim.choiceT = snap.choiceT;

    const seenSoldiers = new Set<number>();
    for (const sq of snap.squads) {
      const squad = sim.addPlayer(sq.owner);
      squad.kills = sq.kills;
      squad.slot = sq.slot;
      squad.coinsPicked = sq.coins;
      squad.skin = skinFromIndex(sq.skin);
      squad.trail = trailFromIndex(sq.trail);
      squad.dealt = sq.dealt;
      squad.level = sq.level;
      squad.xp = sq.xp;
      squad.offer = sq.offer.length ? sq.offer.map((i) => UPGRADE_IDS[i]) : null;
      squad.offerPrism = sq.offerPrism;
      squad.rerolls = sq.rerolls;
      squad.buffs.stim = sq.stim;
      squad.buffs.electro = sq.electro;
      squad.electroAngle = sq.electroAng; // la vue l'avance entre deux snapshots (`ELECTRO.speed`)
      squad.lastStand = sq.lastStand;
      UPGRADE_IDS.forEach((id, i) => {
        squad.picked[id] = sq.picked[i];
        squad.prismPicked[id] = sq.prismPicked[i];
      });
      squad.stats.reset();
      squad.stats.add('maxSquad', { flat: sq.maxSize - SQUAD.baseMaxSize });
      // `isHealing` = arrêtée depuis assez longtemps ET un Medic présent.
      squad.stillTime = sq.healing ? CROWD.stillDelay + 1 : 0;
      if (sq.owner === this.localPlayer && this.directLocal) {
        // ancre et soldats de ma squad : déjà lus sans délai par `applyLocal` (un snapshot du tampon, plus vieux, les écraserait)
        for (const s of squad.soldiers) seenSoldiers.add(s.id);
        continue;
      }
      this.applyLocalSquad(squad, sq, snap.choiceT > 0, seenSoldiers);
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
    for (const id of this.lastAlienPos.keys()) if (!seenAliens.has(id)) this.lastAlienPos.delete(id);
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

    const seenUpOrbs = new Set<number>();
    sim.upgradeOrbs.items.length = 0;
    for (const o of snap.upgradeOrbs) {
      seenUpOrbs.add(o.id);
      sim.upgradeOrbs.items.push(this.upsertUpgradeOrb(o));
    }
    prune(this.upgradeOrbs, seenUpOrbs);

    const seenCoins = new Set<number>();
    sim.gems.coins.length = 0;
    for (const c of snap.coins) {
      seenCoins.add(c.id);
      sim.gems.coins.push(this.upsertCoin(c));
    }
    prune(this.coins, seenCoins);

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
    sim.fires.length = 0; // affichage seulement (la brûlure est calculée chez l'hôte)
    for (const f of snap.fires) sim.fires.push({ id: f.id, x: f.x, y: f.y, r: f.r, ttl: 1, dps: 0 });
    sim.crosses.length = 0; // pics en croix : télégraphe puis poussée (les dégâts sont calculés chez l'hôte) ; les mesures viennent des données du Rhino Alpha
    const CX = ALIENS.boss_rhino.spikeCross!;
    for (const c of snap.crosses) sim.crosses.push({ id: c.id, x: c.x, y: c.y, t: c.t, s: c.s, length: CX.length, width: CX.width, aim: CX.aim, sweep: CX.sweep, damage: 0 });
    sim.stalactites.length = 0; // télégraphes seulement (l'impact est calculé chez l'hôte)
    for (const k of snap.stalactites) sim.stalactites.push({ ...k, damage: 0, knockback: 0 });

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
  step(dtReal: number, local?: LocalInput): void {
    const { sim } = this;
    // monde figé chez l'hôte : les objets ne font plus que rejoindre leur position reçue (sinon ils avancent à leur vitesse puis
    // sont ramenés à chaque snapshot : tremblement des projectiles et des aliens pendant la pause)
    const dt = this.frozen ? 0 : dtReal;
    const predicting = !!local;
    if (local) this.predictor.step(sim.arena, local.n, local.mx, local.my, dtReal, (this.directLocal ? this.localChoiceT : sim.choiceT) > 0);
    const predicted = predicting && this.predictor.active;
    for (const sq of sim.squads) {
      if (predicted && sq.owner === this.localPlayer) {
        // la squad locale suit l'ancre prédite : pas d'extrapolation à la vitesse reçue (elle est déjà dans le décalage)
        sq.anchor.x = this.predictor.anchor.x;
        sq.anchor.y = this.predictor.anchor.y;
        for (const s of sq.soldiers) this.followPredicted(s, dt);
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
      if (a.lurkPhase === 3 && a.def.spikeRing) a.spikeAng += (a.def.spikeRing.turn / a.def.spikeRing.aim) * dt; // télégraphe des pics du crabe : il tourne, la rotation continue entre deux snapshots
      if (a.lurkT > 0) a.lurkT = Math.max(0, a.lurkT - dt);
      if (a.sinkT > 0) a.sinkT = Math.max(1e-3, a.sinkT - dt);
    }
    // éléments au sol à durée décroissante (la disparition réelle vient du snapshot : on s'arrête à 0, jamais en dessous)
    const tick = (o: { ttl: number }): void => {
      if (o.ttl > 0) o.ttl = Math.max(0, o.ttl - dt);
    };
    for (const sq of sim.squads) {
      if (sq.buffs.electro > 0) {
        sq.electroAngle = (sq.electroAngle + ELECTRO.speed * dt) % (Math.PI * 2); // orbes enflammées : elles continuent de tourner entre deux snapshots
        sq.buffs.electro = Math.max(0, sq.buffs.electro - dt);
      }
    }
    for (const c of sim.crosses) {
      if (c.t > 0) c.t = Math.max(0, c.t - dt);
      else c.s = Math.max(0, c.s - dt); // pics en croix : le télégraphe puis la poussée se décomptent entre deux snapshots
    }
    for (const k of sim.stalactites) if (k.t > 0) k.t = Math.max(0, k.t - dt); // stalactite : décompte jusqu'à l'impact
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
    for (const o of sim.upgradeOrbs.items) {
      o.px = o.x;
      o.py = o.y;
      if (o.hop) o.hop.t = Math.max(0.001, o.hop.t - dt); // chute : le compteur décroît entre deux snapshots (arc fluide)
      const g = this.goals.get(o);
      if (g) this.approach(o, this.advance(g, dt)); // chute depuis le coffre, puis envol vers sa squad : glisse au lieu de sauter
    }
    for (const o of sim.gems.coins) {
      o.px = o.x;
      o.py = o.y;
      if (o.hop) o.hop.t = Math.max(0.001, o.hop.t - dt); // chute : le compteur décroît entre deux snapshots
      const g = this.goals.get(o);
      if (g) this.approach(o, this.advance(g, dt));
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
        jumpT: 0,
        burn: 0,
        burnDps: 0,
        knockT: 0,
        jx0: 0,
        jy0: 0,
        jx1: 0,
        jy1: 0,
        jm: 0,
        poison: 0,
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
    s.burn = u.burning ? 1 : 0; // enflammé : la flamme est dessinée par la vue
    s.knockT = u.knocked ? 1 : 0; // soufflé par un kamikaze : la position vient du snapshot
    s.jumpT = u.airborne ? 1 : 0; // en vol vers la Gling Mère (toile) : la position vient du snapshot
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
        farT: 0,
        flank: 0,
        sinkT: 0,
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
        instant: false,
        age: 0,
        escDmg: 1,
        escRate: 1,
        escSpeed: 1,
        revives: 0,
        reviveLock: 0,
        swarmCd: 0,
        ringCd: 0,
        webCd: 0,
        wallsCd: 0,
        frostCd: 0,
        goldState: 0,
        goldTries: 0,
        goldDrop: 0,
        goldBury: 0,
        goldHp0: 0,
        goldNext: 0,
        crossCd: 0,
        lurkBlockT: 0,
        swarmT: 0,
        swarmAcc: 0,
        lurkPhase: 0,
        lurkT: 0,
        spikeAng: 0,
      };
      this.aliens.set(a.id, s);
    }
    // vitesse : vers la position du snapshot suivant (interpolation), sinon depuis la précédente ; un saut (recyclage, sortie de terre) = 0
    const n = this.nextAliens?.get(a.id);
    const p = this.lastAlienPos.get(a.id);
    let vx = 0;
    let vy = 0;
    if (n) {
      vx = (n.x - a.x) / this.nextDt;
      vy = (n.y - a.y) / this.nextDt;
    } else if (p && this.curSeq > p.seq) {
      const dt = (this.curSeq - p.seq) / TICK_RATE;
      vx = (a.x - p.x) / dt;
      vy = (a.y - p.y) / dt;
    }
    if (Math.hypot(vx, vy) > MAX_GROUND_SPEED) vx = vy = 0;
    if (p) {
      p.x = a.x;
      p.y = a.y;
      p.seq = this.curSeq;
    } else this.lastAlienPos.set(a.id, { x: a.x, y: a.y, seq: this.curSeq });
    s.vx = vx;
    s.vy = vy;
    s.hp = a.hp;
    s.maxHp = a.maxHp;
    const shield = shieldOf(s.def, this.sim.difficulty); // le niveau de la room (bouclier des boss en impossible)
    s.maxShield = shield ? a.maxHp * shield.pct : 0;
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
    s.instant = a.instant;
    // s'enterre : le compte à rebours démarre à la première réception, puis il décompte localement (`step`), sans passer sous 0,001
    s.sinkT = a.sinking ? (s.sinkT > 0 ? s.sinkT : (s.def.golden?.burrowTime ?? RELOCATE.sink)) : 0; // l'alien doré s'enterre en `burrowTime` s
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

  private upsertUpgradeOrb(o: { id: number; owner: string; upgrade: number; x: number; y: number; fall: number }): UpgradeOrbState {
    let s = this.upgradeOrbs.get(o.id);
    if (!s) {
      s = { id: o.id, owner: o.owner, upgrade: UPGRADE_IDS[o.upgrade] ?? UPGRADE_IDS[0], x: o.x, y: o.y, px: o.x, py: o.y, life: 1e9, age: 9 };
      this.upgradeOrbs.set(o.id, s);
    }
    s.owner = o.owner;
    s.hop = o.fall > 0 ? { vx: 0, vy: 0, t: o.fall } : undefined;
    this.retarget(s, o.x, o.y);
    return s;
  }

  private upsertCoin(c: { id: number; x: number; y: number; fall: number; blink: boolean }): GemState {
    let s = this.coins.get(c.id);
    if (!s) {
      s = { id: c.id, x: c.x, y: c.y, px: c.x, py: c.y, life: COINS.life, age: 9 };
      this.coins.set(c.id, s);
    }
    s.life = c.blink ? COINS.blink / 2 : COINS.life; // seul compte « sous le seuil de clignotement ou non » : l'hôte le décide
    s.hop = c.fall > 0 ? { vx: 0, vy: 0, t: c.fall } : undefined;
    this.retarget(s, c.x, c.y);
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
    // un soldat gelé ou étourdi reste statique chez l'hôte : pas d'extrapolation à sa dernière vitesse
    if (!(u.kind === 'soldier' && (u.frozen > 0 || u.stun > 0 || u.jumpT > 0 || u.knockT > 0))) {
      g.x += u.vx * dt;
      g.y += u.vy * dt;
    }
    this.approach(u, g);
  }

  /**
   * Soldat de la squad locale : but = position hôte du dernier snapshot + déplacement prédit de l'ancre depuis.
   * Un soldat gelé, étourdi (charge électrique) ou avalé par une bulle ne suit pas l'ancre (il est hors du mouvement de foule : chez l'hôte il reste
   * sur place) : il rejoint seulement sa position hôte (la bulle, elle, bouge : extrapolation à la vitesse reçue). Sinon il glisse avec la prédiction puis
   * est ramené à chaque snapshot : tremblement.
   */
  private followPredicted(u: Unit, dt: number): void {
    if (u.kind === 'soldier' && Mirror.hostDriven(u as SoldierState)) {
      this.follow(u, dt);
      return;
    }
    const c = this.crowd.get(u as SoldierState);
    if (c) {
      // modèle de foule local (voir `reconcileSoldier`) : un pas par tick, le long de l'ancre prédite
      u.px = u.x;
      u.py = u.y;
      if (dt > 0) this.crowdStep(c, this.predictor.anchor.x, this.predictor.anchor.y, this.predictor.anchorSpeed, dt, u.radius);
      u.x = c.x;
      u.y = c.y;
      u.vx = c.vx;
      u.vy = c.vy;
      return;
    }
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
