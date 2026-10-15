import Phaser from 'phaser';
import { DEV_TOOLS, devLog, loadAssetsLater, log, poki, type AssetEntry } from '@xiao/engine';
import { isPlaceholder, realKey, swapInRealImages } from '../art/imageFallbacks';
import { SFX, type SfxId } from '../settings';
import { sfxPack } from './coreSfx';
import { LATE_ASSETS, LATE_B_ASSETS } from './manifest';

/** Ids de visuels du paquet 2 (2a et 2b ; image isolée : son id ; planche : ses sprites). */
const LATE_IDS = new Set([...LATE_ASSETS, ...LATE_B_ASSETS].flatMap((e) => (e.type === 'image' ? [e.id] : Object.keys(e.sprites))));

/**
 * Charge un lot. Une image qui a un repli posé (`art/imageFallbacks.ts`) est chargée sous une autre clé puis redessinée dans la texture de repli
 * (même objet : ce qui l'affiche la voit changer sans rien faire) ; les autres suivent le chemin habituel.
 */
function loadPack(scene: Phaser.Scene, entries: readonly AssetEntry[]): Promise<string[]> {
  const holders = entries.filter((e): e is Extract<AssetEntry, { type: 'image' }> => e.type === 'image' && isPlaceholder(e.id));
  scene.load.setPath('assets/');
  for (const h of holders) scene.load.image(realKey(h.id), h.url);
  scene.load.setPath('');
  return loadAssetsLater(scene, entries.filter((e) => !holders.includes(e as never))).then((applied) => {
    swapInRealImages(scene, holders.map((h) => h.id));
    return applied;
  });
}

/** idle → loading (2a) → ready (2a arrivé, 2b se télécharge) → complete (tout est là). */
type State = 'idle' | 'loading' | 'ready' | 'complete';
let state: State = 'idle';
const listeners = new Set<() => void>();
const completeListeners = new Set<() => void>();

/** Temps écoulé depuis `t0`, rangé en 5 tranches lisibles pour les analytics (au lieu d'une ligne par demi-seconde). */
const durationBucket = (t0: number): string => {
  const s = (performance.now() - t0) / 1000;
  return s < 1 ? '0-1s' : s < 3 ? '1-3s' : s < 6 ? '3-6s' : s < 10 ? '6-10s' : '10s+';
};

/**
 * Paquet 2 des visuels, chargé après le démarrage en deux étapes. **2a** (`LATE_ASSETS`) : ce qui sert dans les ~2 premières minutes
 * (aliens précoces, Gling Mère et Rhino Alpha, timeline, XP, globes, power-ups, recrue, bruitages) ; **2b** (`LATE_B_ASSETS`), enchaîné
 * dès que 2a est arrivé : aliens tardifs et boss suivants (Scarab, rhinos jumeaux, Giant Crab…), critiques. Tant qu'un visuel n'est pas
 * là, son dessin procédural sert ; les vues se rafraîchissent via `onReady` (2a) et `onComplete` (2b).
 */
export const latePack = {
  /** 2a arrivé (les écrans et visuels des premières minutes sont prêts). */
  get ready(): boolean {
    return state === 'ready' || state === 'complete';
  },

  /** 2a et 2b arrivés. */
  get complete(): boolean {
    return state === 'complete';
  },

  /** Déclare le paquet 2 déjà chargé (chargement complet au démarrage). */
  markLoaded(): void {
    state = 'complete';
  },

  /** Cet id de visuel est-il dans le paquet 2 (2a ou 2b) ? */
  has(spriteId: string): boolean {
    return LATE_IDS.has(spriteId);
  },

  /** Lance le chargement (sans effet s'il est en cours ou fini) : 2a, puis 2b. */
  ensure(scene: Phaser.Scene): void {
    if (state !== 'idle') return;
    if (DEV_TOOLS && poki.getURLParam('nolate') !== undefined) return; // dev : `?nolate=1` ne charge JAMAIS le paquet 2 (voir le jeu avec les seuls visuels du paquet 1 + dessins procéduraux)
    state = 'loading';
    const t0 = performance.now();
    devLog(`paquet 2a : début du chargement (${LATE_ASSETS.length} entrées)`, 'warn');
    this.loadSfx(scene, '2a'); // bruitages hors `CORE_SFX` : avec le paquet 2a (sfx.play ignore un son pas encore chargé)
    scene.load.on(Phaser.Loader.Events.FILE_LOAD, (file: Phaser.Loader.File) => devLog(`+ ${file.key} (${file.type})`));
    void loadPack(scene, LATE_ASSETS).then((applied) => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD);
      devLog(`paquet 2a : prêt (${applied.length} visuels, ${Math.round(performance.now() - t0)} ms)`, 'warn');
      state = 'ready';
      log.info(`[assets] paquet 2a chargé (${applied.length} visuels, ${Math.round(performance.now() - t0)} ms)`);
      poki.measureOnce('perf', 'late-assets-2a', durationBucket(t0)); // temps de chargement du paquet 2a
      for (const fn of [...listeners]) fn();
      this.loadB(scene, t0);
    });
  },

  /** Met en file les bruitages d'un paquet (ceux déjà dans le cache sont sautés). */
  loadSfx(scene: Phaser.Scene, pack: '2a' | '2b'): void {
    for (const id of Object.keys(SFX) as SfxId[]) {
      const s = SFX[id];
      if (sfxPack(id) === pack && !scene.cache.audio.exists(s.key)) scene.load.audio(s.key, s.url);
    }
  },

  /** Étape 2b : enchaînée dès que 2a est là. */
  loadB(scene: Phaser.Scene, t0: number): void {
    devLog(`paquet 2b : début du chargement (${LATE_B_ASSETS.length} entrées)`, 'warn');
    this.loadSfx(scene, '2b');
    scene.load.on(Phaser.Loader.Events.FILE_LOAD, (file: Phaser.Loader.File) => devLog(`+ ${file.key} (${file.type})`));
    void loadPack(scene, LATE_B_ASSETS).then((applied) => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD);
      state = 'complete';
      devLog(`paquet 2b : prêt (${applied.length} visuels, ${Math.round(performance.now() - t0)} ms depuis le début)`, 'warn');
      log.info(`[assets] paquet 2b chargé (${applied.length} visuels, ${Math.round(performance.now() - t0)} ms depuis le début)`);
      poki.measureOnce('perf', 'late-assets-2b', durationBucket(t0)); // temps total (2a + 2b) depuis le lancement du chargement
      for (const fn of [...completeListeners]) fn();
    });
  },

  /** Demande un visuel : lance le chargement si rien n'a démarré. À appeler quand une unité qui en dépend apparaît. */
  request(scene: Phaser.Scene, spriteId: string): void {
    if (state === 'idle' && LATE_IDS.has(spriteId)) {
      devLog(`paquet 2 demandé par l'apparition de ${spriteId}`, 'warn');
      this.ensure(scene);
    }
  },

  /** Appelé quand 2a arrive. */
  onReady(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Appelé quand 2b arrive (tout est chargé) : à utiliser pour rafraîchir les visuels des aliens et boss tardifs. */
  onComplete(fn: () => void): () => void {
    completeListeners.add(fn);
    return () => completeListeners.delete(fn);
  },
};
