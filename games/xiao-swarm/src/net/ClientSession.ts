import { FixedStep } from '@xiao/engine/sim';
import { MODES } from '../data/modes';
import { Sim } from '../sim/Sim';
import type { PlayerId, SimEvent } from '../sim/types';
import { Mirror } from './Mirror';
import {
  decodeSnapshot,
  parseMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type HostMessage,
  type Snapshot,
} from './Protocol';
import { TICK_RATE, type Session } from './Session';
import type { Payload, Transport } from './Transport';

/** Événements en attente au-delà desquels on jette les plus anciens (onglet en arrière-plan). */
const MAX_PENDING_EVENTS = 400;

/**
 * Tampon d'interpolation (v38, voir docs/MULTIJOUEUR.md § Optimisations v38) : le client joue les snapshots avec ce retard (ms) derrière le
 * plus récent reçu, à cadence régulière. Un snapshot perdu, en retard ou arrivé en rafale ne fait plus sauter les aliens ni les autres
 * squads ; la squad locale, prédite, reste instantanée. 0 = comportement d'avant v38 : chaque snapshot est appliqué dès réception.
 */
export const INTERP_DELAY_MS = 100;
/** Retard de lecture en frames hôte. */
const DELAY_FRAMES = (INTERP_DELAY_MS / 1000) * TICK_RATE;
/** Écart (frames hôte) au-delà duquel l'horloge de lecture est recalée d'un coup (onglet en arrière-plan, hôte figé…). */
const RESYNC_FRAMES = 30;
/** Snapshots gardés au plus dans le tampon (les plus anciens sont appliqués d'office). */
const MAX_BUFFER = 16;

type Welcome = Extract<HostMessage, { t: 'welcome' }>;

/**
 * Le client ne simule rien : il envoie ses inputs à l'hôte et affiche l'état reçu
 * (via `Mirror`, qui remplit un `Sim` que le WorldView lit comme une partie locale).
 *
 * La squad locale est prédite (`Prediction.ts`) : elle réagit tout de suite, l'hôte la recale à chaque snapshot.
 */
export class ClientSession implements Session {
  readonly sim: Sim;
  readonly online = true;
  connection: 'connected' | 'lost' = 'connected';
  /** Temps (ms) écoulé chez ce client depuis le dernier snapshot de l'hôte. */
  private sinceSnapshot = 0;
  private readonly mirror: Mirror;
  private readonly loop = new FixedStep(TICK_RATE);
  private readonly hostId: PlayerId;
  private pending: SimEvent[] = [];
  /** Tampon d'interpolation : snapshots reçus (triés par `seq`) et événements, joués quand l'horloge de lecture atteint leur `seq`. */
  private readonly buffer: Snapshot[] = [];
  private readonly eventBuffer: { seq: number; list: SimEvent[] }[] = [];
  /** Horloge de lecture (en frames hôte, fractionnaire), dernier `seq` reçu et dernier appliqué. */
  private playSeq: number;
  private latestSeq: number;
  private appliedSeq: number;
  private mx = 0;
  private my = 0;
  private ticks = 0;

  private constructor(
    private readonly transport: Transport,
    welcome: Welcome,
    first: Snapshot,
    readonly roomCode: string,
  ) {
    this.localPlayer = welcome.you;
    this.hostId = welcome.host;
    // xp : la jauge et les choix d'upgrade s'affichent (la simulation, elle, tourne chez l'hôte)
    this.sim = new Sim({ mode: MODES[welcome.mode as keyof typeof MODES] ?? MODES.survival, seed: welcome.seed, players: [], xp: true, online: true });
    this.mirror = new Mirror(this.sim, welcome.you);
    this.playSeq = this.latestSeq = this.appliedSeq = first.seq;
    this.applySnapshot(first);

    transport.onMessage = this.onMessage;
    transport.onPeerDisconnected = (peer) => {
      if (peer === this.hostId) this.connection = 'lost';
    };
    transport.onClosed = () => (this.connection = 'lost');
  }

  readonly localPlayer: PlayerId;

  /**
   * Rejoint la salle et attend d'être accepté par l'hôte (welcome) et de recevoir
   * le premier snapshot : la session est alors prête à afficher. Rejette si refusé.
   * Les handlers sont posés AVANT `join` pour ne manquer aucune connexion.
   */
  static connect(transport: Transport, code: string): Promise<ClientSession> {
    return new Promise((resolve, reject) => {
      let welcome: Welcome | null = null;
      let done = false;
      transport.onPeerConnected = (peer) => {
        const hello: ClientMessage = { t: 'hello', v: PROTOCOL_VERSION };
        transport.send(peer, 'reliable', JSON.stringify(hello));
      };
      transport.onClosed = (reason) => reject(new Error(reason ?? 'closed'));
      transport.onMessage = (peer, data) => {
        if (typeof data === 'string') {
          const msg = parseMessage<HostMessage>(data);
          if (msg?.t === 'welcome') welcome = msg;
          else if (msg?.t === 'refused') reject(new Error(msg.reason));
          return;
        }
        if (done || !welcome || peer !== welcome.host) return;
        const snap = decodeSnapshot(data);
        if (!snap) return;
        done = true;
        resolve(new ClientSession(transport, welcome, snap, code));
      };
      transport.join(code).catch(reject);
    });
  }

  get alpha(): number {
    return this.loop.alpha;
  }

