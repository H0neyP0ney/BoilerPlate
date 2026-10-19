import { FixedStep } from '@xiao/engine/sim';
import { MAX_BOTS, type BotLevel } from '../data/bots';
import { START_SQUADS, type SoldierClassId } from '../data/classes';
import type { DifficultyLevel } from '../data/difficultyLevels';
import type { ModeDef } from '../data/modes';
import { CoopBot } from '../sim/CoopBot';
import { Sim } from '../sim/Sim';
import { NO_INPUT, type PlayerId, type PlayerInput, type SimEvent } from '../sim/types';
import {
  encodeSnapshot,
  parseMessage,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY,
  takeSnapshot,
  type ClientMessage,
  type HostMessage,
  type LobbyInfo,
  type Snapshot,
} from './Protocol';
import { skinById } from '../data/skins';
import { perkById, unitUnlockById } from '../data/armory';
import { trailById } from '../data/trails';
import { TICK_RATE, type Session } from './Session';
import type { Payload, Transport } from './Transport';

/** Joueurs max (hôte inclus) : au-delà, le P2P sature la connexion montante de l'hôte. */
export const MAX_PLAYERS = 4;
/** Sans input depuis si longtemps (s), la squad d'un client s'arrête. */
const INPUT_TIMEOUT = 1.5;
/** Délai (s) entre l'anéantissement d'une squad et sa réapparition. */
const RESPAWN_DELAY = 2.5;
/** Coop : temps (s) d'affichage de l'écran de fin (victoire / défaite) avant de relancer la partie. */
const END_DELAY = 3;

export interface HostSessionOptions {
  mode: ModeDef;
  seed: number;
  transport: Transport;
  roomCode: string;
  /** Coop : nombre de coéquipiers IA au départ (0 si absent) et leur niveau. */
  bots?: number;
  botLevel?: BotLevel;
  /** Niveau de difficulté de la room (`normal` par défaut) : l'hôte décide pour tous les joueurs. */
  difficulty?: DifficultyLevel;
  /** Salle d'attente : la simulation reste figée jusqu'à `startGame()` (l'hôte règle la difficulté, ajoute des bots, attend ses amis). */
  lobby?: boolean;
  /** Salle listée dans les parties publiques (information du lobby ; la visibilité réelle est décidée à la création par le transport). */
  public?: boolean;
  /** Cosmétiques équipés par l'hôte (ids de skin et de trail), diffusés à tous les joueurs. */
  skin?: string;
  trail?: string;
  /** Armurerie de l'hôte (unités débloquées, upgrades). */
  units?: string[];
  perks?: string[];
}

interface RemotePlayer {
  input: PlayerInput;
  lastInputTick: number;
  /** Numéro (tick client) du plus récent input reçu (dédoublonnage). */
  seq: number;
  /** Inputs reçus pas encore joués, contigus et dans l'ordre : l'hôte en joue UN par tick, comme le client les a joués dans sa prédiction. */
  queue: { n: number; mx: number; my: number }[];
  /** Numéro du dernier input réellement joué par la simulation : c'est lui qui est renvoyé dans le snapshot (`ack`). */
  applied: number;
  /** Plus petite taille de la file sur la fenêtre en cours (pour la raccourcir quand la gigue du réseau a disparu). */
  minDepth: number;
  depthTicks: number;
}

/** File d'inputs d'un joueur distant : au-delà, les plus vieux sont abandonnés (rafale après un gel du réseau). */
const MAX_INPUT_QUEUE = 6;
/** Fenêtre (ticks) au bout de laquelle une file toujours ≥ 2 est raccourcie d'un cran. */
const INPUT_QUEUE_WINDOW = 90;
/** Trou maximal (ticks) comblé en répétant le dernier input ; au-delà, on saute. */
const MAX_INPUT_GAP = 8;
/**
 * Événements envoyés sur le canal FIABLE (les autres partent en non fiable : un effet perdu n'est pas grave). Ceux-ci pilotent un écran, une
 * sauvegarde ou les événements Poki chez le client (`GameScene.onEvent`, `HudScene.onNetEnd` / `onBoss`) : rares, ils ne coûtent rien.
 */
const RELIABLE_EVENTS = new Set<SimEvent['t']>(['gameEnd', 'restart', 'boss', 'bossDown', 'bossEnrage']);

