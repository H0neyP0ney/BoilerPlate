import { splitXp } from '../data/progression';
import type { AlienState, XpOrb } from './entities';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

const PICK_RADIUS = 26;
/** Rayon d'attraction de base (px), multiplié par la stat `magnet` de la squad. */
const MAGNET_RADIUS = 110;
/** Power-up aimant (coup unique) : rayon (px) dans lequel tout l'XP est aspiré à son ramassage, et vitesse d'aspiration. */
const MAGNET_BUFF_RADIUS = 1000;
const MAGNET_BUFF_PULL = 2.5;
const LIFETIME = 45;
/** Au-delà, les plus vieux globes disparaissent (garde l'affichage et la simulation légers). */
const MAX_ORBS = 350;

/**
 * Globes d'XP : les aliens en laissent en mourant (valeur `def.xp` découpée en globes de 3 tailles). Le soldat le plus
 * proche les attire puis les absorbe ; l'XP va à sa squad (en battle royale, on peut voler celle des autres).
 * Actif seulement si `Sim.xpEnabled` (solo / bots : en ligne, pas de pause possible pour choisir une upgrade).
 */
export class Xp {
  readonly orbs: XpOrb[] = [];

  constructor(private readonly sim: Sim) {}

  drop(a: AlienState): void {
    if (a.def.xp <= 0) return;
    const { rng } = this.sim;
    for (const value of splitXp(a.def.xp)) {
      const ang = rng.range(0, Math.PI * 2);
      const r = a.radius * rng.range(0.2, 1.1);
      const x = a.x + Math.cos(ang) * r;
      const y = a.y + Math.sin(ang) * r * 0.6;
      this.orbs.push({ id: this.sim.ids.get(), x, y, px: x, py: y, value, life: LIFETIME });
    }
    if (this.orbs.length > MAX_ORBS) this.orbs.splice(0, this.orbs.length - MAX_ORBS);
  }

  update(dt: number): void {
    const { soldierHash } = this.sim;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.px = o.x;
      o.py = o.y;
      o.life -= dt;
      if (o.life <= 0) {
        this.orbs.splice(i, 1);
        continue;
      }
      // soldat le plus proche dans le rayon d'attraction (celui de sa squad : stat `magnet`)
      let best: { x: number; y: number; owner: string } | undefined;
      let bestD = Infinity;
      let bestMag = MAGNET_RADIUS;
      for (const s of soldierHash.query(o.x, o.y, MAGNET_RADIUS * 2.6, this.sim.scratchSoldiers)) {
        if (!s.alive) continue;
        const sq = this.sim.squadOf(s.owner);
        if (!sq) continue;
        const mag = MAGNET_RADIUS * sq.stats.get('magnet');
        const d = Math.hypot(s.x - o.x, s.y - o.y);
        if (d > mag || d >= bestD) continue;
        best = s;
        bestD = d;
        bestMag = mag;
      }
      // Globe aspiré par le power-up aimant (coup unique) : il vole vers le soldat le plus proche de sa squad jusqu'à être ramassé
      if (o.pulled) {
        const sq = this.sim.squadOf(o.pulled);
        let near: (typeof best) | undefined;
        let nearD = Infinity;
        for (const s of sq?.soldiers ?? []) {
          const d = Math.hypot(s.x - o.x, s.y - o.y);
          if (s.alive && d < nearD) {
            near = s;
            nearD = d;
          }
        }
        if (near) {
          best = near;
          bestD = nearD;
          bestMag = MAGNET_BUFF_RADIUS;
        } else o.pulled = undefined; // squad anéantie : le globe redevient un globe normal
      }
      if (!best) continue;
      if (bestD < PICK_RADIUS) {
        this.sim.squadOf(best.owner)!.gainXp(o.value);
        this.orbs.splice(i, 1);
        continue;
      }
      // plus il est proche, plus il accélère vers le soldat
      const k = Math.min(1, dt * (bestMag >= MAGNET_BUFF_RADIUS ? MAGNET_BUFF_PULL + (1 - bestD / bestMag) * 3.5 : 5 + (1 - bestD / bestMag) * 10));
      o.x += (best.x - o.x) * k;
      o.y += (best.y - o.y) * k;
    }
  }

  /** Aimant (power-up, coup unique) : tout globe à moins de `radius` px du centre de la squad est aspiré vers elle, jusqu'à être ramassé. */
  magnetize(squad: Squad, radius: number): void {
    for (const o of this.orbs) {
      if (Math.hypot(squad.center.x - o.x, squad.center.y - o.y) > radius) continue;
      o.pulled = squad.owner;
      o.life = Math.max(o.life, 10); // il ne disparaît pas en route
    }
  }

  clear(): void {
    this.orbs.length = 0;
  }
}