  setLocalInput(mx: number, my: number): void {
    this.mx = mx;
    this.my = my;
  }

  /** Aucun snapshot depuis `HOST_STALL_MS` alors que la connexion tient : l'hôte est probablement en arrière-plan ou gelé. */
  get hostStalled(): boolean {
    return this.connection === 'connected' && this.sinceSnapshot > HOST_STALL_MS;
  }

  advance(deltaMs: number, onEvent: (e: SimEvent) => void): void {
    this.sinceSnapshot += deltaMs;
    if (INTERP_DELAY_MS > 0) this.playback(deltaMs);
    this.loop.advance(deltaMs, (dt) => {
      this.ticks++;
      this.mirror.step(dt, { n: this.ticks, mx: this.mx, my: this.my });
      this.sendInput();
    });
    const events = this.pending;
    this.pending = [];
    for (const e of events) onEvent(e);
  }

  /** Pas de revive en ligne : l'hôte fait réapparaître la squad tout seul. */
  reviveLocal(): void {}

  chooseUpgrade(index: number): void {
    const msg: ClientMessage = { t: 'upgrade', index };
    this.transport.send(this.hostId, 'reliable', JSON.stringify(msg));
  }

  rerollUpgrade(): void {
    const msg: ClientMessage = { t: 'reroll' };
    this.transport.send(this.hostId, 'reliable', JSON.stringify(msg));
  }

  close(): void {
    this.transport.close();
  }

  // ---------- Réseau ----------

  /**
   * Un input par tick, numéroté : l'hôte renvoie le dernier numéro pris en compte, le client rejoue les suivants
   * (réconciliation). Un paquet perdu ou en retard est sans conséquence : le suivant arrive 33 ms après.
   */
  private sendInput(): void {
    const msg: ClientMessage = { t: 'input', mx: round(this.mx), my: round(this.my), n: this.ticks };
    this.transport.send(this.hostId, 'unreliable', JSON.stringify(msg));
  }

  private readonly onMessage = (peer: string, data: Payload): void => {
    if (peer !== this.hostId) return;
    if (typeof data !== 'string') {
      const snap = decodeSnapshot(data);
      if (!snap) return;
      this.sinceSnapshot = 0;
      if (INTERP_DELAY_MS <= 0) {
        this.applySnapshot(snap);
        return;
      }
      if (snap.seq <= this.appliedSeq) return; // arrivé trop tard : un plus récent est déjà à l'écran
      this.latestSeq = Math.max(this.latestSeq, snap.seq);
      let i = this.buffer.length;
      while (i > 0 && this.buffer[i - 1].seq > snap.seq) i--;
      this.buffer.splice(i, 0, snap);
      while (this.buffer.length > MAX_BUFFER) this.applySnapshot(this.buffer.shift()!);
      return;
    }
    const msg = parseMessage<HostMessage>(data);
    if (msg?.t !== 'events') return;
    if (INTERP_DELAY_MS <= 0 || msg.seq <= this.appliedSeq) this.pushEvents(msg.list);
    else this.eventBuffer.push({ seq: msg.seq, list: msg.list });
  };

  /**
   * Avance l'horloge de lecture et joue les snapshots / événements qu'elle a atteints. Elle vise `DELAY_FRAMES` derrière le dernier
   * snapshot reçu et s'y recale doucement (±20 % de vitesse) ; trop loin (onglet en arrière-plan, hôte figé), elle saute.
   */
  private playback(deltaMs: number): void {
    const target = this.latestSeq - DELAY_FRAMES;
    const drift = target - this.playSeq;
    if (Math.abs(drift) > RESYNC_FRAMES) this.playSeq = target;
    else this.playSeq += (deltaMs / 1000) * TICK_RATE * (1 + Math.max(-0.2, Math.min(0.2, drift * 0.05)));
    while (this.buffer.length > 0 && this.buffer[0].seq <= this.playSeq) this.applySnapshot(this.buffer.shift()!);
    while (this.eventBuffer.length > 0 && this.eventBuffer[0].seq <= this.playSeq) this.pushEvents(this.eventBuffer.shift()!.list);
  }

  /** Applique un snapshot au reflet et rejoue ses effets de tir (binaires depuis v38) en événements pour l'affichage. */
  private applySnapshot(snap: Snapshot): void {
    this.mirror.apply(snap);
    this.appliedSeq = snap.seq;
    const fx: SimEvent[] = [];
    for (const f of snap.shots) {
      const s = this.mirror.soldier(f.id);
      if (s) fx.push({ t: 'shot', id: f.id, cls: s.def.id, x: f.x, y: f.y, aim: s.aim });
    }
    for (const f of snap.impacts) fx.push({ t: 'impact', x: f.x, y: f.y, texture: f.texture });
    for (const id of snap.hits) fx.push({ t: 'hit', id });
    this.pushEvents(fx);
  }

  private pushEvents(list: SimEvent[]): void {
    this.pending.push(...list);
    if (this.pending.length > MAX_PENDING_EVENTS) this.pending.splice(0, this.pending.length - MAX_PENDING_EVENTS);
  }
}

/** Délai (ms) sans snapshot au-delà duquel on prévient le joueur que l'hôte ne répond plus (les snapshots arrivent à 15 Hz). */
const HOST_STALL_MS = 1500;

const round = (v: number): number => Math.round(v * 100) / 100;
