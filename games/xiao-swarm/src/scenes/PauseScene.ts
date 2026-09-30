import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { SCENES } from '../config';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

/** Overlay de pause. La reprise passe par RunFlow (commercialBreak → gameplayStart). */
export class PauseScene extends Phaser.Scene {
  private busy = false;

  constructor() {
    super(SCENES.pause);
  }

  create(): void {
    this.busy = false;
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x0a1422, 0.7).setOrigin(0).setInteractive();
    const title = this.add
      .text(width / 2, height / 2 - 120, t('paused'), { fontFamily: theme.font, fontSize: '64px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const resume = new Button(this, width / 2, height / 2 + 10, { label: t('resume'), onClick: () => this.resume() });
    // Recommencer : même mécanisme que « Rejouer » de l'écran de fin (pub entre deux parties, le run repart aussitôt).
    const restart = new Button(this, width / 2, height / 2 + 110, {
      label: t('restart'),
      variant: 'secondary',
      width: 320,
      height: 64,
      onClick: () => this.restart(),
    });

    for (const key of ['ESC', 'P', 'SPACE', 'ENTER']) this.input.keyboard!.on(`keydown-${key}`, () => this.resume());

    const layout = () => {
      const { width: w, height: h } = this.scale;
      dim.setSize(w, h);
      title.setPosition(w / 2, h / 2 - 120);
      resume.setPosition(w / 2, h / 2 + 10);
      restart.setPosition(w / 2, h / 2 + 110);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
  }

  private async restart(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const game = this.scene.get(SCENES.game) as GameScene;
    this.scene.stop();
    await game.retry();
  }

  private async resume(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const game = this.scene.get(SCENES.game) as GameScene;
    this.scene.stop();
    await game.resumeGame();
  }
}
