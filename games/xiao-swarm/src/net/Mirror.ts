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
import { rushSmashes, rushStop } from '../sim/Horde';
import type { PlayerId, SimEvent } from '../sim/types';
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
/** Fraction de la vitesse maximale d'un soldat (`speed × CROWD.maxSpeedMul`) au-delà de laquelle sa vitesse est considérée comme plafonnée. */
const CAPPED_FRACTION = 0.92;
/** Vitesse (px/s) à laquelle l'écart d'entrée dans le modèle de foule se résorbe : 60 px de retard en ~0,3 s, sans longue queue. */
const ENTER_CLOSE_SPEED = 200;
/** Plus grand pas (px par tick client) d'un soldat qui rattrape sa position hôte : un peu plus que sa vitesse maximale (~10 px/tick). */
const SOLDIER_MAX_STEP = 14;

/** État de foule simulé chez le client pour un soldat de ma squad : position, vitesse et slot visé (relatif à l'ancre). */
interface CrowdState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  /** Écart d'affichage à résorber (position affichée avant l'entrée dans le modèle − position du modèle) : se ferme à `ENTER_CLOSE_SPEED` px/s. */
  ox: number;
  oy: number;
}

/** Avance des télégraphes (s) : au plus (au-delà, réseau anormal : on n'en rajoute pas), et part de l'écart à la mesure fondue à chaque snapshot. */
const MAX_TELE_LEAD = 0.5;
const TELE_LEAD_SMOOTH = 0.25;
/** Temps (s) pendant lequel un télégraphe dont l'impact a été joué ici reste écarté des snapshots (l'hôte le garde encore un moment), et pendant lequel un
 * effet d'impact joué ici attend son double venu de l'hôte (qu'on jette). */
const TELE_DONE_TTL = 2;
/** Écart (px) sous lequel un effet d'impact de l'hôte est le même que celui déjà joué ici. */
const IMPACT_MATCH = 24;

/** Charge simulée chez l'invité (`Mirror.charges`) : position, vitesse, axe, temps écoulé / durée ; `hostSeen` : l'hôte l'a annoncée (`rushing`). */
interface Charge {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dx: number;
  dy: number;
  t: number;
  dur: number;
  done: boolean;
  hostSeen: boolean;
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

  /**
   * Avance des télégraphes (s). Ma squad est prédite (en avance sur l'hôte d'un aller simple + la file d'inputs), le reste du monde arrive en retard (un aller
   * simple + le tampon de 100 ms) : sans correction, je voyais la fin d'un télégraphe ~230-300 ms après que l'hôte a jugé ma squad (« j'étais sorti et j'ai
   * pris les dégâts »). L'écart se mesure exactement : mon input courant − l'`ack` du snapshot affiché (l'input que l'hôte avait joué quand il l'a pris).
   * Les minuteurs des télégraphes (stalactites, croix de pics, murs, mèches des kamikazes, pics du lurker et du crabe, saut du crabe, boules en cloche des aliens) sont avancés
   * d'autant : leur fin tombe quand ma squad affichée est là où l'hôte la juge. 0 sans squad prédite (spectateur, mort).
   */
  teleLead = 0;
  /** Dernier input local joué (`step`). */
  private lastN = 0;
  /** Télégraphes dont l'impact a été joué ici (clé → temps restant) : écartés des snapshots tant que l'hôte les garde. */
  private readonly teleDone = new Map<string, number>();
  /** Effets d'impact joués ici (`localEvents`), en attente de leur double venu de l'hôte. */
  private readonly localImpacts: { t: SimEvent['t']; x: number; y: number; ttl: number }[] = [];
  /** Effets d'impact joués ici au moment où le télégraphe avancé se termine : `ClientSession` les envoie à la vue. */
  readonly localEvents: SimEvent[] = [];
  /**
   * Plongée du Scarab (par alien) : zone de sortie suivie ici quand il vise MA squad (`mine`) : avant le verrouillage elle suit le centre de ma squad
   * affichée (comme `Horde.aimBurrow` chez l'hôte), après elle avance sur l'axe figé au rythme de ma squad prédite (`myVel`, même lissage que
   * `Squad.vel`) ; `emerged` : sortie déjà jouée ici, l'hôte ne l'a pas encore annoncée.
   */
  private readonly burrows = new Map<number, { mine: boolean; checked: boolean; locked: boolean; dx: number; dy: number; x: number; y: number; emerged: boolean }>();
  /** Ancres de toutes les squads dans le snapshot affiché : la squad visée par un Scarab est celle dont l'ancre est la plus proche de sa zone. */
  private snapAnchors: { owner: PlayerId; x: number; y: number }[] = [];
  /**
   * Charges (`rush`) simulées ici, par alien : l'alien qui charge est un alien qui bouge vite (1000-1300 px/s), affiché ~`teleLead` en retard il était à
   * ~400 px de là où l'hôte le juge. La charge part à la fin du télégraphe avancé, de son point de départ (`rushX/Y`), sur l'axe verrouillé, avec la loi
   * de l'hôte (même accélération, arrêt contre un obstacle de la carte : `rushStop`, rochers brisés : `rushSmashes`) ; l'alien est affiché là. `done` :
   * finie ici (arrêtée ou au bout), il y reste jusqu'à ce que l'hôte la dise finie.
   */
  private readonly charges = new Map<number, Charge>();
  /** Vitesse lissée de mon ancre prédite (px/s) : celle que l'hôte aura (`Squad.vel`) quand il jouera mes inputs. */
  private readonly myVel = { x: 0, y: 0 };
  private myPrev?: { x: number; y: number };
  /** Saut du crabe : dernier `leapT` reçu de l'hôte (nouveau saut = il remonte) et point de départ (NaN = vu en plein vol, inconnu). */
  private readonly leapSeen = new Map<number, number>();

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
  /**
   * Monde figé chez l'hôte d'après le dernier snapshot reçu (sans délai) : pause de choix d'upgrade, ou tick qui n'avance plus (écran de fin, salle d'attente).
   * La prédiction de ma squad s'arrête et repart avec l'hôte, pas 100 ms plus tard : `frozen` (lu dans le tampon) gardait mes soldats immobiles 100 ms
   * après la reprise pendant que l'ancre repartait, d'où un rattrapage par bonds.
   */
  private localFrozen = false;
  private localTick = -1;
  /** L'input du tick client courant est tenu (monde figé ou pause annoncée) : le client envoie un input nul (voir `AnchorPredictor.step`). */
  inputHeld = false;

