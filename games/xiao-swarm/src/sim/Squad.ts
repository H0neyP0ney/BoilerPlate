import { assignSlots, damp, robustCentroid, Stats, sunflowerSlots, type Point } from '@xiao/engine/sim';
import { SQUAD } from '../config';
import { CLASSES, type SoldierClassId } from '../data/classes';
import type { SoldierState } from './entities';
import type { Sim } from './Sim';
import type { PlayerId, PlayerInput } from './types';

export type SquadStat = 'damage' | 'fireRate' | 'hp' | 'speed' | 'maxSquad';

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
  readonly center: Point = { x: 0, y: 0 };
  /** Upgrades propres à ce joueur. */
  readonly stats = new Stats<SquadStat>({ damage: 1, fireRate: 1, hp: 1, speed: 1, maxSquad: SQUAD.baseMaxSize });
  moving = false;
  stillTime = 0;
  kills = 0;
  private slots: Point[] = [];
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

  get isHealing(): boolean {
    return this.stillTime > SQUAD.stillDelay && this.soldiers.some((s) => s.def.heal);
  }

  countOf(id: SoldierClassId): number {
    let n = 0;
    for (const s of this.soldiers) if (s.def.id === id) n++;
    return n;
  }

  /** Taille de la formation, utile pour la caméra et le spawn. */
  get radius(): number {
    return SQUAD.spacing * 0.55 * Math.sqrt(this.soldiers.length + 0.5) + SQUAD.spacing;
  }

  spawn(ids: SoldierClassId[], at: Point): void {
    this.anchor.x = at.x;
    this.anchor.y = at.y;
    this.stillTime = 0;
    const slots = sunflowerSlots(ids.length, SQUAD.spacing);
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
      gain: 4 + this.sim.rng.next() * 2,
      cooldown: this.sim.rng.next() * def.weapon.cooldown,
      retarget: 0,
      target: null,
      facing: 1,
      aim: 0,
      invulnerable: 0,
    };
    this.soldiers.push(s);
    this.dirty = true;
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
    const speed = SQUAD.speed * this.stats.get('speed');

    // 1. Ancre : réponse immédiate à l'input
    this.anchor.x += mx * speed * dt;
    this.anchor.y += my * speed * dt;
    this.sim.arena.constrain(this.anchor);

    // 2. Laisse autour du coeur de la squad
    this.updateCenter();
    const dx = this.anchor.x - this.center.x;
    const dy = this.anchor.y - this.center.y;
    const d = Math.hypot(dx, dy);
    const leash = SQUAD.leash + Math.sqrt(n) * 6;
    if (d > leash) {
      this.anchor.x = this.center.x + (dx / d) * leash;
      this.anchor.y = this.center.y + (dy / d) * leash;
    }

    // 3. Slots (recalculés seulement quand la taille change)
    if (this.dirty) this.reassign();

    // 4. Chaque soldat rejoint son slot avec inertie
    const maxSpeed = speed * 1.6;
    for (const s of this.soldiers) {
      let desiredX = (this.anchor.x + s.slotX - s.x) * s.gain;
      let desiredY = (this.anchor.y + s.slotY - s.y) * s.gain;
      const l = Math.hypot(desiredX, desiredY);
      if (l > maxSpeed) {
        desiredX = (desiredX / l) * maxSpeed;
        desiredY = (desiredY / l) * maxSpeed;
      }
      s.vx = damp(s.vx, desiredX, 10, dt);
      s.vy = damp(s.vy, desiredY, 10, dt);
      s.x += (s.vx + s.kx) * dt;
      s.y += (s.vy + s.ky) * dt;
      s.kx = damp(s.kx, 0, 5, dt);
      s.ky = damp(s.ky, 0, 5, dt);
      if (s.invulnerable > 0) s.invulnerable -= dt;
    }

    // 5. Séparation douce entre soldats (n ≤ ~30 : O(n²) suffit)
    for (let i = 0; i < n; i++) {
      const a = this.soldiers[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.soldiers[j];
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const min = (a.radius + b.radius) * 1.05;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= min * min || d2 === 0) continue;
        const dd = Math.sqrt(d2);
        const push = ((min - dd) / dd) * 0.5;
        const wa = b.mass / (a.mass + b.mass);
        const wb = a.mass / (a.mass + b.mass);
        a.x -= ddx * push * wa;
        a.y -= ddy * push * wa;
        b.x += ddx * push * wb;
        b.y += ddy * push * wb;
      }
    }

    // 6. Obstacles & bords
    for (const s of this.soldiers) this.sim.arena.constrain(s);

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
    this.slots = sunflowerSlots(this.soldiers.length, SQUAD.spacing, this.slots);
    const rel = this.soldiers.map((s) => ({ x: s.x - this.anchor.x, y: s.y - this.anchor.y }));
    const assignment = assignSlots(rel, this.slots);
    this.soldiers.forEach((s, i) => {
      const slot = this.slots[assignment[i]];
      s.slotX = slot.x;
      s.slotY = slot.y;
    });
  }
}
