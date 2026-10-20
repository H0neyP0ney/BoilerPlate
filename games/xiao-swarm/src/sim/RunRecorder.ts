import type { UpgradeId } from '../data/progression';
import type { Sim } from './Sim';
import type { PlayerId, SimEvent } from './types';

/** Rayon (px) autour du centre de la squad dans lequel un alien compte comme « au contact » (pression vécue, au lieu des PV de toute la carte). */
const NEAR_RADIUS = 300;

/** Une seconde de partie (temps de jeu : la pause du choix d'upgrade ne compte pas). */
export interface RunSample {
  /** Temps de jeu (s) en fin de fenêtre. */
  t: number;
  level: number;
  /** Soldats vivants de la squad suivie, aliens vivants et leurs PV cumulés (toute la carte). */
  soldiers: number;
  aliens: number;
  aliveHp: number;
  /** Aliens vivants à moins de `NEAR_RADIUS` px du centre de la squad, et leurs PV (boucliers compris) : la pression au contact. */
  nearAliens: number;
  nearHp: number;
  /** Sur la seconde : PV d'aliens réellement retirés (sans overkill), PV de soldats perdus, PV d'aliens apparus, kills, soldats morts. */
  dealt: number;
  taken: number;
  spawned: number;
  kills: number;
  lost: number;
  /** Sur la seconde : recrues apparues, ramassées, expirées (jamais ramassées) dont celles « noyées » (≥ 5 aliens à 120 px). */
  recDropped: number;
  recPicked: number;
  recExpired: number;
  recSwamped: number;
  /**
   * DPS théorique de la squad (`Combat.squadDps` : cadence × dégâts de chaque soldat qui peut tirer, upgrades additives, critique moyen, stimpack et perks compris ;
   * sans roquettes ni orbes électriques). Format v1 : Damage × Fire rate seulement (sous-estimé).
   */
  theoDps: number;
  /** PV cumulés des soldats vivants de la squad suivie (boucliers et overheal compris) et leur maximum (soldats vivants seulement) : santé de la squad. */
  squadHp: number;
  squadMaxHp: number;
  /** Soldats empêchés d'agir à la fin de la seconde : gelés, étourdis, avalés par une bulle, en l'air (toile, souffle), et soldats enflammés. */
  frozen: number;
  stunned: number;
  captured: number;
  airborne: number;
  burning: number;
  /** Vitesse de la squad (px/s, `Squad.vel`) : 0 = immobile ; sert à voir si le joueur kite. */
  speed: number;
  /** Relances d'upgrade encore disponibles. */
  rerolls: number;
  /** Gestionnaire de vagues figé (boss vivant ou trop d'aliens), et boss vivants. */
  suspended: boolean;
  bosses: number;
  /** Images par seconde affichées pendant la seconde (moyenne) et la pire image (ms) ; 0 si non mesuré. */
  fps: number;
  worstFrameMs: number;
  /** Taille max (octets) d'un snapshot réseau encodé pendant la seconde (0 : aucune mesure). */
  snapBytes: number;
  /** Octets par catégorie (en-tête, squads, aliens, projectiles, globes…) du plus gros snapshot de la seconde. */
  snapSizes?: Record<string, number>;
  /**
   * Sur la seconde (clés absentes = 0, objets omis s'ils sont vides) : aliens tués / apparus par type, soldats perdus par classe, pièces / diamants RAMASSÉS par source,
   * PV de soldats retirés par source (`alien:capacité`, ex. `slime:melee`, `burner:trail:burn`), soldats tués par source, PV rendus par source (`medic`, `healField`),
   * XP des globes (`dropped`, `picked`, `expired`, `overflow`). Compteurs : `Sim.tally`.
   */
  killTypes?: Record<string, number>;
  spawnTypes?: Record<string, number>;
  lostTypes?: Record<string, number>;
  coins?: Record<string, number>;
  gems?: Record<string, number>;
  takenBy?: Record<string, number>;
  deathsBy?: Record<string, number>;
  healBy?: Record<string, number>;
  xp?: Record<string, number>;
}

