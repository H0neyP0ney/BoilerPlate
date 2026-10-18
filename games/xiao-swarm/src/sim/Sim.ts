import { EventQueue, IdGen, Rng, SpatialHash, type Point } from '@xiao/engine/sim';
import { BURIED, CAPTIVE_VULN, DIFFICULTY, RING, UPGRADE_REPEL, LEVEL_UP_DELAY, REVIVE_INVULN, REVIVE_RADIUS, REVIVE_TIME, UPGRADE_CHOICE_TIME, WEB, KNOCK_HOP, FIRE } from '../config';
import { xpToNext } from '../data/progression';
import { ALIENS, bossKindAt, zombieStats, type AlienId } from '../data/aliens';
import type { DifficultyLevel } from '../data/difficultyLevels';
import { START_SQUADS, type SoldierClassId } from '../data/classes';
import type { MapDef } from '../data/maps';
import type { ModeDef } from '../data/modes';
import { Arena } from './Arena';
import { UpgradeOrbs } from './Chests';
import { Gems } from './Gems';
import { Combat } from './Combat';
import type { AlienState, Corpse, FirePatch, Puddle, ReviveZone, SoldierState, SpikeCross, Stalactite, Unit, WallTelegraph } from './entities';
import { Horde } from './Horde';
import { PowerUps } from './PowerUps';
import { Recruits } from './Recruits';
import { Tutorial } from './Tutorial';
import { Xp } from './Xp';
import { WaveRunner } from './WaveRunner';
import { Squad } from './Squad';
import { NO_INPUT, type PlayerId, type PlayerInput, type SimEvent } from './types';

/** Distance minimale entre un point de réapparition et les squads vivantes (hors écran). */
const SAFE_SPAWN_DISTANCE = 700;

/** Distance de spawn des aliens autour d'une squad (hors écran). */
const SPAWN_DISTANCE = 780;
/** Les deux premières vagues (envois à 0 s et 3 s de la timeline, avant `EARLY_SPAWN_UNTIL`) apparaissent plus près, juste hors écran (l'écran fait ±640 px × ±360 px à zoom 1, + 60-180 px d'écart tirés dans `spawnNear`). */
const EARLY_SPAWN_DISTANCE = 610;
const EARLY_SPAWN_UNTIL = 4;

export interface SimConfig {
  mode: ModeDef;
  seed: number;
  players: PlayerId[];
  /** Globes d'XP et montées de niveau. */
  xp?: boolean;
  /**
   * Choix d'upgrade limité dans le temps (`UPGRADE_CHOICE_TIME`, puis choix au hasard) : en ligne, pour ne pas bloquer les
   * autres joueurs. Faux en solo : le jeu reste en pause jusqu'au choix du joueur.
   */
  choiceTimeout?: boolean;
  /** Onboarding scripté au début de la partie (solo seulement) : voir `sim/Tutorial.ts`. */
  tutorial?: boolean;
  /**
   * Partie en ligne (hôte et clients, `HostSession` / `ClientSession`) : XP partagée par tous les joueurs, zones de réanimation
   * (`ModeDef.reviveZones`). Faux seul hors ligne. Remplace l'ancien mode `coop` (08/10).
   */
  online?: boolean;
  /** Niveau de difficulté de la run (`normal` par défaut) ; en ligne, celui de l'hôte. Pour l'instant sans effet sur le jeu. */
  difficulty?: DifficultyLevel;
}

/** Durée (s) pendant laquelle la flaque d'un slime mort peut encore être ressuscitée. */
const CORPSE_TTL = 14;

/**
 * Simulation complète d'une partie, SANS Phaser ni DOM : elle peut tourner
 * dans le navigateur (solo, ou hôte Netlib) comme sur un serveur Node.
 *
 *   sim.step(dt, inputs)   // tick fixe, inputs par joueur
 *   sim.events.drain(fn)   // effets à jouer / à diffuser
 *
 * Tout l'aléatoire passe par `sim.rng` (seedé) : même seed + mêmes inputs = même partie.
 */
export class Sim {
  readonly rng: Rng;
  readonly ids = new IdGen();
  readonly events = new EventQueue<SimEvent>();
  readonly map: MapDef;
  readonly arena: Arena;
  readonly squads: Squad[];
  readonly aliens: AlienState[] = [];
  /** Flaques de slimes morts, que les chamans peuvent ressusciter. */
  readonly corpses: Corpse[] = [];
  /** Flaques de flammes laissées par les slimes de feu. */
  readonly fires: FirePatch[] = [];
  /** Coop : zones où un joueur mort peut être ramené par un équipier. */
  readonly reviveZones: ReviveZone[] = [];
  /** Ondes de choc en cours d'application (montée de niveau). */
  private readonly shockwaves: { x: number; y: number; r: number; speed: number; duration: number; reach: number; lethal: PlayerId | null; t: number; hit: Map<number, { dx: number; dy: number; k: number; left: number }> }[] = [];
  /** Flaques de crachat : ralentissent les soldats dedans. */
  readonly puddles: Puddle[] = [];
  /** Murs annoncés (télégraphe jaune du bâtisseur) : ils deviennent des rochers à la fin du compte à rebours. */
  readonly walls: WallTelegraph[] = [];
  /** Stalactites annoncées (Scarab) : passent par le snapshot (télégraphe chez les clients). */
  readonly stalactites: Stalactite[] = [];
  /** Pics en croix du Rhino Alpha : passent par le snapshot (télégraphe et poussée chez les clients). */
  readonly crosses: SpikeCross[] = [];
  private burnCd = 0;
  /** Le boss final est mort : la partie (survie) est gagnée. */
  finalBossDead = false;
  /** Boss d'origine de chaque œuf vivant (id d'alien de l'œuf → boss) : détermine le contenu du coffre à diamants. Sim seulement. */
  readonly eggBoss = new Map<number, AlienId>();
  /** Séquence de fin (solo, boss final tombé) : plus de vagues, d'XP ni de dégâts aux soldats ; la vue pilote la squad vers la fusée (`beginEnding`). */
  ending = false;
  /** Soldats montés dans la fusée de fin : retirés sans mort (ni corps ni événement `soldierDied`). */
  private readonly boarded = new Set<SoldierState>();
  /** Boss et mini-boss tués depuis le début de la partie (voir `escalationHp` / `Damage` / `Rate` / `Speed`). */
  bossKills = 0;
  readonly alienHash = new SpatialHash<AlienState>(64);
  readonly soldierHash = new SpatialHash<SoldierState>(64);
  readonly horde: Horde;
  readonly combat: Combat;
  readonly recruits: Recruits;
  /** Coffres des boss tués et globes d'upgrade qui en sortent (réservés à leur joueur). */
  readonly upgradeOrbs: UpgradeOrbs;
  /** Diamants verts et coffres à diamants des boss (solo seulement, voir `Gems`). */
  readonly gems: Gems;
  readonly powerups: PowerUps;
  readonly xp: Xp;
  /** Tampon réutilisé pour les requêtes de voisinage (évite les allocations). */
  readonly scratchSoldiers: SoldierState[] = [];
  readonly waves: WaveRunner;
  /** Onboarding en cours (null hors tutoriel) : tant qu'il est actif, la timeline de vagues est suspendue. */
  readonly tutorial: Tutorial | null;
  /** Compteurs cumulés depuis la création de la Sim (lus par `RunRecorder`, jamais remis à zéro : le lecteur fait des différences). */
  readonly metrics = { dealt: 0, taken: 0, spawnedHp: 0, kills: 0, soldiersLost: 0, recDropped: 0, recPicked: 0, recExpired: 0, recSwamped: 0 };
  tick = 0;
  private readonly blasts: { x: number; y: number; r: number; dmg: number; team: string; owner: PlayerId; knock: number; style?: 'slime' | 'fire' | 'spit' | 'acid'; poison?: number; hop?: number }[] = [];
  /** Explosions retardées (kamikaze mort) : le corps reste sur place jusqu'à la fin de la mèche. */
  /** Aliens à faire surgir à la mort d'un alien à `deathSpawn` (posés en fin de tick par `cleanup`, jamais pendant qu'on parcourt `aliens`). */
  private readonly deathSpawns: { type: AlienId; x: number; y: number; count: number; radius: number; hpMul: number }[] = [];
  private readonly fuses: { x: number; y: number; t: number; r: number; dmg: number; knock: number }[] = [];

