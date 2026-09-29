/**
 * Pool d'objets réutilisables (projectiles, effets, pickups…) pour éviter
 * les allocations / destructions de GameObjects à chaque frame.
 */
export class Pool<T> {
  private readonly free: T[] = [];
  readonly active: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly onAcquire: (item: T) => void = () => {},
    private readonly onRelease: (item: T) => void = () => {},
  ) {}

  acquire(): T {
    const item = this.free.pop() ?? this.create();
    this.active.push(item);
    this.onAcquire(item);
    return item;
  }

  release(item: T): void {
    const i = this.active.indexOf(item);
    if (i === -1) return;
    // swap-remove : O(1), l'ordre de `active` n'est pas garanti
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    this.onRelease(item);
    this.free.push(item);
  }

  /** Libère les éléments pour lesquels `predicate` renvoie true (itération sûre). */
  releaseWhere(predicate: (item: T) => boolean): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      if (!predicate(item)) continue;
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
      this.onRelease(item);
      this.free.push(item);
    }
  }

  releaseAll(): void {
    this.releaseWhere(() => true);
  }
}
