import Phaser from 'phaser';
import { Button, storage, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

export interface GameOverData {
  victory: boolean;
  time: number;
  kills: number;
  best: number;
  canRevive: boolean;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

/**
 * Fin de run. Règles Poki rewarded : "Rejouer" toujours présent, plus grand et au-dessus ;
 * "Relancer l'escouade" avec icône vidéo, non vert, une vidéo = une récompense.
 */
export class GameOverScene extends Phaser.Scene {
  private busy = false;

  constructor() {
    super(SCENES.gameOver);
  }

  create(data: GameOverData): void {
    this.busy = false;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.add.rectangle(0, 0, width, height, 0x0a1422, 0.75).setOrigin(0).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(PALETTE.panel, 0.95).fillRoundedRect(cx - 260, cy - 250, 520, 460, 20);
    panel.lineStyle(3, PALETTE.panelBorder, 1).strokeRoundedRect(cx - 260, cy - 250, 520, 460, 20);

    this.add
      .text(cx, cy - 195, data.victory ? t('victory') : t('gameOver'), {
        fontFamily: theme.font,
        fontSize: '42px',
        color: data.victory ? '#ffe066' : '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 480 },
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 130, t('survived', { time: fmt(data.time), kills: data.kills }), {
        fontFamily: theme.font,
        fontSize: '24px',
        color: PALETTE.textDim,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 96, t('best', { value: fmt(data.best) }), { fontFamily: theme.font, fontSize: '20px', color: PALETTE.textDim })
      .setOrigin(0.5);

    const retry = new Button(this, cx, cy + 5, { label: t('retry'), width: 360, height: 88, onClick: () => this.retry() });

    if (data.canRevive) {
      const revive: Button = new Button(this, cx, cy + 115, {
        label: t('revive'),
        variant: 'rewarded',
        width: 340,
        height: 72,
        onClick: () => this.revive(revive),
      });
    }

    if (!storage.isPersistent()) {
      this.add
        .text(cx, height - 30, t('noSave'), { fontFamily: theme.font, fontSize: '16px', color: PALETTE.textDim })
        .setOrigin(0.5);
    }

    this.input.keyboard!.on('keydown-ENTER', () => retry.trigger());
    this.input.keyboard!.on('keydown-SPACE', () => retry.trigger());
  }

  private get gameScene(): GameScene {
    return this.scene.get(SCENES.game) as GameScene;
  }

  private async retry(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.scene.stop();
    await this.gameScene.retry();
  }

  private async revive(button: Button): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (await this.gameScene.revive()) {
      this.scene.stop();
      return;
    }
    button.setEnabled(false);
    this.busy = false;
  }
}