/**
 * L'hôte fait tourner LA simulation (autoritaire) : il applique ses propres inputs
 * et ceux des clients, puis diffuse l'état (snapshots) et les événements.
 * Les clients ne simulent rien : ils affichent ce que l'hôte leur envoie.
 *
 * Un client qui arrive en cours de partie reçoit une squad neuve, placée loin des autres.
 */
export class HostSession implements Session {
  readonly sim: Sim;
  readonly localPlayer: PlayerId;
  readonly online = true;
  readonly isHost = true;
  readonly roomCode: string;
  connection: 'connected' | 'lost' = 'connected';
  readonly hostStalled = false;
  private readonly transport: Transport;
  private readonly loop = new FixedStep(TICK_RATE);
  private readonly inputs = new Map<PlayerId, PlayerInput>();
  private readonly local: PlayerInput = { mx: 0, my: 0 };
  private readonly remotes = new Map<PlayerId, RemotePlayer>();
  private readonly acks = new Map<PlayerId, number>();
  /** Coéquipiers IA (coop) : ils jouent sur l'hôte uniquement ; les clients voient une squad comme une autre. */
  readonly bots = new Map<PlayerId, CoopBot>();
  private botCount = 0;
  private outbound: SimEvent[] = [];
  /** Effets de tir à joindre au prochain snapshot, en binaire (v38) au lieu d'événements JSON. */
  private fxShots: Snapshot['shots'] = [];
  private fxImpacts: Snapshot['impacts'] = [];
  private fxHits: number[] = [];
  /** Tick d'anéantissement des squads en attente de réapparition. */
  private readonly deadSince = new Map<PlayerId, number>();
  /** Coop : ticks restants avant la relance de la partie (> 0 = écran de fin, simulation figée). */
  private endTicks = 0;
  private frame = 0;
  /** Salle d'attente (null = partie lancée sans attente). */
  lobby: LobbyInfo | null = null;
  private isPublic: boolean;

  constructor(opts: HostSessionOptions) {
    this.transport = opts.transport;
    this.roomCode = opts.roomCode;
    this.isPublic = opts.public ?? true;
    if (opts.lobby) this.lobby = { started: false, humans: 1, bots: 0, public: this.isPublic };
    this.localPlayer = opts.transport.localId;
    this.sim = new Sim({ mode: opts.mode, seed: opts.seed, players: [this.localPlayer], xp: true, choiceTimeout: true, online: true, difficulty: opts.difficulty });
    this.sim.spawnSquads(() => this.sim.rng.pick(START_SQUADS));
    this.setCosmetics(this.localPlayer, opts.skin, opts.trail);
    this.setLoadout(this.localPlayer, opts.units, opts.perks);
    this.inputs.set(this.localPlayer, this.local);

    this.transport.onMessage = this.onMessage;
    this.transport.onPeerDisconnected = this.onPeerLeft;
    this.transport.onClosed = () => (this.connection = 'lost');
    for (let i = 0; i < Math.min(opts.bots ?? 0, MAX_BOTS); i++) this.addBot(opts.botLevel);
  }

  /** Ajoute un coéquipier IA (pas en PvP, dans la limite de `MAX_BOTS` et des places libres). Renvoie son id, ou null. */
  addBot(level: BotLevel = 'standard'): PlayerId | null {
    if (this.sim.mode.pvp || this.bots.size >= MAX_BOTS || this.playerCount >= MAX_PLAYERS) return null;
    const id = `bot${++this.botCount}`;
    this.bots.set(id, new CoopBot(id, this.sim.config.seed + 101 * this.botCount, level));
    this.sim.spawnLate(id, this.sim.rng.pick(START_SQUADS));
    this.updateLobby();
    return id;
  }

  removeBot(id: PlayerId): void {
    if (!this.bots.delete(id)) return;
    this.inputs.delete(id);
    this.deadSince.delete(id);
    this.sim.removePlayer(id);
    this.updateLobby();
  }

  /** Fin de partie (défaite ou victoire) : nouvelle run prête, monde figé, tous les joueurs retrouvent la salle d'attente (l'hôte relance avec Start). */
  backToLobby(): void {
    this.sim.restart();
    this.lobby ??= { started: true, humans: 1, bots: 0, public: this.isPublic };
    this.lobby.started = false;
    this.updateLobby();
  }

