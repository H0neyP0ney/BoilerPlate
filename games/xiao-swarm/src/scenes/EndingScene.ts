import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { SCENES } from '../config';
import { t } from '../i18n';

/**
 * Fin de partie (boss final tombé, solo) : une fois la fusée partie, « Congratulations! » / « You beat the game! » en blanc au milieu de l'écran,
 * puis fondu au noir, puis `onDone` (GameScene relance une partie neuve).
 */
export class EndingScene extends Phaser.Scene {
  constructor() {
    super(SCENES.ending);
  }

  create(data: { onDone: () => void }): void {
    const { width, height } = this.scale;
    const style = { fontFamily: theme.font, fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', align: 'center' } as const;
    const title = this.add.text(width / 2, height / 2 - 34, t('endingTitle'), { ...style, fontSize: '68px', strokeThickness: 10 }).setOrigin(0.5).setAlpha(0);
    const sub = this.add.text(width / 2, height / 2 + 40, t('endingSub'), { ...style, fontSize: '38px', strokeThickness: 8 }).setOrigin(0.5).setAlpha(0);
    const black = this.add.rectangle(0, 0, width, height, 0x000000).setOrigin(0).setAlpha(0).setDepth(10);
    this.tweens.add({ targets: title, alpha: 1, scale: { from: 1.25, to: 1 }, duration: 600, ease: 'Back.Out' });
    this.tweens.add({ targets: sub, alpha: 1, delay: 500, duration: 600 });
    this.tweens.add({ targets: black, alpha: 1, delay: 3600, duration: 1400, onComplete: () => data.onDone() });
  }
}
