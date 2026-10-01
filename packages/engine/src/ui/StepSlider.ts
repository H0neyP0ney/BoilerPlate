import Phaser from 'phaser';
import { theme } from './theme';

export interface StepSliderOptions {
  /** Largeur de la piste (px). */
  width?: number;
  /** Nombre de graduations : valeurs entières de 0 à `steps`. */
  steps: number;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Réglette à crans (souris + tactile) : piste, graduations, curseur à glisser ; un clic sur la piste saute au cran le plus proche.
 * Valeurs entières 0 → `steps` (ex. volume sur 10).
 */
export class StepSlider extends Phaser.GameObjects.Container {
  private value: number;
  private readonly knob: Phaser.GameObjects.Graphics;
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly trackW: number;
  private readonly steps: number;
  private readonly onChange: (value: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: StepSliderOptions) {
    super(scene, x, y);
    this.trackW = opts.width ?? 360;
    this.steps = Math.max(1, Math.round(opts.steps));
    this.value = Phaser.Math.Clamp(Math.round(opts.value), 0, this.steps);
    this.onChange = opts.onChange;
    const half = this.trackW / 2;

    const track = scene.add.graphics();
    track.fillStyle(0x000000, 0.45).fillRoundedRect(-half, -6, this.trackW, 12, 6);
    for (let i = 0; i <= this.steps; i++) {
      const tx = -half + (this.trackW * i) / this.steps;
      track.fillStyle(0xffffff, 0.55).fillRect(tx - 1, 12, 2, i % 5 === 0 ? 12 : 8); // graduations (plus longues tous les 5)
    }
    this.fill = scene.add.graphics();
    this.knob = scene.add.graphics();
    this.knob.fillStyle(0x000000, 0.35).fillCircle(0, 3, 16);
    this.knob.fillStyle(theme.primary, 1).fillCircle(0, 0, 16);
    this.knob.lineStyle(3, theme.panelBorder, 0.7).strokeCircle(0, 0, 16);

    const hit = scene.add.zone(0, 0, this.trackW + 40, 56).setInteractive({ useHandCursor: true, draggable: true });
    const pick = (pointer: Phaser.Input.Pointer): void => {
      const local = pointer.x - this.getWorldTransformMatrix().tx;
      const k = Phaser.Math.Clamp((local / this.scaleX + half) / this.trackW, 0, 1);
      this.set(Math.round(k * this.steps));
    };
    hit.on('pointerdown', pick);
    hit.on('drag', (pointer: Phaser.Input.Pointer) => pick(pointer));

    this.add([track, this.fill, this.knob, hit]);
    this.redraw();
    scene.add.existing(this);
  }

  get current(): number {
    return this.value;
  }

  /** Change la valeur (bornée, entière) et prévient `onChange` si elle a changé. */
  set(value: number): void {
    const v = Phaser.Math.Clamp(Math.round(value), 0, this.steps);
    if (v === this.value) return;
    this.value = v;
    this.redraw();
    this.onChange(v);
  }

  private redraw(): void {
    const half = this.trackW / 2;
    const x = -half + (this.trackW * this.value) / this.steps;
    this.fill.clear().fillStyle(theme.primary, 1).fillRoundedRect(-half, -6, Math.max(12, x + half), 12, 6);
    this.knob.setX(x);
  }
}
