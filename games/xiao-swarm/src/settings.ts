import { clamp, storage } from '@xiao/engine';

/**
 * Le préfixe du stockage doit être posé AVANT la lecture des réglages ci-dessous : ce module est évalué à l'import, bien avant
 * `beforeCreate` (main.ts). Sans cela, les lectures utilisaient le préfixe par défaut alors que les écritures utilisaient celui du jeu :
 * aucun réglage n'était jamais relu d'une session à l'autre.
 */
storage.setNamespace('xiao-swarm');

/** Réglages joueur (menu « Réglages »), mémorisés dans le navigateur. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;
/** Graduations de la réglette de volume de la musique (0 = coupée, 10 = plein volume). */
export const MUSIC_STEPS = 10;
/** Cran de volume de la musique à la première partie. */
export const MUSIC_DEFAULT = 2;
/**
 * Musique de fond (public/assets/audio), chargée en différé au lancement de la partie : OGG (léger), MP3 en secours pour les
 * navigateurs qui ne lisent pas l'OGG (vieux Safari iOS) ; un seul des deux est téléchargé. Source d'origine : art-src/audio.
 */
export const MUSIC = { key: 'music', url: ['assets/audio/music.ogg', 'assets/audio/music.mp3'] };
/** Bruitages (public/assets/audio, chargés avec les visuels) : même principe OGG + MP3 de secours. */
export const SFX = {
  /** Tir du Gunner : volume de base, variation de hauteur (cents) et délai minimal entre deux tirs entendus (rafales d'escouade). */
  blaster: { key: 'sfx_blaster', url: ['assets/audio/blaster.ogg', 'assets/audio/blaster.mp3'], volume: 0.35, detune: 120, minGapMs: 60 },
};

/** Réglage booléen mémorisé ; `?clé=0` / `?clé=1` dans l'URL le force (utile sur téléphone, sans menu Réglages). */
function flag(key: string, urlParam: string, defaultOn = true): boolean {
  const q = new URLSearchParams(location.search).get(urlParam);
  if (q === '0' || q === '1') storage.set(`settings.${key}`, q === '1');
  return storage.get<boolean>(`settings.${key}`, defaultOn) !== false;
}

export const settings = {
  /** Compteur de FPS en haut à gauche (`?fps=0` pour le masquer). */
  showFps: flag('showFps', 'fps'),
  /** Fond d'espace (nébuleuses + étoiles). Désactivé par défaut (coûteux en perf) : fond noir uni ; `?space=1` ou le menu Réglages l'active. */
  starfield: flag('starfield', 'space', false),
  /** Multiplicateur du zoom total de la caméra (1 = zoom d'origine). */
  zoom: clamp(storage.get('settings.zoom', 1), ZOOM_MIN, ZOOM_MAX),
  /** Volume de la musique, en crans de 0 à `MUSIC_STEPS` (menu Options). Par défaut 2 (dev et build Poki). */
  musicVolume: clamp(Math.round(storage.get('settings.musicVolume', MUSIC_DEFAULT)), 0, MUSIC_STEPS),
  /** Volume des bruitages (tirs…), en crans de 0 à `MUSIC_STEPS` (menu Options). */
  sfxVolume: clamp(Math.round(storage.get('settings.sfxVolume', 6)), 0, MUSIC_STEPS),
  /** Mode debug (menu Options, dev seulement) : affiche les boutons des outils de dev en haut à gauche du HUD. Activé par défaut en dev. */
  debugMode: storage.get<boolean>('settings.debugMode', import.meta.env.DEV) === true,

  /** Volume effectif (0 → 1) de la musique. */
  musicGain(): number {
    return this.musicVolume / MUSIC_STEPS;
  },

  /** Volume effectif (0 → 1) des bruitages. */
  sfxGain(): number {
    return this.sfxVolume / MUSIC_STEPS;
  },

  setMusicVolume(steps: number): void {
    this.musicVolume = clamp(Math.round(steps), 0, MUSIC_STEPS);
    storage.set('settings.musicVolume', this.musicVolume);
  },

  setSfxVolume(steps: number): void {
    this.sfxVolume = clamp(Math.round(steps), 0, MUSIC_STEPS);
    storage.set('settings.sfxVolume', this.sfxVolume);
  },

  setDebugMode(on: boolean): void {
    this.debugMode = on;
    storage.set('settings.debugMode', on);
  },

  setZoom(value: number): void {
    // arrondi au pas pour éviter la dérive des flottants (0.7000000001)
    this.zoom = clamp(Math.round(value / ZOOM_STEP) * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    storage.set('settings.zoom', this.zoom);
  },

  setShowFps(on: boolean): void {
    this.showFps = on;
    storage.set('settings.showFps', on);
  },

  setStarfield(on: boolean): void {
    this.starfield = on;
    storage.set('settings.starfield', on);
  },
};