  constructor(readonly config: SimConfig) {
    this.rng = new Rng(config.seed);
    this.level = config.difficulty ?? 'normal';
    this.map = config.mode.map(config.seed);
    this.arena = new Arena(this.map);
    this.horde = new Horde(this);
    this.combat = new Combat(this);
    this.recruits = new Recruits(this);
    this.upgradeOrbs = new UpgradeOrbs(this);
    this.gems = new Gems(this);
    this.powerups = new PowerUps(this);
    this.xp = new Xp(this);
    this.squads = config.players.map((id) => new Squad(this, id));
    this.squads.forEach((sq, i) => (sq.slot = i));
    this.tutorial = config.tutorial ? new Tutorial(this) : null;
    this.waves = new WaveRunner(
      config.mode.waves,
      (type, count, arrival, ringRoll = 0) => {
        // Difficulté dynamique : chaque joueur de la partie en plus ajoute `DIFFICULTY.extraPlayerAliens` (75 %) d'ennemis (2 joueurs = ×1,75). Les joueurs
        // à terre comptent aussi (on peut les réanimer : la charge ne retombe pas quand un équipier tombe) ; ceux qui ont quitté la partie, non. Un boss,
        // lui, n'apparaît qu'une fois, avec ses PV multipliés par le même facteur (2 joueurs = ×1,75 ; ×le nombre de squads avant le 08/10).
        // Plafond d'aliens à l'apparition appliqué par type dans Horde.spawnNear (`ModeDef.maxAliens`, réserve pour les costauds) ; au-delà de
        // `DIFFICULTY.wavePauseAbove` aliens vivants, la timeline se met en pause.
        const squads = this.aliveSquads;
        if (squads.length === 0) return;
        const dist = this.waves.time < EARLY_SPAWN_UNTIL ? EARLY_SPAWN_DISTANCE : SPAWN_DISTANCE;
        const playersMul = 1 + DIFFICULTY.extraPlayerAliens * (this.squads.length - 1); // tous les joueurs de la partie, vivants ou non
        if (ALIENS[type].boss) {
          this.horde.spawnNear(squads[Math.floor(this.rng.next() * squads.length)], type, count, dist, playersMul);
        } else {
          // chaque joueur en plus ajoute `DIFFICULTY.extraPlayerAliens` (+75 %) d'aliens à la vague : le total est réparti entre les squads VIVANTES (seules à pouvoir en être entourées)
          const share = playersMul / squads.length;
          const cap = ALIENS[type].maxPerWave ?? Infinity; // plafond par vague et par squad (ex. 2 slimes de glace)
          if (arrival === 'ring' && !this.tutorial?.active) {
            // vague en cercle : toute la vague (les parts de toutes les squads) sort du sol autour de la squad d'UN joueur, tirée au hasard (`ringRoll`, le même pour tous les groupes de la vague)
            const target = squads[Math.min(squads.length - 1, Math.floor(ringRoll * squads.length))];
            this.horde.spawnRing(target.center, type, Math.min(cap, Math.round(count * playersMul)), RING.radius, this.rng.range(0, Math.PI * 2)); // même cercle que la dernière vague du tutoriel (`Horde.spawnRing`)
            return;
          }
          for (const sq of squads) {
            const n = Math.min(cap, Math.round(count * share));
            if (arrival) this.horde.spawnAhead(sq, type, n); // vague en embuscade : sort du sol devant la squad
            else this.horde.spawnNear(sq, type, n, dist);
          }
        }
      },
      this.rng,
      {
        bossAlive: () => this.aliens.some((a) => a.alive && !!a.def.boss),
        bossId: () => this.aliens.find((a) => a.alive && !!a.def.boss)?.def.id ?? null,
        aliveCount: () => {
          let n = 0;
          for (const a of this.aliens) if (a.alive) n++;
          return n;
        },
      },
    );
  }

  /** Nouvelle partie dans la même simulation (coop : tous les joueurs sont morts, ou le boss final est tombé). */
  restart(): void {
    this.aliens.length = 0;
    this.corpses.length = 0;
    this.fires.length = 0;
    this.reviveZones.length = 0;
    this.puddles.length = 0;
    this.walls.length = 0;
    this.stalactites.length = 0;
    this.crosses.length = 0;
    this.shockwaves.length = 0;
    this.arena.rocks.length = 0;
    this.blasts.length = 0;
    this.fuses.length = 0;
    this.deathSpawns.length = 0;
    this.combat.clear();
    this.recruits.clear();
    this.upgradeOrbs.clear();
    this.gems.clear();
    this.powerups.clear();
    this.xp.clear();
    this.finalBossDead = false;
    this.eggBoss.clear();
    this.ending = false;
    this.boarded.clear();
    this.bossKills = 0;
    this.choiceT = 0;
    this.choiceDelay = 0;
    this.sharedXpPool = 0;
    this.sharedLevel = 1;
    this.waves.reset();
    this.horde.resetGolden();
    for (const sq of this.squads) sq.resetRun();
    this.spawnSquads(() => this.rng.pick(START_SQUADS));
    for (const sq of this.squads) for (const s of sq.soldiers) s.invulnerable = 2.5;
    this.events.push({ t: 'restart' });
  }

  /**
   * Dev (panneau Triche, hors ligne) : saute à une partie avancée sans rien jouer. Terrain vidé (aliens, tirs, globes, power-ups…),
   * horloges des vagues à `time` / `cursor` sans aucun envoi, `bossKills` boss déjà tués (escalade). Les squads ne sont pas touchées
   * (voir `Squad.fastForward`).
   */
  fastForward(time: number, cursor: number, bossKills: number): void {
    this.aliens.length = 0;
    this.corpses.length = 0;
    this.fires.length = 0;
    this.puddles.length = 0;
    this.walls.length = 0;
    this.stalactites.length = 0;
    this.crosses.length = 0;
    this.shockwaves.length = 0;
    this.arena.rocks.length = 0;
    this.blasts.length = 0;
    this.fuses.length = 0;
    this.deathSpawns.length = 0;
    this.combat.clear();
    this.recruits.clear();
    this.upgradeOrbs.clear();
    this.gems.clear();
    this.powerups.clear();
    this.xp.clear();
    this.choiceT = 0;
    this.choiceDelay = 0;
    this.bossKills = bossKills;
    this.waves.skipTo(cursor, time);
  }

  get xpEnabled(): boolean {
    return this.config.xp === true && !this.ending;
  }

