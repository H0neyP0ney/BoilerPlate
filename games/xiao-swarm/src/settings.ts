import { clamp, storage, type MoveKeyCodes } from '@xiao/engine';
import { HOTKEY_DEFAULTS, parseHotkeys, type HotkeyAction, type HotkeyBind } from './hotkeys';
import { i18n, LANGS, type Lang } from './i18n';

/**
 * Le préfixe du stockage doit être posé AVANT la lecture des réglages ci-dessous : ce module est évalué à l'import, bien avant
 * `beforeCreate` (main.ts). Sans cela, les lectures utilisaient le préfixe par défaut alors que les écritures utilisaient celui du jeu :
 * aucun réglage n'était jamais relu d'une session à l'autre.
 */
storage.setNamespace('xiao-swarm');

/**
 * Version de la sauvegarde : l'incrémenter REMET À ZÉRO, chez tous les joueurs au prochain lancement, la progression (tutoriel à rejouer,
 * compteur de parties pour les interstitielles, record) ; les réglages (volumes, mutes, langue, zoom…) sont conservés. À faire quand une
 * version change assez le jeu pour que tout le monde doive refaire l'onboarding.
 */
export const SAVE_VERSION = 3;
if (storage.get<number>('saveVersion', 0) < SAVE_VERSION) {
  storage.set('settings.tutorialDone', false);
  storage.set('gamesPlayed', 0);
  storage.set('bestTime', 0);
  storage.set('saveVersion', SAVE_VERSION);
}

/** Réglages joueur (menu « Réglages »), mémorisés dans le navigateur. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;
/** Graduations de la réglette de volume de la musique (0 = coupée, 10 = plein volume). */
export const MUSIC_STEPS = 10;
/** Cran de volume de la musique à la première partie. */
export const MUSIC_DEFAULT = 5;
/** Cran de volume des bruitages à la première partie (5/10 = 50 %). */
export const SFX_DEFAULT = 5;
/** Gain réel de la musique au cran maximal (la réglette 0-10 est mise à l'échelle : plein volume = 1/6 du volume du fichier). */
export const MUSIC_MAX_GAIN = 1 / 6;
/**
 * Musique de fond (public/assets/audio), chargée en différé au lancement de la partie : OGG (léger), MP3 en secours pour les
 * navigateurs qui ne lisent pas l'OGG (vieux Safari iOS) ; un seul des deux est téléchargé. Source d'origine : art-src/audio.
 */
export const MUSIC = { key: 'music', url: ['assets/audio/music.ogg', 'assets/audio/music.mp3'] };
/** Bruitages (public/assets/audio, chargés avec les visuels) : même principe OGG + MP3 de secours. */
export const SFX = {
  /** Tir du Trooper : volume de base, variation de hauteur (cents), délai minimal entre deux tirs entendus et nombre maximal de tirs superposés (rafales d'escouade : voir `sfx` de l'engine). */
  blaster: { key: 'sfx_blaster', url: ['assets/audio/blaster.ogg', 'assets/audio/blaster.mp3'], volume: 0.35, detune: 120, minGapMs: 60, maxVoices: 2 },
  /** Explosion (grenade, kamikaze, boules des aliens, onde…) : superposition max 3 voix, chaque nouvelle voix plus discrète ; hauteur variable. */
  blast: { key: 'sfx_blast', url: ['assets/audio/blast.ogg', 'assets/audio/blast.mp3'], volume: 0.5, detune: 250, minGapMs: 90, maxVoices: 3 },
};

/** Réglage booléen mémorisé ; `?clé=0` / `?clé=1` dans l'URL le force (utile sur téléphone, sans menu Réglages). */
function flag(key: string, urlParam: string, defaultOn = true): boolean {
  const q = new URLSearchParams(location.search).get(urlParam);
  if (q === '0' || q === '1') storage.set(`settings.${key}`, q === '1');
  return storage.get<boolean>(`settings.${key}`, defaultOn) !== false;
}

/** Onboarding déjà terminé ? `?tuto=1` le rejoue (remet à faux), `?tuto=0` le saute (le marque comme terminé). */
function tutorialDoneFlag(): boolean {
  const q = new URLSearchParams(location.search).get('tuto');
  if (q === '0' || q === '1') storage.set('settings.tutorialDone', q === '0');
  return storage.get<boolean>('settings.tutorialDone', false) === true;
}

