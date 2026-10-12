import Phaser from 'phaser';
import { applyAssets, devLog, loadAssets, log, poki, DEV_TOOLS } from '@xiao/engine';
import { SCENES } from '../config';
import { ASSETS, CORE_ASSETS } from '../assets/manifest';
import { latePack } from '../assets/latePack';
import { makeAlienTextures } from '../art/aliens';
import { registerDefaultSprites } from '../art/catalog';
import { initPlayerHue } from '../art/playerHue';
import { loadFxOverrides } from '../debugFx';
import { loadObstacleOverrides } from '../debugObstacles';
import { loadSpriteOverrides } from '../debugSprites';
import { loadWaveOverrides } from '../debugWaves';
import { loadMapZoneOverrides } from '../debugMapZones';
import { loadNameOverrides } from '../debugNames';
import { loadStatOverrides } from '../debugStats';
import { loadUpgradeOverrides } from '../debugUpgrades';
import { makeEnvironmentTextures } from '../art/environment';
import { makeFxTextures } from '../art/fx';
import { makeTurretTextures } from '../art/turret';
import { startUpgradeCardTextures } from '../art/cardTextures';
import { makeSoldierTextures } from '../art/soldiers';
import { makeRecruitTextures } from '../art/recruits';
import { t } from '../i18n';
import { SFX } from '../settings';
import { createOnlineSession, OnlineError, readOnlineRequest } from '../online';
import { hideLoadingScreen, setLoadProgress, setLoadStatus } from '../loadingScreen';

/**
 * Chargement : planches de sprites du manifeste (avec barre de progression),
 * puis dessin procédural de tout ce qui n'a pas été fourni. Signale ensuite
 * la fin du chargement à Poki et lance directement le jeu (pas d'écran titre).
 */
/** La fusée du power-up (`fx_rocket`, dessin procédural) est remplacée par l'image chargée sous `fx_rocket_png`, une fois celle-ci arrivée. */
function useRocketImage(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fx_rocket_png')) return;
  if (scene.textures.exists('fx_rocket')) scene.textures.remove('fx_rocket');
  scene.textures.renameTexture('fx_rocket_png', 'fx_rocket');
}

export class BootScene extends Phaser.Scene {
  /** Assets chargés ici : tout, ou seulement le paquet 1 (le paquet 2 arrive pendant le premier choix d'upgrade, `assets/latePack.ts`). */
  private assets = CORE_ASSETS;

  constructor() {
    super(SCENES.boot);
  }

  /**
   * Tout charger d'emblée : en ligne (on peut rejoindre en cours de partie), tests d'URL qui sautent en avant (`?jump`, `?endtest`) et
   * dev (visionneuses) sauf `?split=1`. Sinon : seulement le paquet 1.
   */
  private needsEverything(): boolean {
    if (readOnlineRequest() || poki.getURLParam('jump') !== undefined || poki.getURLParam('endtest') !== undefined) return true;
    return DEV_TOOLS && poki.getURLParam('split') === undefined;
  }