  /**
   * Salle d'attente : passe la partie en publique / privée (visible dans la liste des parties publiques, ou seulement par son code). Le serveur est prévenu d'abord ; si il refuse, rien ne change.
   * Les joueurs déjà dans la salle y restent.
   */
  async setPublic(isPublic: boolean): Promise<void> {
    if (!this.lobby || this.lobby.started || this.isPublic === isPublic) return;
    try {
      await this.transport.setPublic(isPublic);
    } catch {
      return; // refusé (ou réseau perdu) : on garde l'ancienne visibilité
    }
    this.isPublic = isPublic;
    if (this.lobby) this.lobby.public = isPublic;
    this.updateLobby();
  }

  /** Lance la partie : fin de la salle d'attente pour tous les joueurs. */
  startGame(): void {
    if (!this.lobby || this.lobby.started) return;
    this.lobby.started = true;
    this.updateLobby();
  }

  /** Remet l'effectif à jour et le diffuse (changement de joueurs, de bots, départ de la partie). */
  private updateLobby(): void {
    if (!this.lobby) return;
    this.lobby.humans = 1 + this.remotes.size;
    this.lobby.bots = this.bots.size;
    this.transport.broadcast('reliable', JSON.stringify({ t: 'lobby', info: this.lobby } satisfies HostMessage));
  }

  /** Joueurs présents (hôte, clients et coéquipiers IA). */
  get playerCount(): number {
    return 1 + this.remotes.size + this.bots.size;
  }

  get alpha(): number {
    return this.loop.alpha;
  }

  setLocalInput(mx: number, my: number): void {
    this.local.mx = mx;
    this.local.my = my;
  }

  /**
   * Joue UN input de la file d'un joueur distant par tick d'hôte, dans l'ordre des numéros : la trajectoire de son ancre chez l'hôte est alors
   * exactement celle que son client a prédite (il rejoue seulement les inputs après `ack`). Avant, l'hôte gardait « le dernier input reçu » : une
   * rafale ou un paquet en retard faisait sauter des numéros, donc l'ancre divergeait de la prédiction et chaque snapshot la corrigeait (à-coups).
   * File vide : on garde le dernier input ; la file grossit alors d'un cran dès que le paquet arrive (tampon adaptatif contre la gigue).
   */
  private consumeInput(id: PlayerId, r: RemotePlayer): void {
    r.minDepth = r.depthTicks === 0 ? r.queue.length : Math.min(r.minDepth, r.queue.length);
    let shrink = false;
    if (++r.depthTicks >= INPUT_QUEUE_WINDOW) {
      shrink = r.minDepth >= 2; // la file n'est pas tombée sous 2 de toute la fenêtre : la gigue a disparu, on la raccourcit d'un cran
      r.depthTicks = 0;
    }
    while (r.queue.length > MAX_INPUT_QUEUE) r.queue.shift();
    let e = r.queue.shift();
    if (e && shrink && r.queue.length > 0) e = r.queue.shift();
    if (!e) return;
    r.input = { mx: e.mx, my: e.my };
    r.applied = e.n;
    this.acks.set(id, e.n);
  }

  advance(deltaMs: number, onEvent: (e: SimEvent) => void): void {
    this.loop.advance(deltaMs, (dt) => {
      for (const [id, r] of this.remotes) {
        this.consumeInput(id, r);
        const stale = this.sim.tick - r.lastInputTick > INPUT_TIMEOUT * TICK_RATE;
        this.inputs.set(id, stale ? NO_INPUT : r.input);
      }
      this.frame++;
      for (const [id, bot] of this.bots) this.inputs.set(id, bot.think(this.sim, dt));
      if (this.lobby && !this.lobby.started) {
        // salle d'attente : le monde est figé (les squads attendent), les snapshots partent quand même
      } else if (this.endTicks > 0) {
        // écran de fin : le monde est figé jusqu'à la relance
        if (--this.endTicks === 0) this.backToLobby();
      } else {
        this.sim.step(dt, this.inputs);
        for (const [id, bot] of this.bots) {
          const pick = bot.pickUpgrade(this.sim);
          if (pick >= 0) this.sim.chooseUpgrade(id, pick);
        }
        if (!this.sim.mode.pvp) this.checkCoopEnd(); // survie à plusieurs : fin quand tous sont morts ou que le boss final tombe
        else this.respawnDead();
      }
      const share = this.remotes.size > 0;
      this.sim.events.drain((e) => {
        onEvent(e);
        if (!share) return;
        if (e.t === 'shot') this.fxShots.push({ id: e.id, x: e.x, y: e.y });
        else if (e.t === 'impact') this.fxImpacts.push({ x: e.x, y: e.y, texture: e.texture });
        else if (e.t === 'hit') this.fxHits.push(e.id);
        else this.outbound.push(e);
      });
      if (share && this.frame % SNAPSHOT_EVERY === 0) this.broadcast();
    });
  }