/** Apparition d'un boss (pour vérifier l'ordre réel : mini-boss puis boss final). */
export interface BossSpawn {
  t: number;
  alien: string;
  kind: string;
}

/** Événement daté de la partie (timeline) : `e` = sorte, le reste dépend de la sorte. */
export interface RunEvent {
  t: number;
  e: string;
  [key: string]: string | number | boolean;
}

/** Informations sur la partie que la simulation ne connaît pas (fournies par l'affichage). */
export interface RunMeta {
  /** Libellés des triches utilisées (panneau Triche) : une partie qui en a ne devrait pas compter dans les stats. */
  cheats: string[];
  /** Réglages de dev mémorisés dans le navigateur qui masquaient les valeurs du code pendant la partie. */
  overrides: string[];
  /** Partie avancée (`?jump=…`, `?endtest=1`) ou autre test (`null` sinon). */
  jump: string | null;
}

export interface RunLog {
  /** 2 depuis le 20/10 (nouveaux champs ; `theoDps` complet). */
  version: 2;
  mode: string;
  victory: boolean;
  duration: number;
  level: number;
  difficulty: string;
  seed: number;
  tutorial: boolean;
  online: boolean;
  /** Squads de la partie (humains et bots). */
  players: number;
  cheats: string[];
  overrides: string[];
  jump: string | null;
  /** Source du coup qui a tué le dernier soldat (défaite), '' sinon. */
  deathCause: string;
  picked: Partial<Record<UpgradeId, number>>;
  prismPicked: Partial<Record<UpgradeId, number>>;
  bosses: BossSpawn[];
  /** Envois de vagues (`WaveRunner.log`). */
  waves: Sim['waves']['log'];
  /** Timeline : boss (apparition, enragement, mort), level up, upgrades, power-ups, recrues, relances, mort et revive de la squad, coffres à diamants. */
  events: RunEvent[];
  samples: RunSample[];
}

type Metrics = Sim['metrics'];
type Bag = Record<string, number>;
type Tally = Sim['tally'];
type BagKey = Exclude<keyof Tally, 'lastDeath'>;

/** Compteurs de `Sim.tally` → nom du champ dans l'échantillon. */
const BAGS: Record<BagKey, string> = { kills: 'killTypes', spawns: 'spawnTypes', lostBy: 'lostTypes', coins: 'coins', gems: 'gems', takenBy: 'takenBy', deathsBy: 'deathsBy', healBy: 'healBy', xp: 'xp' };
const BAG_KEYS = Object.keys(BAGS) as BagKey[];

const copyBags = (t: Tally): Record<BagKey, Bag> => Object.fromEntries(BAG_KEYS.map((k) => [k, { ...t[k] }])) as Record<BagKey, Bag>;

/** Différence `now − before` clé par clé, sans les clés à zéro (arrondie au dixième) ; `undefined` s'il n'y a rien (garde les fichiers petits). */
function diffBag(now: Bag, before: Bag): Bag | undefined {
  let out: Bag | undefined;
  for (const k in now) {
    const d = Math.round((now[k] - (before[k] ?? 0)) * 10) / 10;
    if (d > 0) (out ??= {})[k] = d;
  }
  return out;
}

/**
 * Enregistre une partie seconde par seconde (dev) pour équilibrer : pression des vagues, pression subie et ses sources, santé de la squad, économie, réseau.
 * Pur : ne fait que lire la Sim et ses compteurs (`Sim.metrics`, `Sim.tally`) et les événements que l'affichage lui passe. `npm run sim:calibrate` lit les JSON produits.
 */
export class RunRecorder {
  readonly samples: RunSample[] = [];
  private next = 1;
  private last: Metrics;
  private lastBags: Record<BagKey, Bag>;
  readonly bosses: BossSpawn[] = [];
  readonly events: RunEvent[] = [];
  private snapMax = 0;
  private snapSizes: Record<string, number> | undefined;
  private frames = 0;
  private frameMs = 0;
  private worstMs = 0;
  private owner: PlayerId | null = null;
  private rerolls = -1;

