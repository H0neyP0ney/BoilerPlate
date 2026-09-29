import Phaser from 'phaser';
import { poki, theme } from '@xiao/engine';
import { COLORS, SCENES } from '../config';
import { t } from '../i18n';

/**
 * Chargement des assets ESSENTIELS (premier niveau jouable).
 * Poki : < 5 Mo au démarrage, < 8 Mo au total, joueurs perdus après ~10 s.
 * Le reste (niveaux suivants, musiques) se charge en arrière-plan pendant le jeu.
 *
 * Tous les fichiers vont dans /public/assets (aucune requête externe autorisée).
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  preload(): void {
    const { width, height } = this.scale;
    const barW = Math.min(420, width * 0.7);
    const barH = 18;

    this.add
      .text(width / 2, height / 2 - 40, t('loading'), { fontFamily: theme.font, fontSize: '28px', color: COLORS.textDim })
      .setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, barW, barH, COLORS.panel).setOrigin(0.5);
    const fill = this.add.rectangle(width / 2 - barW / 2, height / 2, 0, barH, COLORS.primary).setOrigin(0, 0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      fill.width = barW * p;
    });

    this.load.setPath('assets');
    // Exemples :
    // this.load.image('bg', 'bg.webp');
    // this.load.spritesheet('hero', 'hero.png', { frameWidth: 64, frameHeight: 64 });
    // this.load.audio('coin', ['coin.ogg', 'coin.mp3']);
  }

  create(): void {
    poki.gameLoadingFinished();
    // Pas d'écran titre : Poki recommande d'envoyer le joueur directement en jeu.
    this.scene.start(SCENES.game);
  }
}