  /** Pas de revive par pub en ligne : la réapparition est automatique. */
  reviveLocal(): void {}

  chooseUpgrade(index: number): void {
    this.sim.chooseUpgrade(this.localPlayer, index);
  }

  rerollUpgrade(): void {
    this.sim.rerollUpgrade(this.localPlayer);
  }

  /** Coop : fin de partie quand toutes les squads sont mortes (défaite) ou que le boss final est tombé (victoire). */
  private checkCoopEnd(): void {
    const sim = this.sim;
    if (sim.squads.length === 0) return;
    const victory = sim.finalBossDead;
    if (!victory && sim.aliveSquads.length > 0) return;
    sim.events.push({ t: 'gameEnd', victory, delay: END_DELAY });
    this.endTicks = END_DELAY * TICK_RATE;
  }

  close(): void {
    this.transport.close();
  }

  /** Une squad anéantie (la nôtre comme celle d'un client) revient après un court délai, à l'aléatoire. */
  private respawnDead(): void {
    for (const sq of this.sim.squads) {
      if (sq.alive) {
        this.deadSince.delete(sq.owner);
        continue;
      }
      const since = this.deadSince.get(sq.owner) ?? this.sim.tick;
      this.deadSince.set(sq.owner, since);
      if (this.sim.tick - since < RESPAWN_DELAY * TICK_RATE) continue;
      this.deadSince.delete(sq.owner);
      this.sim.spawnLate(sq.owner, this.sim.rng.pick(START_SQUADS));
    }
  }

  // ---------- Réseau ----------

  private broadcast(): void {
    const snap = takeSnapshot(this.sim, this.acks);
    snap.seq = this.frame;
    snap.shots = this.fxShots;
    snap.impacts = this.fxImpacts;
    snap.hits = this.fxHits;
    this.transport.broadcast('unreliable', encodeSnapshot(snap));
    this.fxShots = [];
    this.fxImpacts = [];
    this.fxHits = [];
    if (this.outbound.length > 0) {
      // événements qui changent l'état ou les écrans d'un client (fin de partie, relance, annonces de boss) : canal fiable, rares. Perdus, l'invité ne voyait
      // pas l'écran de fin, ne débloquait pas le niveau suivant après une victoire et n'envoyait pas `gameplayStop` à Poki (mesure `sim:netloss -- events`).
      const reliable = this.outbound.filter((e) => RELIABLE_EVENTS.has(e.t));
      const rest = reliable.length > 0 ? this.outbound.filter((e) => !RELIABLE_EVENTS.has(e.t)) : this.outbound;
      if (reliable.length > 0) this.transport.broadcast('reliable', JSON.stringify({ t: 'events', seq: this.frame, list: reliable } satisfies HostMessage));
      if (rest.length > 0) this.transport.broadcast('unreliable', JSON.stringify({ t: 'events', seq: this.frame, list: rest } satisfies HostMessage));
      this.outbound = [];
    }
  }

  setDifficulty(level: DifficultyLevel): void {
    this.sim.setDifficulty(level);
    const msg: HostMessage = { t: 'difficulty', level };
    this.transport.broadcast('reliable', JSON.stringify(msg));
  }

  private send(peer: PlayerId, msg: HostMessage): void {
    this.transport.send(peer, 'reliable', JSON.stringify(msg));
  }

