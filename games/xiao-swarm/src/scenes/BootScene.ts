import Phaser from 'phaser';
import { applyAssets, loadAssets, log, poki, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { ASSETS } from '../assets/manifest';
import { makeAlienTextures } from '../art/aliens';
import { registerDefaultSprites } from '../art/catalog';
import { makeEnvironmentTextures } from '../art/environment';
import { makeFxTextures } from '../art/fx';
import { makeSoldierTextures } from '../art/soldiers';

/**
 * Chargement : planches de sprites du manifeste (avec barre de progression),
 * puis dessin procédural de tout ce qui n'a pas été fourni. Signale ensuite
 * la fin du chargement à Poki et lance directement le jeu (pas d'écran titre).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    if (ASSETS.length === 0) return;
    const { width, height } = this.scale;
    const w = Math.min(420, width * 0.7);
    this.add.text(width / 2, height / 2 - 40, '…', { fontFamily: theme.font, fontSize: '28px', color: PALETTE.textDim }).setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, w, 16, PALETTE.panel).setOrigin(0.5);
    const fill = this.add.rectangle(width / 2 - w / 2, height / 2, 0, 16, PALETTE.primary).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => (fill.width = w * p));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      log.warn(`[assets] introuvable : ${file.src} — visuel procédural conservé`),
    );
    loadAssets(this, ASSETS);
  }

  create(): void {
    const applied = applyAssets(this, ASSETS);
    if (applied.length) log.info('[assets] visuels remplacés :', applied.join(', '));
    // Procédural : canvasTexture ignore les clés déjà chargées (PNG 'image' du même id).
    makeSoldierTextures(this);
    makeAlienTextures(this);
    makeEnvironmentTextures(this);
    makeFxTextures(this);
    registerDefaultSprites();

    poki.gameLoadingFinished();
    this.scene.start(SCENES.game);
  }
}
