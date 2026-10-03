import { clamp, Rng, type Point } from '@xiao/engine/sim';
import { RECRUIT } from '../config';
import { ACTIVE_CLASSES, TARGET_MIX, type SoldierClassId } from '../data/classes';
import type { AlienState, RecruitState, SoldierState } from './entities';
import { findAttractor, inPickRange, pullToward } from './Pickup';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Soin d'une recrue en trop (escouade pleine) : rayon (px, ~2-3 soldats de large) et part des PV max rendue aux soldats autour. */
const HEAL_AREA = { radius: 75, otherPct: 0.5 };
/** Mesure : rayon (px) autour d'une recrue expirée dans lequel on compte les aliens pour dire qu'elle était « noyée ». */
const SWAMP_RADIUS = 120;

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
    // petite squad = beaucoup d'aide ; grosse squad = recrutement ralenti
    const sizeFactor = clamp(1.8 - (size - 4) * 0.12, 0.25, 1.8);
    if (!this.sim.rng.chance(a.def.recruitChance * sizeFactor * squad.stats.get('recruit'))) return;
    this.drop(this.chooseClass(squad), a.x, a.y, squad.center);
  }

  /** `toward` : la recrue saute en cloche dans sa direction (avec un peu de hasard) pour être plus facile à attraper. */
  drop(cls: SoldierClassId, x: number, y: number, toward?: Point, forced = false): RecruitState {
    const r: RecruitState = { id: this.sim.ids.get(), cls, x, y, px: x, py: y, life: forced ? 1e6 : RECRUIT.life };
    if (forced) r.forced = true; // tutoriel : ne disparaît pas
    if (toward) {
      const d = Math.hypot(toward.x - x, toward.y - y);
      if (d > 40) {
        const rng = new Rng((r.id * 2654435761) >>> 0); // propre à la recrue : ne décale pas la séquence aléatoire de la simulation
        const ang = Math.atan2(toward.y - y, toward.x - x) + rng.range(-RECRUIT.hopSpread, RECRUIT.hopSpread);
        const dist = Math.min(rng.range(RECRUIT.hopDist[0], RECRUIT.hopDist[1]), d); // jamais au-delà de la squad
        r.hop = { vx: (Math.cos(ang) * dist) / RECRUIT.hopTime, vy: (Math.sin(ang) * dist) / RECRUIT.hopTime, t: RECRUIT.hopTime };
      }
    }
    this.items.push(r);
    this.sim.metrics.recDropped++;
    return r;
  }

  /** Mesure (RunRecorder) : une recrue expire sans avoir été ramassée ; « noyée » si au moins 5 aliens sont autour d'elle. */
  private noteExpired(r: RecruitState): void {
    const m = this.sim.metrics;
    m.recExpired++;
    let near = 0;
    for (const a of this.sim.aliens) if (a.alive && (a.x - r.x) ** 2 + (a.y - r.y) ** 2 < SWAMP_RADIUS ** 2 && ++near >= 5) break;
    if (near >= 5) m.recSwamped++;
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i];
      r.px = r.x;
      r.py = r.y;
      r.life -= dt;
      if (r.life <= 0) {
        this.noteExpired(r);
        this.items.splice(i, 1);
        continue;
      }
      // saut en cloche à l'apparition : en l'air, ni aimant ni ramassage
      if (r.hop) {
        const { minX, maxX, minY, maxY } = this.sim.arena.bounds;
        r.x = clamp(r.x + r.hop.vx * dt, minX, maxX);
        r.y = clamp(r.y + r.hop.vy * dt, minY, maxY);
        r.hop.t -= dt;
        if (r.hop.t <= 0) r.hop = undefined;
        continue;
      }
      // aimant vers le soldat le plus proche (toutes squads confondues) qui peut en profiter : place libre, ou blessé (escouade pleine)
      // rayon d'attraction, de ramassage et vitesse max : stat `magnet` de la squad (upgrade)
      const a = findAttractor(this.sim, r.x, r.y, (o, sq) => sq.size < sq.maxSize || o.hp < o.maxHp);
      if (!a) continue;
      const s = a.soldier;
      if (inPickRange(a)) {
        const squad = a.squad;
        if (squad.size < squad.maxSize) {
          const recruit = squad.recruit(r.cls, { x: r.x, y: r.y });
          recruit.invulnerable = 1;
          this.sim.metrics.recPicked++;
          this.sim.events.push({ t: 'recruited', owner: squad.owner, cls: r.cls, x: r.x, y: r.y });
        } else {
          // escouade pleine : la recrue en trop soigne en zone (le soldat qui l'a ramassée à fond, ses voisins à moitié)
          this.healArea(s, squad);
        }
        this.items.splice(i, 1);
        continue;
      }
      pullToward(r, a, dt); // comme les globes d'XP : plus elle est proche, plus elle accélère vers le soldat
    }
  }

  /** Soin en zone centré sur `main` : 100 % des PV max pour lui, `HEAL_AREA.otherPct` pour les soldats de sa squad à portée. L'affichage détecte la hausse de PV. */
  private healArea(main: SoldierState, squad: Squad): void {
    main.hp = main.maxHp;
    for (const o of squad.soldiers) {
      if (o === main || !o.alive || o.hp >= o.maxHp) continue;
      if ((o.x - main.x) ** 2 + (o.y - main.y) ** 2 > HEAL_AREA.radius ** 2) continue;
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * HEAL_AREA.otherPct);
    }
  }

  /** Classe qui comble le mieux l'écart à TARGET_MIX (avec un peu d'aléatoire). */
  private chooseClass(squad: Squad): SoldierClassId {
    const n = Math.max(1, squad.size);
    const ids = ACTIVE_CLASSES;
    return this.sim.rng.weighted(ids, (id) => Math.max(0, TARGET_MIX[id] - squad.countOf(id) / n) + 0.04) ?? 'trooper';
  }

  clear(): void {
    this.items.length = 0;
  }
}
