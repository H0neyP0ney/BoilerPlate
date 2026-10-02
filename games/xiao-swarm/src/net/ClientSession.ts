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
    this.sim = new Sim({ mode: MODES[welcome.mode as keyof typeof MODES], seed: welcome.seed, players: [], xp: true });
    this.mirror = new Mirror(this.sim, welcome.you);
    this.mirror.apply(first);

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
      if (snap) {
        this.mirror.apply(snap);
        this.sinceSnapshot = 0;
      }
      return;
    }
    const msg = parseMessage<HostMessage>(data);
    if (msg?.t !== 'events') return;
    this.pending.push(...msg.list);
    if (this.pending.length > MAX_PENDING_EVENTS) this.pending.splice(0, this.pending.length - MAX_PENDING_EVENTS);
  };
}

/** Délai (ms) sans snapshot au-delà duquel on prévient le joueur que l'hôte ne répond plus (les snapshots arrivent à 15 Hz). */
const HOST_STALL_MS = 1500;

const round = (v: number): number => Math.round(v * 100) / 100;
