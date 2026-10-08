/**
 * Statistiques modifiables (upgrades, buffs) : valeur = (base + flat) × (1 + Σ%).
 *
 *   const stats = new Stats({ damage: 1, fireRate: 1, maxSquad: 12 });
 *   stats.add('damage', { pct: 0.1 });        // Damage +10 %
 *   stats.add('maxSquad', { flat: 3 });       // Max Squad +3
 *   stats.get('damage');                      // 1.1
 */
export interface Modifier {
  flat?: number;
  pct?: number;
}

export class Stats<K extends string> {
  private readonly base: Record<K, number>;
  private readonly flat = {} as Record<K, number>;
  private readonly pct = {} as Record<K, number>;

  constructor(base: Record<K, number>) {
    this.base = { ...base };
    this.reset();
  }

  get(key: K): number {
    return (this.base[key] + this.flat[key]) * (1 + this.pct[key]);
  }

  /** Change la valeur de base d'une stat (réglage en direct) ; les modificateurs déjà ajoutés restent. */
  setBase(key: K, value: number): void {
    this.base[key] = value;
  }

  add(key: K, mod: Modifier): void {
    this.flat[key] += mod.flat ?? 0;
    this.pct[key] += mod.pct ?? 0;
  }

  reset(): void {
    for (const k of Object.keys(this.base) as K[]) {
      this.flat[k] = 0;
      this.pct[k] = 0;
    }
  }
}