export const settings = {
  /** L'onboarding scripté (voir `sim/Tutorial.ts`) a déjà été terminé : les parties suivantes commencent directement par les vagues normales. */
  tutorialDone: tutorialDoneFlag(),
  /** Déformation de l'écran (shader) à la montée de niveau (`?shock=0` pour la couper : filtre plein écran, coûteux sur un petit GPU). */
  shockwave: flag('shockwave', 'shock'),
  /** Fond d'espace (nébuleuses + étoiles). Désactivé par défaut (coûteux en perf) : fond noir uni ; `?space=1` ou le menu Réglages l'active. */
  starfield: flag('starfield', 'space', false),
  /** Multiplicateur du zoom total de la caméra (1 = zoom d'origine). */
  zoom: clamp(storage.get('settings.zoom', 1), ZOOM_MIN, ZOOM_MAX),
  /** Volume de la musique, en crans de 0 à `MUSIC_STEPS` (menu Options). Par défaut 5 (50 %). */
  musicVolume: clamp(Math.round(storage.get('settings.musicVolume', MUSIC_DEFAULT)), 0, MUSIC_STEPS),
  /** Volume des bruitages (tirs…), en crans de 0 à `MUSIC_STEPS` (menu Options). */
  sfxVolume: clamp(Math.round(storage.get('settings.sfxVolume', SFX_DEFAULT)), 0, MUSIC_STEPS),
  /** Mode debug (menu Options, dev seulement) : affiche les boutons des outils de dev en haut à gauche du HUD. Activé par défaut en dev. */
  debugMode: storage.get<boolean>('settings.debugMode', import.meta.env.DEV) === true,

  /** Coupures (boutons du HUD) : le volume réglé dans Options est conservé et revient au rétablissement. */
  musicMuted: storage.get<boolean>('settings.musicMuted', false) === true,
  sfxMuted: storage.get<boolean>('settings.sfxMuted', false) === true,

  /** La musique / les bruitages sont audibles (ni coupés, ni à 0). */
  musicOn(): boolean {
    return !this.musicMuted && this.musicVolume > 0;
  },
  sfxOn(): boolean {
    return !this.sfxMuted && this.sfxVolume > 0;
  },

  setMusicMuted(on: boolean): void {
    this.musicMuted = on;
    storage.set('settings.musicMuted', on);
  },
  setSfxMuted(on: boolean): void {
    this.sfxMuted = on;
    storage.set('settings.sfxMuted', on);
  },

  /** Bouton du HUD : coupe, ou rétablit (volume remis par défaut s'il était à 0). */
  toggleMusic(): void {
    if (this.musicOn()) return this.setMusicMuted(true);
    if (this.musicVolume === 0) this.setMusicVolume(MUSIC_DEFAULT);
    this.setMusicMuted(false);
  },
  toggleSfx(): void {
    if (this.sfxOn()) return this.setSfxMuted(true);
    if (this.sfxVolume === 0) this.setSfxVolume(SFX_DEFAULT);
    this.setSfxMuted(false);
  },

  /** Langue choisie dans le menu Options (null : jamais choisie, on suit le navigateur / Poki). */
  lang: ((l) => (LANGS as readonly string[]).includes(l ?? '') ? (l as Lang) : null)(storage.get<string | null>('settings.lang', null)),

  /** Change la langue du jeu (mémorisée) : les textes créés ensuite l'utilisent. */
  setLang(lang: Lang): void {
    this.lang = lang;
    storage.set('settings.lang', lang);
    i18n.setLang(lang);
  },

  /** Volume effectif (0 → 1) de la musique. */
  musicGain(): number {
    return this.musicMuted ? 0 : (this.musicVolume / MUSIC_STEPS) * MUSIC_MAX_GAIN;
  },

  /** Volume effectif (0 → 1) des bruitages. */
  sfxGain(): number {
    return this.sfxMuted ? 0 : this.sfxVolume / MUSIC_STEPS;
  },

  setMusicVolume(steps: number): void {
    this.musicVolume = clamp(Math.round(steps), 0, MUSIC_STEPS);
    if (this.musicVolume > 0) this.setMusicMuted(false); // toucher au volume rétablit le son
    storage.set('settings.musicVolume', this.musicVolume);
  },

  setSfxVolume(steps: number): void {
    this.sfxVolume = clamp(Math.round(steps), 0, MUSIC_STEPS);
    if (this.sfxVolume > 0) this.setSfxMuted(false);
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

  setShockwave(on: boolean): void {
    this.shockwave = on;
    storage.set('settings.shockwave', on);
  },

  setTutorialDone(done: boolean): void {
    this.tutorialDone = done;
    storage.set('settings.tutorialDone', done);
  },

  setStarfield(on: boolean): void {
    this.starfield = on;
    storage.set('settings.starfield', on);
  },

  /** Touches choisies par le joueur (menu Options > Hotkeys) : déplacement, choix d'upgrade, relance. Voir `hotkeys.ts`. */
  hotkeys: parseHotkeys(storage.get<unknown>('settings.hotkeys', {})) as Record<HotkeyAction, HotkeyBind>,

  /** Code physique de la touche d'une action. */
  hotkeyCode(action: HotkeyAction): string {
    return this.hotkeys[action].code;
  },

  /** Touches de déplacement pour `MoveInput` (relues à chaque image : un changement dans les options s'applique tout de suite). */
  moveKeys(): MoveKeyCodes {
    const h = this.hotkeys;
    return { up: h.up.code, down: h.down.code, left: h.left.code, right: h.right.code };
  },

  /** Assigne une touche à une action ; si une autre action l'avait déjà, les deux touches s'échangent (jamais deux actions sur la même touche). */
  setHotkey(action: HotkeyAction, code: string, label?: string): void {
    const previous = this.hotkeys[action];
    for (const other of Object.keys(this.hotkeys) as HotkeyAction[]) {
      if (other !== action && this.hotkeys[other].code === code) this.hotkeys[other] = previous;
    }
    this.hotkeys[action] = { code, label };
    storage.set('settings.hotkeys', this.hotkeys);
  },

  /** Remet toutes les touches par défaut. */
  resetHotkeys(): void {
    for (const a of Object.keys(HOTKEY_DEFAULTS) as HotkeyAction[]) this.hotkeys[a] = { code: HOTKEY_DEFAULTS[a] };
    storage.set('settings.hotkeys', this.hotkeys);
  },
};
