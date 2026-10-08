import { EventQueue, IdGen, Rng, SpatialHash, type Point } from '@xiao/engine/sim';
import { BURIED, CAPTIVE_VULN, DIFFICULTY, UPGRADE_REPEL, LEVEL_UP_DELAY, REVIVE_INVULN, REVIVE_RADIUS, REVIVE_TIME, UPGRADE_CHOICE_TIME } from '../config';
import { xpToNext } from '../data/progression';
import { ALIENS } from '../data/aliens';
import { START_SQUADS, type SoldierClassId } from '../data/classes';
import type { MapDef } from '../data/maps';
import type { ModeDef } from '../data/modes';
import { Arena } from './Arena';
import { Chests, UpgradeOrbs } from './Chests';
import { Combat } from './Combat';
import type { AlienState, Corpse, FirePatch, Puddle, ReviveZone, SoldierState, Stalactite, Unit, WallTelegraph } from './entities';
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
  private burnCd = 0;
  /** Le boss final est mort : la partie (survie) est gagnée. */
  finalBossDead = false;
  /** Boss et mini-boss tués depuis le début de la partie (voir `escalation`). */
  bossKills = 0;
  readonly alienHash = new SpatialHash<AlienState>(64);
  readonly soldierHash = new SpatialHash<SoldierState>(64);
  readonly horde: Horde;
  readonly combat: Combat;
  readonly recruits: Recruits;
  /** Coffres des boss tués et globes d'upgrade qui en sortent (réservés à leur joueur). */
  readonly chests: Chests;
  readonly upgradeOrbs: UpgradeOrbs;
  readonly powerups: PowerUps;
  readonly xp: Xp;
  /** Tampon réutilisé pour les requêtes de voisinage (évite les allocations). */
  readonly scratchSoldiers: SoldierState[] = [];
  readonly waves: WaveRunner;
  /** Onboarding en cours (null hors tutoriel) : tant qu'il est actif, la timeline de vagues est suspendue. */
  readonly tutorial: Tutorial | null;
  alienHpMul = 1;
  /** Compteurs cumulés depuis la création de la Sim (lus par `RunRecorder`, jamais remis à zéro : le lecteur fait des différences). */
  readonly metrics = { dealt: 0, taken: 0, spawnedHp: 0, kills: 0, soldiersLost: 0, recDropped: 0, recPicked: 0, recExpired: 0, recSwamped: 0 };
  tick = 0;
  private readonly blasts: { x: number; y: number; r: number; dmg: number; team: string; owner: PlayerId; knock: number; style?: 'slime' | 'fire' | 'spit' | 'acid' }[] = [];
  /** Explosions retardées (kamikaze mort) : le corps reste sur place jusqu'à la fin de la mèche. */
  private readonly fuses: { x: number; y: number; t: number; r: number; dmg: number; knock: number }[] = [];

  constructor(readonly config: SimConfig) {
    this.rng = new Rng(config.seed);
    this.map = config.mode.map(config.seed);
    this.arena = new Arena(this.map);
    this.horde = new Horde(this);
    this.combat = new Combat(this);
    this.recruits = new Recruits(this);
    this.chests = new Chests(this);
    this.upgradeOrbs = new UpgradeOrbs(this);
    this.powerups = new PowerUps(this);
    this.xp = new Xp(this);
    this.squads = config.players.map((id) => new Squad(this, id));
    this.squads.forEach((sq, i) => (sq.slot = i));
    this.tutorial = config.tutorial ? new Tutorial(this) : null;
    this.waves = new WaveRunner(
      config.mode.waves,
      (type, count) => {
        // Difficulté dynamique : chaque joueur vivant en plus ajoute `DIFFICULTY.extraPlayerAliens` (75 %) d'ennemis (2 joueurs = ×1,75, 1 seul vivant =
        // retour à ×1). Un boss, lui, n'apparaît qu'une fois, avec ses PV multipliés par le même facteur (2 joueurs = ×1,75 ; ×le nombre de
        // squads avant le 08/10).
        // Plafond d'aliens à l'apparition appliqué par type dans Horde.spawnNear (`ModeDef.maxAliens`, réserve pour les costauds) ; au-delà de
        // `DIFFICULTY.wavePauseAbove` aliens vivants, la timeline se met en pause.
        const squads = this.aliveSquads;
        if (squads.length === 0) return;
        const playersMul = 1 + DIFFICULTY.extraPlayerAliens * (squads.length - 1);
        if (ALIENS[type].boss) {
          this.horde.spawnNear(squads[Math.floor(this.rng.next() * squads.length)], type, count, SPAWN_DISTANCE, playersMul);
        } else {
          // chaque joueur en plus ajoute `DIFFICULTY.extraPlayerAliens` (+75 %) d'aliens à la vague : le total est réparti entre les squads vivantes
          const share = playersMul / squads.length;
          const cap = ALIENS[type].maxPerWave ?? Infinity; // plafond par vague et par squad (ex. 2 slimes de glace)
          for (const sq of squads) this.horde.spawnNear(sq, type, Math.min(cap, Math.round(count * DIFFICULTY.alienCountMul * share)), SPAWN_DISTANCE);
        }
      },
      this.rng,
      {
        bossAlive: () => this.aliens.some((a) => a.alive && !!a.def.boss),
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
    this.shockwaves.length = 0;
    this.arena.rocks.length = 0;
    this.blasts.length = 0;
    this.fuses.length = 0;
    this.combat.clear();
    this.recruits.clear();
    this.chests.clear();
    this.upgradeOrbs.clear();
    this.powerups.clear();
    this.xp.clear();
    this.finalBossDead = false;
    this.bossKills = 0;
    this.choiceT = 0;
    this.choiceDelay = 0;
    this.sharedXpPool = 0;
    this.sharedLevel = 1;
    this.waves.reset();
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
    this.shockwaves.length = 0;
    this.arena.rocks.length = 0;
    this.blasts.length = 0;
    this.fuses.length = 0;
    this.combat.clear();
    this.recruits.clear();
    this.chests.clear();
    this.upgradeOrbs.clear();
    this.powerups.clear();
    this.xp.clear();
    this.choiceT = 0;
    this.choiceDelay = 0;
    this.bossKills = bossKills;
    this.waves.skipTo(cursor, time);
  }

  get xpEnabled(): boolean {
    return this.config.xp === true;
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

  /** Multiplicateur du seuil de niveau (XP partagée : × nombre de joueurs). */
  get xpScale(): number {
    return this.sharedXp ? Math.max(1, this.squads.length) : 1;
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
    const points = this.mode.spawnPoints(this.map, this.squads.length, this.rng);
    this.squads.forEach((sq, i) => sq.spawn(pickComposition(), points[i]));
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
    const sq = this.addPlayer(owner);
    if (sq.alive) return;
    // coop : on arrive à côté de ses équipiers ; sinon (PvP) à l'écart des autres squads
    const mate = this.mode.pvp ? undefined : this.aliveSquads[0];
    const at = mate ? { x: mate.center.x + 90, y: mate.center.y } : this.randomSpawnPoint();
    sq.spawn(composition, at);
    for (const s of sq.soldiers) s.invulnerable = invulnerable;
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

    if (!this.tutorial?.active) this.waves.update(dt); // onboarding : la timeline normale attend la fin du tutoriel
    this.rebuildHashes();
    for (const sq of this.squads) sq.update(dt, inputs.get(sq.owner) ?? NO_INPUT);
    this.horde.update(dt);
    this.combat.update(dt);
    this.recruits.update(dt);
    this.chests.update(dt);
    this.upgradeOrbs.update(dt);
    if (this.xpEnabled) this.xp.update(dt);
    this.updateCorpsesAndRocks(dt);
    this.updateFires(dt);
    this.updateReviveZones(dt);
    this.updateWalls(dt);
    this.updateStalactites(dt);
    this.updatePuddles(dt);
    this.powerups.update(dt);
    this.updateShockwaves(dt);
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.t > 0) continue;
      this.addBlast(f.x, f.y, f.r, f.dmg, 'aliens', 'aliens', f.knock, 'fire');
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

  /** Multiplicateur appliqué à tout alien qui apparaît maintenant : ×(1 + `DIFFICULTY.bossEscalation`) par boss ou mini-boss déjà tué. */
  get escalation(): number {
    return (1 + DIFFICULTY.bossEscalation) ** this.bossKills;
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
    const effective = Math.min(amount, Math.max(0, u.hp) + u.shield); // PV et bouclier réellement retirés (sans l'overkill)
    this.metrics.dealt += effective;
    if (attacker) {
      const sq = this.squadOf(attacker);
      if (sq) sq.dealt += effective;
    }
    u.shieldT = 0; // tout coup relance le délai de régénération du bouclier
    u.hp -= this.absorb(u, amount);
    u.kx += (dirX * 40) / u.mass;
    u.ky += (dirY * 40) / u.mass;
    this.events.push({ t: 'hit', id: u.id });
    if (u.hp <= 0) this.killAlien(u, attacker);
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
    for (let i = 0; i < Math.round(DIFFICULTY.zombieCopies); i++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = i === 0 ? 0 : this.rng.range(18, 45);
      this.horde.spawnAt(c.type, c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r, hpFrac, true);
    }
  }

  /** Annonce un mur (télégraphe jaune) ; `windup` s plus tard, une ligne de rochers de rayon `rockR` surgit, pour `ttl` s. */
  addWall(x: number, y: number, angle: number, length: number, windup: number, rockR: number, ttl: number): void {
    this.walls.push({ id: this.ids.get(), x, y, angle, length, rockR, ttl, t: windup, dur: windup });
    if (this.walls.length > 30) this.walls.shift();
  }

  /** Annonce une stalactite : zone de rayon `r` en (`x`, `y`), impact `delay` s plus tard. */
  addStalactite(x: number, y: number, r: number, delay: number, damage: number, knockback: number): void {
    this.stalactites.push({ id: this.ids.get(), x, y, r, t: delay, dur: delay, damage, knockback });
    if (this.stalactites.length > 60) this.stalactites.shift();
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

  /** Rocher au sol (élément d'un mur) : obstacle pendant `ttl` secondes. */
  addRock(x: number, y: number, radius: number, ttl: number): void {
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
        if (!a.alive) continue;
        let h = w.hit.get(a.id);
        if (!h) {
          if (w.t - dt > w.reach) continue; // front arrivé au bout : un alien apparu après n'est pas repoussé
          const dx = a.x - w.x;
          const dy = a.y - w.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > front) continue;
          h = { dx: dx / d, dy: dy / d, k: (1 - (d / w.r) * 0.6) * w.speed * (a.def.capture ? 0.35 : 1), left: w.duration }; // les bulles sont difficiles à repousser
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
  addPuddle(x: number, y: number, r: number, ttl: number, slow: number, frost = false): void {
    this.puddles.push(frost ? { id: this.ids.get(), x, y, r, ttl, slow: 1, frost } : { id: this.ids.get(), x, y, r, ttl, slow });
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
      if (gone) this.puddles.splice(i, 1);
    }
  }

  /** Facteur de vitesse d'un soldat à cet endroit (1 = libre ; les flaques ne se cumulent pas : la plus forte l'emporte). */
  slowAt(x: number, y: number, radius: number): number {
    let k = 1;
    for (const p of this.puddles) {
      if (p.frost) continue; // nuage de glace : il gèle (updatePuddles), il ne ralentit pas
      const rr = p.r + radius * 0.5;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 < rr * rr) k = Math.min(k, p.slow);
    }
    return k;
  }

  /** Flaque de flammes : brûle les soldats dedans pendant `ttl` s. */
  addFire(x: number, y: number, r: number, ttl: number, dps: number): void {
    const f: FirePatch = { id: this.ids.get(), x, y, r, ttl, dps };
    this.fires.push(f); // affichage : `WorldView.syncFires` suit cette liste (snapshot en ligne), pas d'événement
    if (this.fires.length > 150) this.endFire(this.fires[0]);
  }

  private endFire(f: FirePatch): void {
    const i = this.fires.indexOf(f);
    if (i >= 0) this.fires.splice(i, 1);
  }

  /** Durée des flammes, et brûlure des soldats qui marchent dedans (par petits coups toutes les 0,25 s). */
  private updateFires(dt: number): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.ttl -= dt;
      if (f.ttl <= 0) this.endFire(f);
    }
    this.burnCd -= dt;
    if (this.burnCd > 0) return;
    this.burnCd = 0.25;
    if (this.fires.length === 0) return;
    for (const sq of this.squads) {
      for (const s of sq.soldiers) {
        if (!s.alive) continue;
        let dps = 0;
        for (const f of this.fires) {
          const rr = f.r + s.radius * 0.5;
          if ((s.x - f.x) ** 2 + (s.y - f.y) ** 2 < rr * rr) dps = Math.max(dps, f.dps); // les flaques ne se cumulent pas
        }
        if (dps > 0) this.damageSoldier(s, dps * 0.25);
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
  addBlast(x: number, y: number, r: number, dmg: number, team: string, owner: PlayerId, knock = 300, style?: 'slime' | 'fire' | 'spit' | 'acid'): void {
    this.blasts.push({ x, y, r, dmg, team, owner, knock, style });
  }

  /**
   * `force` : dégâts qui passent même sur un soldat protégé (digestion par une bulle : c'est la seule source qui l'atteint). Sans `attacker` (coup
   * d'alien), × `DIFFICULTY.alienDamageMul` sauf si `scaled` = false (un coup = un mort : boss en mêlée, écrasement du saut).
   */
  damageSoldier(s: SoldierState, amount: number, attacker: PlayerId | null = null, force = false, scaled = true): void {
    if (!s.alive) return;
    if (!force && (s.invulnerable > 0 || s.capturedBy)) return; // avalé par une bulle : protégé (gelé : attaquable)
    if (attacker === null && scaled) amount *= DIFFICULTY.alienDamageMul; // coup d'alien (`scaled` = false : un coup = un mort, intact)
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
    if (blast) this.blasts.push({ x: s.x, y: s.y, r: blast.radius, dmg: blast.damage, team: s.team, owner: s.owner, knock: 300 });
  }

  private killAlien(a: AlienState, killer: PlayerId | null): void {
    a.alive = false;
    this.metrics.kills++;
    const squad = killer ? this.squadOf(killer) : undefined;
    if (squad) squad.kills++;
    this.events.push({ t: 'alienDied', id: a.id, x: a.x, y: a.y, alien: a.def.id, killer });
    if (a.def.boss) {
      // rhinos jumeaux : le combat de boss ne se termine qu'à la mort du DERNIER ; lui seul compte (escalade, bandeau) et laisse le coffre
      const last = !this.aliens.some((o) => o !== a && o.alive && o.def.boss);
      if (a.def.boss.kind === 'final') this.finalBossDead = true;
      this.wipeAliens(a, killer); // clear screen à chaque mort de boss ; un autre boss encore en vie est épargné
      if (last) {
        this.bossKills++; // escalade : les aliens suivants sont plus forts
        this.events.push({ t: 'bossDown', alien: a.def.id, kind: a.def.boss.kind });
        if (a.def.boss.kind !== 'final') this.chests.drop(a.x, a.y); // coffre sur le cadavre (le boss final, lui, gagne la partie)
      }
    }
    this.releaseCaptive(a);
    if (a.def.revivable && !a.revived) {
      const c: Corpse = { id: this.ids.get(), x: a.x, y: a.y, type: a.def.id, ttl: CORPSE_TTL, claimed: 0 };
      this.corpses.push(c);
      this.events.push({ t: 'corpse', id: c.id, x: c.x, y: c.y, alien: c.type, ttl: c.ttl });
      if (this.corpses.length > 60) this.endCorpse(this.corpses[0], false);
    }
    const bomb = a.def.deathBlast;
    if (bomb) {
      this.fuses.push({ x: a.x, y: a.y, t: bomb.delay, r: bomb.radius, dmg: bomb.damage * a.esc, knock: bomb.knockback });
      this.events.push({ t: 'fuse', x: a.x, y: a.y, r: bomb.radius, delay: bomb.delay, alien: a.def.id });
    }
    if (a.tut && this.tutorial) {
      this.tutorial.drop(a); // onboarding : XP, recrue et power-up choisis par le script
      return;
    }
    if (!a.noRecruit) this.recruits.maybeDrop(a, squad); // invoqué / ressuscité : pas de recrue (un alien d'un rejeu de vague, lui, peut en laisser)
    if (this.xpEnabled && !a.noXp) this.xp.drop(a, undefined, squad ?? this.nearestSquad(a.x, a.y)); // les aliens des vagues rejouées pendant un boss ne donnent pas d'XP // le bonus d'XP de la squad qui a tué agrandit le butin
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
      if (o === boss || !o.alive || o.def.boss) continue;
      this.killAlien(o, killer);
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

    for (let i = this.aliens.length - 1; i >= 0; i--) if (!this.aliens[i].alive) this.aliens.splice(i, 1);

    for (const sq of this.squads) {
      const hadSoldiers = sq.size > 0;
      const deadOfSquad = sq.removeDead();
      for (const s of deadOfSquad) {
        this.events.push({ t: 'soldierDied', id: s.id, x: s.x, y: s.y, cls: s.def.id, owner: s.owner });
      }
      if (hadSoldiers && sq.size === 0) {
        this.events.push({ t: 'squadWiped', owner: sq.owner });
        if (this.mode.reviveZones && this.config.online && !this.reviveZones.some((z) => z.owner === sq.owner)) {
          const last = deadOfSquad[deadOfSquad.length - 1];
          this.reviveZones.push({ owner: sq.owner, x: last.x, y: last.y, r: REVIVE_RADIUS, progress: 0 });
        }
      }
    }
  }

  private blastHit(u: Unit, b: { x: number; y: number; r: number; dmg: number; owner: PlayerId; knock: number }): void {
    if (!u.alive) return;
    const dx = u.x - b.x;
    const dy = u.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > b.r + u.radius) return;
    u.kx += ((dx / d) * b.knock) / u.mass;
    u.ky += ((dy / d) * b.knock) / u.mass;
    this.damage(u, b.dmg, b.owner);
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
