import Phaser from 'phaser';
import { VirtualJoystick } from '../ui/VirtualJoystick';

/**
 * Direction de déplacement unifiée : joystick flottant (tactile + drag souris)
 * ou clavier (flèches, WASD, ZQSD, pavé numérique 1-9). `vector` a une longueur entre 0 et 1.
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
    // pavé numérique : 8 2 4 6 = haut bas gauche droite, 7 9 1 3 = diagonales
    const left = k.LEFT.isDown || k.A.isDown || k.Q.isDown || k.NUMPAD_FOUR.isDown || k.NUMPAD_SEVEN.isDown || k.NUMPAD_ONE.isDown;
    const right = k.RIGHT.isDown || k.D.isDown || k.NUMPAD_SIX.isDown || k.NUMPAD_NINE.isDown || k.NUMPAD_THREE.isDown;
    const up = k.UP.isDown || k.W.isDown || k.Z.isDown || k.NUMPAD_EIGHT.isDown || k.NUMPAD_SEVEN.isDown || k.NUMPAD_NINE.isDown;
    const down = k.DOWN.isDown || k.S.isDown || k.NUMPAD_TWO.isDown || k.NUMPAD_ONE.isDown || k.NUMPAD_THREE.isDown;
    if (left) v.x -= 1;
    if (right) v.x += 1;
    if (up) v.y -= 1;
    if (down) v.y += 1;
    return v.lengthSq() > 0 ? v.normalize() : v;
  }

  get active(): boolean {
    return this.vector.lengthSq() > 0.0001;
  }
}

/** Flèches + WASD (QWERTY) + ZQSD (AZERTY) + pavé numérique. */
const KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D', 'Z', 'Q', 'NUMPAD_ONE', 'NUMPAD_TWO', 'NUMPAD_THREE', 'NUMPAD_FOUR', 'NUMPAD_SIX', 'NUMPAD_SEVEN', 'NUMPAD_EIGHT', 'NUMPAD_NINE'] as const;
