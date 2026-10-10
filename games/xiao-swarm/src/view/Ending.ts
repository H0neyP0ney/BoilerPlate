import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { PlayerId } from '../sim/types';
import type { Sim } from '../sim/Sim';

/** Longueur affichée de la fusée (px), sa chute (px au-dessus du point d'atterrissage, durée en s), et la distance au-delà de laquelle un soldat y monte. */
const ROCKET_LEN = 230;
const DROP_HEIGHT = 900;
const DROP_TIME = 2.2;
const BOARD_RADIUS = 55;
const BOARD_TIMEOUT = 12;
const LAUNCH_TIME = 2.4;

/**
 * Séquence de fin du solo (boss final tombé) : les commandes sont verrouillées (`moveDir` remplace l'input), une fusée (sprite `fx_rocket`, celui du power-up Rocket
 * barrage) descend à côté de la squad en freinant, les soldats marchent dedans et disparaissent (`Sim.boardSoldier`), puis la fusée décolle. `onLaunched` : la scène
 * affiche alors « Congratulations! ». Vue seulement : la simulation ne fait que figer les vagues, l'XP et les dégâts (`Sim.beginEnding`).
 */
export class Ending {
  private phase: 'drop' | 'board' | 'launch' | 'done' = 'drop';
  private t = 0;
  private boardT = 0;
  private emptyT = 0;
  private speed = 0;
  private readonly rocket: Phaser.GameObjects.Image;
  private readonly flame: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly land = new Phaser.Math.Vector2();
  private readonly dir = new Phaser.Math.Vector2();
  /** Centre de la fusée. */
  private y = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
    private readonly owner: PlayerId,
    private readonly onLaunched: () => void,
  ) {
    const c = sim.squadOf(owner)!.center;
    this.land.set(c.x + 260, c.y + 50);
    const src = scene.textures.get('fx_rocket').getSourceImage() as { width: number; height: number };
    this.rocket = scene.add.image(this.land.x, 0, 'fx_rocket').setDisplaySize(ROCKET_LEN, (ROCKET_LEN * src.height) / src.width).setRotation(-Math.PI / 2); // pointe vers le haut
    this.flame = scene.add.graphics().setDepth(DEPTH.fx);
    this.shadow = scene.add.graphics().setDepth(DEPTH.groundFx);
    this.y = this.land.y - ROCKET_LEN / 2 - DROP_HEIGHT;
    this.place();
  }

  /** Direction imposée à la squad (les commandes du joueur sont ignorées) : elle marche vers la porte de la fusée une fois posée. */
  moveDir(): Phaser.Math.Vector2 {
    this.dir.set(0, 0);
    if (this.phase !== 'board') return this.dir;
    const c = this.sim.squadOf(this.owner)?.center;
    if (!c) return this.dir;
    this.dir.set(this.land.x - c.x, this.land.y - 20 - c.y);
    if (this.dir.length() > 30) this.dir.normalize();
    else this.dir.set(0, 0);
    return this.dir;
  }

  update(dt: number): void {
    this.t += dt;
    const cam = this.scene.cameras.main;
    switch (this.phase) {
      case 'drop': {
        const k = Math.min(1, this.t / DROP_TIME);
        const ease = 1 - (1 - k) ** 3; // freine en arrivant
        this.y = this.land.y - ROCKET_LEN / 2 - DROP_HEIGHT * (1 - ease);
        this.drawFlame(40 + 130 * (1 - ease));
        if (k >= 1) {
          this.phase = 'board';
          this.t = 0;
          cam.shake(350, 0.005); // atterrissage
          this.flame.clear();
        }
        break;
      }
      case 'board': {
        this.boardT += dt;
        const sq = this.sim.squadOf(this.owner);
        const force = this.boardT > BOARD_TIMEOUT; // sécurité : un soldat coincé derrière un obstacle monte quand même
        for (const s of sq?.soldiers ?? []) {
          if (s.alive && (force || Math.hypot(s.x - this.land.x, s.y - (this.land.y - 20)) < BOARD_RADIUS)) this.sim.boardSoldier(s);
        }
        if (!sq || sq.soldiers.every((s) => !s.alive)) this.emptyT += dt;
        if (this.emptyT > 0.6) {
          this.phase = 'launch';
          this.t = 0;
        }
        break;
      }
      case 'launch': {
        this.speed += 1500 * dt;
        this.y -= this.speed * dt;
        this.drawFlame(110 + Math.min(120, this.speed * 0.12));
        cam.shake(100, 0.003);
        if (this.t >= LAUNCH_TIME) {
          this.phase = 'done';
          this.flame.clear();
          this.rocket.setVisible(false);
          this.onLaunched();
        }
        break;
      }
      default:
    }
    this.place();
  }

  private place(): void {
    this.rocket.setPosition(this.land.x, this.y).setDepth(this.phase === 'launch' ? DEPTH.fx : DEPTH.actors + this.land.y);
    // ombre au sol : grandit à mesure que la fusée approche, disparaît au décollage
    const near = this.phase === 'drop' ? Math.min(1, this.t / DROP_TIME) : this.phase === 'launch' ? Math.max(0, 1 - this.t / 0.8) : 1;
    this.shadow.clear().fillStyle(0x000000, 0.28 * near).fillEllipse(this.land.x, this.land.y, 120 * (0.4 + 0.6 * near), 36 * (0.4 + 0.6 * near));
  }

  /** Flamme de la tuyère sous la fusée (vacille). */
  private drawFlame(len: number): void {
    const tailY = this.y + ROCKET_LEN / 2;
    const f = len * (0.85 + Math.random() * 0.3);
    this.flame
      .clear()
      .fillStyle(0xff6a1a, 0.9)
      .fillTriangle(this.land.x - 20, tailY, this.land.x + 20, tailY, this.land.x, tailY + f)
      .fillStyle(0xffe066, 0.95)
      .fillTriangle(this.land.x - 11, tailY, this.land.x + 11, tailY, this.land.x, tailY + f * 0.6);
  }
}
