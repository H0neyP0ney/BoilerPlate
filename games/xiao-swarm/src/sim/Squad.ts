import { assignSlotsOptimal, damp, robustCentroid, Stats, sunflowerSlots, type Point } from '@xiao/engine/sim';
import { CROWD, SQUAD } from '../config';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { OFFER_SIZE, UPGRADE_IDS, UPGRADES, xpToNext, type UpgradeId } from '../data/progression';
import type { SoldierState } from './entities';
import type { Sim } from './Sim';
import type { PlayerId, PlayerInput } from './types';

export type SquadStat = 'damage' | 'fireRate' | 'hp' | 'speed' | 'maxSquad' | 'magnet' | 'recruit' | 'xpGain';

/**
 * La squad d'un joueur = une "entité vivante" (GDD §4-6) :
 *  - une ancre suit l'input immédiatement (c'est elle qu'on prédira côté client en réseau) ;
 *  - chaque soldat rejoint son slot dans une spirale de tournesol avec un retard individuel ;
 *  - séparation + obstacles → la formation se déforme puis se reforme ;
 *  - l'ancre est tenue en laisse autour du coeur de la squad.
 */
export class Squad {
  readonly soldiers: SoldierState[] = [];
  readonly anchor = { x: 0, y: 0, radius: 18 };
  private readonly steerV = { x: 0, y: 0 };
  private readonly slotTarget = { x: 0, y: 0, radius: 0 };
  readonly center: Point = { x: 0, y: 0 };
  /** Upgrades propres à ce joueur. */
  readonly stats = new Stats<SquadStat>({ damage: 1, fireRate: 1, hp: 1, speed: 1, maxSquad: SQUAD.baseMaxSize, magnet: 1, recruit: 1, xpGain: 1 });
  /** Progression (globes d'XP) : niveau, XP dans le niveau en cours, upgrades proposées (pause du jeu tant qu'on n'a pas choisi). */
  xp = 0;
  level = 1;
  /** Les 3 upgrades à choisir, ou null. */
  offer: UpgradeId[] | null = null;
  private pendingLevels = 0;
  readonly picked: Partial<Record<UpgradeId, number>> = {};
  moving = false;
  stillTime = 0;
  kills = 0;
  private slots: Point[] = [];
  /** Recrues qui viennent d'arriver : elles gardent leur place (voir `recruit`). */
  private readonly newcomers: SoldierState[] = [];
  private slotSpacing: number = CROWD.spacing;
  private dirty = true;
  private healFx = 0;

  constructor(
    private readonly sim: Sim,
    readonly owner: PlayerId,
  ) {}

  get size(): number {
    return this.soldiers.length;
  }

  get alive(): boolean {
    return this.soldiers.length > 0;
  }

  get maxSize(): number {
    return Math.floor(this.stats.get('maxSquad'));
  }

  /** Nouvelle partie : plus de soldats, progression (XP, niveau, upgrades) et bonus remis à zéro. */
  resetRun(): void {
    this.soldiers.length = 0;
    this.newcomers.length = 0;
    this.stats.reset();
    this.xp = 0;
    this.level = 1;
    this.offer = null;
    this.pendingLevels = 0;
    for (const k of Object.keys(this.picked)) delete this.picked[k as UpgradeId];
    this.kills = 0;
    this.stillTime = 0;
    this.dirty = true;
  }

  /** XP nécessaire pour le prochain niveau. */
  get xpNeeded(): number {
    return xpToNext(this.level);
  }

