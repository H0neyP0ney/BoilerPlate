import Phaser from 'phaser';
import { Button, music, sfx, StepSlider, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { t } from '../i18n';
import { MUSIC_STEPS, settings, SFX } from '../settings';
import type { GameScene } from './GameScene';

export interface OptionsData {
  /** Ouvert depuis le HUD en solo : la partie a été mise en pause et reprend à la fermeture. */
  resumeGame?: boolean;
}

/**
 * Menu Options (joueur) : volume de la musique et des bruitages (réglettes à 10 crans) et, en dev seulement, le mode debug qui affiche les
 * boutons des outils de dev en haut à gauche du HUD. Overlay par-dessus le jeu ou l'écran de pause.
 */
export class OptionsScene extends Phaser.Scene {
  private resumeGame = false;

  constructor() {
    super(SCENES.options);
  }

  create(data: OptionsData): void {
    this.resumeGame = data?.resumeGame === true;
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x0a1422, 0.75).setOrigin(0).setInteractive();
    const panel = this.add.graphics();
    const title = this.add
      .text(0, 0, t('options'), { fontFamily: theme.font, fontSize: '48px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    const label = (text: string) =>
      this.add.text(0, 0, text, { fontFamily: theme.font, fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const musicLabel = label(t('music'));
    const musicValue = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '22px', color: PALETTE.textDim })
      .setOrigin(1, 0.5);
    const showValue = (v: number) => musicValue.setText(v === 0 ? t('off') : `${v} / ${MUSIC_STEPS}`);
    showValue(settings.musicVolume);
    const slider = new StepSlider(this, 0, 0, {
      width: 340,
      steps: MUSIC_STEPS,
      value: settings.musicVolume,
      onChange: (v) => {
        settings.setMusicVolume(v);
        music.setVolume(this.game, settings.musicGain());
        showValue(v);
      },
    });
    const sfxLabel = label(t('sfx'));
    const sfxValue = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '22px', color: PALETTE.textDim })
      .setOrigin(1, 0.5);
    const showSfx = (v: number) => sfxValue.setText(v === 0 ? t('off') : `${v} / ${MUSIC_STEPS}`);
    showSfx(settings.sfxVolume);
    const sfxSlider = new StepSlider(this, 0, 0, {
      width: 340,
      steps: MUSIC_STEPS,
      value: settings.sfxVolume,
      onChange: (v) => {
        settings.setSfxVolume(v);
        sfx.setVolume(settings.sfxGain());
        showSfx(v);
        sfx.play(this, SFX.blaster.key, SFX.blaster); // aperçu du volume
      },
    });

    // Mode debug : uniquement en dev (les outils de dev n'existent pas dans le build Poki).
    let debugBtn: Button | undefined;
    if (import.meta.env.DEV) {
      const debugLabel = () => `${t('debugMode')} : ${settings.debugMode ? t('on') : t('off')}`;
      debugBtn = new Button(this, 0, 0, {
        label: debugLabel(),
        variant: 'secondary',
        width: 340,
        height: 56,
        onClick: () => {
          settings.setDebugMode(!settings.debugMode);
          debugBtn?.destroy();
          this.scene.restart({ resumeGame: this.resumeGame }); // relabel simple : la scène se redessine
        },
      });
    }
    // Tutoriel au démarrage (réglage mémorisé) : activé, il se lance au début de la prochaine partie solo ; il se désactive tout seul
    // une fois terminé (voir `settings.tutorialDone`) ; le réactiver ici permet de le rejouer.
    const tutorialLabel = () => `${t('tutorialAtStart')} : ${settings.tutorialDone ? t('off') : t('on')}`;
    const tutorialBtn = new Button(this, 0, 0, {
      label: tutorialLabel(),
      variant: 'secondary',
      width: 340,
      height: 56,
      onClick: () => {
        settings.setTutorialDone(!settings.tutorialDone);
        tutorialBtn.destroy();
        this.scene.restart({ resumeGame: this.resumeGame }); // relabel simple : la scène se redessine
      },
    });
    const close = new Button(this, 0, 0, { label: t('close'), width: 260, height: 64, onClick: () => this.close() });
    for (const key of ['ESC', 'ENTER']) this.input.keyboard!.on(`keydown-${key}`, () => this.close());

    const layout = () => {
      const { width: w, height: h } = this.scale;
      const pw = Math.min(520, w - 32);
      const ph = debugBtn ? 540 : 470;
      const cx = w / 2;
      const top = h / 2 - ph / 2;
      dim.setSize(w, h);
      panel.clear();
      panel.fillStyle(PALETTE.panel, 0.96).fillRoundedRect(cx - pw / 2, top, pw, ph, 18);
      panel.lineStyle(3, PALETTE.panelBorder, 1).strokeRoundedRect(cx - pw / 2, top, pw, ph, 18);
      title.setPosition(cx, top + 48);
      musicLabel.setPosition(cx - 170, top + 112);
      musicValue.setPosition(cx + 170, top + 112);
      slider.setPosition(cx, top + 158).setScale(Math.min(1, (pw - 60) / 360));
      sfxLabel.setPosition(cx - 170, top + 202);
      sfxValue.setPosition(cx + 170, top + 202);
      sfxSlider.setPosition(cx, top + 248).setScale(Math.min(1, (pw - 60) / 360));
      tutorialBtn.setPosition(cx, top + 330);
      debugBtn?.setPosition(cx, top + 400);
      close.setPosition(cx, top + ph - 52);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
  }

  private close(): void {
    const resume = this.resumeGame;
    this.resumeGame = false;
    this.scene.stop();
    if (resume) void (this.scene.get(SCENES.game) as GameScene).resumeGame({ ad: false });
  }
}
