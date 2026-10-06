import Phaser from 'phaser';
import { Button, poki, storage, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { t } from '../i18n';
import { buildScoreboard, scoreboardHeight, type ScoreRow } from '../view/Scoreboard';
import type { GameScene } from './GameScene';

export interface GameOverData {
  victory: boolean;
  time: number;
  kills: number;
  best: number;
  canRevive: boolean;
  /** Partie qui suit le tutoriel : seul bouton « Free Revive » (revive offert, onde de choc létale). */
  freeRevive?: boolean;
  /** Scoreboard : un joueur par ligne (aliens tués, dégâts totaux). */
  scores: ScoreRow[];
  /** Remplace le titre (ex. connexion perdue). */
  title?: string;
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
    // le scoreboard agrandit le panneau : le haut remonte de la moitié, le bas descend de la moitié (le tout reste centré)
    const sbH = data.scores.length > 0 ? scoreboardHeight(data.scores.length) + 24 : 0;
    const up = sbH / 2;
    const panel = this.add.graphics();
    panel.fillStyle(PALETTE.panel, 0.95).fillRoundedRect(cx - 260, cy - 250 - up, 520, 460 + sbH, 20);
    panel.lineStyle(3, PALETTE.panelBorder, 1).strokeRoundedRect(cx - 260, cy - 250 - up, 520, 460 + sbH, 20);

    this.add
      .text(cx, cy - 195 - up, data.title ?? (data.victory ? t('victory') : t('gameOver')), {
        fontFamily: theme.font,
        fontSize: '42px',
        color: data.victory ? '#ffe066' : '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 480 },
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 130 - up, t('survived', { time: fmt(data.time), kills: data.kills }), {
        fontFamily: theme.font,
        fontSize: '24px',
        color: PALETTE.textDim,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 96 - up, t('best', { value: fmt(data.best) }), { fontFamily: theme.font, fontSize: '20px', color: PALETTE.textDim })
      .setOrigin(0.5);

    if (data.scores.length > 0) buildScoreboard(this, cx, cy - 70 - up, data.scores);
    if (data.freeRevive) {
      // partie qui suit le tutoriel : un seul bouton, le revive offert
      const free: Button = new Button(this, cx, cy + 5 + up, { label: t('freeRevive'), width: 360, height: 88, onClick: () => this.revive(free, true) });
      poki.measure('reward', 'free_revive', 'visible'); // affiché, puis `interact` au clic (RunFlow.reviveFree)
      this.input.keyboard!.on('keydown-ENTER', () => free.trigger());
      this.input.keyboard!.on('keydown-SPACE', () => free.trigger());
      return;
    }
    const retry = new Button(this, cx, cy + 5 + up, { label: t('retry'), width: 360, height: 88, onClick: () => this.retry() });

    if (data.canRevive) {
      const revive: Button = new Button(this, cx, cy + 115 + up, {
        label: t('revive'),
        variant: 'rewarded',
        width: 340,
        height: 72,
        onClick: () => this.revive(revive),
      });
      poki.measure('reward', 'revive', 'visible'); // affiché, puis `interact` au clic (RunFlow.revive)
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

  private async revive(button: Button, free = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (await this.gameScene.revive(free)) {
      this.scene.stop();
      return;
    }
    button.setEnabled(false);
    this.busy = false;
  }
}
