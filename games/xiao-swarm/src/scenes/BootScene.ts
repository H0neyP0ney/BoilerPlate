import Phaser from 'phaser';
import { applyAssets, devLog, loadAssets, log, poki, DEV_TOOLS, hideMissingTexture } from '@xiao/engine';
import { SCENES } from '../config';
import { recordLaunchTextures } from '../art/launchTextures';
import { ASSETS, CORE_ASSETS } from '../assets/manifest';
import { latePack } from '../assets/latePack';
import { setupTextureWorkshop, startTextureWorkshop } from '../art/textureWorkshop';
import { registerDefaultSprites } from '../art/catalog';
import { initPlayerHue } from '../art/playerHue';
import { loadFxOverrides } from '../debugFx';
import { loadObstacleOverrides } from '../debugObstacles';
import { loadSpriteOverrides } from '../debugSprites';
import { loadWaveOverrides } from '../debugWaves';
import { CORE_SFX } from '../assets/coreSfx';
import { loadSfxOverrides, reloadChangedVariants } from '../debugSfx';
import { loadMapZoneOverrides } from '../debugMapZones';
import { loadNameOverrides } from '../debugNames';
import { loadStatOverrides } from '../debugStats';
import { loadUpgradeOverrides } from '../debugUpgrades';
import { t } from '../i18n';
import { SFX } from '../settings';
import { createOnlineSession, OnlineError, readOnlineRequest } from '../online';
import { hideLoadingScreen, setLoadProgress, setLoadStatus } from '../loadingScreen';

/**
 * Chargement : planches de sprites du manifeste (avec barre de progression),
 * puis dessin procédural de tout ce qui n'a pas été fourni. Signale ensuite
 * la fin du chargement à Poki et lance directement le jeu (pas d'écran titre).
 */
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
    // bruitages : tous d'emblée si tout est chargé ; sinon seulement ceux de `CORE_SFX` (paquet 1), les autres avec le paquet 2a (`latePack.ensure`)
    const sfxNow = this.assets === ASSETS ? Object.values(SFX) : CORE_SFX.map((id) => SFX[id]);
    for (const s of sfxNow) this.load.audio(s.key, s.url);
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
    hideMissingTexture(this); // clé absente = rien à l'écran (jamais le carré vert de Phaser) tant que l'image n'est pas chargée ou fabriquée
    if (this.assets === ASSETS) latePack.markLoaded();
    devLog('create : application des assets + textures procédurales…');
    const t0 = performance.now();
    const steps: string[] = []; // durée de chaque étape de fabrication, affichée à la fin (console de log en jeu et console du navigateur)
    const timed = <T>(label: string, fn: () => T): T => {
      const t = performance.now();
      const out = fn();
      steps.push(`${label} ${Math.round(performance.now() - t)} ms`);
      return out;
    };
    const applied = timed('applyAssets', () => applyAssets(this, this.assets));
    if (applied.length) log.info('[assets] visuels remplacés :', applied.join(', '));
    if (DEV_TOOLS) {
      // dev : réglages édités dans les visionneuses (particules, obstacles) ; code éliminé du build Poki.
      // Avant les textures : la recrue composée dépend des réglages d'effets (FX.recruit).
      loadFxOverrides();
      loadObstacleOverrides();
      loadWaveOverrides();
      loadSfxOverrides();
      reloadChangedVariants(this, this.assets === ASSETS); // variante de son choisie dans la page ?sounds ; en mode 2 paquets, les sons absents attendent le paquet 2 (avant, ce rappel les chargeait TOUS au démarrage, en dev et avec ?debug=1)
      loadMapZoneOverrides();
      loadNameOverrides();
    }
    // Procédural : canvasTexture ignore les clés déjà chargées (PNG 'image' du même id).
    // le reste (soldats, replis d'aliens, effets, globes) est DÉCLARÉ à l'atelier de textures, fabriqué en tâche de fond une fois le jeu jouable (`startTextureWorkshop`)
    timed('atelier de textures (déclaration)', () => setupTextureWorkshop(this, this.assets));
    registerDefaultSprites();
    if (DEV_TOOLS) loadUpgradeOverrides(); // dev : upgrades éditées dans la visionneuse d'upgrades
    if (DEV_TOOLS) loadStatOverrides(); // dev : stats éditées dans la visionneuse d'unités
    if (DEV_TOOLS) loadSpriteOverrides(); // dev : placements édités dans la visionneuse d'unités
    initPlayerHue(this); // soldats et têtes de recrue recolorés : fabriqués à la demande (première squad d'un autre emplacement de joueur), plus au lancement

    recordLaunchTextures(this); // textures fabriquées par le code au lancement (lignes roses de la vue Paquets)
    const summary = `create : terminé en ${Math.round(performance.now() - t0)} ms (${steps.join(' · ')})`;
    devLog(summary);
    log.info(`[boot] ${summary}`);
    poki.gameLoadingFinished();
    void this.launch();
  }

  /** Partie en ligne si l'URL le demande (?net=host / join / auto), sinon solo. Repli solo en cas d'échec. */
  private async launch(): Promise<void> {
    // Police Baloo 2 (`@font-face` d'index.html) : attendue avant de créer le moindre texte, sinon Phaser le mesure avec la police de repli.
    try {
      await Promise.race([document.fonts.load('800 16px "Baloo 2"', 'Aa▼é'), new Promise((r) => setTimeout(r, 3000))]);
    } catch {
      /* police indisponible : le repli système sert */
    }
    // Dev : `?viewer` (unités), `?particles`, `?obstacles`, `?misc`, `?bonus` ou `?waves` ouvrent directement la visionneuse correspondante.
    if (DEV_TOOLS && poki.getURLParam('viewer') !== undefined) return void this.go(SCENES.viewer);
    if (DEV_TOOLS && poki.getURLParam('obstacles') !== undefined) return void this.go(SCENES.obstacles);
    if (DEV_TOOLS && poki.getURLParam('particles') !== undefined) return void this.go(SCENES.particles);
    if (DEV_TOOLS && poki.getURLParam('misc') !== undefined) return void this.go(SCENES.misc);
    if (DEV_TOOLS && poki.getURLParam('bonus') !== undefined) return void this.go(SCENES.bonus);
    if (DEV_TOOLS && poki.getURLParam('upgrades') !== undefined) return void this.go(SCENES.upgrades);
    if (DEV_TOOLS && poki.getURLParam('waves') !== undefined) return void this.go(SCENES.waves);
    if (DEV_TOOLS && poki.getURLParam('mapedit') !== undefined) return void this.go(SCENES.mapEditor);
    if (DEV_TOOLS && poki.getURLParam('sounds') !== undefined) return void this.go(SCENES.sounds);
    if (DEV_TOOLS && poki.getURLParam('packs') !== undefined) return void this.go(SCENES.packs);
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
    window.setTimeout(() => startTextureWorkshop(), 400); // le jeu (ou une vue de dev) est affiché : les textures procédurales se fabriquent en tâche de fond (quelques ms par image)
    if (key === SCENES.game && this.assets !== ASSETS && !latePack.ready) {
      // Paquet 2 lancé d'ici, sans attendre l'indice des commandes : son chargeur appartient à cette scène, qui doit donc RESTER active (`launch`, pas `start`, qui l'arrêterait et annulerait le téléchargement).
      // Même délai de 300 ms que `HudScene` (laisser les premières images s'afficher avant le décodage).
      this.scene.launch(key);
      this.time.delayedCall(300, () => latePack.ensure(this));
      return;
    }
    this.scene.start(key);
  }
}
