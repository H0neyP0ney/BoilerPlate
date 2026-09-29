/**
 * File d'événements émis par la simulation (tir, mort, explosion…), consommés
 * par l'affichage (effets, sons) et, en réseau, sérialisés vers les clients.
 * La simulation ne connaît jamais l'affichage : elle ne fait que `push`.
 */
export class EventQueue<E> {
  private items: E[] = [];

  push(event: E): void {
    this.items.push(event);
  }

  /** Vide la file en appelant `fn` sur chaque événement, dans l'ordre. */
  drain(fn: (event: E) => void): void {
    const items = this.items;
    this.items = [];
    for (const e of items) fn(e);
  }

  get size(): number {
    return this.items.length;
  }
}

/** Générateur d'identifiants d'entités stables (référence réseau / snapshots). */
export class IdGen {
  private next = 1;

  get(): number {
    return this.next++;
  }
}