  constructor(private readonly sim: Sim) {
    this.last = { ...sim.metrics };
    this.lastBags = copyBags(sim.tally);
  }

  /** Taille d'un snapshot encodé et sa ventilation (fournies par l'affichage, qui sait encoder). */
  noteSnapshot(bytes: number, sizes?: Record<string, number>): void {
    if (bytes <= this.snapMax) return;
    this.snapMax = bytes;
    this.snapSizes = sizes && { ...sizes };
  }

  /** Une image affichée (durée réelle en ms) : FPS moyen et pire image de chaque seconde. */
  noteFrame(ms: number): void {
    this.frames++;
    this.frameMs += ms;
    this.worstMs = Math.max(this.worstMs, ms);
  }

  private push(e: string, data: Record<string, string | number | boolean> = {}): void {
    this.events.push({ t: Math.round(this.sim.waves.time * 10) / 10, e, ...data });
  }

  /** Un événement de la simulation (tous passent ici : seuls ceux utiles à l'équilibrage sont gardés, ceux d'une autre squad écartés). */
  noteEvent(ev: SimEvent): void {
    const mine = (owner: PlayerId): boolean => owner === this.owner;
    switch (ev.t) {
      case 'boss':
        this.bosses.push({ t: Math.round(this.sim.waves.time), alien: ev.alien, kind: ev.kind });
        this.push('boss', { alien: ev.alien, kind: ev.kind });
        break;
      case 'bossEnrage':
        this.push('bossEnrage', { alien: ev.alien, level: ev.level });
        break;
      case 'bossDown':
        this.push('bossDown', { alien: ev.alien, kind: ev.kind });
        break;
      case 'levelUp':
        if (mine(ev.owner)) this.push('levelUp', { level: ev.level });
        break;
      case 'upgradePicked':
        if (mine(ev.owner)) this.push('upgrade', { id: ev.id, prism: ev.prism });
        break;
      case 'powerup':
        if (mine(ev.owner)) this.push('powerup', { kind: ev.kind });
        break;
      case 'recruited':
        if (mine(ev.owner)) this.push('recruit', { cls: ev.cls });
        break;
      case 'squadWiped':
        if (mine(ev.owner)) this.push('wiped', { cause: this.sim.tally.lastDeath });
        break;
      case 'squadSpawned':
        if (mine(ev.owner)) this.push('revive');
        break;
      case 'gemChestReady':
        this.push('gemChestReady');
        break;
      case 'gemChestOpen':
        this.push('gemChestOpen');
        break;
      case 'tutorial':
        this.push('tutorial', { phase: ev.phase });
        break;
    }
  }