  /** Ancre et soldats de MA squad, tirés du snapshot qui vient d'arriver (sans passer par le tampon). Le reste attend `apply`. */
  applyLocal(snap: Snapshot): void {
    this.localFrozen = snap.choiceT > 0 || snap.tick === this.localTick;
    this.localTick = snap.tick;
    const sq = snap.squads.find((s) => s.owner === this.localPlayer);
    const squad = this.sim.squads.find((s) => s.owner === this.localPlayer); // jamais créée ici : l'ordre des squads est celui de `apply`
    if (!sq || !squad) return;
    this.applyLocalSquad(squad, sq, this.localFrozen, Mirror.limitOf(snap, sq));
    // balles de ma squad : à l'heure de mes soldats (sans tampon), sinon elles partaient ~100 ms trop tard, d'où mes soldats étaient déjà partis
    const mine = snap.squads.indexOf(sq);
    this.syncProjectiles(snap.projectiles, this.localProjectiles, (p) => p.squad === mine);
  }

  /** Projectiles tirés par ma squad, lus sans tampon (`applyLocal`) ; les autres sont dans `projectiles` (chemin tamponné). */
  private readonly localProjectiles = new Map<number, Projectile>();

  /** Réconciliation de l'ancre prédite et reprise des positions hôte des soldats d'une squad (la mienne : prédiction ; une autre : suivi simple). */
  private applyLocalSquad(squad: Squad, sq: Snapshot['squads'][number], frozen: boolean, limitN: number, seen?: Set<number>): void {
    if (sq.owner === this.localPlayer) {
      this.predictor.reconcile(this.sim.arena, sq.anchorX, sq.anchorY, sq.speed, sq.ack, 1 / TICK_RATE, sq.soldiers.length > 0, frozen, limitN, sq.leash);
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

  /**
   * Dernier input que l'hôte jouera avant sa pause de choix d'upgrade : pause ouverte = l'ack, annoncée dans `choiceIn` ticks = l'ack + (choiceIn − 1)
   * (au tick d'ouverture il ne joue plus rien). Le client arrête alors sa prédiction à cet input au lieu d'avancer d'un aller-retour puis de revenir en arrière.
   */
  private static limitOf(snap: Snapshot, sq: { ack: number }): number {
    if (snap.choiceT > 0) return sq.ack;
    if (snap.choiceIn > 0) return sq.ack + snap.choiceIn - 1;
    return Infinity;
  }

  /** Soldat de ma squad dans un état où l'hôte le déplace lui-même (gelé, étourdi, bulle, saut, souffle) : il suit sa position hôte, sans modèle de foule. */
  private static hostDriven(s: SoldierState): boolean {
    return s.frozen > 0 || s.stun > 0 || !!s.capturedBy || s.jumpT > 0 || s.knockT > 0;
  }

  /** Modèles de foule locaux des soldats de ma squad (état simulé au tick client courant). */
  private readonly crowd = new WeakMap<SoldierState, CrowdState>();
  /** Ma squad est arrêtée en attendant la pause de choix d'upgrade annoncée par l'hôte (voir `limitOf`). */
  private localHold = false;

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
    const speed2 = u.vx * u.vx + u.vy * u.vy;
    const atRest = speed2 < SLOT_REST * SLOT_REST;
    // vitesse plafonnée : le soldat est loin de son slot (revient de l'isolement, poussé, recruté) ; sa vitesse ne dit plus où est son slot, le modèle serait faux
    const cap = this.predictor.anchorSpeed * CROWD.maxSpeedMul * CAPPED_FRACTION;
    if (!atRest && speed2 > cap * cap) {
      this.crowd.delete(s);
      return;
    }
    const moved = old ? (estX - old.sx) ** 2 + (estY - old.sy) ** 2 > SLOT_TOLERANCE * SLOT_TOLERANCE : true;
    const sx = old && !atRest && !moved ? old.sx : estX;
    const sy = old && !atRest && !moved ? old.sy : estY;
    const n: CrowdState = { x: u.x, y: u.y, vx: u.vx, vy: u.vy, sx, sy, ox: 0, oy: 0 };
    const dtTick = 1 / TICK_RATE;
    for (const p of this.predictor.path) this.crowdStep(n, p.x, p.y, this.predictor.anchorSpeed, dtTick, s.radius);
    if (!old) {
      // entrée dans le modèle (fin d'un isolement, d'un gel, nouvelle recrue…) : l'affichage reste où il est et l'écart (la position hôte affichée avait un aller-retour
      // de retard) se résorbe en douceur (`ox` / `oy`, décroissance exponentielle), au lieu d'une téléportation
      const gap2 = (s.x - n.x) ** 2 + (s.y - n.y) ** 2;
      if (gap2 < SOLDIER_SNAP * SOLDIER_SNAP * 4) {
        n.ox = s.x - n.x;
        n.oy = s.y - n.y;
      }
      this.crowd.set(s, n);
      return;
    }
    if ((n.x - old.x) ** 2 + (n.y - old.y) ** 2 > SOLDIER_SNAP * SOLDIER_SNAP) {
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
      this.applyLocalSquad(squad, sq, snap.choiceT > 0, Mirror.limitOf(snap, sq), seenSoldiers);
    }
    prune(this.soldiers, seenSoldiers);
    this.measureTeleLead(snap);
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
    for (const k of snap.rocks) if (!this.teleDone.has('k' + k.id)) sim.arena.rocks.push({ id: k.id, x: k.x, y: k.y, radius: k.r, ttl: k.ttl }); // brisé ici par une charge simulée : écarté
    sim.fires.length = 0; // affichage seulement (la brûlure est calculée chez l'hôte)
    for (const f of snap.fires) sim.fires.push({ id: f.id, x: f.x, y: f.y, r: f.r, ttl: 1, dps: 0 });
    sim.crosses.length = 0; // pics en croix : télégraphe puis poussée (les dégâts sont calculés chez l'hôte) ; les mesures viennent des données du Rhino Alpha
    const CX = ALIENS.boss_rhino.spikeCross!;
    for (const c of snap.crosses) sim.crosses.push({ id: c.id, x: c.x, y: c.y, t: c.t, s: c.s, length: CX.length, width: CX.width, aim: CX.aim, sweep: CX.sweep, damage: 0 });
    sim.stalactites.length = 0; // télégraphes seulement (l'impact est calculé chez l'hôte)
    for (const k of snap.stalactites) if (!this.teleDone.has('s' + k.id)) sim.stalactites.push({ ...k, damage: 0, knockback: 0 });
    for (let i = sim.crosses.length - 1; i >= 0; i--) if (this.teleDone.has('c' + sim.crosses[i].id)) sim.crosses.splice(i, 1);
    sim.fuses.length = 0; // mèches des kamikazes : le corps clignote, l'explosion est calculée chez l'hôte
    for (const f of snap.fuses) if (!this.teleDone.has('f' + f.id)) sim.fuses.push({ ...f, dmg: 0, knock: 0 });

    // projectiles : persistants (retrouvés par id), lissés vers leur position hôte ; absents du snapshot = détruits. Ceux de ma squad : lus par `applyLocal`
    const mine = this.directLocal ? snap.squads.findIndex((q) => q.owner === this.localPlayer) : -2;
    this.syncProjectiles(snap.projectiles, this.projectiles, (p) => (p.squad !== mine || mine < 0) && !this.teleDone.has('l' + p.id));
    for (const sq of sim.squads) if (sq.soldiers.length > 0) robustCentroid(sq.soldiers, sq.radius * 1.6, sq.center);
    this.advanceTelegraphs(this.teleLead); // l'avance (les boules en cloche sont avancées dans `upsertProjectile`)
    this.applyBurrows();
  }

  /** Avance des télégraphes d'après le snapshot affiché (voir `teleLead`). Monde figé : on garde la valeur (l'`ack` ne bouge plus, l'écart ne veut rien dire). */
  private measureTeleLead(snap: Snapshot): void {
    this.snapAnchors = snap.squads.filter((q) => q.soldiers.length > 0).map((q) => ({ owner: q.owner, x: q.anchorX, y: q.anchorY }));
    const sq = snap.squads.find((q) => q.owner === this.localPlayer);
    if (!sq || sq.soldiers.length === 0 || !this.predictor.active || this.lastN === 0) {
      this.teleLead = 0;
      return;
    }
    if (this.frozen) return;
    const raw = Math.max(0, Math.min(MAX_TELE_LEAD, (this.lastN - sq.ack) / TICK_RATE));
    this.teleLead = this.teleLead > 0 ? this.teleLead + (raw - this.teleLead) * TELE_LEAD_SMOOTH : raw;
  }

  /** Effet d'impact joué ici (fin d'un télégraphe avancé) : envoyé à la vue, et son double venu de l'hôte sera jeté (`swallowHostEvent`). */
  private localImpact(e: SimEvent & { x: number; y: number }): void {
    this.localEvents.push(e);
    this.localImpacts.push({ t: e.t, x: e.x, y: e.y, ttl: TELE_DONE_TTL });
  }

  /** Vrai si cet événement de l'hôte est l'impact d'un télégraphe déjà joué ici (`localImpact`) : la vue ne le rejoue pas. */
  swallowHostEvent(e: SimEvent): boolean {
    if (e.t === 'rockBreak') return this.teleDone.has('k' + e.id); // rocher déjà brisé ici par une charge simulée
    if (e.t !== 'stalactite' && e.t !== 'explosion' && e.t !== 'slam') return false;
    const tol = e.t === 'slam' ? Math.max(IMPACT_MATCH, e.r * 0.5) : IMPACT_MATCH; // sortie du Scarab : sa zone, suivie ici, peut différer un peu de celle de l'hôte
    const i = this.localImpacts.findIndex((l) => l.t === e.t && Math.hypot(l.x - e.x, l.y - e.y) < tol);
    if (i < 0) return false;
    this.localImpacts.splice(i, 1);
    return true;
  }

  /**
   * Fait avancer de `dt` s les télégraphes rendus ici (pas du snapshot à `teleLead`, puis chaque tick) : stalactites (impact joué ici, puis retirées), croix de
   * pics (télégraphe puis poussée), murs, mèches des kamikazes (explosion jouée ici), pics du lurker et couronne du crabe (télégraphe puis poussée), saut du crabe (impact joué à l'atterrissage).
   */
  private advanceTelegraphs(dt: number): void {
    if (dt <= 0) return;
    const { sim } = this;
    for (let i = sim.stalactites.length - 1; i >= 0; i--) {
      const k = sim.stalactites[i];
      if ((k.t -= dt) > 0) continue;
      sim.stalactites.splice(i, 1);
      this.teleDone.set('s' + k.id, TELE_DONE_TTL);
      this.localImpact({ t: 'stalactite', x: k.x, y: k.y, r: k.r });
    }
    for (let i = sim.crosses.length - 1; i >= 0; i--) {
      const c = sim.crosses[i];
      if (c.t > 0) {
        c.t -= dt;
        if (c.t >= 0) continue;
        c.s += c.t; // le reste du pas passe dans la poussée
        c.t = 0;
      } else c.s -= dt;
      if (c.s > 0) continue;
      sim.crosses.splice(i, 1);
      this.teleDone.set('c' + c.id, TELE_DONE_TTL);
    }
    for (const w of sim.walls) if (w.t > 0) w.t = Math.max(0, w.t - dt); // les rochers, eux, viennent du snapshot
    for (let i = sim.fuses.length - 1; i >= 0; i--) {
      const f = sim.fuses[i];
      if ((f.t -= dt) > 0) continue;
      sim.fuses.splice(i, 1);
      this.teleDone.set('f' + f.id, TELE_DONE_TTL);
      this.localImpact({ t: 'explosion', x: f.x, y: f.y, r: f.r, style: 'fire' }); // comme `Sim.step` → `addBlast(…, 'fire')`
    }
    for (const a of sim.aliens) {
      const L = a.def.lurk ?? a.def.spikeRing;
      if (L && a.lurkPhase === 3) {
        if (a.def.spikeRing) a.spikeAng += (a.def.spikeRing.turn / a.def.spikeRing.aim) * Math.min(dt, a.lurkT); // le télégraphe du crabe tourne
        a.lurkT -= dt;
        if (a.lurkT <= 0) {
          a.lurkPhase = 4; // les pics partent (la suite vient du snapshot)
          a.lurkT = Math.max(0, L.sweep + a.lurkT);
        }
      } else if (L && a.lurkPhase === 4) a.lurkT = Math.max(0, a.lurkT - dt);
      if (a.def.burrow && a.lurkPhase > 0) this.advanceBurrow(a, dt);
      if (a.def.rush) {
        if (a.rushWind > 0) {
          a.rushWind -= dt;
          if (a.rushWind <= 0) {
            const over = -a.rushWind;
            a.rushWind = 0;
            this.startCharge(a, over);
          }
        }
      }
      const J = a.def.leap;
      if (J && a.leapT > 0) {
        const land = J.recover; // `leapT` restant à l'atterrissage
        const before = a.leapT;
        a.leapT = Math.max(0, a.leapT - dt);
        const key = 'j' + a.id;
        if (before > land && a.leapT <= land && !this.teleDone.has(key)) {
          this.teleDone.set(key, J.recover + 0.5);
          this.localImpact({ t: 'slam', x: a.leapX, y: a.leapY, r: J.radius });
        }
      }
    }
  }

  /**
   * Plongée du Scarab avancée de `dt` (phases de `Horde.updateBurrow` : 1 s'enterre, 2 sous terre, 3 ressort, 4 ruée) ; à la fin de la phase 2, l'onde
   * de choc de sortie est jouée ici, sur la zone affichée.
   */
  private advanceBurrow(a: AlienState, dt: number): void {
    const B = a.def.burrow!;
    if (!this.burrows.has(a.id)) this.burrowStart(a);
    let t = dt;
    if (a.lurkPhase === 1) {
      if (a.lurkT > t) {
        a.lurkT -= t;
        t = 0;
      } else {
        t -= a.lurkT;
        a.lurkPhase = 2;
        a.lurkT = B.wait;
        const b = this.burrows.get(a.id);
        if (b?.mine) this.aimAtMine(a, b);
      }
    }
    if (t > 0 && a.lurkPhase === 2) {
      const before = a.lurkT;
      a.lurkT -= t;
      t = Math.max(0, -a.lurkT);
      const b = this.burrows.get(a.id);
      if (b && b.mine && !b.locked && before > B.lock && a.lurkT <= B.lock) {
        // verrouillage : l'axe est la direction de course de ma squad à cet instant (comme l'hôte avec `Squad.vel` quand il jouera ces inputs)
        const n = Math.hypot(this.myVel.x, this.myVel.y);
        b.locked = true;
        b.dx = n > 1 ? this.myVel.x / n : 0;
        b.dy = n > 1 ? this.myVel.y / n : 0;
      }
      if (a.lurkT <= 0) {
        if (b && b.mine) {
          a.leapX = b.x;
          a.leapY = b.y;
        }
        a.lurkPhase = 3;
        a.lurkT = B.rise;
        a.x = a.px = a.leapX;
        a.y = a.py = a.leapY;
        if (b) b.emerged = true;
        const key = 'b' + a.id;
        if (!this.teleDone.has(key)) {
          this.teleDone.set(key, TELE_DONE_TTL);
          this.localImpact({ t: 'slam', x: a.leapX, y: a.leapY, r: B.radius });
        }
      }
    }
    if (t > 0 && a.lurkPhase === 3) {
      if (a.lurkT > t) {
        a.lurkT -= t;
        t = 0;
      } else {
        t -= a.lurkT;
        a.lurkPhase = 4;
        a.lurkT = B.lunge;
      }
    }
    if (t > 0 && a.lurkPhase === 4) a.lurkT = Math.max(0, a.lurkT - t);
  }

  /** Début de la plongée du Scarab (vue ici) : vise-t-il ma squad ? la plus proche de lui, comme `Horde` sans cible (`burrowSq`, vérifié dès que l'hôte a visé). */
  private burrowStart(a: AlienState): void {
    const mine = this.sim.squads.find((q) => q.owner === this.localPlayer);
    let nearest: Squad | undefined;
    let best = Infinity;
    for (const q of this.sim.squads) {
      if (q.soldiers.length === 0) continue;
      const d = Math.hypot(q.center.x - a.x, q.center.y - a.y);
      if (d < best) {
        best = d;
        nearest = q;
      }
    }
    const b = { mine: !!mine && nearest === mine && this.predictor.active, checked: false, locked: false, dx: 0, dy: 0, x: a.leapX, y: a.leapY, emerged: false };
    this.burrows.set(a.id, b);
    if (b.mine && a.lurkPhase === 2) this.aimAtMine(a, b);
  }

  /** Zone de sortie sur le centre de ma squad affichée, ou le point libre le plus proche (anneaux de 60 et 120 px), comme `Horde.aimBurrow`. */
  private aimAtMine(a: AlienState, b: { x: number; y: number }): void {
    const sq = this.sim.squads.find((q) => q.owner === this.localPlayer);
    if (!sq) return;
    const r = a.radius * 0.6;
    for (const d of [0, 60, 120]) {
      for (let k = 0; k < (d === 0 ? 1 : 8); k++) {
        const ang = (k / 8) * Math.PI * 2;
        const p = { x: sq.center.x + Math.cos(ang) * d, y: sq.center.y + Math.sin(ang) * d };
        if (this.sim.arena.isFree(p, r)) {
          b.x = p.x;
          b.y = p.y;
          return;
        }
      }
    }
    const p = { x: sq.center.x, y: sq.center.y, radius: a.radius };
    this.sim.arena.constrain(p);
    b.x = p.x;
    b.y = p.y;
  }

  /** Chaque tick : zone de sortie du Scarab qui vise ma squad (suit ma squad affichée, puis glisse sur l'axe figé) ; Scarab déjà ressorti ici, tenu à sa sortie. */
  private trackBurrows(dt: number): void {
    for (const a of this.sim.aliens) {
      const b = this.burrows.get(a.id);
      if (!b) continue;
      if (b.mine && a.lurkPhase === 2) {
        if (!b.locked) this.aimAtMine(a, b);
        else {
          const along = (this.myVel.x * b.dx + this.myVel.y * b.dy) * dt;
          const p = { x: b.x + b.dx * along, y: b.y + b.dy * along, radius: a.radius * 0.6 };
          this.sim.arena.constrain(p);
          b.x = p.x;
          b.y = p.y;
        }
        a.leapX = b.x;
        a.leapY = b.y;
      }
    }
  }

  /** Après un snapshot : la zone suivie ici remplace celle de l'hôte (en retard). */
  private applyBurrows(): void {
    for (const a of this.sim.aliens) {
      const b = this.burrows.get(a.id);
      if (!b) continue;
      if (b.mine && a.lurkPhase === 2) {
        a.leapX = b.x;
        a.leapY = b.y;
      }
    }
  }

  /** Départ d'une charge (fin du télégraphe vue ici) : une seule fois par charge (clé = alien + point de départ), simulée depuis `over` s. */
  private startCharge(a: AlienState, over: number): void {
    const R = a.def.rush!;
    const key = 'r' + a.id + ':' + Math.round(a.rushX) + ':' + Math.round(a.rushY);
    if (this.teleDone.has(key)) return;
    this.teleDone.set(key, R.length / R.speed + R.windup + 2);
    // départ : dernière position de l'hôte (l'alien peut encore dériver pendant le télégraphe : `rushX/Y` est celle de son début) ; axe normalisé (quantifié au centième)
    const g = this.goals.get(a);
    const n = Math.hypot(a.rushDx, a.rushDy) || 1;
    const c: Charge = { x: g ? g.x : a.x, y: g ? g.y : a.y, vx: 0, vy: 0, dx: a.rushDx / n, dy: a.rushDy / n, t: 0, dur: R.length / R.speed, done: false, hostSeen: false };
    this.charges.set(a.id, c);
    if (over > 0) this.stepCharge(a, c, over);
  }

  /** Avance une charge simulée ici de `dt` s, par pas de tick (loi de `Horde.update` pendant `rushT`) ; rochers brisés ici, double de l'hôte jeté. */
  private stepCharge(a: AlienState, c: Charge, dt: number): void {
    const R = a.def.rush!;
    const h = 1 / TICK_RATE;
    for (let left = dt; left > 1e-6 && !c.done; left -= h) {
      const k = Math.min(h, left);
      c.t += k;
      const rocks = this.sim.arena.rocks;
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        if (!rushSmashes(c.x, c.y, a.radius, R.speed * k, r)) continue;
        rocks.splice(i, 1);
        this.teleDone.set('k' + r.id, TELE_DONE_TTL + 3);
        this.localEvents.push({ t: 'rockBreak', id: r.id, x: r.x, y: r.y, r: r.radius, dx: c.dx, dy: c.dy });
      }
      const stop = rushStop(this.sim.arena, c.x, c.y, c.dx, c.dy, Math.hypot(c.vx, c.vy) * k, a.radius);
      if (stop >= 0) {
        c.x += c.dx * stop;
        c.y += c.dy * stop;
        c.vx = c.vy = 0;
        c.done = true;
      } else {
        c.vx = damp(c.vx, c.dx * R.speed, 8, k);
        c.vy = damp(c.vy, c.dy * R.speed, 8, k);
        c.x += c.vx * k;
        c.y += c.vy * k;
        if (c.t >= c.dur) c.done = true;
      }
      if (c.done && R.burst) this.localImpact({ t: 'slam', x: c.x, y: c.y, r: 130 }); // jumeaux : onde de départ des orbes (les orbes, elles, viennent du snapshot)
    }
  }

