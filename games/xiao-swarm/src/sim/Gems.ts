import { clamp } from '@xiao/engine/sim';
import { COINS, GEM_CHEST, RECRUIT } from '../config';
import type { AlienState, GemChestState, GemState } from './entities';
import { catchItem, chase, findAttractor, inPickRange, pulledAttractor } from './Pickup';
import type { Sim } from './Sim';
import type { Squad } from './Squad';

/** Durée (s) de la chute d'un diamant qui sort du coffre (saut en cloche, comme les globes d'upgrade). */
export const GEM_FALL_TIME = RECRUIT.hopTime;

/**
 * Diamants verts (ressource des skins) et coffre à diamants laissé par chaque boss tué. SOLO SEULEMENT (rien en ligne : la vidéo récompensée est un choix
 * du joueur et le porte-monnaie est local) ; rien dans le snapshot. Cycle : le boss tombe → le coffre apparaît au-dessus de l'œuf avec quelques diamants
 * (`GEM_CHEST.free`) → la squad reste autour `chargeTime` s → événement `gemChestReady` → la vue lance la vidéo et répond par `adResult` → explosion
 * de `GEM_CHEST.burst` diamants. Un diamant ramassé émet `gemPicked` (la vue crédite `settings.gems`).
 */
export class Gems {
  readonly chests: GemChestState[] = [];
  readonly items: GemState[] = [];
  /** Pièces d'or au sol (lâchées par les aliens tués). */
  readonly coins: GemState[] = [];
  /**
   * Boss final tombé (solo) : ses diamants sont au sol et la séquence de fin attend qu'ils soient ramassés ou disparus (10 s) ; les vagues sont suspendues
   * pendant ce temps (`Sim.update`).
   */
  finalPending = false;

  constructor(private readonly sim: Sim) {}

  private get enabled(): boolean {
    return !this.sim.config.online && !this.sim.ending;
  }

  /** Un boss (ni final ni premier jumeau) vient de tomber en (x, y) : son coffre apparaît au-dessus de l'œuf, avec quelques diamants déjà sortis. */
  spawnChest(x: number, y: number): void {
    if (!this.enabled || this.sim.tutorial?.active) return;
    const { minX, maxX, minY, maxY } = this.sim.arena.bounds;
    const cx = clamp(x, minX + 60, maxX - 60);
    const cy = clamp(y - GEM_CHEST.offsetY, minY + 60, maxY - 60);
    this.chests.push({ id: this.sim.ids.get(), x: cx, y: cy, charge: 0, state: 'idle', cool: 0, age: 0 });
    const rng = this.sim.rng;
    const n = Math.floor(rng.range(GEM_CHEST.free[0], GEM_CHEST.free[1] + 1));
    for (let i = 0; i < n; i++) this.drop(cx, cy, rng.range(0, Math.PI * 2), rng.range(60, 130));
  }