  /** À appeler à chaque image : ajoute un échantillon par seconde de temps de jeu franchie. */
  update(owner: PlayerId): void {
    this.owner = owner;
    const t = this.sim.waves.time;
    if (t < this.next - 1) {
      // temps remis à zéro (relance) : on repart de zéro
      this.samples.length = 0;
      this.events.length = 0;
      this.bosses.length = 0;
      this.next = 1;
      this.last = { ...this.sim.metrics };
      this.lastBags = copyBags(this.sim.tally);
    }
    const { sim } = this;
    const squad = sim.squadOf(owner);
    if (squad && squad.rerolls !== this.rerolls) {
      if (this.rerolls >= 0 && squad.rerolls < this.rerolls) this.push('reroll', { left: squad.rerolls });
      this.rerolls = squad.rerolls;
    }
    if (t < this.next) return;
    const m = sim.metrics;
    let aliveHp = 0;
    let aliens = 0;
    let nearAliens = 0;
    let nearHp = 0;
    let bosses = 0;
    const cx = squad?.center.x ?? 0;
    const cy = squad?.center.y ?? 0;
    for (const a of sim.aliens) {
      if (!a.alive) continue;
      aliens++;
      const hp = a.hp + a.shield;
      aliveHp += hp;
      if (a.def.boss) bosses++;
      if (squad && (a.x - cx) ** 2 + (a.y - cy) ** 2 < NEAR_RADIUS * NEAR_RADIUS) {
        nearAliens++;
        nearHp += hp;
      }
    }
    let soldiers = 0;
    let squadHp = 0;
    let squadMaxHp = 0;
    let frozen = 0;
    let stunned = 0;
    let captured = 0;
    let airborne = 0;
    let burning = 0;
    if (squad) {
      for (const s of squad.soldiers) {
        if (!s.alive) continue;
        soldiers++;
        squadHp += Math.max(0, s.hp) + s.shield;
        squadMaxHp += s.maxHp;
        if (s.frozen > 0) frozen++;
        if (s.stun > 0) stunned++;
        if (s.capturedBy) captured++;
        if (s.jumpT > 0 || s.knockT > 0) airborne++;
        if (s.burn > 0) burning++;
      }
    }
    const now = copyBags(sim.tally);
    const diffs: Record<string, Bag> = {};
    for (const k of BAG_KEYS) {
      const d = diffBag(now[k], this.lastBags[k]);
      if (d) diffs[BAGS[k]] = d;
    }
    this.samples.push({
      t: Math.round(t * 10) / 10,
      level: squad?.level ?? 1,
      soldiers,
      aliens,
      aliveHp: Math.round(aliveHp),
      nearAliens,
      nearHp: Math.round(nearHp),
      dealt: Math.round(m.dealt - this.last.dealt),
      taken: Math.round(m.taken - this.last.taken),
      spawned: Math.round(m.spawnedHp - this.last.spawnedHp),
      kills: m.kills - this.last.kills,
      lost: m.soldiersLost - this.last.soldiersLost,
      recDropped: m.recDropped - this.last.recDropped,
      recPicked: m.recPicked - this.last.recPicked,
      recExpired: m.recExpired - this.last.recExpired,
      recSwamped: m.recSwamped - this.last.recSwamped,
      theoDps: squad ? Math.round(sim.combat.squadDps(squad)) : 0,
      squadHp: Math.round(squadHp),
      squadMaxHp: Math.round(squadMaxHp),
      frozen,
      stunned,
      captured,
      airborne,
      burning,
      speed: squad ? Math.round(Math.hypot(squad.vel.x, squad.vel.y)) : 0,
      rerolls: squad?.rerolls ?? 0,
      suspended: sim.waves.suspended,
      bosses,
      fps: this.frames > 0 ? Math.round((this.frames * 1000) / this.frameMs) : 0,
      worstFrameMs: Math.round(this.worstMs),
      snapBytes: this.snapMax,
      ...(this.snapSizes ? { snapSizes: this.snapSizes } : {}),
      ...diffs,
    });
    this.last = { ...m };
    this.lastBags = now;
    this.snapMax = 0;
    this.snapSizes = undefined;
    this.frames = 0;
    this.frameMs = 0;
    this.worstMs = 0;
    this.next = Math.floor(t) + 1;
  }

  finish(owner: PlayerId, mode: string, victory: boolean, meta: RunMeta): RunLog {
    const { sim } = this;
    const squad = sim.squadOf(owner);
    return {
      version: 2,
      mode,
      victory,
      duration: Math.round(sim.waves.time),
      level: squad?.level ?? 1,
      difficulty: sim.difficulty,
      seed: sim.config.seed,
      tutorial: !!sim.config.tutorial,
      online: !!sim.config.online,
      players: sim.squads.length,
      cheats: meta.cheats,
      overrides: meta.overrides,
      jump: meta.jump,
      deathCause: victory ? '' : sim.tally.lastDeath,
      picked: { ...(squad?.picked ?? {}) },
      prismPicked: { ...(squad?.prismPicked ?? {}) },
      bosses: this.bosses,
      waves: sim.waves.log.map((w) => ({ ...w })),
      events: this.events,
      samples: this.samples,
    };
  }
}
