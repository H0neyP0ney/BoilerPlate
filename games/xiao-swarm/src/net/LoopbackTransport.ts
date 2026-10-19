import type { Channel, Payload, RoomInfo, Transport } from './Transport';

const MAX_ROOM_PLAYERS = 4;

/**
 * Conditions réseau simulées (tests). Tout est en « pumps » (1 pump = 1 tick de test). Par défaut : réseau parfait.
 * Perte, doublons et réordonnancement ne touchent que le canal `unreliable` ; le canal `reliable` garde l'ordre et ne perd rien
 * (il subit seulement la latence et la gigue, comme un canal ordonné fiable).
 */
export interface NetConditions {
  /** Gigue : chaque message reçoit en plus un retard entier tiré dans [0, jitter]. Sur `unreliable`, deux messages peuvent alors arriver dans le désordre. */
  jitter: number;
  /** Probabilité de perte d'un message `unreliable` (0 → 1). */
  loss: number;
  /** Probabilité qu'un message `unreliable` arrive deux fois (la copie a son propre retard). */
  duplicate: number;
  /** Rafales de perte : probabilité, à chaque pump, qu'une coupure commence, et sa durée (pumps) pendant laquelle tout l'`unreliable` est perdu. */
  burstChance: number;
  burstLength: number;
  /** Vrai : un message `unreliable` peut en doubler un plus ancien (gigue, doublon). Faux (défaut, comportement d'avant) : ordre d'envoi conservé, un message en retard retient les suivants. */
  reorder: boolean;
}

/**
 * Transport en mémoire : plusieurs participants dans le même processus, sans réseau.
 * Sert aux tests (`npm run sim:net`) et au développement d'un serveur / d'une lib
 * différente. Les messages sont livrés au prochain `pump()` (ordre conservé par défaut),
 * ce qui imite l'asynchronisme d'un vrai réseau. `conditions` ajoute perte, gigue,
 * doublons et rafales ; `latencyTo` une latence propre à un destinataire (latence asymétrique).
 */
export class LoopbackHub {
  private readonly rooms = new Map<string, LoopbackTransport[]>();
  private readonly publicCodes = new Set<string>();
  /** Messages en attente, triés par échéance (ordre d'envoi conservé à échéance égale). */
  private readonly queue: { due: number; fn: () => void }[] = [];
  private clock = 0;
  /** Latence simulée, en nombre d'appels à `pump()` (1 pump = 1 tick de test) entre l'envoi et la livraison. */
  latency = 0;
  /** Latence propre à un destinataire (id de pair) : remplace `latency` pour les messages qui lui sont envoyés (latence asymétrique hôte ↔ client). */
  readonly latencyTo = new Map<string, number>();
  readonly conditions: NetConditions = { jitter: 0, loss: 0, duplicate: 0, burstChance: 0, burstLength: 0, reorder: false };
  /** Compteurs (tests) : messages `unreliable` envoyés, perdus, dupliqués. */
  readonly stats = { sent: 0, lost: 0, duplicated: 0 };
  /** Aléatoire reproductible des conditions réseau (indépendant de la simulation). */
  private rngState = 12345;
  private burstLeft = 0;
  /** Dernière échéance par couple (envoyeur → destinataire) et canal : un canal ordonné ne double jamais un message plus ancien. */
  private readonly orderedDue = new Map<string, number>();
  private nextId = 1;
  private nextRoom = 1;

  /** Graine de l'aléatoire des conditions réseau (même graine = mêmes pertes). */
  seed(s: number): void {
    this.rngState = s >>> 0 || 1;
  }

  private rand(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  createTransport(): LoopbackTransport {
    return new LoopbackTransport(this, `peer${this.nextId++}`);
  }

  /** @internal */
  createRoom(t: LoopbackTransport, isPublic: boolean): string {
    const code = `room${this.nextRoom++}`;
    this.rooms.set(code, [t]);
    if (isPublic) this.publicCodes.add(code);
    return code;
  }

  /** @internal */
  setRoomPublic(code: string, isPublic: boolean): void {
    if (isPublic) this.publicCodes.add(code);
    else this.publicCodes.delete(code);
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
  later(fn: () => void, delay = this.latency): void {
    const due = this.clock + delay;
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].due > due) i--; // tri par échéance, stable
    this.queue.splice(i, 0, { due, fn });
  }

  /** @internal Envoi d'un message de `from` à `to` sous les conditions réseau simulées. */
  deliver(from: string, to: string, channel: Channel, fn: () => void): void {
    const c = this.conditions;
    const base = this.latencyTo.get(to) ?? this.latency;
    const delay = (): number => base + (c.jitter > 0 ? Math.floor(this.rand() * (c.jitter + 1)) : 0);
    /** Échéance ordonnée : jamais avant le message précédent du même couple et du même canal (canal fiable, ou non fiable sans `reorder`). */
    const ordered = (d: number): number => {
      const key = `${from}>${to}:${channel}`;
      const due = Math.max(this.clock + d, this.orderedDue.get(key) ?? 0);
      this.orderedDue.set(key, due);
      return due - this.clock;
    };
    if (channel === 'reliable') {
      this.later(fn, ordered(delay()));
      return;
    }
    this.stats.sent++;
    if (this.burstLeft > 0 || (c.loss > 0 && this.rand() < c.loss)) {
      this.stats.lost++;
      return;
    }
    this.later(fn, c.reorder ? delay() : ordered(delay()));
    if (c.duplicate > 0 && this.rand() < c.duplicate) {
      this.stats.duplicated++;
      this.later(fn, c.reorder ? delay() : ordered(delay()));
    }
  }

  /** Salles publiques (hors salles privées), avec leur effectif. */
  publicRooms(): RoomInfo[] {
    const out: RoomInfo[] = [];
    for (const [code, room] of this.rooms) {
      if (this.publicCodes.has(code) && room.length < MAX_ROOM_PLAYERS) out.push({ code, playerCount: room.length, maxPlayers: MAX_ROOM_PLAYERS });
    }
    return out;
  }

  publicRoom(): string | null {
    return this.publicRooms()[0]?.code ?? null;
  }

  /** Livre les messages arrivés à échéance (y compris ceux produits pendant la livraison, si la latence est nulle). */
  pump(): void {
    this.clock++;
    if (this.burstLeft > 0) this.burstLeft--;
    else if (this.conditions.burstChance > 0 && this.rand() < this.conditions.burstChance) this.burstLeft = this.conditions.burstLength;
    while (this.queue.length > 0 && this.queue[0].due <= this.clock) this.queue.shift()!.fn();
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

  async host(opts: { public?: boolean } = {}): Promise<string> {
    this.code = this.hub.createRoom(this, opts.public ?? false);
    return this.code;
  }

  private code: string | null = null;

  async setPublic(isPublic: boolean): Promise<void> {
    if (this.code) this.hub.setRoomPublic(this.code, isPublic);
  }

  async listRooms(): Promise<RoomInfo[]> {
    return this.hub.publicRooms();
  }

  async join(code: string): Promise<void> {
    this.hub.joinRoom(code, this);
  }

  async findRoom(): Promise<string | null> {
    return this.hub.publicRoom();
  }

  send(peerId: string, channel: Channel, data: Payload): void {
    const target = this.hub.peersOf(this).find((p) => p.localId === peerId);
    if (target) this.hub.deliver(this.localId, peerId, channel, () => target.onMessage?.(this.localId, data));
  }

  broadcast(channel: Channel, data: Payload): void {
    for (const p of this.hub.peersOf(this)) this.send(p.localId, channel, data);
  }

  close(): void {
    this.hub.leave(this);
  }
}
