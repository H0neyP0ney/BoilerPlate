import Phaser from 'phaser';
import { VirtualJoystick } from '../ui/VirtualJoystick';

/** Touches de déplacement rebindables, par code PHYSIQUE (`KeyboardEvent.code` : « KeyW » est la touche à la place du W d'un clavier QWERTY, donc Z sur un AZERTY). */
export interface MoveKeyCodes {
  up: string;
  down: string;
  left: string;
  right: string;
}

/** Par défaut : WASD (position physique : ZQSD sur un clavier AZERTY, sans rien à régler). */
export const DEFAULT_MOVE_KEYS: MoveKeyCodes = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

/**
 * Direction de déplacement unifiée : joystick flottant (tactile + drag souris)
 * ou clavier (touches rebindables, par défaut WASD ; flèches et pavé numérique 1-9 toujours actifs). `vector` a une longueur entre 0 et 1.
 */
export class MoveInput {
  readonly vector = new Phaser.Math.Vector2();
  readonly joystick: VirtualJoystick;
  /** Joystick « tout ou rien » : dès qu'une direction est détectée (au-delà de `DEADZONE` du rayon), la vitesse est maximale (longueur 1). */
  private readonly fullSpeed: boolean;
  private readonly keys: Record<(typeof KEYS)[number], Phaser.Input.Keyboard.Key>;
  /** Codes physiques des touches actuellement enfoncées (pour les touches rebindables). */
  private readonly pressed = new Set<string>();
  private readonly keyCodes: () => MoveKeyCodes;

  constructor(
    scene: Phaser.Scene,
    opts: {
      joystickRadius?: number;
      joystickFollowMargin?: number;
      joystickFullSpeed?: boolean;
      /** Touches de déplacement, relues à chaque image (un changement dans les options s'applique tout de suite). Défaut : WASD. */
      keyCodes?: () => MoveKeyCodes;
    } = {},
  ) {
    this.fullSpeed = opts.joystickFullSpeed === true;
    this.keyCodes = opts.keyCodes ?? (() => DEFAULT_MOVE_KEYS);
    this.joystick = new VirtualJoystick(scene, opts.joystickRadius, opts.joystickFollowMargin);
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys(KEYS.join(',')) as typeof this.keys;
    kb.on('keydown', (e: KeyboardEvent) => this.pressed.add(e.code));
    kb.on('keyup', (e: KeyboardEvent) => this.pressed.delete(e.code));
    // fenêtre qui perd le focus : les « keyup » ne viendront jamais, aucune touche ne doit rester enfoncée
    const release = (): void => this.pressed.clear();
    scene.game.events.on(Phaser.Core.Events.BLUR, release);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(Phaser.Core.Events.BLUR, release));
  }

  /** À appeler une fois par frame. */
  update(): Phaser.Math.Vector2 {
    const v = this.vector.reset();
    this.joystick.update();
    if (this.joystick.active) {
      v.copy(this.joystick.vector);
      if (!this.fullSpeed) return v;
      return v.length() > DEADZONE ? v.normalize() : v.reset();
    }
    const k = this.keys;
    const c = this.keyCodes();
    const p = this.pressed;
    // pavé numérique : 8 2 4 6 = haut bas gauche droite, 7 9 1 3 = diagonales
    const left = k.LEFT.isDown || p.has(c.left) || k.NUMPAD_FOUR.isDown || k.NUMPAD_SEVEN.isDown || k.NUMPAD_ONE.isDown;
    const right = k.RIGHT.isDown || p.has(c.right) || k.NUMPAD_SIX.isDown || k.NUMPAD_NINE.isDown || k.NUMPAD_THREE.isDown;
    const up = k.UP.isDown || p.has(c.up) || k.NUMPAD_EIGHT.isDown || k.NUMPAD_SEVEN.isDown || k.NUMPAD_NINE.isDown;
    const down = k.DOWN.isDown || p.has(c.down) || k.NUMPAD_TWO.isDown || k.NUMPAD_ONE.isDown || k.NUMPAD_THREE.isDown;
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

/** Joystick plein régime : part du rayon sous laquelle le doigt (ou la souris) ne donne aucune direction. */
const DEADZONE = 0.12;

/** Touches toujours actives (non rebindables) : flèches + pavé numérique. Les touches de lettres passent par `keyCodes`. */
const KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'NUMPAD_ONE', 'NUMPAD_TWO', 'NUMPAD_THREE', 'NUMPAD_FOUR', 'NUMPAD_SIX', 'NUMPAD_SEVEN', 'NUMPAD_EIGHT', 'NUMPAD_NINE'] as const;