  private readonly onMessage = (peer: string, data: Payload): void => {
    if (typeof data !== 'string') return;
    const msg = parseMessage<ClientMessage>(data);
    if (!msg) return;
    switch (msg.t) {
      case 'hello':
        return this.onHello(peer, msg.v, msg.skin, msg.trail, msg.units, msg.perks);
      case 'upgrade':
        if (this.remotes.has(peer) && typeof msg.index === 'number') this.sim.chooseUpgrade(peer, Math.floor(msg.index));
        return;
      case 'reroll':
        if (this.remotes.has(peer)) this.sim.rerollUpgrade(peer);
        return;
      case 'input': {
        const r = this.remotes.get(peer);
        if (!r) return;
        const n = typeof msg.n === 'number' && Number.isFinite(msg.n) ? Math.floor(msg.n) : 0;
        if (n <= r.seq) return; // paquet en retard ou dupliqué : déjà reçu
        // le paquet redonde les inputs précédents (`prev` : n-1, n-2…, jusqu'à `MAX_INPUT_GAP`) : un paquet perdu, en retard ou une courte coupure ne laisse pas de trou
        const entries: { n: number; mx: number; my: number }[] = [];
        const prev: unknown[] = Array.isArray(msg.prev) ? msg.prev : [];
        for (let k = Math.min(MAX_INPUT_GAP, prev.length >> 1) - 1; k >= 0; k--) {
          const pn = n - (k + 1);
          if (pn > r.seq && prev.length >= 2 * (k + 1)) entries.push({ n: pn, mx: finite(prev[2 * k]), my: finite(prev[2 * k + 1]) });
        }
        entries.push({ n, mx: finite(msg.mx), my: finite(msg.my) });
        let last = r.queue.length > 0 ? r.queue[r.queue.length - 1] : { mx: r.input.mx, my: r.input.my };
        let expect = r.seq === 0 ? entries[0].n : r.seq + 1;
        for (const e of entries) {
          if (e.n - expect > MAX_INPUT_GAP) expect = e.n; // trou trop grand : on ne fabrique rien
          while (expect < e.n) r.queue.push({ n: expect++, mx: last.mx, my: last.my }); // trou : on répète le dernier input connu
          r.queue.push(e);
          expect = e.n + 1;
          last = e;
        }
        r.seq = n;
        r.lastInputTick = this.sim.tick;
        return;
      }
    }
  };

  /** Skin et trail annoncés par un joueur (cosmétiques : ids inconnus ignorés) ; l'hôte les diffuse à tous dans le snapshot. */
  private setCosmetics(owner: PlayerId, skin: unknown, trail: unknown): void {
    const sq = this.sim.squadOf(owner);
    if (!sq) return;
    sq.skin = typeof skin === 'string' && skinById(skin) ? skin : '';
    sq.trail = typeof trail === 'string' && trailById(trail) ? trail : '';
  }

  /** Armurerie annoncée par un joueur : seuls les ids connus sont retenus (le Trooper est toujours là) ; elle règle SES recrues et ses bonus, pas ceux des autres. */
  private setLoadout(owner: PlayerId, units: unknown, perks: unknown): void {
    const sq = this.sim.squadOf(owner);
    if (!sq) return;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    sq.unlocked = ['trooper', ...list(units).filter((u): u is SoldierClassId => u !== 'trooper' && !!unitUnlockById(u))];
    sq.perks = new Set(list(perks).filter((p) => perkById(p)));
  }

  private onHello(peer: PlayerId, version: number, skin?: string, trail?: string, units?: string[], perks?: string[]): void {
    if (version !== PROTOCOL_VERSION) return this.send(peer, { t: 'refused', reason: 'version' });
    if (!this.remotes.has(peer) && this.playerCount >= MAX_PLAYERS && this.bots.size > 0) this.removeBot([...this.bots.keys()][this.bots.size - 1]); // un humain prend la place d'un bot
    if (!this.remotes.has(peer) && this.playerCount >= MAX_PLAYERS) return this.send(peer, { t: 'refused', reason: 'full' });
    if (!this.remotes.has(peer)) {
      this.remotes.set(peer, { input: { mx: 0, my: 0 }, lastInputTick: this.sim.tick, seq: 0, queue: [], applied: 0, minDepth: 0, depthTicks: 0 });
      this.sim.spawnLate(peer, this.sim.rng.pick(START_SQUADS));
      if (this.lobby) this.lobby.humans = 1 + this.remotes.size;
    }
    this.setCosmetics(peer, skin, trail);
    this.setLoadout(peer, units, perks);
    const lobby = this.lobby ?? { started: true, humans: 1 + this.remotes.size, bots: this.bots.size, public: false };
    this.send(peer, { t: 'welcome', v: PROTOCOL_VERSION, mode: this.sim.mode.id, seed: this.sim.config.seed, you: peer, host: this.localPlayer, difficulty: this.sim.difficulty, lobby });
    this.updateLobby();
  }

  private readonly onPeerLeft = (peer: string): void => {
    if (!this.remotes.delete(peer)) return;
    this.inputs.delete(peer);
    this.acks.delete(peer);
    this.deadSince.delete(peer);
    this.sim.removePlayer(peer);
    this.updateLobby();
  };
}

function finite(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}