  /** Saut du crabe : position pendant le vol, d'après le départ, le point d'impact et `leapT` (avancé) ; le snapshot, en retard, la ferait atterrir trop tard. */
  private placeLeaper(a: AlienState): void {
    const J = a.def.leap;
    if (!J || a.leapT <= 0 || Number.isNaN(a.leapFromX)) return;
    const elapsed = J.windup + J.flight + J.recover - a.leapT;
    if (elapsed <= J.windup) return;
    const k = Math.min(1, (elapsed - J.windup) / J.flight);
    a.x = a.leapFromX + (a.leapX - a.leapFromX) * k;
    a.y = a.leapFromY + (a.leapY - a.leapFromY) * k;
  }

  /** Un tick client : prédiction de la squad locale, extrapolation + lissage du reste, recalcul du centre des squads. */
  step(dtReal: number, local?: LocalInput): void {
    const { sim } = this;
    // monde figé chez l'hôte : les objets ne font plus que rejoindre leur position reçue (sinon ils avancent à leur vitesse puis
    // sont ramenés à chaque snapshot : tremblement des projectiles et des aliens pendant la pause)
    const dt = this.frozen ? 0 : dtReal;
    const predicting = !!local;
    // ma squad : figée ou non d'après le dernier snapshot reçu (sans délai), pas d'après celui du tampon
    const localFrozen = this.directLocal ? this.localFrozen : this.frozen;
    this.inputHeld = !!local && this.predictor.step(sim.arena, local.n, local.mx, local.my, dtReal, localFrozen);
    if (local) this.lastN = local.n;
    if (this.predictor.active && !localFrozen) {
      const a = this.predictor.anchor;
      if (this.myPrev) {
        let vx = (a.x - this.myPrev.x) / dtReal;
        let vy = (a.y - this.myPrev.y) / dtReal;
        if (Math.hypot(vx, vy) > this.predictor.anchorSpeed * 2) vx = vy = 0; // saut (recalage) : pas une vitesse, comme `Squad.update`
        this.myVel.x = damp(this.myVel.x, vx, 4, dtReal);
        this.myVel.y = damp(this.myVel.y, vy, 4, dtReal);
      }
      this.myPrev = { x: a.x, y: a.y };
    }
    for (const [k, t] of this.teleDone) if (t - dtReal <= 0) this.teleDone.delete(k); else this.teleDone.set(k, t - dtReal);
    for (let i = this.localImpacts.length - 1; i >= 0; i--) if ((this.localImpacts[i].ttl -= dtReal) <= 0) this.localImpacts.splice(i, 1);
    this.localHold = !!local && local.n > this.predictor.limitN; // les inputs après la limite seront jetés par l'hôte (pause annoncée) : ma squad ne bouge plus
    const predicted = predicting && this.predictor.active;
    for (const sq of sim.squads) {
      if (predicted && sq.owner === this.localPlayer) {
        // la squad locale suit l'ancre prédite : pas d'extrapolation à la vitesse reçue (elle est déjà dans le décalage)
        sq.anchor.x = this.predictor.anchor.x;
        sq.anchor.y = this.predictor.anchor.y;
        const dtLocal = localFrozen ? 0 : dtReal;
        for (const s of sq.soldiers) this.followPredicted(s, dtLocal);
      } else {
        for (const s of sq.soldiers) this.follow(s, dt);
      }
      if (sq.soldiers.length > 0) robustCentroid(sq.soldiers, sq.radius * 1.6, sq.center);
    }
    for (const a of sim.aliens) {
      this.follow(a, dt);
      this.placeLeaper(a);
      const charge = this.charges.get(a.id);
      if (charge) {
        this.stepCharge(a, charge, dt);
        a.x = charge.x;
        a.y = charge.y;
      }
      // compteurs de télégraphes : la sim hôte les décompte à chaque tick, on fait pareil entre deux snapshots (sinon ils avancent par paliers de 66 ms)
      if (a.slamWind > 0) a.slamWind = Math.max(0, a.slamWind - dt);
      if (a.rushWind > 0 && !a.def.rush) a.rushWind = Math.max(0, a.rushWind - dt); // charge : `advanceTelegraphs` (départ de la charge simulée ici)
      if (a.castT > 0) a.castT = Math.max(0, a.castT - dt);
      const telegraph = ((a.def.lurk || a.def.spikeRing) && (a.lurkPhase === 3 || a.lurkPhase === 4)) || (!!a.def.burrow && a.lurkPhase > 0); // pics, plongée du Scarab : `advanceTelegraphs`
      if (!telegraph && a.lurkT > 0) a.lurkT = Math.max(0, a.lurkT - dt);
      if (!a.def.leap && a.leapT > 0) a.leapT = Math.max(0, a.leapT - dt); // saut du crabe : `advanceTelegraphs` (Scarab : `leapT` = temps restant, ici)
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
    this.advanceTelegraphs(dt); // stalactites, croix, murs, pics, saut du crabe, plongée du Scarab : décompte entre deux snapshots (impact joué ici à la fin)
    this.trackBurrows(dt);
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
    const landed: Projectile[] = [];
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
      const was = p.life;
      p.life = Math.max(0, p.life - (p.lob ? dt : dt / PROJECTILE_FADE)); // en cloche : vrai temps de vol (télégraphe)
      if (p.lob && p.team === 'aliens' && p.aoe > 0 && was > 0 && p.life <= 0) landed.push(p);
    }
    // boules en cloche des aliens qui touchent le sol ici (vol avancé de `teleLead`) : explosion jouée tout de suite, la boule disparaît
    for (const p of landed) {
      const g = this.goals.get(p);
      const x = g ? g.x : p.x;
      const y = g ? g.y : p.y;
      const style = p.texture === 'fx_spit' ? 'spit' : p.texture === 'fx_blob_green' ? 'acid' : 'slime'; // comme `Combat.stepProjectile` / `Sim.cleanup`
      this.localImpact({ t: 'explosion', x, y, r: p.aoe, style });
      this.teleDone.set('l' + p.id, TELE_DONE_TTL);
      this.projectiles.delete(p.id);
      sim.combat.projectiles.release(p);
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
        burrowSq: '',
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
    const charge = this.charges.get(a.id);
    if (charge) {
      if (a.rushing) {
        charge.hostSeen = true;
        // l'hôte la montre (en retard, sur la même ligne) : l'écart latéral est recalé ; s'il est allé plus loin que la charge simulée ici (arrêtée à tort,
        // un obstacle frôlé), elle reprend de sa position
        const ex = a.x - charge.x;
        const ey = a.y - charge.y;
        const side = -ex * charge.dy + ey * charge.dx;
        charge.x += -charge.dy * side * 0.5;
        charge.y += charge.dx * side * 0.5;
        if (charge.done && ex * charge.dx + ey * charge.dy > 4) {
          charge.x = a.x;
          charge.y = a.y;
          charge.done = false;
        }
      }
      // finie ici et chez l'hôte (qui l'a annoncée puis plus) : l'alien suit de nouveau le snapshot ; filet de sécurité si l'hôte ne l'a jamais annoncée
      if (charge.done && ((charge.hostSeen && !a.rushing && a.rushWind <= 0) || charge.t > charge.dur + 2)) this.charges.delete(a.id);
    }
    s.rushDx = a.rushDx;
    s.rushDy = a.rushDy;
    s.rushX = a.rushX;
    s.rushY = a.rushY;
    const J = s.def.leap;
    if (J && a.leapT > 0) {
      const prev = this.leapSeen.get(a.id);
      if (prev === undefined || a.leapT > prev + 0.05) {
        // nouveau saut : immobile pendant la préparation, sa position est le départ ; vu en plein vol : départ inconnu, on suit le snapshot
        const fresh = J.windup + J.flight + J.recover - a.leapT <= J.windup;
        s.leapFromX = fresh ? a.x : NaN;
        s.leapFromY = fresh ? a.y : NaN;
      }
      this.leapSeen.set(a.id, a.leapT);
    } else this.leapSeen.delete(a.id);
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
    if (s.def.burrow) {
      const b = this.burrows.get(a.id);
      if (a.lurkPhase === 0 || a.lurkPhase === 4) this.burrows.delete(a.id); // plongée finie chez l'hôte
      else if (b && a.lurkPhase === 2 && !b.checked) {
        // l'hôte a visé : sa zone est sur la squad visée (± 120 px) ; la plus proche des ancres du snapshot dit si c'est moi
        b.checked = true;
        let best = Infinity;
        let owner = '';
        for (const q of this.snapAnchors) {
          const d = Math.hypot(q.x - a.leapX, q.y - a.leapY);
          if (d < best) {
            best = d;
            owner = q.owner;
          }
        }
        const mine = owner === this.localPlayer && this.predictor.active;
        if (mine && !b.mine) {
          b.mine = true;
          b.locked = false;
          this.aimAtMine(s, b);
        } else if (!mine) b.mine = false; // la zone de l'hôte, en retard, reprend la main
      }
      if (b && b.emerged && a.lurkPhase <= 2) this.setGoal(s, b.x, b.y); // ressorti ici, pas encore chez l'hôte : il reste à sa sortie
    }
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

  /** Met une table de projectiles reflétés à jour d'après un snapshot (ceux que `keep` retient) : créés, lissés, libérés quand ils disparaissent. */
  private syncProjectiles(list: readonly ProjectileSnap[], map: Map<number, Projectile>, keep: (p: ProjectileSnap) => boolean): void {
    const seen = new Set<number>();
    for (const p of list) {
      if (!keep(p) || seen.has(p.id)) continue; // collision d'id (modulo 65536) : extrêmement rare, ignorée
      seen.add(p.id);
      this.upsertProjectile(p, map);
    }
    for (const [id, p] of map) {
      if (seen.has(id)) continue;
      map.delete(id);
      this.sim.combat.projectiles.release(p);
    }
  }

  private upsertProjectile(snap: ProjectileSnap, map: Map<number, Projectile>): void {
    let p = map.get(snap.id);
    const fresh = !p;
    if (!p) {
      p = this.sim.combat.projectiles.acquire();
      map.set(snap.id, p);
      p.id = snap.id;
      // balle de ma squad : elle naît là où l'hôte voit mes soldats, en retard sur ma squad prédite. Elle part donc décalée de l'avance de la prédiction
      // (ancre prédite − ancre hôte, la même pour toute la squad), puis le lissage (`CATCH_UP`) la ramène sur sa trajectoire hôte en quelques ticks
      const lead = map === this.localProjectiles && this.predictor.active && !snap.lob;
      p.x = p.px = snap.x + (lead ? this.predictor.dx : 0);
      p.y = p.py = snap.y + (lead ? this.predictor.dy : 0);
    }
    // boule en cloche d'un alien : vol avancé de `teleLead` (son impact tombe quand ma squad affichée est là où l'hôte la juge), jamais au-delà du sol
    const ahead = snap.alien && snap.lob ? Math.min(this.teleLead, snap.age * snap.flight) : 0;
    if (ahead > 0 && fresh) {
      p.x = p.px = p.x + snap.vx * ahead; // nouvelle : elle naît déjà avancée
      p.y = p.py = p.y + snap.vy * ahead;
    }
    this.goals.set(p, { x: snap.x + snap.vx * ahead, y: snap.y + snap.vy * ahead }); // position hôte : le projectile glisse vers elle (pas de saut à chaque snapshot)
    p.vx = snap.vx;
    p.vy = snap.vy;
    p.texture = snap.texture;
    p.flame = snap.flame;
    p.lob = snap.lob;
    p.aoe = snap.aoe;
    p.team = snap.alien ? 'aliens' : '';
    p.maxLife = snap.lob ? snap.flight : 1;
    p.life = snap.age * p.maxLife - ahead;
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
      if (dt > 0 && !this.localHold) {
        this.crowdStep(c, this.predictor.anchor.x, this.predictor.anchor.y, this.predictor.anchorSpeed, dt, u.radius);
        const gap = Math.hypot(c.ox, c.oy);
        if (gap > 0) {
          const k = Math.max(0, gap - ENTER_CLOSE_SPEED * dt) / gap; // l'écart se ferme à vitesse constante (pas de longue queue exponentielle)
          c.ox *= k;
          c.oy *= k;
        }
      }
      u.x = c.x + c.ox;
      u.y = c.y + c.oy;
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

  private approach(u: { x: number; y: number; kind?: string }, g: Goal): void {
    this.approachTo(u, g.x, g.y);
  }

  private approachTo(u: { x: number; y: number; kind?: string }, gx: number, gy: number): void {
    const dx = gx - u.x;
    const dy = gy - u.y;
    if (dx * dx + dy * dy > TELEPORT * TELEPORT) {
      u.x = gx;
      u.y = gy;
      return;
    }
    let sx = dx * CATCH_UP;
    let sy = dy * CATCH_UP;
    if (u.kind === 'soldier') {
      // un soldat ne « glisse » jamais plus vite que `SOLDIER_MAX_STEP` px par tick (un peu plus que sa course) : un rattrapage de position hôte
      // (fin d'un étourdissement, d'une bulle, d'un glaçon : la position affichée avait un aller-retour de retard) est une course, pas un saut
      const len = Math.hypot(sx, sy);
      if (len > SOLDIER_MAX_STEP) {
        sx *= SOLDIER_MAX_STEP / len;
        sy *= SOLDIER_MAX_STEP / len;
      }
    }
    u.x += sx;
    u.y += sy;
  }
}

function prune<V>(map: Map<number, V>, keep: Set<number>): void {
  for (const id of map.keys()) if (!keep.has(id)) map.delete(id);
}
