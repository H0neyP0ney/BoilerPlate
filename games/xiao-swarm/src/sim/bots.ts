import { Rng } from '@xiao/engine/sim';
import type { Sim } from './Sim';
import type { PlayerId, PlayerInput } from './types';

/**
 * Bots très simples qui produisent des PlayerInput, exactement comme un joueur
 * humain ou un client réseau. Servent à tester le multi-squad (battle royale)
 * sans réseau, et plus tard à remplir les parties incomplètes.
 */
export class BotBrain {
  private readonly rng: Rng;
  private wanderAngle: number;
  private retarget = 0;
  private readonly input: PlayerInput = { mx: 0, my: 0 };

  constructor(
    readonly owner: PlayerId,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.wanderAngle = this.rng.range(0, Math.PI * 2);
  }

  think(sim: Sim, dt: number): PlayerInput {
    const sq = sim.squadOf(this.owner);
    if (!sq || !sq.alive) {
      this.input.mx = this.input.my = 0;
      return this.input;
    }
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = this.rng.range(1, 3);
      this.wanderAngle += this.rng.range(-1.2, 1.2);
    }
    // Converge vers le centre de la carte en zigzaguant ; s'arrête parfois (soin du Medic).
    const cx = sim.map.width / 2 - sq.center.x;
    const cy = sim.map.height / 2 - sq.center.y;
    const d = Math.hypot(cx, cy) || 1;
    const toCenter = Math.min(1, d / 800);
    let mx = (cx / d) * toCenter + Math.cos(this.wanderAngle) * 0.7;
    let my = (cy / d) * toCenter + Math.sin(this.wanderAngle) * 0.7;
    const len = Math.hypot(mx, my) || 1;
    const idle = this.retarget < 0.5 && sq.soldiers.some((s) => s.hp < s.maxHp * 0.6);
    mx = idle ? 0 : mx / len;
    my = idle ? 0 : my / len;
    this.input.mx = mx;
    this.input.my = my;
    return this.input;
  }
}
