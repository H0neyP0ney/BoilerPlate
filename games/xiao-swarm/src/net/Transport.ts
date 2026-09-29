/**
 * Couche transport : la seule chose que le jeu sait du réseau. Une implémentation
 * (Netlib de Poki, WebSocket vers un serveur Node, boucle mémoire pour les tests…)
 * fournit des salles et un envoi de messages ; HostSession / ClientSession ne
 * dépendent que de cette interface, donc changer de lib = écrire un Transport.
 *
 * Pur : aucune dépendance au DOM (les types RTC/WebSocket vivent dans les implémentations).
 */
export type Channel = 'reliable' | 'unreliable';

/** Texte = messages de contrôle (JSON) ; ArrayBuffer = snapshots binaires. */
export type Payload = string | ArrayBuffer;

export interface Transport {
  /** Identifiant de ce participant dans la salle (valide après `host()` / `join()`). */
  readonly localId: string;

  onPeerConnected: ((peerId: string) => void) | null;
  onPeerDisconnected: ((peerId: string) => void) | null;
  onMessage: ((peerId: string, data: Payload) => void) | null;
  /** La connexion à la salle est perdue pour de bon. */
  onClosed: ((reason?: string) => void) | null;

  /** Crée une salle et renvoie son code. `public` la rend trouvable par `findRoom`. */
  host(opts?: { public?: boolean }): Promise<string>;
  /** Rejoint une salle existante. */
  join(code: string): Promise<void>;
  /** Cherche une salle publique à rejoindre (null si aucune). */
  findRoom(): Promise<string | null>;

  send(peerId: string, channel: Channel, data: Payload): void;
  broadcast(channel: Channel, data: Payload): void;
  close(): void;
}