  /** Le boss final tombe en (x, y) : l'équivalent d'un coffre qui explose, tout de suite, sans vidéo (`GEM_CHEST.burst` diamants, 10 s pour les ramasser). */
  spawnFinalBurst(x: number, y: number): void {
    if (!this.enabled) return;
    const rng = this.sim.rng;
    const n = Math.floor(rng.range(GEM_CHEST.burst[0], GEM_CHEST.burst[1] + 1));
    const turn = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) this.drop(x, y, turn + (k / n) * Math.PI * 2 + rng.range(-0.25, 0.25), rng.range(70, 200));
    this.finalPending = true;
    this.sim.events.push({ t: 'gemChestOpen', x, y });
  }

  /** La séquence de fin peut démarrer : pas de burst du boss final en attente, ou tous ses diamants sont ramassés / disparus. */
  get endingReady(): boolean {
    return !this.finalPending || this.items.length === 0;
  }

  /** Un alien vient de mourir : il peut lâcher une pièce d'or (plus souvent s'il est costaud), un boss en lâche une poignée. Solo seulement. */
  dropCoins(a: AlienState): void {
    if (this.sim.ending) return; // les pièces tombent aussi en multi (contrairement aux diamants)
    const rng = this.sim.rng;
    const n = a.def.boss ? COINS.bossCoins : rng.chance(a.maxHp >= COINS.strongHp ? COINS.strongChance : COINS.chance) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const hop = n > 1 ? rng.range(50, 150) : rng.range(15, 45);
      const ang = rng.range(0, Math.PI * 2);
      this.coins.push({ id: this.sim.ids.get(), x: a.x, y: a.y, px: a.x, py: a.y, life: COINS.life, age: 0, hop: { vx: (Math.cos(ang) * hop) / GEM_FALL_TIME, vy: (Math.sin(ang) * hop) / GEM_FALL_TIME, t: GEM_FALL_TIME } });
    }
  }

  /** Un diamant qui retombe en cloche autour de (x, y), à `dist` px dans la direction `angle`. */
  private drop(x: number, y: number, angle: number, dist: number): void {
    this.items.push({
      id: this.sim.ids.get(),
      x,
      y,
      px: x,
      py: y,
      life: GEM_CHEST.life,
      age: 0,
      hop: { vx: (Math.cos(angle) * dist) / GEM_FALL_TIME, vy: (Math.sin(angle) * dist) / GEM_FALL_TIME, t: GEM_FALL_TIME },
    });
  }

  /** Réponse de la vue à `gemChestReady` : vidéo regardée (`ok`) → le coffre explose en diamants ; sinon il repasse en pause avant de pouvoir se recharger. */
  adResult(id: number, ok: boolean): void {
    const i = this.chests.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = this.chests[i];
    if (!ok) {
      c.state = 'cooldown';
      c.cool = GEM_CHEST.cooldown;
      c.charge = 0;
      return;
    }
    this.chests.splice(i, 1);
    const rng = this.sim.rng;
    const n = Math.floor(rng.range(GEM_CHEST.burst[0], GEM_CHEST.burst[1] + 1));
    const turn = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) this.drop(c.x, c.y, turn + (k / n) * Math.PI * 2 + rng.range(-0.25, 0.25), rng.range(70, 230)); // explosion : en couronne, plus loin que les diamants du début
    this.sim.events.push({ t: 'gemChestOpen', x: c.x, y: c.y });
  }

  update(dt: number): void {
    for (const c of this.chests) {
      c.age += dt;
      if (c.state === 'ad') continue; // la vidéo tourne : le monde est de toute façon figé
      if (c.state === 'cooldown') {
        c.cool -= dt;
        if (c.cool <= 0) c.state = 'idle';
        continue;
      }
      const near = this.sim.aliveSquads.some((sq) => sq.soldiers.some((s) => s.alive && Math.hypot(s.x - c.x, s.y - c.y) < GEM_CHEST.radius));
      c.charge = clamp(c.charge + (near ? dt / GEM_CHEST.chargeTime : (-dt * GEM_CHEST.decay) / GEM_CHEST.chargeTime), 0, 1);
      if (c.charge >= 1) {
        c.state = 'ad';
        this.sim.events.push({ t: 'gemChestReady', id: c.id, x: c.x, y: c.y });
      }
    }
    this.updateList(this.items, dt, 'gem');
    this.updateList(this.coins, dt, 'coin');
  }

  /** Fait vivre une liste d'objets au sol (diamants ou pièces) : chute, durée de vie, aimant, ramassage. */
  private updateList(list: GemState[], dt: number, kind: 'gem' | 'coin'): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      g.px = g.x;
      g.py = g.y;
      g.age += dt;
      if (!g.caught) g.life -= dt; // attrapé : il ne disparaît plus
      if (g.life <= 0) {
        list.splice(i, 1); // disparu au bout de `life` s
        continue;
      }
      if (g.hop) {
        const { minX, maxX, minY, maxY } = this.sim.arena.bounds;
        g.x = clamp(g.x + g.hop.vx * dt, minX, maxX);
        g.y = clamp(g.y + g.hop.vy * dt, minY, maxY);
        g.hop.t -= dt;
        if (g.hop.t <= 0) g.hop = undefined;
        continue;
      }
      if (g.age < GEM_CHEST.grace) continue; // on le voit d'abord retomber
      const a = (g.pulled ? pulledAttractor(this.sim, g.x, g.y, g.pulled) : undefined) ?? findAttractor(this.sim, g.x, g.y);
      if (!a) continue;
      catchItem(g, a.squad.owner);
      if (inPickRange(a)) {
        list.splice(i, 1);
        if (kind === 'coin') a.squad.coinsPicked++;
        this.sim.events.push(kind === 'gem' ? { t: 'gemPicked', x: g.x, y: g.y, n: 1 } : { t: 'coinPicked', x: g.x, y: g.y, n: 1, owner: a.squad.owner });
        continue;
      }
      chase(g, a.soldier.x, a.soldier.y, a.dist, a.stat, dt);
    }
  }

  /** Aimant (power-up) : les diamants à moins de `radius` px de la squad sont aspirés. */
  magnetize(squad: Squad, radius: number): void {
    for (const g of [...this.items, ...this.coins]) {
      if (g.hop || g.age < GEM_CHEST.grace || Math.hypot(squad.center.x - g.x, squad.center.y - g.y) > radius) continue;
      catchItem(g, squad.owner);
    }
  }

  clear(): void {
    this.chests.length = 0;
    this.items.length = 0;
    this.coins.length = 0;
    this.finalPending = false;
  }
}
