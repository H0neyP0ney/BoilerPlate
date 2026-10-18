import { clamp, Rng } from '@xiao/engine/sim';
import { COINS, DIFFICULTY, GEM_CHEST, RECRUIT } from '../config';
import { ALIENS, type AlienId } from '../data/aliens';
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
  /** Temps (s) avant la séquence de fin quand le boss final a explosé : `GEM_CHEST.finalWait`, +`finalBonus` par diamant ramassé ; à 0 la fin démarre même s'il reste des diamants. */
  finalT = 0;


  /**
   * Aléatoire PROPRE aux diamants et aux pièces : il ne touche jamais la suite aléatoire de la simulation (`sim.rng`), donc ajouter ou régler ces butins ne change
   * pas les vagues ni les tirages du reste de la partie.
   */
  private readonly rng: Rng;

  constructor(private readonly sim: Sim) {
    this.rng = new Rng((sim.config.seed ^ 0x5bd1e995) >>> 0);
  }

  private get enabled(): boolean {
    return !this.sim.config.online && !this.sim.ending;
  }

  /**
   * Un boss (ni final ni premier jumeau) vient de tomber, son œuf est en (x, y) : quelques diamants jaillissent tout de suite autour de l'œuf, et le coffre saute de l'œuf vers le
   * sommet d'un triangle équilatéral (côté `GEM_CHEST.triangle`, ± `triangleJitter`) dont les deux globes d'upgrade (`UpgradeOrbs.burst`, en bas à gauche et à droite) sont la base.
   * Pas de jauge pendant le saut.
   */
  /** Quantité de diamants d'un coffre de `boss` : sa moyenne (`AlienDef.diamonds`) × le multiplicateur du niveau (`DIFFICULTY.gemMul…`), ± `GEM_CHEST.spread`, au moins 1. */
  chestQuantity(boss: AlienId): number {
    const lvl = this.sim.difficulty;
    const mul = lvl === 'impossible' ? DIFFICULTY.gemMulExpert : lvl === 'expert' ? DIFFICULTY.gemMulHard : DIFFICULTY.gemMulNormal;
    return Math.max(1, Math.round((ALIENS[boss].diamonds ?? 0) * mul * (1 + this.rng.range(-GEM_CHEST.spread, GEM_CHEST.spread))));
  }

  spawnChest(x: number, y: number, boss: AlienId = 'boss_gling'): void {
    if (!this.enabled || this.sim.tutorial?.active) return;
    const { minX, maxX, minY, maxY } = this.sim.arena.bounds;
    const rng = this.rng;
    const qty = this.chestQuantity(boss);
    const R = GEM_CHEST.triangle / Math.sqrt(3); // rayon du cercle circonscrit : le centre du triangle est l'œuf
    const j = GEM_CHEST.triangleJitter;
    const ang = -Math.PI / 2 + rng.range(-0.05, 0.05); // sommet = au-dessus de l'œuf
    const dist = R * (1 + rng.range(-j, j));
    const tx = clamp(x + Math.cos(ang) * dist, minX + 60, maxX - 60);
    const ty = clamp(y + Math.sin(ang) * dist, minY + 60, maxY - 60);
    this.chests.push({ id: this.sim.ids.get(), x, y, px: x, py: y, charge: 0, state: 'idle', cool: 0, age: 0, qty, hop: { vx: (tx - x) / GEM_FALL_TIME, vy: (ty - y) / GEM_FALL_TIME, t: GEM_FALL_TIME } });
    const n = Math.max(1, Math.round(qty * DIFFICULTY.gemFreeShare)); // une part du contenu du coffre jaillit tout de suite
    for (let i = 0; i < n; i++) this.drop(x, y, rng.range(0, Math.PI * 2), rng.range(60, 130)); // autour de l'œuf
  }

  /** Le boss final tombe en (x, y) : l'équivalent d'un coffre qui explose, tout de suite, sans vidéo (`GEM_CHEST.burst` diamants, 10 s pour les ramasser). */
  spawnFinalBurst(x: number, y: number, boss: AlienId = 'boss_crab'): void {
    if (!this.enabled) return;
    const rng = this.rng;
    const n = Math.max(1, Math.round(this.chestQuantity(boss) * DIFFICULTY.gemFinalShare)); // quantité modérée : une part du coffre
    this.finalT = GEM_CHEST.finalWait;
    const turn = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) this.drop(x, y, turn + (k / n) * Math.PI * 2 + rng.range(-0.25, 0.25), rng.range(70, 200));
    this.finalPending = true;
    this.sim.events.push({ t: 'gemChestOpen', x, y });
  }

  /** La séquence de fin peut démarrer : pas de burst du boss final en attente, ou tous ses diamants sont ramassés / disparus. */
  get endingReady(): boolean {
    return !this.finalPending || this.items.length === 0 || this.finalT <= 0;
  }

  /** Un alien vient de mourir : il peut lâcher une pièce d'or (plus souvent s'il est costaud), un boss en lâche une poignée. Solo seulement. */
  dropCoins(a: AlienState): void {
    if (this.sim.ending) return; // les pièces tombent aussi en multi (contrairement aux diamants)
    const rng = this.rng;
    const n = a.def.boss ? COINS.bossCoins : rng.chance(a.maxHp >= COINS.strongHp ? COINS.strongChance : COINS.chance) ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const hop = n > 1 ? rng.range(50, 150) : rng.range(15, 45);
      const ang = rng.range(0, Math.PI * 2);
      this.pushCoin(a.x, a.y, ang, hop);
    }
  }

  /** `n` pièces d'or qui retombent en cloche autour de (x, y), de `min` à `max` px (alien doré : sur sa route, ou à sa mort). */
  dropCoinsAt(x: number, y: number, n: number, min = 15, max = 45): void {
    if (this.sim.ending) return;
    for (let i = 0; i < n; i++) this.pushCoin(x, y, this.rng.range(0, Math.PI * 2), this.rng.range(min, max));
  }

  /** `n` diamants qui jaillissent autour de (x, y) (solo seulement). */
  dropGemsAt(x: number, y: number, n: number): void {
    if (!this.enabled) return;
    const turn = this.rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) this.drop(x, y, turn + (k / n) * Math.PI * 2 + this.rng.range(-0.25, 0.25), this.rng.range(60, 160));
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
    const rng = this.rng;
    const n = c.qty;
    const turn = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) this.drop(c.x, c.y, turn + (k / n) * Math.PI * 2 + rng.range(-0.25, 0.25), rng.range(70, 230)); // explosion : en couronne, plus loin que les diamants du début
    this.sim.events.push({ t: 'gemChestOpen', x: c.x, y: c.y });
  }

  update(dt: number): void {
    if (this.finalPending) this.finalT -= dt;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      c.px = c.x;
      c.py = c.y;
      c.age += dt;
      if (c.state !== 'ad' && c.age >= GEM_CHEST.chestLife) {
        this.chests.splice(i, 1); // pas pris au bout de `chestLife` s : il disparaît (jamais pendant la vidéo)
        continue;
      }
      if (c.hop) {
        c.x += c.hop.vx * dt;
        c.y += c.hop.vy * dt;
        c.hop.t -= dt;
        if (c.hop.t <= 0) c.hop = undefined;
        continue; // en l'air : pas de jauge
      }
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

  private pushCoin(x: number, y: number, ang: number, dist: number): void {
    this.coins.push({ id: this.sim.ids.get(), x, y, px: x, py: y, life: COINS.life, age: 0, hop: { vx: (Math.cos(ang) * dist) / GEM_FALL_TIME, vy: (Math.sin(ang) * dist) / GEM_FALL_TIME, t: GEM_FALL_TIME } });
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
        else if (this.finalPending) this.finalT += GEM_CHEST.finalBonus; // boss final : chaque diamant ramassé retarde la fin
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
    this.finalT = 0;
  }
}
