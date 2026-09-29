import Phaser from 'phaser';
import { Button, storage, theme } from '@xiao/engine';
import { COLORS, SCENES } from '../config';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

export interface GameOverData {
  score: number;
  best: number;
  canRevive: boolean;
}

/**
 * Écran de fin. Règles Poki sur les boutons rewarded :
 *  - le bouton standard ("Rejouer") est toujours présent, en même temps que le rewarded ;
 *  - il est au moins aussi grand, et placé au-dessus ou à côté ;
 *  - le rewarded a l'icône vidéo et n'est pas vert ;
 *  - une seule vidéo par récompense, pas de message "adblock détecté".
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

    this.add.rectangle(0, 0, width, height, 0x000000, 0.65).setOrigin(0).setInteractive();
    this.add
      .text(cx, cy - 190, t('gameOver'), { fontFamily: theme.font, fontSize: '64px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 115, `${t('score', { value: data.score })}   ·   ${t('best', { value: data.best })}`, {
        fontFamily: theme.font,
        fontSize: '28px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    const retry = new Button(this, cx, cy, { label: t('retry'), width: 340, height: 88, onClick: () => this.retry() });

    if (data.canRevive) {
      const revive: Button = new Button(this, cx, cy + 105, {
        label: t('revive'),
        variant: 'rewarded',
        width: 300,
        height: 72,
        onClick: () => this.revive(revive),
      });
    }

    if (!storage.isPersistent()) {
      this.add
        .text(cx, height - 40, t('noSave'), { fontFamily: theme.font, fontSize: '18px', color: COLORS.textDim })
        .setOrigin(0.5);
    }

    this.input.keyboard!.on('keydown-ENTER', () => retry.trigger());
    this.input.keyboard!.on('keydown-SPACE', () => retry.trigger());
  }

  private get game_(): GameScene {
    return this.scene.get(SCENES.game) as GameScene;
  }

  private async retry(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.scene.stop();
    await this.game_.retry();
  }

  private async revive(button: Button): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (await this.game_.revive()) {
      this.scene.stop();
      return;
    }
    // Pas de récompense (pub non vue / bloquée) : on désactive simplement le bouton.
    button.setEnabled(false);
    this.busy = false;
  }
}
