import Phaser from 'phaser';

/**
 * Joystick flottant : il apparaît là où le joueur pose le doigt.
 * Si le doigt s'éloigne franchement (au-delà du rayon + une marge), le joystick est entraîné (drag) : son centre suit
 * le doigt, qui reste à cette distance, et la direction continue de suivre le doigt sans qu'il faille revenir vers
 * l'ancien centre. Entre le rayon et le rayon + marge, le bouton reste au bord sans que la base bouge.
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
    /** Distance au-delà du rayon avant que la base ne suive le doigt (défaut : la moitié du rayon). */
    private readonly followMargin = radius * 0.5,
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

  /**
   * À appeler une fois par frame. Un relâchement manqué (bouton lâché pendant qu'une autre fenêtre captait les événements, hors de la
   * page…) laisserait le joystick « actif » pour toujours : on le rend quand son pointeur n'est plus enfoncé.
   */
  update(): void {
    if (this.pointerId === null) return;
    const m = this.scene.input.manager;
    const p = [m.mousePointer, ...m.pointers].find((q) => q && q.id === this.pointerId);
    if (!p || !p.isDown) this.release();
  }

  private begin(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== null || !p.isDown) return;
    this.pointerId = p.id;
    this.origin.set(p.x, p.y);
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
    this.vector.reset();
  }

  /** Relâche le joystick (direction nulle, visuels masqués). */
  release(): void {
    this.pointerId = null;
    this.vector.reset();
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }

  private readonly onDown = (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void => {
    if (this.pointerId !== null || over.length > 0) return; // ignore les clics sur l'UI
    this.begin(p);
  }

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    let len = Math.hypot(dx, dy);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    const follow = this.radius + this.followMargin;
    if (len > follow) {
      // le doigt est allé bien au-delà de la base : on déplace le centre pour qu'il reste à la limite de la marge
      const excess = len - follow;
      this.origin.x += nx * excess;
      this.origin.y += ny * excess;
      this.base.setPosition(this.origin.x, this.origin.y);
      len = follow;
    }
    const clamped = Math.min(len, this.radius);
    this.knob.setPosition(this.origin.x + nx * clamped, this.origin.y + ny * clamped);
    this.vector.set(nx * (clamped / this.radius), ny * (clamped / this.radius));
  }

  private readonly onUp = (p: Phaser.Input.Pointer): void => {
    if (p.id !== this.pointerId) return;
    this.release();
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.input.off('pointerupoutside', this.onUp);
  }
}