  /** Début de la séquence de fin : le monde se calme (plus de vagues, d'XP ni de dégâts) le temps que la squad monte dans la fusée. */
  beginEnding(): void {
    this.ending = true;
    this.choiceDelay = 0; // pas de choix d'upgrade en attente : la pause figerait la séquence sans écran pour la lever
    this.choiceT = 0;
    // on finit le jeu : plus aucun bonus ni loot au sol (recrues, globes d'XP et d'upgrade, power-ups, zones, relance, booster, œufs de boss) ni bonus actif
    this.recruits.clear();
    this.upgradeOrbs.clear();
    this.gems.clear();
    this.powerups.clear();
    this.xp.clear();
    for (const a of this.aliens) if (a.def.egg) a.alive = false; // œuf détruit sans ses globes (pas de `killAlien`)
    for (const sq of this.squads) sq.buffs.stim = 0;
    // soldats libres (les dégâts sont déjà ignorés : `damageSoldier`) : ceux qui étaient gelés (ou empoisonnés, étourdis) sont dégelés, plus personne ne peut l'être
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        if (s.frozen > 0) {
          s.frozen = 0;
          s.iceInvuln = 0;
          this.events.push({ t: 'thaw', soldier: s.id, x: s.x, y: s.y });
        }
        s.poison = 0;
        s.stun = 0;
        s.jumpT = 0;
        s.burn = 0;
        s.burnDps = 0;
        s.knockT = 0;
      }
    }
  }

  /** Un soldat monte dans la fusée de fin : il disparaît sans mourir. */
  boardSoldier(s: SoldierState): void {
    if (!s.alive) return;
    s.alive = false;
    this.boarded.add(s);
  }

  // ---------- Progression : XP partagée (coop) et pause du choix d'upgrade ----------

  /**
   * Choix d'upgrade en cours : temps restant (s). Tant qu'il est > 0, le monde est en PAUSE pour tout le monde (solo comme
   * en ligne) : chaque joueur choisit parmi ses 3 propositions ; à la fin du temps, choix au hasard pour ceux qui n'ont pas choisi.
   */
  choiceT = 0;
  /** Délai (s) restant avant l'ouverture de la pause de choix après une montée de niveau (voir `beginUpgradeChoice`) ; 0 = aucun. */
  choiceDelay = 0;
  /** Coop : une seule barre d'XP pour tous les joueurs (réserve et niveau communs). */
  private sharedXpPool = 0;
  private sharedLevel = 1;

  /** XP mutualisée : en ligne, tous les joueurs remplissent la même barre, plus longue (× nombre de joueurs). */
  get sharedXp(): boolean {
    return this.config.online === true;
  }

  /**
   * Multiplicateur du seuil de niveau (`DIFFICULTY.xpCostMul`, sauf pendant le tutoriel). XP partagée : le seuil grandit comme la charge de mobs
   * (`1 + DIFFICULTY.extraPlayerAliens × (joueurs − 1)`, le même facteur que les vagues) et non comme le nombre de joueurs : l'XP produite
   * grandit avec les mobs, donc le rythme des level-ups sur la timeline reste celui du solo, quel que soit le nombre de joueurs. Compte tous les joueurs
   * de la partie (pas seulement les vivants) pour que la barre ne saute pas quand quelqu'un tombe ou revient.
   */
  get xpScale(): number {
    const players = this.sharedXp ? Math.max(1, this.squads.length) : 1;
    return (1 + DIFFICULTY.extraPlayerAliens * (players - 1)) * (this.tutorial?.active ? 1 : DIFFICULTY.xpCostMul);
  }

  /** XP gagnée par `from` versée dans la barre commune ; un niveau franchi = tous montent. */
  gainSharedXp(_from: Squad, value: number): void {
    this.sharedXpPool += value;
    let levels = 0;
    while (this.sharedXpPool >= xpToNext(this.sharedLevel) * this.xpScale) {
      this.sharedXpPool -= xpToNext(this.sharedLevel) * this.xpScale;
      this.sharedLevel++;
      levels++;
    }
    for (const sq of this.squads) sq.syncSharedXp(this.sharedXpPool, this.sharedLevel, levels);
  }

  /** Une squad vient d'avoir des propositions : ouvre la pause de choix si elle n'est pas déjà en cours. */
  beginUpgradeChoice(): void {
    // pas de pause immédiate : le monde continue `LEVEL_UP_DELAY` s (l'onde de choc repousse les aliens, le texte « LEVEL UP! » monte), puis `step` ouvre la pause
    if (this.choiceT <= 0 && this.choiceDelay <= 0) this.choiceDelay = LEVEL_UP_DELAY;
  }

  /** Le joueur `owner` choisit l'upgrade `index` parmi celles qui lui sont proposées. */
  chooseUpgrade(owner: PlayerId, index: number): boolean {
    const ok = this.squadOf(owner)?.chooseUpgrade(index) ?? false;
    if (ok) this.afterChoice();
    return ok;
  }

  /** Le joueur `owner` relance ses propositions d'upgrade (nombre limité par partie). */
  rerollUpgrade(owner: PlayerId): boolean {
    const ok = this.squadOf(owner)?.rerollOffer() ?? false;
    if (ok && this.choiceT > 0) this.choiceT = UPGRADE_CHOICE_TIME; // la jauge d'attente repart à zéro (choix en ligne)
    return ok;
  }

  /** Quand plus personne n'a de choix ouvert : niveaux encore en attente → nouvelle manche de choix (temps plein), sinon reprise. */
  private afterChoice(): void {
    if (this.squads.some((sq) => sq.offer)) return;
    this.choiceDelay = 0; // tout le monde a déjà choisi (pendant le délai, ou à la fin de la pause)
    let more = false;
    for (const sq of this.squads) if (sq.rollPending()) more = true;
    this.choiceT = more ? UPGRADE_CHOICE_TIME : 0;
  }

  /** Pendant la pause de choix : le temps s'écoule (en ligne) ; à zéro, choix au hasard pour les retardataires. Solo : pas de limite. */
  private stepChoice(dt: number): void {
    if (this.config.choiceTimeout) this.choiceT -= dt;
    if (this.choiceT > 0) {
      if (!this.squads.some((sq) => sq.offer)) this.afterChoice();
      return;
    }
    for (const sq of this.squads) if (sq.offer) sq.chooseUpgrade(Math.floor(this.rng.next() * sq.offer.length));
    this.choiceT = 0;
    this.afterChoice();
  }

  private level: DifficultyLevel = 'normal';

  /** Niveau de difficulté de la run (`normal` par défaut). */
  get difficulty(): DifficultyLevel {
    return this.level;
  }

  /** Change le niveau de la run : seulement avant son départ (écran d'accueil, boutons de niveau) ; les aliens déjà apparus ne changent pas. */
  setDifficulty(level: DifficultyLevel): void {
    this.level = level;
  }

  get mode(): ModeDef {
    return this.config.mode;
  }

  /** Temps de jeu écoulé (s). */
  get time(): number {
    return this.waves.time;
  }

  get aliveSquads(): Squad[] {
    return this.squads.filter((s) => s.alive);
  }

  squadOf(owner: PlayerId): Squad | undefined {
    return this.squads.find((s) => s.owner === owner);
  }

  nearestSquad(x: number, y: number): Squad | undefined {
    let best: Squad | undefined;
    let bestD = Infinity;
    for (const s of this.squads) {
      if (!s.alive) continue;
      const d = (s.center.x - x) ** 2 + (s.center.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Place chaque squad à son point de départ avec une composition de départ. */
  spawnSquads(pickComposition: () => SoldierClassId[]): void {
    if (this.mode.pvp) {
      const points = this.mode.spawnPoints(this.map, this.squads.length, this.rng);
      this.squads.forEach((sq, i) => sq.spawn(pickComposition(), points[i]));
      return;
    }
    // survie : la squad de l'hôte (emplacement 0) au centre, les autres à leur place autour d'elle (comme à leur arrivée dans la salle d'attente)
    const lead = this.squads.find((q) => q.slot === 0) ?? this.squads[0];
    const centre = this.mode.spawnPoints(this.map, 1, this.rng)[0];
    lead.spawn(pickComposition(), centre);
    for (const sq of this.squads) if (sq !== lead) sq.spawn(pickComposition(), this.placeBeside(sq, lead));
  }

  // ---------- Joueurs en cours de partie (réseau) ----------

  /** Crée (sans la placer) la squad d'un joueur qui rejoint. Idempotent. */
  addPlayer(owner: PlayerId): Squad {
    let sq = this.squadOf(owner);
    if (!sq) {
      sq = new Squad(this, owner);
      let slot = 0;
      while (this.squads.some((o) => o.slot === slot)) slot++; // le plus petit emplacement libre
      sq.slot = slot;
      this.squads.push(sq);
      if (this.sharedXp) sq.syncSharedXp(this.sharedXpPool, this.sharedLevel, 0); // arrive au niveau commun
    }
    return sq;
  }

  /** Un joueur part : sa squad disparaît de la partie (ses soldats sont retirés sans mort spectaculaire). */
  removePlayer(owner: PlayerId): void {
    const i = this.squads.findIndex((s) => s.owner === owner);
    if (i === -1) return;
    for (const s of this.squads[i].soldiers) s.alive = false;
    this.squads.splice(i, 1);
    this.removeReviveZone(owner);
    this.events.push({ t: 'squadWiped', owner });
  }

  /**
   * (Re)place la squad d'un joueur à un endroit aléatoire de la carte, à distance des
   * autres squads vivantes (arrivée en cours de partie, ou réapparition après une mort).
   */
  spawnLate(owner: PlayerId, composition: SoldierClassId[], invulnerable = REVIVE_INVULN): void {
    const fresh = !this.squadOf(owner);
    const sq = this.addPlayer(owner);
    if (sq.alive) return;
    if (fresh && this.sharedXp && this.sharedLevel > 1) {
      // arrivée en cours de partie : upgrades tirées au hasard pour rejoindre le niveau commun, et 60 % de l'effectif max des autres squads (comme un revive)
      sq.catchUpUpgrades(this.sharedLevel);
      let peak: SoldierClassId[] = [];
      for (const o of this.squads) if (o !== sq && o.peakComposition.length > peak.length) peak = o.peakComposition;
      if (peak.length > 0) {
        const n = Math.min(sq.maxSize, Math.max(1, Math.ceil(peak.length * DIFFICULTY.reviveSquadFraction)));
        composition = Array.from({ length: n }, (_, i) => peak[Math.floor((i * peak.length) / n)]);
      }
    }
    // coop : on arrive à côté de ses équipiers ; sinon (PvP) à l'écart des autres squads
    const mate = this.mode.pvp ? undefined : this.aliveSquads[0];
    const at = mate ? this.placeBeside(sq, mate) : this.randomSpawnPoint();
    sq.spawn(composition, at);
    for (const s of sq.soldiers) s.invulnerable = invulnerable;
  }

  /**
   * Place d'une squad autour d'un équipier : chaque arrivant a sa place au-dessus de lui (le 1er en haut à droite, le 2e en haut à gauche, le 3e plus haut au centre, les suivants plus haut encore à droite / à gauche),
   * sans tirage aléatoire (mêmes places chez tous) ; place occupée par un obstacle : la suivante de la liste.
   */
  private placeBeside(sq: Squad, mate: Squad): Point {
    const OFFSETS = [[90, -70], [-90, -70], [0, -140], [150, -130], [-150, -130], [0, 120]];
    const pick = (i: number): Point => {
      const o = OFFSETS[i % OFFSETS.length];
      return { x: mate.center.x + o[0], y: mate.center.y + o[1] };
    };
    const first = Math.max(0, sq.slot - 1); // l'emplacement 0 est celui de l'hôte
    for (let k = 0; k < OFFSETS.length; k++) {
      const p = pick(first + k);
      if (this.arena.isFree(p, 40)) return p;
    }
    return pick(first);
  }

  /** Point libre tiré au hasard, idéalement hors de vue (> SAFE_SPAWN_DISTANCE) des squads vivantes. */
  private randomSpawnPoint(): Point {
    const b = this.arena.bounds;
    const others = this.aliveSquads;
    let best: Point | null = null;
    let bestD = -1;
    for (let i = 0; i < 30; i++) {
      const p = { x: this.rng.range(b.minX + 120, b.maxX - 120), y: this.rng.range(b.minY + 120, b.maxY - 120) };
      if (!this.arena.isFree(p, 80)) continue;
      const d = others.reduce((m, o) => Math.min(m, Math.hypot(o.center.x - p.x, o.center.y - p.y)), Infinity);
      if (d >= SAFE_SPAWN_DISTANCE) return p;
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ?? { x: this.map.width / 2, y: this.map.height / 2 };
  }

  // ---------- Tick ----------

  step(dt: number, inputs: ReadonlyMap<PlayerId, PlayerInput>): void {
    this.tick++;
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        s.px = s.x;
        s.py = s.y;
      }
    }
    for (const a of this.aliens) {
      a.px = a.x;
      a.py = a.y;
    }
    // montée de niveau : après le délai, la pause s'ouvre (le monde a tourné pendant ce délai)
    if (this.choiceDelay > 0 && (this.choiceDelay -= dt) <= 0) {
      this.choiceDelay = 0;
      if (this.squads.some((sq) => sq.offer)) this.choiceT = UPGRADE_CHOICE_TIME;
    }
    // choix d'upgrade : monde en pause (ni vagues, ni déplacements, ni tirs) jusqu'à ce que tout le monde ait choisi
    if (this.choiceT > 0) {
      this.stepChoice(dt);
      return;
    }

    if (!this.tutorial?.active && !this.ending && !this.gems.finalPending) this.waves.update(dt); // onboarding : la timeline normale attend la fin du tutoriel
    this.rebuildHashes();
    for (const sq of this.squads) sq.update(dt, inputs.get(sq.owner) ?? NO_INPUT);
    this.horde.update(dt);
    this.combat.update(dt);
    this.recruits.update(dt);
    this.upgradeOrbs.update(dt);
    this.gems.update(dt);
    if (this.xpEnabled) this.xp.update(dt);
    this.updateCorpsesAndRocks(dt);
    this.updateFires(dt);
    this.updateReviveZones(dt);
    this.updateWalls(dt);
    this.updateStalactites(dt);
    this.updateCrosses(dt);
    this.updatePuddles(dt);
    this.powerups.update(dt);
    this.updateShockwaves(dt);
    this.updatePoison(dt);
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.t > 0) continue;
      this.addBlast(f.x, f.y, f.r, f.dmg, 'aliens', 'aliens', f.knock, 'fire', 0, KNOCK_HOP.time); // explosion de kamikaze : les soldats touchés sont soufflés en cloche
      this.fuses.splice(i, 1);
    }
    this.cleanup();
    this.tutorial?.update(dt);
  }

  private rebuildHashes(): void {
    this.alienHash.clear();
    for (const a of this.aliens) if (a.alive) this.alienHash.insert(a);
    this.soldierHash.clear();
    for (const sq of this.squads) for (const s of sq.soldiers) if (s.alive) this.soldierHash.insert(s);
  }

  // ---------- Dégâts & morts ----------

  /** Le bouclier absorbe en premier : renvoie la part des dégâts qui passe sur les PV. */
  private absorb(u: Unit, amount: number): number {
    if (u.shield <= 0) return amount;
    const taken = Math.min(u.shield, amount);
    u.shield -= taken;
    return amount - taken;
  }

  /** Escalade de tout alien qui apparaît maintenant : ×(1 + gain) par boss ou mini-boss déjà tué, un gain par stat (`DIFFICULTY.bossEscalation*`). */
  get escalationHp(): number {
    return this.escalation(DIFFICULTY.bossEscalationHp);
  }

  get escalationDamage(): number {
    return this.escalation(DIFFICULTY.bossEscalationDamage);
  }

  get escalationRate(): number {
    return this.escalation(DIFFICULTY.bossEscalationRate);
  }

  get escalationSpeed(): number {
    return this.escalation(DIFFICULTY.bossEscalationSpeed);
  }

  /**
   * Multiplicateur d'une stat d'alien qui apparaît maintenant : multiplicateur de BASE du niveau de difficulté (×1 en normal) × (1 + `gain` × multiplicateur d'ESCALADE du niveau) par boss tué.
   * Les stats de base de tous les aliens passent par là (`Horde.create` : PV, `escDmg`, `escRate`, `escSpeed`).
   */
  private escalation(gain: number): number {
    const level = this.difficulty;
    const base = level === 'expert' ? DIFFICULTY.expertBaseMul : level === 'impossible' ? DIFFICULTY.impossibleBaseMul : 1;
    const scale = level === 'expert' ? DIFFICULTY.expertScaleMul : level === 'impossible' ? DIFFICULTY.impossibleScaleMul : 1;
    return base * (1 + gain * scale) ** this.bossKills;
  }

  /** Dégâts à n'importe quelle unité. `attacker` = joueur crédité du kill. */
  damage(u: Unit, amount: number, attacker: PlayerId | null, dirX = 0, dirY = 0): void {
    if (u.kind === 'soldier') {
      if (u.frozen > 0 && attacker !== null && this.allied(attacker, u)) this.chipIce(u); // tir allié sur un soldat gelé : il brise la glace
      else this.damageSoldier(u, amount, attacker);
      return;
    }
    if (!u.alive || !this.horde.targetable(u)) return; // dans son trou d'apparition ou totalement enterré : intouchable
    if (this.horde.burial(u) === 'semi') amount *= BURIED.semiDmg; // semi-enterré (lurker en embuscade)
    if (u.captive && u.def.capture) amount *= CAPTIVE_VULN; // une bulle qui digère un soldat est super vulnérable
    const sq = attacker ? this.squadOf(attacker) : undefined;
    const effective = Math.min(amount, Math.max(0, u.hp) + u.shield); // PV et bouclier réellement retirés (sans l'overkill)
    this.metrics.dealt += effective;
    if (sq) sq.dealt += effective;
    u.shieldT = 0; // tout coup relance le délai de régénération du bouclier
    u.hp -= this.absorb(u, amount);
    if (this.horde.knockable(u)) {
      u.kx += (dirX * 40) / u.mass;
      u.ky += (dirY * 40) / u.mass;
    }
    this.events.push({ t: 'hit', id: u.id });
    if (u.hp <= 0) this.killAlien(u, attacker, false, dirX, dirY);
  }

  /** Une flaque disparaît (délai écoulé, trop nombreuses) ou sert : le chaman qui l'incante la ressuscite. */
  private endCorpse(c: Corpse, revived: boolean): void {
    const i = this.corpses.indexOf(c);
    if (i >= 0) this.corpses.splice(i, 1);
    this.events.push({ t: 'corpseEnd', id: c.id, x: c.x, y: c.y, revived });
  }

  /** Ressuscite le slime de la flaque `c` avec `hpFrac` de ses PV (il ne pourra pas l'être une seconde fois). */
  reviveCorpse(c: Corpse, hpFrac: number): void {
    this.endCorpse(c, true);
    for (let i = 0; i < Math.round(zombieStats().copies); i++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = i === 0 ? 0 : this.rng.range(18, 45);
      this.horde.spawnAt(c.type, c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r, hpFrac, true);
    }
  }

  /** Annonce un mur (télégraphe jaune) ; `windup` s plus tard, une ligne de rochers de rayon `rockR` surgit, pour `ttl` s. */
  addWall(x: number, y: number, angle: number, length: number, windup: number, rockR: number, ttl: number): void {
    const b = this.arena.bounds; // le centre du mur reste dans l'arène (le bâtisseur ne pose déjà que des murs entiers : `wallFits`)
    x = Math.min(b.maxX, Math.max(b.minX, x));
    y = Math.min(b.maxY, Math.max(b.minY, y));
    this.walls.push({ id: this.ids.get(), x, y, angle, length, rockR, ttl, t: windup, dur: windup });
    if (this.walls.length > 30) this.walls.shift();
  }

  /** Annonce une stalactite : zone de rayon `r` en (`x`, `y`), impact `delay` s plus tard. */
  addStalactite(x: number, y: number, r: number, delay: number, damage: number, knockback: number): void {
    const b = this.arena.bounds; // jamais hors de la carte : la zone tient entièrement dans l'arène
    x = Math.min(b.maxX - r, Math.max(b.minX + r, x));
    y = Math.min(b.maxY - r, Math.max(b.minY + r, y));
    this.stalactites.push({ id: this.ids.get(), x, y, r, t: delay, dur: delay, damage, knockback });
    if (this.stalactites.length > 60) this.stalactites.shift();
  }

  /** Pose une croix de pics (Rhino Alpha) centrée en (x, y) : mesures de `def.spikeCross`, dégâts × `power`. */
  addCross(x: number, y: number, C: { aim: number; sweep: number; length: number; width: number; damage: number }, power: number): void {
    this.crosses.push({ id: this.ids.get(), x, y, t: C.aim, s: C.sweep, length: C.length, width: C.width, aim: C.aim, sweep: C.sweep, damage: C.damage * power });
    if (this.crosses.length > 20) this.crosses.shift();
  }

  /** Pics en croix : télégraphe, puis les 4 rangées s'étendent ; chaque soldat est blessé une fois quand un front passe sur lui (comme les pics du lurker). */
  private updateCrosses(dt: number): void {
    for (let i = this.crosses.length - 1; i >= 0; i--) {
      const c = this.crosses[i];
      if (c.t > 0) {
        c.t -= dt;
        continue;
      }
      const prevF = c.s >= c.sweep ? -30 : (1 - c.s / c.sweep) * c.length;
      c.s -= dt;
      const curF = (1 - Math.max(0, c.s) / c.sweep) * c.length;
      for (const s of this.soldierHash.query(c.x, c.y, c.length + 40, this.scratchSoldiers)) {
        if (!s.alive) continue;
        const dx = s.x - c.x;
        const dy = s.y - c.y;
        for (let k = 0; k < 4; k++) {
          const cos = Math.round(Math.cos((k * Math.PI) / 2));
          const sin = Math.round(Math.sin((k * Math.PI) / 2));
          const along = dx * cos + dy * sin;
          const across = Math.abs(-dx * sin + dy * cos);
          if (along > prevF && along <= Math.min(curF, this.arena.rayLength(c.x, c.y, cos, sin, c.length)) && across <= c.width / 2 + s.radius * 0.6) {
            this.damageSoldier(s, c.damage);
            break; // une seule fois par passage de front
          }
        }
      }
      if (c.s <= 0) this.crosses.splice(i, 1);
    }
  }

  /** Stalactites qui tombent : à l'impact, dégâts et recul aux soldats dans la zone. */
  private updateStalactites(dt: number): void {
    for (let i = this.stalactites.length - 1; i >= 0; i--) {
      const k = this.stalactites[i];
      if ((k.t -= dt) > 0) continue;
      this.stalactites.splice(i, 1);
      this.events.push({ t: 'stalactite', x: k.x, y: k.y, r: k.r });
      for (const s of this.soldierHash.query(k.x, k.y, k.r + 30, this.scratchSoldiers)) {
        const dx = s.x - k.x;
        const dy = s.y - k.y;
        const d = Math.hypot(dx, dy) || 1;
        if (!s.alive || d > k.r + s.radius) continue;
        s.kx += (dx / d) * k.knockback;
        s.ky += (dy / d) * k.knockback;
        this.damageSoldier(s, k.damage);
      }
    }
  }

  private updateWalls(dt: number): void {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if ((w.t -= dt) > 0) continue;
      this.walls.splice(i, 1);
      // un rocher qui tomberait hors de la carte ou sur un obstacle n'apparaît pas (vérifié avant d'en poser un seul : les rochers d'un même mur se chevauchent)
      const spots = this.wallSpots(w.x, w.y, w.angle, w.length, w.rockR);
      const free = spots.map((p) => this.arena.isFree(p, w.rockR));
      spots.forEach((p, k) => {
        if (free[k]) this.addRock(p.x, p.y, w.rockR, w.ttl);
      });
    }
  }

  /** Positions des rochers d'un mur : qui se chevauchent à moitié, pour un mur continu et non une rangée de cailloux. */
  private wallSpots(x: number, y: number, angle: number, length: number, rockR: number): Point[] {
    const n = Math.max(2, Math.round(length / (rockR * 1.4)) + 1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const out: Point[] = [];
    for (let k = 0; k < n; k++) {
      const o = (k / (n - 1) - 0.5) * length;
      out.push({ x: x + cos * o, y: y + sin * o });
    }
    return out;
  }

  /** Tous les rochers du mur tiennent dans la carte et hors des obstacles ? (le bâtisseur ne pose que des murs entiers) */
  wallFits(x: number, y: number, angle: number, length: number, rockR: number): boolean {
    return this.wallSpots(x, y, angle, length, rockR).every((p) => this.arena.isFree(p, rockR));
  }

  /** Fracasse le rocher `id` (charge d'un alien) : il disparaît (collision et affichage, qui suit la liste) et ses débris partent dans le sens (`dx`, `dy`). */
  breakRock(id: number, dx: number, dy: number): void {
    const i = this.arena.rocks.findIndex((k) => k.id === id);
    if (i < 0) return;
    const k = this.arena.rocks[i];
    this.arena.rocks.splice(i, 1);
    const len = Math.hypot(dx, dy) || 1;
    this.events.push({ t: 'rockBreak', id, x: k.x, y: k.y, r: k.radius, dx: dx / len, dy: dy / len });
  }

  /** Rocher au sol (élément d'un mur) : obstacle pendant `ttl` secondes. */
  addRock(x: number, y: number, radius: number, ttl: number): void {
    const b = this.arena.bounds; // jamais hors de la carte
    x = Math.min(b.maxX - radius, Math.max(b.minX + radius, x));
    y = Math.min(b.maxY - radius, Math.max(b.minY + radius, y));
    const rock = { id: this.ids.get(), x, y, radius, ttl };
    this.arena.rocks.push(rock);
    this.events.push({ t: 'rock', id: rock.id, x, y, r: radius, ttl });
    if (this.arena.rocks.length > 120) this.arena.rocks.shift(); // l'affichage se cale sur la liste (snapshot) : le visuel disparaît avec la collision
  }

  /**
   * Onde de choc : un front part de (x, y) et atteint le rayon `r` en `reach` s (Cubic.Out, comme l'anneau affiché). Chaque alien
   * touché par le front recule ensuite pendant `duration` s à `speed` px/s (plus vite au centre) : ils ne sont donc pas tous repoussés
   * au même moment, mais quand l'onde passe. Déplacement direct, pas une impulsion : un alien lourd ou rapide est repoussé comme un léger.
   */
  shockwave(x: number, y: number, r: number, speed: number, duration: number, reach = 0, lethal: PlayerId | null = null): void {
    this.shockwaves.push({ x, y, r, speed, duration, reach, lethal, t: 0, hit: new Map() });
  }

  private updateShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.t += dt;
      const p = w.reach > 0 ? Math.min(1, w.t / w.reach) : 1;
      const front = w.r * (1 - (1 - p) ** 3);
      for (const a of this.aliens) {
        if (!a.alive || a.def.egg) continue; // l'œuf d'un boss est scellé sur son socle : ni repoussé ni détruit par l'onde (level up, revive)
        let h = w.hit.get(a.id);
        if (!h) {
          if (w.t - dt > w.reach) continue; // front arrivé au bout : un alien apparu après n'est pas repoussé
          const dx = a.x - w.x;
          const dy = a.y - w.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > front) continue;
          h = { dx: dx / d, dy: dy / d, k: (1 - (d / w.r) * 0.6) * w.speed * (a.def.capture ? 0.35 : 1), left: w.duration }; // les bulles sont difficiles à repousser
          if (!this.horde.knockable(a)) h.k = 0; // sort ou rentre dans le sol : jamais repoussé par cette onde (même s'il finit de sortir avant qu'elle ne s'éteigne)
          w.hit.set(a.id, h);
          if (w.lethal && !a.def.boss) {
            // revive gratuit : l'onde détruit ce qu'elle touche (les boss sont seulement repoussés)
            this.damage(a, a.hp + a.shield + 1, w.lethal);
            continue;
          }
        }
        if (h.left <= 0) continue;
        const step = Math.min(dt, h.left);
        h.left -= step;
        a.x += h.dx * h.k * step;
        a.y += h.dy * h.k * step;
        this.arena.constrain(a);
      }
      if (p >= 1 && w.t >= w.reach + w.duration) this.shockwaves.splice(i, 1);
    }
  }

  /** Facteur de vitesse d'un alien à cet endroit (1 = libre ; globe de stase : très lent). */
  stasisAt(x: number, y: number): number {
    return this.powerups.fields.length > 0 ? this.powerups.stasisAt(x, y) : 1;
  }

  /** Flaque de crachat : les soldats dedans vont à `slow` × leur vitesse pendant `ttl` s. */
  addPuddle(x: number, y: number, r: number, ttl: number, slow: number, frost = false, webOwner = 0): void {
    // jamais hors de la carte (une squad au bord : le chaman, le rhinocéros de glace… posaient des nuages dans le vide) : le centre reste dans l'arène
    const b = this.arena.bounds;
    x = Math.min(b.maxX - r, Math.max(b.minX + r, x));
    y = Math.min(b.maxY - r, Math.max(b.minY + r, y));
    this.puddles.push(webOwner ? { id: this.ids.get(), x, y, r, ttl, slow: 1, web: true, owner: webOwner } : frost ? { id: this.ids.get(), x, y, r, ttl, slow: 1, frost } : { id: this.ids.get(), x, y, r, ttl, slow });
    if (this.puddles.length > 40) this.puddles.shift();
  }

  /** Flaques et nuages : durée de vie ; un nuage de glace gèle le premier soldat qui y entre, puis disparaît. */
  private updatePuddles(dt: number): void {
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      let gone = (p.ttl -= dt) <= 0;
      if (!gone && p.frost) {
        for (const s of this.soldierHash.query(p.x, p.y, p.r + 30, this.scratchSoldiers)) {
          if (!s.alive || s.capturedBy || s.frozen > 0 || s.invulnerable > 0 || Math.hypot(s.x - p.x, s.y - p.y) > p.r + s.radius * 0.5) continue;
          this.horde.freezeSoldier(s);
          this.events.push({ t: 'freeze', x: p.x, y: p.y, r: p.r });
          gone = true;
          break;
        }
      }
      if (!gone && p.web) {
        // toile de la Gling Mère : sans elle, plus de toile ; sinon le premier soldat qui y marche la consomme et saute vers elle
        const mother = this.aliens.find((a) => a.alive && a.id === p.owner);
        if (!mother) gone = true;
        else {
          for (const s of this.soldierHash.query(p.x, p.y, p.r + 30, this.scratchSoldiers)) {
            if (!s.alive || s.capturedBy || s.frozen > 0 || s.jumpT > 0 || s.stun > 0 || s.invulnerable > 0 || Math.hypot(s.x - p.x, s.y - p.y) > p.r + s.radius * 0.5) continue;
            this.webPull(s, mother);
            this.events.push({ t: 'webPull', x: p.x, y: p.y, r: p.r });
            gone = true;
            break;
          }
        }
      }
      if (gone) this.puddles.splice(i, 1);
    }
  }

  /** Le soldat saute vers la Gling Mère : arrivée à `WEB.land` px d'elle (côté du soldat), dans l'arène et hors des obstacles. */
  private webPull(s: SoldierState, mother: AlienState): void {
    const mx = mother.x + mother.vx * WEB.jump; // la Mère avance pendant le vol : on vise où elle sera à l'arrivée
    const my = mother.y + mother.vy * WEB.jump;
    const dx = s.x - mx;
    const dy = s.y - my;
    const d = Math.hypot(dx, dy) || 1;
    const land = { x: mx + (dx / d) * WEB.land, y: my + (dy / d) * WEB.land, radius: s.radius };
    this.arena.constrain(land);
    s.jumpT = WEB.jump;
    s.jx0 = s.x;
    s.jy0 = s.y;
    s.jx1 = land.x;
    s.jy1 = land.y;
    s.jm = mother.id;
    s.kx = s.ky = 0;
  }

  /** Facteur de vitesse d'un soldat à cet endroit (1 = libre ; les flaques ne se cumulent pas : la plus forte l'emporte). */
  slowAt(x: number, y: number, radius: number): number {
    let k = 1;
    for (const p of this.puddles) {
      if (p.frost || p.web) continue; // nuage de glace ou toile : ils agissent dans updatePuddles, ils ne ralentissent pas
      const rr = p.r + radius * 0.5;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 < rr * rr) k = Math.min(k, p.slow);
    }
    return k;
  }

  /** Flaque de flammes : brûle les soldats dedans pendant `ttl` s. */
  addFire(x: number, y: number, r: number, ttl: number, dps: number): void {
    const b = this.arena.bounds; // jamais hors de la carte : le centre reste dans l'arène
    x = Math.min(b.maxX - r, Math.max(b.minX + r, x));
    y = Math.min(b.maxY - r, Math.max(b.minY + r, y));
    const f: FirePatch = { id: this.ids.get(), x, y, r, ttl, dps };
    this.fires.push(f); // affichage : `WorldView.syncFires` suit cette liste (snapshot en ligne), pas d'événement
    if (this.fires.length > 150) this.endFire(this.fires[0]);
  }

  private endFire(f: FirePatch): void {
    const i = this.fires.indexOf(f);
    if (i >= 0) this.fires.splice(i, 1);
  }

  /** Enflamme un soldat : il brûle `time` s (la durée repart de zéro, jamais cumulée) à `dps` PV/s (le plus fort des feux qui le touchent). Un soldat gelé ne s'enflamme pas. */
  ignite(s: SoldierState, dps: number, time = FIRE.burnTime): void {
    if (s.frozen > 0 || this.ending) return;
    s.burn = Math.max(s.burn, time);
    s.burnDps = Math.max(s.burnDps, dps);
  }

  /**
   * Durée des flammes ; un soldat qui marche dans une flaque est enflammé (débit de la flaque × `FIRE.dmgMul`), puis brûle `FIRE.burnTime` s : ses PV baissent dans le temps (par petits coups toutes
   * les 0,25 s, comme avant) ; plus de dégâts directs au contact.
   */
  private updateFires(dt: number): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.ttl -= dt;
      if (f.ttl <= 0) this.endFire(f);
    }
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        if (s.burn <= 0) continue;
        s.burn -= dt;
        if (s.burn <= 0 || s.frozen > 0 || !s.alive) {
          s.burn = 0;
          s.burnDps = 0;
        }
      }
    }
    this.burnCd -= dt;
    if (this.burnCd > 0) return;
    this.burnCd = 0.25;
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        if (!s.alive) continue;
        let dps = 0;
        for (const f of this.fires) {
          const rr = f.r + s.radius * 0.5;
          if ((s.x - f.x) ** 2 + (s.y - f.y) ** 2 < rr * rr) dps = Math.max(dps, f.dps); // les flaques ne se cumulent pas
        }
        if (dps > 0) this.ignite(s, dps * FIRE.dmgMul);
        if (s.burn > 0) this.damageSoldier(s, s.burnDps * 0.25);
      }
    }
  }

  private removeReviveZone(owner: PlayerId): void {
    const i = this.reviveZones.findIndex((z) => z.owner === owner);
    if (i >= 0) this.reviveZones.splice(i, 1);
  }

  /** Un équipier vivant resté `REVIVE_TIME` s dans la zone ramène le joueur mort, avec une escouade de base (sa progression est conservée). */
  private updateReviveZones(dt: number): void {
    for (let i = this.reviveZones.length - 1; i >= 0; i--) {
      const z = this.reviveZones[i];
      const sq = this.squadOf(z.owner);
      if (!sq || sq.alive) {
        this.reviveZones.splice(i, 1);
        continue;
      }
      let inside = false;
      for (const mate of this.squads) {
        if (!mate.alive || mate === sq) continue;
        if (mate.soldiers.some((s) => s.alive && (s.x - z.x) ** 2 + (s.y - z.y) ** 2 <= (z.r + s.radius) ** 2)) {
          inside = true;
        }
      }
      z.progress = inside ? Math.min(REVIVE_TIME, z.progress + dt) : Math.max(0, z.progress - dt);
      if (z.progress < REVIVE_TIME) continue;
      this.reviveZones.splice(i, 1);
      // escouade de base, ramenée (ou complétée en gunners) à 60 % de la taille max atteinte par ce joueur
      const target = Math.max(1, Math.min(sq.maxSize, Math.round(sq.peakSize * DIFFICULTY.coopReviveRatio)));
      const base = this.rng.pick(START_SQUADS);
      const comp = base.slice(0, target);
      while (comp.length < target) comp.push('trooper');
      sq.spawn(comp, { x: z.x, y: z.y });
      for (const s of sq.soldiers) s.invulnerable = REVIVE_INVULN;
    }
  }

  private updateCorpsesAndRocks(dt: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.ttl -= dt;
      if (c.claimed && !this.aliens.some((a) => a.alive && a.id === c.claimed)) c.claimed = 0; // le chaman est mort
      if (c.ttl <= 0) this.endCorpse(c, false);
    }
    for (let i = this.arena.rocks.length - 1; i >= 0; i--) {
      const r = this.arena.rocks[i];
      r.ttl -= dt;
      if (r.ttl > 0) continue;
      this.arena.rocks.splice(i, 1);
      this.events.push({ t: 'rockEnd', id: r.id });
    }
  }

  /** Explosion de zone (résolue en fin de tick, comme la mort d'un Flammeur). `team` / `owner` = camp épargné. */
  addBlast(x: number, y: number, r: number, dmg: number, team: string, owner: PlayerId, knock = 300, style?: 'slime' | 'fire' | 'spit' | 'acid', poison = 0, hop = 0): void {
    this.blasts.push({ x, y, r, dmg, team, owner, knock, style, poison, hop });
  }

  /**
   * `force` : dégâts qui passent même sur un soldat protégé (digestion par une bulle : c'est la seule source qui l'atteint). 
   */
  damageSoldier(s: SoldierState, amount: number, attacker: PlayerId | null = null, force = false): void {
    if (!s.alive || (this.ending && !force)) return;
    if (!force && (s.invulnerable > 0 || s.capturedBy)) return; // avalé par une bulle : protégé (gelé : attaquable)
    this.metrics.taken += Math.min(amount, Math.max(0, s.hp) + s.shield);
    s.hp -= this.absorb(s, amount);
    if (this.tutorial?.active && s.hp < 1) s.hp = 1; // onboarding : la squad peut être blessée, jamais tuée
    if (!force) this.events.push({ t: 'hit', id: s.id });
    if (s.hp > 0) return;
    s.alive = false;
    if (s.frozen > 0) {
      s.frozen = 0; // mort dans la glace : elle vole en éclats
      this.events.push({ t: 'thaw', soldier: s.id, x: s.x, y: s.y });
    }
    this.metrics.soldiersLost++;
    if (attacker && attacker !== s.owner) {
      const k = this.squadOf(attacker);
      if (k) k.kills++;
    }
    const blast = s.def.deathBlast;
    if (blast) this.blasts.push({ x: s.x, y: s.y, r: blast.radius, dmg: blast.damage, team: s.team, owner: s.owner, knock: blast.knock ?? 300 });
  }

  /** (`dirX`, `dirY`) : sens du coup fatal (les globes d'XP y sont expulsés). */
  private killAlien(a: AlienState, killer: PlayerId | null, wipe = false, dirX = 0, dirY = 0): void {
    a.alive = false;
    this.metrics.kills++;
    const squad = killer ? this.squadOf(killer) : undefined;
    if (squad) squad.kills++;
    this.events.push({ t: 'alienDied', id: a.id, x: a.x, y: a.y, alien: a.def.id, killer });
    if (a.def.golden) {
      this.gems.dropCoinsAt(a.x, a.y, a.def.golden.deathCoins, 40, 190); // alien doré tué : une grosse quantité d'argent et quelques diamants
      this.gems.dropGemsAt(a.x, a.y, a.def.golden.deathGems);
    }
    if (a.def.egg) {
      this.upgradeOrbs.burst(a.x, a.y); // œuf détruit : les globes d'upgrade roses en sortent
      this.gems.spawnChest(a.x, a.y, this.eggBoss.get(a.id) ?? 'boss_gling'); // et le coffre à diamants (solo) saute de l'œuf, plus à la mort du boss
    }
    if (a.def.boss) {
      // rhinos jumeaux : le combat de boss ne se termine qu'à la mort du DERNIER ; lui seul fait un clear screen, laisse l'œuf, compte pour l'escalade et le bandeau.
      // Le premier tombé (`firstTwin`) est un alien comme les autres (ses drops normaux, aucun effet de fin de boss) ; son jumeau continue le combat.
      const last = !this.aliens.some((o) => o !== a && o.alive && o.def.boss);
      const firstTwin = !!a.def.boss.twin && this.aliens.some((o) => o !== a && o.alive && o.def.boss?.twin);
      const isFinal = bossKindAt(a.def, this.difficulty) === 'final'; // le boss final dépend du niveau (Normal : Scarab, Hard : rhinos jumeaux, Expert : Giant Crab)
      if (isFinal && !firstTwin) {
        this.finalBossDead = true;
        this.gems.spawnFinalBurst(a.x, a.y, a.def.id); // l'équivalent d'un coffre à diamants : 10 s pour les ramasser avant la séquence de fin (solo)
      }
      if (!firstTwin) {
        this.wipeAliens(a, killer); // clear screen à chaque mort de boss ; un autre boss (non jumeau) encore en vie est épargné
        if (!isFinal) this.eggBoss.set(this.horde.spawnEgg(a.x, a.y).id, a.def.id); // l'œuf se souvient de son boss : le coffre contiendra SES diamants // œuf à détruire sur le cadavre du boss (le boss final, lui, gagne la partie ; jumeaux : seul le dernier tombé en laisse un)
        if (last) {
          this.bossKills++; // escalade : les aliens suivants sont plus forts (une seule fois pour les jumeaux)
          this.events.push({ t: 'bossDown', alien: a.def.id, kind: isFinal ? 'final' : 'mini', x: a.x, y: a.y });
        }
      }
    }
    this.releaseCaptive(a);
    if (a.def.revivable && !a.revived) {
      const c: Corpse = { id: this.ids.get(), x: a.x, y: a.y, type: a.def.id, ttl: CORPSE_TTL, claimed: 0 };
      this.corpses.push(c);
      this.events.push({ t: 'corpse', id: c.id, x: c.x, y: c.y, alien: c.type, ttl: c.ttl });
      if (this.corpses.length > 60) this.endCorpse(this.corpses[0], false);
    }
    if (a.def.lob?.deathBlobs && !wipe && !this.ending) this.combat.deathBlobs(a); // shooter : 2 boules rouges en cloche autour du cadavre
    const brood = a.def.deathSpawn;
    if (brood && !wipe) this.deathSpawns.push({ type: brood.spawn, x: a.x, y: a.y, count: brood.count, radius: a.radius, hpMul: brood.hpMul ?? 1 });
    const bomb = a.def.deathBlast;
    if (bomb) {
      this.fuses.push({ x: a.x, y: a.y, t: bomb.delay, r: bomb.radius, dmg: bomb.damage * a.escDmg, knock: bomb.knockback });
      this.events.push({ t: 'fuse', x: a.x, y: a.y, r: bomb.radius, delay: bomb.delay, alien: a.def.id });
    }
    if (a.tut && this.tutorial) {
      this.tutorial.drop(a); // onboarding : XP, recrue et power-up choisis par le script
      return;
    }
    if (!a.noRecruit) this.recruits.maybeDrop(a, squad); // invoqué / ressuscité : pas de recrue (un alien d'un rejeu de vague, lui, peut en laisser)
    if (!a.noXp && !a.def.egg && !a.def.projectile) this.gems.dropCoins(a); // pièces d'or (solo) : jamais par un alien sans XP (invoqué, rejeu de vague), un œuf ou un orbe
    this.powerups.maybeDropReroll(a, squad); // loot rare : ~5 relances par partie, au nombre d'aliens tués (DIFFICULTY.rerollLootFirst / rerollLootEvery)
    if (this.xpEnabled && !a.noXp) this.xp.drop(a, undefined, squad ?? this.nearestSquad(a.x, a.y), dirX, dirY); // les aliens des vagues rejouées pendant un boss ne donnent pas d'XP // le bonus d'XP de la squad qui a tué agrandit le butin
  }

  /** Bulle qui meurt : son prisonnier est libéré (brève protection, petit recul). */
  private releaseCaptive(a: AlienState): void {
    const s = a.captive;
    if (!s) return;
    a.captive = null;
    s.capturedBy = 0;
    s.invulnerable = 1.2;
    s.ky += 120;
    this.events.push({ t: 'release', soldier: s.id, x: s.x, y: s.y });
  }

  /**
   * Boss tué : « clear screen ». Tous les autres aliens de la carte meurent avec lui, exactement comme si le joueur qui a tué le boss les
   * avait tués (XP et recrues selon leurs marques habituelles, flaques, explosion des kamikazes…) : pas de décalage d'XP entre ceux qui
   * tuent le boss vite et les autres. Un autre boss encore en vie est épargné.
   */
  private wipeAliens(boss: AlienState, killer: PlayerId | null): void {
    for (const o of this.aliens) {
      if (o === boss || !o.alive || o.def.boss || o.def.egg) continue; // un œuf d'un boss précédent survit au clear screen
      this.killAlien(o, killer, true); // clear screen : pas de portée à la mort
    }
  }

  /** Boucle de glace : gèle le seul soldat touché ; `ring` = rayon (px) de l'onde visuelle de l'impact. */
  freezeHit(s: SoldierState, ring: number): void {
    this.events.push({ t: 'freeze', x: s.x, y: s.y, r: ring });
    if (!s.alive || s.capturedBy || s.frozen > 0 || s.grabbed > 0 || s.invulnerable > 0) return;
    this.horde.freezeSoldier(s);
  }

  /** Le joueur `owner` est allié du soldat `s` : coop / solo, tous les joueurs ; PvP, seulement le sien. Jamais les aliens. */
  allied(owner: PlayerId, s: SoldierState): boolean {
    return owner !== 'aliens' && (!this.mode.pvp || owner === s.owner);
  }

  /** Coup allié sur un soldat gelé : 1 PV de gel en moins, quelle que soit sa puissance (rien au tout début du gel) ; à 0, il est libéré. */
  chipIce(s: SoldierState): void {
    if (!s.alive || s.frozen <= 0 || s.iceInvuln > 0) return;
    s.frozen = Math.max(0, s.frozen - 1);
    if (s.frozen > 0) return;
    s.iceInvuln = 0;
    s.invulnerable = Math.max(s.invulnerable, 1.2); // brève protection à la sortie de la glace
    this.events.push({ t: 'thaw', soldier: s.id, x: s.x, y: s.y });
  }

  /** Retire les morts en fin de tick (jamais pendant les itérations). */
  private cleanup(): void {
    // Explosions de Flammeurs morts (peuvent en tuer d'autres)
    while (this.blasts.length > 0) {
      const b = this.blasts.shift()!;
      const fromAlien = b.team === 'aliens';
      this.events.push({ t: 'explosion', x: b.x, y: b.y, r: b.r, style: b.style ?? (fromAlien ? 'slime' : undefined) });
      if (fromAlien) {
        // boule de slime : blesse tous les soldats (jamais les aliens), même hors PvP
        for (const sq of this.squads) for (const s of sq.soldiers) this.blastHit(s, b);
        continue;
      }
      for (const a of this.aliens) this.blastHit(a, b);
      // soldats alliés gelés dans la zone : l'explosion brise un peu leur glace (1 PV de gel, comme un tir)
      for (const sq of this.squads) {
        for (const s of sq.soldiers) {
          if (s.frozen > 0 && this.allied(b.owner, s) && Math.hypot(s.x - b.x, s.y - b.y) < b.r + s.radius) this.chipIce(s);
        }
      }
      if (this.mode.pvp) for (const sq of this.squads) if (sq.owner !== b.owner) for (const s of sq.soldiers) this.blastHit(s, b);
    }

    // aliens qui surgissent de la mort d'un autre (chaman : 5 araignées), répartis en cercle autour du corps
    for (const d of this.deathSpawns.splice(0)) {
      const start = this.rng.range(0, Math.PI * 2);
      for (let i = 0; i < d.count; i++) {
        const ang = start + (i / d.count) * Math.PI * 2;
        const dist = d.radius * this.rng.range(0.8, 1.5);
        const p = { x: d.x + Math.cos(ang) * dist, y: d.y + Math.sin(ang) * dist * 0.7, radius: ALIENS[d.type].radius };
        this.arena.constrain(p);
        this.horde.spawnAt(d.type, p.x, p.y, 1, false, true, d.hpMul); // sur place : pas enterrées
      }
    }

    for (let i = this.aliens.length - 1; i >= 0; i--) if (!this.aliens[i].alive) this.aliens.splice(i, 1);

    for (const sq of this.squads) {
      const hadSoldiers = sq.size > 0;
      const deadOfSquad = sq.removeDead();
      for (const s of deadOfSquad) {
        if (this.boarded.delete(s)) continue;
        this.events.push({ t: 'soldierDied', id: s.id, x: s.x, y: s.y, cls: s.def.id, owner: s.owner });
      }
      if (hadSoldiers && sq.size === 0 && !this.ending) {
        this.events.push({ t: 'squadWiped', owner: sq.owner });
        if (this.mode.reviveZones && this.config.online && !this.reviveZones.some((z) => z.owner === sq.owner)) {
          const last = deadOfSquad[deadOfSquad.length - 1];
          this.reviveZones.push({ owner: sq.owner, x: last.x, y: last.y, r: REVIVE_RADIUS, progress: 0 });
        }
      }
    }
  }

  private blastHit(u: Unit, b: { x: number; y: number; r: number; dmg: number; owner: PlayerId; knock: number; poison?: number; hop?: number }): void {
    if (!u.alive) return;
    const dx = u.x - b.x;
    const dy = u.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > b.r + u.radius) return;
    if (u.kind !== 'alien' || this.horde.knockable(u)) {
      u.kx += ((dx / d) * b.knock) / u.mass;
      u.ky += ((dy / d) * b.knock) / u.mass;
      if (b.hop && u.kind === 'soldier') u.knockT = Math.max(u.knockT, b.hop); // pendant ce temps seul le recul le déplace
    }
    this.damage(u, b.dmg, b.owner);
    if (b.poison && u.kind === 'soldier' && u.alive) u.poison = Math.max(u.poison, b.poison); // empoisonné (ou durée remise à plein)
  }

  /** Poison : les PV du soldat descendent linéairement vers 1 en `poison` s (il ne meurt jamais de poison ; un soin remonte la barre, la descente continue). */
  private updatePoison(dt: number): void {
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        if (s.poison <= 0 || !s.alive) continue;
        if (s.hp > 1) s.hp -= (s.hp - 1) * Math.min(1, dt / s.poison);
        s.poison = Math.max(0, s.poison - dt);
      }
    }
  }

  // ---------- Revive ----------

  /** Relance une squad anéantie (pub récompensée en solo) : les aliens ne disparaissent pas, une onde de choc les repousse comme à une montée de niveau. */
  respawnSquad(owner: PlayerId, composition: SoldierClassId[], invulnerable = REVIVE_INVULN, lethal = false): void {
    const sq = this.squadOf(owner);
    if (!sq) return;
    const at = { x: sq.anchor.x, y: sq.anchor.y };
    sq.spawn(composition, at);
    for (const s of sq.soldiers) s.invulnerable = invulnerable;
    this.shockwave(at.x, at.y, UPGRADE_REPEL.radius, UPGRADE_REPEL.speed, UPGRADE_REPEL.duration, UPGRADE_REPEL.reach, lethal ? owner : null);
    this.events.push({ t: 'repel', x: at.x, y: at.y });
  }
}
