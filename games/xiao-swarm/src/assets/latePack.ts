import Phaser from 'phaser';
import { devLog, loadAssetsLater, log, poki } from '@xiao/engine';
import { SFX } from '../settings';
import { LATE_ASSETS } from './manifest';

/** Ids de visuels du paquet 2 (image isolée : son id ; planche : ses sprites). */
const LATE_IDS = new Set(LATE_ASSETS.flatMap((e) => (e.type === 'image' ? [e.id] : Object.keys(e.sprites))));

type State = 'idle' | 'loading' | 'ready';
let state: State = 'idle';
const listeners = new Set<() => void>();

/**
 * Paquet 2 des visuels (aliens autres que slime / gling) chargé après le démarrage. Tant qu'il n'est pas prêt, les
 * visuels concernés restent leurs dessins procéduraux ; les vues se rafraîchissent via `onReady`.
 */
export const latePack = {
  get ready(): boolean {
    return state === 'ready';
  },

  /** Déclare le paquet 2 déjà chargé (chargement complet au démarrage). */
  markLoaded(): void {
    state = 'ready';
  },

  /** Cet id de visuel est-il dans le paquet 2 ? */
  has(spriteId: string): boolean {
    return LATE_IDS.has(spriteId);
  },

  /** Lance le chargement (sans effet s'il est en cours ou fini). */
  ensure(scene: Phaser.Scene): void {
    if (state !== 'idle') return;
    state = 'loading';
    const t0 = performance.now();
    devLog(`paquet 2 : début du chargement (${LATE_ASSETS.length} entrées)`, 'warn');
    for (const s of Object.values(SFX)) if (!scene.cache.audio.exists(s.key)) scene.load.audio(s.key, s.url); // bruitages : avec le paquet 2 (sfx.play ignore un son pas encore chargé)
    scene.load.on(Phaser.Loader.Events.FILE_LOAD, (file: Phaser.Loader.File) => devLog(`+ ${file.key} (${file.type})`));
    void loadAssetsLater(scene, LATE_ASSETS).then((applied) => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD);
      devLog(`paquet 2 : prêt (${applied.length} visuels, ${Math.round(performance.now() - t0)} ms)`, 'warn');
      state = 'ready';
      log.info(`[assets] paquet 2 chargé (${applied.length} visuels, ${Math.round(performance.now() - t0)} ms)`);
      poki.measureOnce('perf', 'late-assets', `${Math.round((performance.now() - t0) / 500) * 500}ms`); // temps de chargement du paquet 2, par tranches de 0,5 s
      for (const fn of [...listeners]) fn();
    });
  },

  /** Demande un visuel : lance le chargement si son paquet n'est pas là. À appeler quand une unité qui en dépend apparaît. */
  request(scene: Phaser.Scene, spriteId: string): void {
    if (state === 'idle' && LATE_IDS.has(spriteId)) {
      devLog(`paquet 2 demandé par l'apparition de ${spriteId}`, 'warn');
      this.ensure(scene);
    }
  },

  onReady(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
