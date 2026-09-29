import { Network } from '@poki/netlib';
import type { Channel, Payload, Transport } from '../net/Transport';

/**
 * Transport basé sur Netlib (lib P2P WebRTC de Poki). C'est le SEUL fichier du jeu
 * qui connaît Netlib : pour changer de lib réseau, on écrit un autre `Transport`
 * (voir net/Transport.ts et net/LoopbackTransport.ts) et on le branche dans online.ts.
 *
 * Canaux Netlib par défaut : 'reliable' (ordonné, fiable) et 'unreliable' (UDP-like).
 */
export class NetlibTransport implements Transport {
  onPeerConnected: ((peerId: string) => void) | null = null;
  onPeerDisconnected: ((peerId: string) => void) | null = null;
  onMessage: ((peerId: string, data: Payload) => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;

  private readonly net: Network;
  private readonly ready: Promise<void>;

  constructor(gameId: string) {
    this.net = new Network(gameId);
    this.ready = new Promise((resolve) => this.net.once('ready', () => resolve()));
    this.net.on('connected', (peer) => this.onPeerConnected?.(peer.id));
    this.net.on('disconnected', (peer) => this.onPeerDisconnected?.(peer.id));
    this.net.on('message', (peer, _channel, data) => {
      if (typeof data === 'string' || data instanceof ArrayBuffer) this.onMessage?.(peer.id, data);
    });
    this.net.on('close', (reason) => this.onClosed?.(reason));
  }

  get localId(): string {
    return this.net.id;
  }

  async host(opts: { public?: boolean } = {}): Promise<string> {
    await this.ready;
    return this.net.create({ public: opts.public ?? false, maxPlayers: 4 });
  }

  async join(code: string): Promise<void> {
    await this.ready;
    const lobby = await this.net.join(code);
    if (!lobby) throw new Error('not-found');
  }

  async findRoom(): Promise<string | null> {
    await this.ready;
    const rooms = await this.net.list();
    return rooms.find((r) => r.playerCount < r.maxPlayers && !r.hasPassword)?.code ?? null;
  }

  send(peerId: string, channel: Channel, data: Payload): void {
    try {
      this.net.send(channel, peerId, data);
    } catch {
      // pair pas encore prêt ou déjà parti : le message est perdu, comme sur un canal non fiable
    }
  }

  broadcast(channel: Channel, data: Payload): void {
    try {
      this.net.broadcast(channel, data);
    } catch {
      // idem
    }
  }

  close(): void {
    this.net.close();
  }
}
