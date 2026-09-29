import Phaser from 'phaser';
import { device, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

/**
 * HUD minimal en scène parallèle (non affecté par le zoom caméra) : bouton pause,
 * consigne de contrôle avant le premier input et, en ligne uniquement, le code de la salle à partager.
 */
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private pauseBtn!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Container;
  private roomText!: Phaser.GameObjects.Text;
  private respawnText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    this.game_ = this.scene.get(SCENES.game) as GameScene;
    this.roomText = this.add.text(0, 0, '', {
      fontFamily: theme.font,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#13233a',
      strokeThickness: 4,
    });
    this.respawnText = this.add
      .text(0, 0, t('respawning'), { fontFamily: theme.font, fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 7 })
      .setOrigin(0.5)
      .setVisible(false);
    this.pauseBtn = this.makePauseButton().setVisible(!this.game_.session.online);
    this.hint = this.makeHint();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout));
    this.layout();
  }

  update(): void {
    const g = this.game_;
    const s = g.session;
    this.roomText.setText(
      !s.online ? '' : s.connection === 'lost' ? t('connectionLost') : t('room', { code: s.roomCode ?? '', players: g.playerCount }),
    );
    this.hint.setVisible(g.flow.state === 'ready');
    this.respawnText.setVisible(s.online && s.connection === 'connected' && !g.localSquad?.alive);
  }

  private makePauseButton(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.panel, 0.92).fillRoundedRect(-30, -30, 60, 60, 12);
    g.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(-30, -30, 60, 60, 12);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-11, -13, 8, 26, 2).fillRoundedRect(3, -13, 8, 26, 2);
    const hit = this.add.zone(0, 0, 60, 60).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.game_.pauseGame());
    c.add([g, hit]);
    return c;
  }

  private makeHint(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const label = this.add
      .text(0, 70, device.isTouch ? t('hintDrag') : t('hintKeys'), {
        fontFamily: theme.font,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#13233a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    c.add(label);
    if (device.isTouch) {
      const hand = this.add.image(-60, 0, 'hand').setScale(0.8);
      c.add(hand);
      this.tweens.add({ targets: hand, x: 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      this.tweens.add({ targets: label, scale: 1.06, duration: 600, yoyo: true, repeat: -1 });
    }
    return c;
  }

  private readonly layout = (): void => {
    const { width, height } = this.scale;
    // Décalé sous la pill Poki sur mobile
    const top = device.isTouch ? 70 : 12;
    this.roomText.setPosition(14, top);
    this.pauseBtn.setPosition(width - 44, top + 34);
    this.hint.setPosition(width / 2, height * 0.62);
    this.respawnText.setPosition(width / 2, height / 2);
  };
}
