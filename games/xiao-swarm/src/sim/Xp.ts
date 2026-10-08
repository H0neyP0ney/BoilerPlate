import { PICKUP, XP_ORB_LIFE } from '../config';
import { splitXp } from '../data/progression';
import type { AlienState, XpOrb } from './entities';
import { catchItem, chase } from './Pickup';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Rayons d'attraction et de ramassage : ceux de `PICKUP` (config.ts), communs aux globes d'XP, recrues et power-ups, multipliés par la stat `magnet` de la squad. */
const MAGNET_RADIUS = PICKUP.magnetRadius;
const LIFETIME = XP_ORB_LIFE;
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

  /**
   * `xp` : XP lâchée si elle diffère de celle de l'espèce (tutoriel). `squad` : celle qui a tué l'alien ; sa stat `xpGain` (upgrade « XP »)
   * multiplie l'XP du butin, donc le nombre et la taille des globes (1, 3 ou 8 XP) : chaque globe vaut toujours la même chose au ramassage.
   * La part décimale est tirée au sort (2 XP × 1,25 = 2,5 : 2 ou 3), pour que le bonus compte aussi sur les petits aliens.
   */
  drop(a: AlienState, xp = a.def.xp, squad?: Squad): void {
    if (xp <= 0) return;
    const { rng } = this.sim;
    if (squad) {
      const scaled = xp * squad.stats.get('xpGain');
      xp = Math.floor(scaled) + (rng.chance(scaled - Math.floor(scaled)) ? 1 : 0);
    }
    for (const value of splitXp(xp, a.def.boss ? Infinity : undefined)) { // un boss laisse toute son XP, en autant de globes qu'il faut
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
      if (!o.caught) o.life -= dt; // attrapé : il ne disparaît plus
      if (o.life <= 0) {
        this.orbs.splice(i, 1);
        continue;
      }
      // soldat le plus proche dans le rayon d'attraction (celui de sa squad : stat `magnet`)
      let best: { x: number; y: number; owner: string } | undefined;
      let bestD = Infinity;
      let bestStat = 1; // stat `magnet` de la squad qui attire : accélère aussi le globe
      for (const s of soldierHash.query(o.x, o.y, MAGNET_RADIUS * 2.6, this.sim.scratchSoldiers)) {
        if (!s.alive) continue;
        const sq = this.sim.squadOf(s.owner);
        if (!sq) continue;
        const mag = MAGNET_RADIUS * sq.stats.get('magnet');
        const d = Math.hypot(s.x - o.x, s.y - o.y);
        if (d > mag || d >= bestD) continue;
        best = s;
        bestD = d;
        bestStat = sq.stats.get('magnet');
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
          bestStat = sq?.stats.get('magnet') ?? 1;
        } else o.pulled = undefined; // squad anéantie : le globe redevient un globe normal
      }
      if (!best) continue;
      catchItem(o, best.owner); // attiré : il ne disparaît plus ni ne clignote, et suit cette squad
      if (bestD < PICKUP.pickRadius * bestStat) {
        this.sim.squadOf(best.owner)!.gainXp(o.value);
        this.orbs.splice(i, 1);
        continue;
      }
      chase(o, best.x, best.y, bestD, bestStat, dt); // accélère jusqu'à une vitesse max très rapide : impossible à distancer
    }
  }

  /** Aimant (power-up, coup unique) : tout globe à moins de `radius` px du centre de la squad est aspiré vers elle, jusqu'à être ramassé. */
  magnetize(squad: Squad, radius: number): void {
    for (const o of this.orbs) {
      if (Math.hypot(squad.center.x - o.x, squad.center.y - o.y) > radius) continue;
      o.pulled = squad.owner;
      catchItem(o); // il ne disparaît pas en route
    }
  }

  clear(): void {
    this.orbs.length = 0;
  }
}
