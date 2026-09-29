import Phaser from 'phaser';

/**
 * Joystick flottant : il apparaît là où le joueur pose le doigt.
 * Fonctionne aussi à la souris (drag), utile pour tester sur desktop.
 */
export class VirtualJoystick {
  /** Direction normalisée (longueur 0 → 1). */
  readonly vector = new Phaser.Math.Vector2();

  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private pointerId: number | null = null;
  private readonly origin = new Phaser.Math.Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly radius = 70,
  ) {
    this.base = scene.add.circle(0, 0, radius, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.35);
    this.knob = scene.add.circle(0, 0, radius * 0.45, 0xffffff, 0.45);
    this.base.setDepth(1000).setScrollFactor(0).setVisible(false);
    this.knob.setDepth(1001).setScrollFactor(0).setVisible(false);

    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('pointerupoutside', this.onUp);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  private readonly onDown = (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void => {
    if (this.pointerId !== null || over.length > 0) return; // ignore les clics sur l'UI
    this.pointerId = p.id;
    this.origin.set(p.x, p.y);
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
    this.vector.reset();
  }

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, this.radius);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    this.knob.setPosition(this.origin.x + nx * clamped, this.origin.y + ny * clamped);
    this.vector.set(nx * (clamped / this.radius), ny * (clamped / this.radius));
  }

  private readonly onUp = (p: Phaser.Input.Pointer): void => {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.vector.reset();
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.input.off('pointerupoutside', this.onUp);
  }
}
