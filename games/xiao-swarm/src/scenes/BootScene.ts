import Phaser from 'phaser';
import { applyAssets, loadAssets, log, poki, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { ASSETS } from '../assets/manifest';
import { makeAlienTextures } from '../art/aliens';
import { registerDefaultSprites } from '../art/catalog';
import { loadFxOverrides } from '../debugFx';
import { loadObstacleOverrides } from '../debugObstacles';
import { loadSpriteOverrides } from '../debugSprites';
import { loadWaveOverrides } from '../debugWaves';
import { makeEnvironmentTextures } from '../art/environment';
import { makeFxTextures } from '../art/fx';
import { makeSoldierTextures } from '../art/soldiers';
import { t } from '../i18n';
import { createOnlineSession, OnlineError, readOnlineRequest } from '../online';

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
    if (import.meta.env.DEV) {
      // dev : réglages édités dans les visionneuses (particules, obstacles) ; code éliminé du build Poki
      loadFxOverrides();
      loadObstacleOverrides();
      loadWaveOverrides();
    }
    registerDefaultSprites();
    if (import.meta.env.DEV) loadSpriteOverrides(); // dev : placements édités dans la visionneuse d'unités

    poki.gameLoadingFinished();
    void this.launch();
  }

  /** Partie en ligne si l'URL le demande (?net=host / join / auto), sinon solo. Repli solo en cas d'échec. */
  private async launch(): Promise<void> {
    // Dev : `?viewer` (unités), `?particles`, `?obstacles`, `?misc` ou `?waves` ouvrent directement la visionneuse correspondante.
    if (import.meta.env.DEV && poki.getURLParam('viewer') !== undefined) return void this.scene.start(SCENES.viewer);
    if (import.meta.env.DEV && poki.getURLParam('obstacles') !== undefined) return void this.scene.start(SCENES.obstacles);
    if (import.meta.env.DEV && poki.getURLParam('particles') !== undefined) return void this.scene.start(SCENES.particles);
    if (import.meta.env.DEV && poki.getURLParam('misc') !== undefined) return void this.scene.start(SCENES.misc);
    if (import.meta.env.DEV && poki.getURLParam('waves') !== undefined) return void this.scene.start(SCENES.waves);
    const req = readOnlineRequest();
    if (req) {
      const { width, height } = this.scale;
      const status = this.add
        .text(width / 2, height / 2, t('connecting'), { fontFamily: theme.font, fontSize: '28px', color: PALETTE.textDim })
        .setOrigin(0.5);
      try {
        this.registry.set('session', await createOnlineSession(req));
      } catch (e) {
        log.warn('[online]', e);
        const reason = e instanceof OnlineError ? e.reason : 'failed';
        const key = reason === 'not-found' ? 'roomNotFound' : reason === 'full' ? 'roomFull' : reason === 'version' ? 'versionMismatch' : 'connectFailed';
        status.setText(t(key));
        await new Promise((resolve) => setTimeout(resolve, 2200));
      }
    }
    this.scene.start(SCENES.game);
  }
}
