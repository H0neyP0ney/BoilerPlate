import Phaser from 'phaser';

/**
 * Panneau de debug (dev uniquement) : FPS + stats libres. Touche ² / ` / F2 pour afficher.
 * En build de prod, `DebugOverlay.create` renvoie undefined et tout est tree-shaké.
 *
 *   const dbg = DebugOverlay.create(this);
 *   dbg?.set('enemies', enemies.length);
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly stats = new Map<string, string | number>();
  private readonly cheats: { key: string; label: string }[] = [];
  private elapsed = 0;

  static create(scene: Phaser.Scene): DebugOverlay | undefined {
    return import.meta.env.DEV ? new DebugOverlay(scene) : undefined;
  }

  private constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#7CFFB2',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(1e6)
      .setVisible(false);
    const toggle = () => this.text.setVisible(!this.text.visible);
    scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === 'F2') toggle();
    });
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.refresh);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.refresh));
  }

  set(key: string, value: string | number): void {
    this.stats.set(key, value);
  }

  /** Raccourci de triche : `dbg?.cheat('K', 'kill all', () => …)`. */
  cheat(key: string, label: string, fn: () => void): void {
    this.cheats.push({ key, label });
    this.scene.input.keyboard?.on(`keydown-${key}`, fn);
  }

  private readonly refresh = (_t: number, delta: number): void => {
    this.elapsed += delta;
    if (!this.text.visible || this.elapsed < 250) return;
    this.elapsed = 0;
    const lines = [`fps ${this.scene.game.loop.actualFps.toFixed(0)}`];
    for (const [k, v] of this.stats) lines.push(`${k} ${typeof v === 'number' ? Math.round(v * 10) / 10 : v}`);
    for (const c of this.cheats) lines.push(`[${c.key}] ${c.label}`);
    this.text.setText(lines.join('\n'));
  };
}
