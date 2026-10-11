import { TURRETS } from '../config';
import { TURRET_DEF } from '../data/classes';
import type { AlienState, TurretState } from './entities';
import type { Sim } from './Sim';
import type { PlayerId } from './types';

/**
 * Tourelles automatiques du power-up `turrets` : `TURRETS.count` « soldats » posés autour du globe ramassé, hors de toute squad. Les aliens les ciblent et les
 * blessent comme des soldats (elles sont dans `Sim.soldierHash`) ; elles tirent sur l'alien le plus proche (`Combat.turretShot`, tir explosif) et explosent à leur
 * mort (`deathBlast` de `TURRET_DEF`, via `Sim.damageSoldier`). Au bout de `TURRETS.life` s elles disparaissent sans explosion. Seul l'hôte / le solo simule ; le client reçoit la liste.
 */
export class Turrets {
  readonly items: TurretState[] = [];
  private readonly scratch: AlienState[] = [];

  constructor(private readonly sim: Sim) {}

  /** Pose les tourelles autour de (`x`, `y`), au nom de `owner`. */
  spawn(owner: PlayerId, x: number, y: number): void {
    const { rng, arena } = this.sim;
    const start = rng.range(0, Math.PI * 2);
    for (let i = 0; i < TURRETS.count; i++) {
      const ang = start + (i / TURRETS.count) * Math.PI * 2;
      const p = { x: x + Math.cos(ang) * TURRETS.spread, y: y + Math.sin(ang) * TURRETS.spread, radius: TURRETS.radius };
      arena.constrain(p);
      this.items.push(this.make(this.sim.ids.get(), owner, p.x, p.y));
    }
  }

  make(id: number, owner: PlayerId, x: number, y: number): TurretState {
    return {
      kind: 'soldier',
      id,
      owner,
      team: owner,
      def: TURRET_DEF,
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      radius: TURRET_DEF.radius,
      mass: TURRET_DEF.mass,
      hp: TURRET_DEF.hp,
      maxHp: TURRET_DEF.hp,
      shield: 0,
      maxShield: 0,
      alive: true,
      slotX: 0,
      slotY: 0,
      gain: 0,
      cooldown: this.sim.rng.next() * TURRET_DEF.weapon.cooldown,
      retarget: 0,
      target: null,
      facing: 1,
      aim: 0,
      invulnerable: 0,
      capturedBy: 0,
      frozen: 0,
      iceInvuln: 0,
      stun: 0,
      poison: 0,
      grabbed: 0,
      ttl: TURRETS.life,
      ttlMax: TURRETS.life,
    };
  }

  update(dt: number): void {
    const { alienHash } = this.sim;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i];
      if (!t.alive) {
        this.items.splice(i, 1); // détruite par les aliens : l'explosion est déjà posée (`damageSoldier`)
        continue;
      }
      t.ttl -= dt;
      if (t.ttl <= 0) {
        t.alive = false; // fin de vie : disparaît sans exploser
        this.items.splice(i, 1);
        continue;
      }
      // immobile et insensible aux états des soldats (gel, étourdissement, poison, bulle, langue)
      t.frozen = t.stun = t.poison = t.capturedBy = t.grabbed = 0;
      t.vx = t.vy = t.kx = t.ky = 0;
      t.cooldown -= dt;
      t.retarget -= dt;
      const range = TURRET_DEF.weapon.range;
      if (t.retarget <= 0 || (t.target && !t.target.alive)) {
        t.target = alienHash.nearest(t.x, t.y, range, (a) => a.alive && this.sim.horde.targetable(a), this.scratch) ?? null;
        t.retarget = 0.15;
      }
      const target = t.target?.kind === 'alien' ? t.target : null;
      if (!target || !target.alive) {
        t.target = null;
        continue;
      }
      t.aim = Math.atan2(target.y - 10 - (t.y - 17), target.x - t.x);
      t.facing = Math.cos(t.aim) >= 0 ? 1 : -1;
      if (t.cooldown <= 0) {
        this.sim.combat.turretShot(t, target);
        t.cooldown += TURRET_DEF.weapon.cooldown;
        if (t.cooldown < 0) t.cooldown = 0;
      }
    }
  }

  clear(): void {
    this.items.length = 0;
  }
}