  /** Ajoute de l'XP (bonus `xpGain` compris) ; chaque niveau franchi prépare un choix d'upgrade. */
  gainXp(value: number): void {
    this.xp += value * this.stats.get('xpGain');
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.pendingLevels++;
      this.sim.events.push({ t: 'levelUp', owner: this.owner, level: this.level });
    }
    if (this.pendingLevels > 0 && !this.offer) this.rollOffer();
  }

  private rollOffer(): void {
    const eligible = UPGRADE_IDS.filter((id) => (this.picked[id] ?? 0) < UPGRADES[id].maxStacks);
    this.offer = eligible.length ? this.sim.rng.sample(eligible, OFFER_SIZE) : null;
    if (!this.offer) this.pendingLevels = 0;
  }

  /** Choisit l'upgrade `index` parmi les propositions ; enchaîne sur le niveau suivant s'il y en a un en attente. */
  chooseUpgrade(index: number): boolean {
    const id = this.offer?.[index];
    if (!id) return false;
    this.applyUpgrade(id);
    this.offer = null;
    this.pendingLevels--;
    if (this.pendingLevels > 0) this.rollOffer();
    return true;
  }

  private applyUpgrade(id: UpgradeId): void {
    const def = UPGRADES[id];
    this.picked[id] = (this.picked[id] ?? 0) + 1;
    if (def.stat && def.mod) this.stats.add(def.stat, def.mod);
    if (id === 'hp') {
      // les soldats déjà là gagnent aussi les PV supplémentaires
      for (const s of this.soldiers) {
        const max = s.def.hp * this.stats.get('hp');
        s.hp += max - s.maxHp;
        s.maxHp = max;
      }
    } else if (id === 'heal') {
      for (const s of this.soldiers) {
        s.hp = Math.min(s.maxHp, s.hp + s.maxHp * (def.value / 100));
        this.sim.events.push({ t: 'heal', x: s.x, y: s.y - 50 });
      }
    }
  }

  get isHealing(): boolean {
    return this.stillTime > CROWD.stillDelay && this.soldiers.some((s) => s.def.heal);
  }

  countOf(id: SoldierClassId): number {
    let n = 0;
    for (const s of this.soldiers) if (s.def.id === id) n++;
    return n;
  }

  /** Taille de la formation, utile pour la caméra et le spawn. */
  get radius(): number {
    return CROWD.spacing * 0.55 * Math.sqrt(this.soldiers.length + 0.5) + CROWD.spacing;
  }

  spawn(ids: SoldierClassId[], at: Point): void {
    this.anchor.x = at.x;
    this.anchor.y = at.y;
    this.stillTime = 0;
    const slots = sunflowerSlots(ids.length, CROWD.spacing);
    ids.forEach((id, i) => this.add(id, { x: at.x + slots[i].x, y: at.y + slots[i].y }));
    this.updateCenter();
    this.sim.events.push({ t: 'squadSpawned', owner: this.owner, x: at.x, y: at.y });
  }

  add(id: SoldierClassId, at: Point): SoldierState {
    const def = CLASSES[id];
    const maxHp = def.hp * this.stats.get('hp');
    const s: SoldierState = {
      kind: 'soldier',
      id: this.sim.ids.get(),
      owner: this.owner,
      team: this.owner,
      def,
      x: at.x,
      y: at.y,
      px: at.x,
      py: at.y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      radius: def.radius,
      mass: def.mass,
      hp: maxHp,
      maxHp,
      alive: true,
      slotX: 0,
      slotY: 0,
      gain: this.sim.rng.next(),
      cooldown: this.sim.rng.next() * def.weapon.cooldown,
      retarget: 0,
      target: null,
      facing: 1,
      aim: 0,
      invulnerable: 0,
      capturedBy: 0,
    };
    this.soldiers.push(s);
    this.dirty = true;
    return s;
  }

  /**
   * Un soldat rejoint la squad en cours de route (ramassage). Il prend dans la formation la place la plus proche
   * de l'endroit où il a été ramassé, et les autres se décalent au besoin : le joueur choisit où s'insère la
   * recrue en choisissant quel côté de la squad passe dessus.
   */
  recruit(id: SoldierClassId, at: Point): SoldierState {
    const s = this.add(id, at);
    this.newcomers.push(s);
    return s;
  }

  /** Retire les soldats morts (appelé en fin de tick). */
  removeDead(): SoldierState[] {
    const dead: SoldierState[] = [];
    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      if (this.soldiers[i].alive) continue;
      dead.push(this.soldiers[i]);
      this.soldiers.splice(i, 1);
      this.dirty = true;
    }
    return dead;
  }

  update(dt: number, input: PlayerInput): void {
    const n = this.soldiers.length;
    if (n === 0) return;
    const len = Math.hypot(input.mx, input.my);
    const mx = len > 1 ? input.mx / len : input.mx;
    const my = len > 1 ? input.my / len : input.my;
    this.moving = len > 0.1;
    this.stillTime = this.moving ? 0 : this.stillTime + dt;
    const speed = CROWD.speed * this.stats.get('speed');

    // 1. Ancre : réponse immédiate à l'input
    this.steerV.x = mx * speed;
    this.steerV.y = my * speed;
    this.sim.arena.steer(this.anchor.x, this.anchor.y, this.anchor.radius, this.steerV);
    this.anchor.x += this.steerV.x * dt;
    this.anchor.y += this.steerV.y * dt;
    this.sim.arena.constrain(this.anchor);

    // 2. Laisse autour du coeur de la squad
    this.updateCenter();
    const dx = this.anchor.x - this.center.x;
    const dy = this.anchor.y - this.center.y;
    const d = Math.hypot(dx, dy);
    const leash = CROWD.leash + Math.sqrt(n) * CROWD.leashPerRoot;
    if (d > leash) {
      this.anchor.x = this.center.x + (dx / d) * leash;
      this.anchor.y = this.center.y + (dy / d) * leash;
    }

    // 3. Slots (recalculés quand la taille ou l'espacement change)
    if (this.dirty || this.slotSpacing !== CROWD.spacing) this.reassign();

    // 4. Chaque soldat rejoint son slot avec inertie
    const maxSpeed = speed * CROWD.maxSpeedMul;
    for (const s of this.soldiers) {
      // prisonnier d'une bulle : elle le porte ; si la bulle a disparu, il est libre
      if (s.capturedBy) {
        if (this.sim.aliens.some((x) => x.alive && x.id === s.capturedBy)) continue;
        s.capturedBy = 0;
      }
      const gain = CROWD.gainMin + s.gain * CROWD.gainSpread;
      // le slot visé est ramené hors du décor : un slot dans un obstacle plaquerait le soldat contre lui
      this.slotTarget.x = this.anchor.x + s.slotX;
      this.slotTarget.y = this.anchor.y + s.slotY;
      this.slotTarget.radius = s.radius + CROWD.wallMargin * 0.4;
      this.sim.arena.constrain(this.slotTarget);
      let desiredX = (this.slotTarget.x - s.x) * gain;
      let desiredY = (this.slotTarget.y - s.y) * gain;
      const l = Math.hypot(desiredX, desiredY);
      if (l > maxSpeed) {
        desiredX = (desiredX / l) * maxSpeed;
        desiredY = (desiredY / l) * maxSpeed;
      }
      s.vx = damp(s.vx, desiredX, CROWD.velDamp, dt);
      s.vy = damp(s.vy, desiredY, CROWD.velDamp, dt);
      this.steerV.x = s.vx;
      this.steerV.y = s.vy;
      this.sim.arena.steer(s.x, s.y, s.radius, this.steerV);
      s.vx = this.steerV.x;
      s.vy = this.steerV.y;
      s.x += (s.vx + s.kx) * dt;
      s.y += (s.vy + s.ky) * dt;
      s.kx = damp(s.kx, 0, CROWD.knockDamp, dt);
      s.ky = damp(s.ky, 0, CROWD.knockDamp, dt);
      if (s.invulnerable > 0) s.invulnerable -= dt;
    }

    // 5. Séparation douce entre soldats (n ≤ ~30 : O(n²) suffit)
    for (let i = 0; i < n; i++) {
      const a = this.soldiers[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.soldiers[j];
        if (a.capturedBy || b.capturedBy) continue;
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const min = (a.radius + b.radius) * 1.05;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= min * min || d2 === 0) continue;
        const dd = Math.sqrt(d2);
        const push = ((min - dd) / dd) * CROWD.separation;
        const wa = b.mass / (a.mass + b.mass);
        const wb = a.mass / (a.mass + b.mass);
        a.x -= ddx * push * wa;
        a.y -= ddy * push * wa;
        b.x += ddx * push * wb;
        b.y += ddy * push * wb;
      }
    }

    // 6. Obstacles & bords
    for (const s of this.soldiers) if (!s.capturedBy) this.sim.arena.constrain(s);

    this.updateHealing(dt);
  }

  /** Medic : soigne la squad quand elle est à l'arrêt (GDD §8). */
  private updateHealing(dt: number): void {
    if (!this.isHealing) return;
    this.healFx -= dt;
    const fx = this.healFx <= 0;
    if (fx) this.healFx = 0.35;
    for (const m of this.soldiers) {
      const heal = m.def.heal;
      if (!heal) continue;
      for (const s of this.soldiers) {
        if (s.hp >= s.maxHp || Math.hypot(s.x - m.x, s.y - m.y) > heal.radius) continue;
        s.hp = Math.min(s.maxHp, s.hp + heal.perSecond * dt);
        if (fx && this.sim.rng.chance(0.5)) this.sim.events.push({ t: 'heal', x: s.x, y: s.y - 50 });
      }
    }
  }

  private updateCenter(): void {
    robustCentroid(this.soldiers, this.radius * 1.6, this.center);
  }

  private reassign(): void {
    this.dirty = false;
    this.slotSpacing = CROWD.spacing;
    this.slots = sunflowerSlots(this.soldiers.length, CROWD.spacing, this.slots);
    const relOf = (s: SoldierState): Point => ({ x: s.x - this.anchor.x, y: s.y - this.anchor.y });

    // 1. Les recrues prennent d'abord la place libre la plus proche de leur point de ramassage.
    const slotOf = new Map<SoldierState, number>();
    const taken = new Set<number>();
    for (const s of this.newcomers) {
      if (!this.soldiers.includes(s)) continue;
      const p = relOf(s);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < this.slots.length; i++) {
        if (taken.has(i)) continue;
        const d = (this.slots[i].x - p.x) ** 2 + (this.slots[i].y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      slotOf.set(s, best);
      taken.add(best);
    }
    this.newcomers.length = 0;

    // 2. Les autres soldats se répartissent les places restantes en se déplaçant le moins possible.
    const others = this.soldiers.filter((s) => !slotOf.has(s));
    const free = this.slots.map((_, i) => i).filter((i) => !taken.has(i));
    const assignment = assignSlotsOptimal(
      others.map(relOf),
      free.map((i) => this.slots[i]),
    );
    others.forEach((s, i) => slotOf.set(s, free[assignment[i]]));

    for (const s of this.soldiers) {
      const slot = this.slots[slotOf.get(s)!];
      s.slotX = slot.x;
      s.slotY = slot.y;
    }
  }
}
