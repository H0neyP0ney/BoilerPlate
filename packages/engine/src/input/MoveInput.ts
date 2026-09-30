import Phaser from 'phaser';
import { VirtualJoystick } from '../ui/VirtualJoystick';

/**
 * Direction de déplacement unifiée : joystick flottant (tactile + drag souris)
 * ou clavier (flèches, WASD, ZQSD). `vector` a une longueur entre 0 et 1.
 */
export class MoveInput {
  readonly vector = new Phaser.Math.Vector2();
  readonly joystick: VirtualJoystick;
  private readonly keys: Record<(typeof KEYS)[number], Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, opts: { joystickRadius?: number; joystickFollowMargin?: number } = {}) {
    this.joystick = new VirtualJoystick(scene, opts.joystickRadius, opts.joystickFollowMargin);
    this.keys = scene.input.keyboard!.addKeys(KEYS.join(',')) as typeof this.keys;
  }

  /** À appeler une fois par frame. */
  update(): Phaser.Math.Vector2 {
    const v = this.vector.reset();
    if (this.joystick.active) return v.copy(this.joystick.vector);
    const k = this.keys;
    if (k.LEFT.isDown || k.A.isDown || k.Q.isDown) v.x -= 1;
    if (k.RIGHT.isDown || k.D.isDown) v.x += 1;
    if (k.UP.isDown || k.W.isDown || k.Z.isDown) v.y -= 1;
    if (k.DOWN.isDown || k.S.isDown) v.y += 1;
    return v.lengthSq() > 0 ? v.normalize() : v;
  }

  get active(): boolean {
    return this.vector.lengthSq() > 0.0001;
  }
}

/** Flèches + WASD (QWERTY) + ZQSD (AZERTY). */
const KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D', 'Z', 'Q'] as const;
