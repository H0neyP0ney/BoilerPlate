import type { Channel, Payload, Transport } from './Transport';

/**
 * Transport en mémoire : plusieurs participants dans le même processus, sans réseau.
 * Sert aux tests (`npm run sim:net`) et au développement d'un serveur / d'une lib
 * différente. Les messages sont livrés au prochain `pump()` (ordre conservé),
 * ce qui imite l'asynchronisme d'un vrai réseau.
 */
export class LoopbackHub {
  private readonly rooms = new Map<string, LoopbackTransport[]>();
  private readonly queue: (() => void)[] = [];
  private nextId = 1;
  private nextRoom = 1;

  createTransport(): LoopbackTransport {
    return new LoopbackTransport(this, `peer${this.nextId++}`);
  }

  /** @internal */
  createRoom(t: LoopbackTransport): string {
    const code = `room${this.nextRoom++}`;
    this.rooms.set(code, [t]);
    return code;
  }

  /** @internal */
  joinRoom(code: string, t: LoopbackTransport): LoopbackTransport[] {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`room not found: ${code}`);
    const others = [...room];
    room.push(t);
    for (const o of others) {
      this.later(() => o.onPeerConnected?.(t.localId));
      this.later(() => t.onPeerConnected?.(o.localId));
    }
    return others;
  }

  /** @internal */
  leave(t: LoopbackTransport): void {
    for (const room of this.rooms.values()) {
      const i = room.indexOf(t);
      if (i === -1) continue;
      room.splice(i, 1);
      for (const o of room) this.later(() => o.onPeerDisconnected?.(t.localId));
    }
  }

  /** @internal */
  peersOf(t: LoopbackTransport): LoopbackTransport[] {
    for (const room of this.rooms.values()) if (room.includes(t)) return room.filter((o) => o !== t);
    return [];
  }

  /** @internal */
  later(fn: () => void): void {
    this.queue.push(fn);
  }

  publicRoom(): string | null {
    return this.rooms.keys().next().value ?? null;
  }

  /** Livre tous les messages en attente (y compris ceux produits pendant la livraison). */
  pump(): void {
    while (this.queue.length > 0) this.queue.shift()!();
  }
}

export class LoopbackTransport implements Transport {
  onPeerConnected: ((peerId: string) => void) | null = null;
  onPeerDisconnected: ((peerId: string) => void) | null = null;
  onMessage: ((peerId: string, data: Payload) => void) | null = null;
  onClosed: ((reason?: string) => void) | null = null;

  constructor(
    private readonly hub: LoopbackHub,
    readonly localId: string,
  ) {}

  async host(): Promise<string> {
    return this.hub.createRoom(this);
  }

  async join(code: string): Promise<void> {
    this.hub.joinRoom(code, this);
  }

  async findRoom(): Promise<string | null> {
    return this.hub.publicRoom();
  }

  send(peerId: string, _channel: Channel, data: Payload): void {
    const target = this.hub.peersOf(this).find((p) => p.localId === peerId);
    if (target) this.hub.later(() => target.onMessage?.(this.localId, data));
  }

  broadcast(channel: Channel, data: Payload): void {
    for (const p of this.hub.peersOf(this)) this.send(p.localId, channel, data);
  }

  close(): void {
    this.hub.leave(this);
  }
}
