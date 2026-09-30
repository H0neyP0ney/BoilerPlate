import { clamp } from '@xiao/engine/sim';
import { ACTIVE_CLASSES, TARGET_MIX, type SoldierClassId } from '../data/classes';
import type { AlienState, RecruitState } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

const PICK_RADIUS = 34;
const MAGNET_RADIUS = 120;
const LIFETIME = 18;

/**
 * Recrutement sur le terrain (GDD §13-14) :
 *  - taux de drop inversement lié à la taille de la squad du tueur ;
 *  - type de recrue choisi pour combler l'écart avec la composition cible ;
 *  - ramassée par n'importe quelle squad (en battle royale, on peut voler une recrue !).
 */
export class Recruits {
  readonly items: RecruitState[] = [];

  constructor(private readonly sim: Sim) {}

  maybeDrop(a: AlienState, killer: Squad | undefined): void {
    const squad = killer ?? this.sim.nearestSquad(a.x, a.y);
    if (!squad) return;
    const size = squad.size;
    if (size >= squad.maxSize) return;
    // petite squad = beaucoup d'aide ; grosse squad = recrutement ralenti
    const sizeFactor = clamp(1.8 - (size - 4) * 0.12, 0.25, 1.8);
    if (!this.sim.rng.chance(a.def.recruitChance * sizeFactor * squad.stats.get('recruit'))) return;
    this.drop(this.chooseClass(squad), a.x, a.y);
  }

  drop(cls: SoldierClassId, x: number, y: number): void {
    this.items.push({ id: this.sim.ids.get(), cls, x, y, px: x, py: y, life: LIFETIME });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i];
      r.px = r.x;
      r.py = r.y;
      r.life -= dt;
      if (r.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      // aimant vers le soldat le plus proche (toutes squads confondues, si pas pleine)
      const s = this.sim.soldierHash.nearest(r.x, r.y, MAGNET_RADIUS, (o) => {
        const sq = this.sim.squadOf(o.owner);
        return o.alive && !!sq && sq.size < sq.maxSize;
      });
      if (!s) continue;
      const d = Math.hypot(s.x - r.x, s.y - r.y);
      if (d < PICK_RADIUS) {
        const squad = this.sim.squadOf(s.owner)!;
        const recruit = squad.recruit(r.cls, { x: r.x, y: r.y });
        recruit.invulnerable = 1;
        this.sim.events.push({ t: 'recruited', owner: squad.owner, cls: r.cls, x: r.x, y: r.y });
        this.items.splice(i, 1);
        continue;
      }
      const k = Math.min(1, dt * 6);
      r.x += (s.x - r.x) * k;
      r.y += (s.y - r.y) * k;
    }
  }

  /** Classe qui comble le mieux l'écart à TARGET_MIX (avec un peu d'aléatoire). */
  private chooseClass(squad: Squad): SoldierClassId {
    const n = Math.max(1, squad.size);
    const ids = ACTIVE_CLASSES;
    return this.sim.rng.weighted(ids, (id) => Math.max(0, TARGET_MIX[id] - squad.countOf(id) / n) + 0.04) ?? 'gunner';
  }

  clear(): void {
    this.items.length = 0;
  }
}
