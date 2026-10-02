import Phaser from 'phaser';
import type { HostSession } from '../net/HostSession';

const DEPTH = 5000;

/**
 * Debug des coéquipiers IA (dev, hôte coop) : étiquette « BOT standard / expert » au-dessus de chaque squad, flèche de son
 * déplacement, cercle sur sa cible de ramassage, couleur selon la menace (vert → rouge). Dessiné dans le monde du jeu.
 */
export class BotOverlay {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: HostSession,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    scene.events.once('shutdown', () => {
      this.g.destroy();
      for (const t of this.labels.values()) t.destroy();
      this.labels.clear();
    });
  }

  update(): void {
    const g = this.g;
    g.clear();
    const seen = new Set<string>();
    for (const [id, bot] of this.host.bots) {
      const sq = this.host.sim.squadOf(id);
      if (!sq || !sq.alive) continue;
      seen.add(id);
      const { x, y } = sq.center;
      const info = bot.info;
      const color = Phaser.Display.Color.GetColor(Math.round(255 * info.threat), Math.round(255 * (1 - info.threat * 0.6)), 80);
      let label = this.labels.get(id);
      if (!label) {
        label = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH);
        this.labels.set(id, label);
      }
      label.setText(`BOT ${bot.level === 'expert' ? 'expert' : 'standard'}`).setPosition(x, y - sq.radius - 28).setColor('#' + color.toString(16).padStart(6, '0'));
      g.lineStyle(3, color, 0.9).strokeCircle(x, y, sq.radius + 8);
      const dx = bot.lastMoveX;
      const dy = bot.lastMoveY;
      if (dx !== 0 || dy !== 0) g.lineStyle(4, color, 0.95).lineBetween(x, y, x + dx * 90, y + dy * 90);
      if (info.hasTarget) g.lineStyle(2, info.holding ? 0xffd166 : 0x5aa8ff, 0.8).strokeCircle(info.targetX, info.targetY, 18).lineBetween(x, y, info.targetX, info.targetY);
    }
    for (const [id, label] of this.labels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }
}
