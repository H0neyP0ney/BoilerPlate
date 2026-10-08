import Phaser from 'phaser';
import { Button, device, music, sfx, StepSlider, theme, DEV_TOOLS } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { i18n, LANGS, LANG_NAMES, t, type Lang } from '../i18n';
import { MUSIC_STEPS, settings, SFX } from '../settings';
import type { GameScene } from './GameScene';
import { buildHotkeysPage } from './hotkeysPage';

export interface OptionsData {
  /** Ouvert depuis le HUD en solo : la partie a été mise en pause et reprend à la fermeture. */
  resumeGame?: boolean;
  /** Page à afficher : le menu (défaut) ou la page des raccourcis clavier (Hotkeys). */
  page?: 'hotkeys';
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
    if (data?.page === 'hotkeys') {
      buildHotkeysPage(this, () => this.scene.restart({ resumeGame: this.resumeGame })); // « Retour » : le menu, sans toucher à la partie en pause
      return;
    }
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
    if (DEV_TOOLS) {
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
    // Raccourcis clavier (déplacement, choix d'upgrade, relance) : seulement avec un clavier, donc pas sur téléphone.
    const hotkeysBtn = device.isTouch
      ? undefined
      : new Button(this, 0, 0, { label: t('hotkeys'), variant: 'secondary', width: 340, height: 56, onClick: () => this.scene.restart({ resumeGame: this.resumeGame, page: 'hotkeys' }) });
    // Rejouer le tutoriel (et donc la première expérience) : après confirmation, la partie en cours est quittée et une nouvelle démarre avec le tutoriel.
    const tutorialBtn = new Button(this, 0, 0, {
      label: t('replayTutorial'),
      variant: 'secondary',
      width: 340,
      height: 56,
      onClick: () => this.confirmReplayTutorial(),
    });
    // Langue : bascule anglais / français (mémorisée) ; la scène se redessine dans la nouvelle langue
    const langBtn: Button = new Button(this, 0, 0, {
      label: `${t('language')} : ${LANG_NAMES[(i18n.lang as Lang) in LANG_NAMES ? (i18n.lang as Lang) : 'en']}`,
      variant: 'secondary',
      width: 340,
      height: 56,
      onClick: () => {
        const cur = LANGS.indexOf(i18n.lang as Lang);
        settings.setLang(LANGS[(cur + 1) % LANGS.length]);
        this.scene.restart({ resumeGame: this.resumeGame });
      },
    });
    const close = new Button(this, 0, 0, { label: t('close'), width: 260, height: 64, onClick: () => this.close() });
    for (const key of ['ESC', 'ENTER']) this.input.keyboard!.on(`keydown-${key}`, () => this.close());

    const layout = () => {
      const { width: w, height: h } = this.scale;
      const pw = Math.min(520, w - 32);
      const ph = (debugBtn ? 610 : 540) + (hotkeysBtn ? 70 : 0);
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
      let by = top + 330;
      if (hotkeysBtn) {
        hotkeysBtn.setPosition(cx, by);
        by += 70;
      }
      tutorialBtn.setPosition(cx, by);
      langBtn.setPosition(cx, by + 70);
      debugBtn?.setPosition(cx, by + 140);
      close.setPosition(cx, top + ph - 52);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
  }

  /** Fenêtre oui / non par-dessus le menu ; « Oui » quitte la partie en cours et relance une partie avec le tutoriel. */
  private confirmReplayTutorial(): void {
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const cy = h / 2;
    const items: Phaser.GameObjects.GameObject[] = [];
    const veil = this.add.rectangle(0, 0, w, h, 0x0a1422, 0.6).setOrigin(0).setInteractive().setDepth(10);
    const pw = Math.min(460, w - 32);
    const box = this.add.graphics().setDepth(10);
    box.fillStyle(PALETTE.panel, 1).fillRoundedRect(cx - pw / 2, cy - 110, pw, 220, 16);
    box.lineStyle(3, PALETTE.panelBorder, 1).strokeRoundedRect(cx - pw / 2, cy - 110, pw, 220, 16);
    const msg = this.add
      .text(cx, cy - 50, t('replayTutorialConfirm'), { fontFamily: theme.font, fontSize: '24px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 48 } })
      .setOrigin(0.5)
      .setDepth(10);
    const bw = Math.min(180, (pw - 72) / 2);
    const no = new Button(this, cx - bw / 2 - 12, cy + 50, { label: t('no'), variant: 'secondary', width: bw, height: 56, onClick: () => items.forEach((o) => o.destroy()) });
    const yes = new Button(this, cx + bw / 2 + 12, cy + 50, {
      label: t('yes'),
      width: bw,
      height: 56,
      onClick: () => {
        settings.setTutorialDone(false);
        this.resumeGame = false; // la partie en cours est abandonnée : rien à reprendre
        const game = this.scene.get(SCENES.game) as GameScene;
        this.scene.stop(SCENES.pause);
        this.scene.stop();
        void game.retry();
      },
    });
    no.setDepth(11);
    yes.setDepth(11);
    items.push(veil, box, msg, no, yes);
  }

  private close(): void {
    const resume = this.resumeGame;
    this.resumeGame = false;
    this.scene.stop();
    if (resume) void (this.scene.get(SCENES.game) as GameScene).resumeGame({ ad: false });
  }
}