  preload(): void {
    this.assets = this.needsEverything() ? ASSETS : CORE_ASSETS;
    if (this.assets === ASSETS) for (const s of Object.values(SFX)) this.load.audio(s.key, s.url); // bruitages courts : chargés d'emblée seulement si tout l'est, sinon avec le paquet 2 (`latePack.ensure`)
    if (this.assets.length === 0) return;
    // écran de chargement : celui de la page HTML (logo XIAO Games, fond bleu dégradé, barre), piloté ici (`loadingScreen.ts`)
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => setLoadProgress(p));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) =>
      log.warn(`[assets] introuvable : ${file.src} — visuel procédural conservé`),
    );
    devLog(this.assets === ASSETS ? 'mode : TOUT chargé d\'emblée (dev, ?jump, en ligne… ; ajouter &split=1 pour le découpage en 2 paquets)' : 'mode : paquet 1 seulement (paquet 2 plus tard)', 'warn');
    this.load.on(Phaser.Loader.Events.FILE_LOAD, (file: Phaser.Loader.File) => devLog(`+ ${file.key} (${file.type})`)); // console de log en jeu (dev / ?debug=1)
    this.load.once(Phaser.Loader.Events.COMPLETE, () => devLog(`chargement initial terminé (${this.assets.length} entrées)`));
    loadAssets(this, this.assets);
  }

  create(): void {
    if (this.assets === ASSETS) latePack.markLoaded();
    devLog('create : application des assets + textures procédurales…');
    const t0 = performance.now();
    const applied = applyAssets(this, this.assets);
    if (applied.length) log.info('[assets] visuels remplacés :', applied.join(', '));
    if (DEV_TOOLS) {
      // dev : réglages édités dans les visionneuses (particules, obstacles) ; code éliminé du build Poki.
      // Avant les textures : la recrue composée dépend des réglages d'effets (FX.recruit).
      loadFxOverrides();
      loadObstacleOverrides();
      loadWaveOverrides();
      loadMapZoneOverrides();
      loadNameOverrides();
    }
    // Procédural : canvasTexture ignore les clés déjà chargées (PNG 'image' du même id).
    makeRecruitTextures(this); // recrues composées (pièces fournies) avant les recrues procédurales de repli
    if (!latePack.ready) latePack.onReady(() => startUpgradeCardTextures(this)); // image de base des cartes dans le paquet 2 : fabrication des fonds à son arrivée
    if (!latePack.ready) latePack.onReady(() => makeRecruitTextures(this)); // pièces de la recrue dans le paquet 2 : composée à son arrivée (d'ici là, recrue procédurale)
    makeSoldierTextures(this);
    makeAlienTextures(this);
    makeEnvironmentTextures(this);
    makeFxTextures(this);
    makeTurretTextures(this);
    useRocketImage(this);
    if (!latePack.ready) latePack.onReady(() => useRocketImage(this)); // fusée du Rocket barrage : image dans le paquet 2
    startUpgradeCardTextures(this); // fonds des cartes d'upgrade (une carte de base recolorée par upgrade + la prismatique), fabriqués en tâche de fond
    registerDefaultSprites();
    if (DEV_TOOLS) loadUpgradeOverrides(); // dev : upgrades éditées dans la visionneuse d'upgrades
    if (DEV_TOOLS) loadStatOverrides(); // dev : stats éditées dans la visionneuse d'unités
    if (DEV_TOOLS) loadSpriteOverrides(); // dev : placements édités dans la visionneuse d'unités
    initPlayerHue(this); // soldats et têtes de recrue recolorés : fabriqués à la demande (première squad d'un autre emplacement de joueur), plus au lancement

    devLog(`create : terminé en ${Math.round(performance.now() - t0)} ms`);
    poki.gameLoadingFinished();
    void this.launch();
  }

  /** Partie en ligne si l'URL le demande (?net=host / join / auto), sinon solo. Repli solo en cas d'échec. */
  private async launch(): Promise<void> {
    // Dev : `?viewer` (unités), `?particles`, `?obstacles`, `?misc`, `?bonus` ou `?waves` ouvrent directement la visionneuse correspondante.
    if (DEV_TOOLS && poki.getURLParam('viewer') !== undefined) return void this.go(SCENES.viewer);
    if (DEV_TOOLS && poki.getURLParam('obstacles') !== undefined) return void this.go(SCENES.obstacles);
    if (DEV_TOOLS && poki.getURLParam('particles') !== undefined) return void this.go(SCENES.particles);
    if (DEV_TOOLS && poki.getURLParam('misc') !== undefined) return void this.go(SCENES.misc);
    if (DEV_TOOLS && poki.getURLParam('bonus') !== undefined) return void this.go(SCENES.bonus);
    if (DEV_TOOLS && poki.getURLParam('upgrades') !== undefined) return void this.go(SCENES.upgrades);
    if (DEV_TOOLS && poki.getURLParam('waves') !== undefined) return void this.go(SCENES.waves);
    if (DEV_TOOLS && poki.getURLParam('mapedit') !== undefined) return void this.go(SCENES.mapEditor);
    const req = readOnlineRequest();
    if (req) {
      setLoadStatus(t('connecting')); // sous la barre de l'écran de chargement HTML
      try {
        this.registry.set('session', await createOnlineSession(req));
      } catch (e) {
        log.warn('[online]', e);
        const reason = e instanceof OnlineError ? e.reason : 'failed';
        const key = reason === 'not-found' ? 'roomNotFound' : reason === 'full' ? 'roomFull' : reason === 'version' ? 'versionMismatch' : 'connectFailed';
        setLoadStatus(t(key));
        await new Promise((resolve) => setTimeout(resolve, 2200));
      }
    }
    this.go(SCENES.game);
  }

  /** Lance la scène suivante et retire l'écran de chargement (fondu). */
  private go(key: string): void {
    hideLoadingScreen();
    this.scene.start(key);
  }
}
