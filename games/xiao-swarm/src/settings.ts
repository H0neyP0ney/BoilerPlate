import { DIFFICULTY_LEVELS, parseDifficultyLevel, type DifficultyLevel } from './data/difficultyLevels';
import { SFX_TUNING } from './data/sfxTuning';
import { skinById, skinPrice } from './data/skins';
import { trailById, trailPrice } from './data/trails';
import { perkById, unitUnlockById, UNIT_UNLOCKS } from './data/armory';
import type { SoldierClassId } from './data/classes';
import { clamp, poki, storage, type MoveKeyCodes, DEV_TOOLS } from '@xiao/engine';
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
export const SAVE_VERSION = 5; // 5 (20/10, 0.1.159) : on rejoue le tutoriel pour tester ; 4 (0.1.158) : tutoriel retravaillé (level up et power-ups scriptés, plus de cadeau caché)
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
export const MUSIC = { key: 'music', url: ['assets/audio/music.mp3'] }; // mp3 seul : lu par tous les navigateurs (l'ogg a été retiré, 1,1 Mo de moins dans le zip)
/** Bruitages (public/assets/audio, chargés avec les visuels) : même principe OGG + MP3 de secours. */
/** Adresse du fichier d'une variante : `<base sans .mp3>--<variante>.mp3` (variante vide = le fichier de base). */
export const sfxVariantUrl = (baseUrl: string, variant: string): string => (variant ? baseUrl.replace(/\.mp3$/, `--${variant}.mp3`) : baseUrl);

/** Un bruitage : `public/assets/audio/...`, réglé par `SFX_TUNING` (`data/sfxTuning.ts`, curseurs de la page `?sounds`) ; `volume` et `opts` ne servent que si le son n'y figure pas encore. */
function sfxDef(name: string, volume: number, opts: { detune?: number; pitch?: number; rate?: number; minGapMs?: number; maxVoices?: number } = {}, url = `assets/audio/sfx/${name}.mp3`) {
  const t = SFX_TUNING[name];
  return {
    key: `sfx_${name}`,
    baseUrl: url, // fichier de base ; la variante choisie (`variant`) est `<base sans .mp3>--<variante>.mp3`
    variant: t?.variant ?? '',
    url: [sfxVariantUrl(url, t?.variant ?? '')],
    volume: t?.volume ?? volume,
    detune: t ? t.detune : opts.detune,
    pitch: t ? t.pitch : opts.pitch,
    rate: t ? t.rate : opts.rate,
    minGapMs: t ? t.minGapMs : opts.minGapMs,
    maxVoices: t ? (t.maxVoices > 0 ? t.maxVoices : undefined) : opts.maxVoices, // 0 = pas de limite
  };
}

export const SFX = {
  /** Tir du Trooper : volume de base, variation de hauteur (cents), délai minimal entre deux tirs entendus et nombre maximal de tirs superposés (rafales d'escouade : voir `sfx.play`). */
  blaster: sfxDef('blaster', 0.35, { detune: 120, minGapMs: 60, maxVoices: 2 }, 'assets/audio/blaster.mp3'),
  /** Explosion (grenade, kamikaze, boules des aliens, onde…) : superposition max 3 voix, chaque nouvelle voix plus discrète ; hauteur variable. */
  blast: sfxDef('blast', 0.5, { detune: 250, minGapMs: 90, maxVoices: 3 }, 'assets/audio/blast.mp3'),
  // ----- sons de remplacement synthétisés (`tools/gen-sfx.py`, voir `docs/SONS.md`) : un fichier par son dans `public/assets/audio/sfx/<nom>.mp3`, à écraser par de vrais sons -----
  // interface
  ui_click: sfxDef('ui_click', 0.5, { minGapMs: 40 }),
  ui_hover: sfxDef('ui_hover', 0.3, { minGapMs: 60 }),
  ui_open: sfxDef('ui_open', 0.5),
  ui_claim: sfxDef('ui_claim', 0.6),
  ui_claim_prism: sfxDef('ui_claim_prism', 0.7),
  ui_reroll: sfxDef('ui_reroll', 0.55),
  levelup: sfxDef('levelup', 0.7),
  defeat: sfxDef('defeat', 0.7),
  victory: sfxDef('victory', 0.7),
  // ramassages
  xp: sfxDef('xp', 0.3, { detune: 120, minGapMs: 35, maxVoices: 4 }),
  recruit: sfxDef('recruit', 0.6, { minGapMs: 80 }),
  pu_stim: sfxDef('pu_stim', 0.6),
  pu_magnet: sfxDef('pu_magnet', 0.6),
  pu_heal: sfxDef('pu_heal', 0.55),
  pu_stasis: sfxDef('pu_stasis', 0.6),
  pu_rockets: sfxDef('pu_rockets', 0.6),
  pu_reroll: sfxDef('pu_reroll', 0.6),
  pu_prism: sfxDef('pu_prism', 0.7),
  egg_break: sfxDef('egg_break', 0.6),
  // combat
  alien_die_s: sfxDef('alien_die_s', 0.3, { detune: 200, minGapMs: 40, maxVoices: 4 }),
  alien_die_m: sfxDef('alien_die_m', 0.4, { detune: 150, minGapMs: 60, maxVoices: 3 }),
  alien_die_l: sfxDef('alien_die_l', 0.6, { detune: 100, minGapMs: 100, maxVoices: 2 }),
  soldier_die: sfxDef('soldier_die', 0.5, { minGapMs: 80, maxVoices: 3 }),
  crit: sfxDef('crit', 0.35, { detune: 100, minGapMs: 60, maxVoices: 2 }),
  alien_shot: sfxDef('alien_shot', 0.35, { detune: 150, minGapMs: 80, maxVoices: 2 }),
  tongue: sfxDef('tongue', 0.45, { detune: 100, minGapMs: 80, maxVoices: 2 }),
  fuse: sfxDef('fuse', 0.45, { minGapMs: 120, maxVoices: 2 }),
  cleave: sfxDef('cleave', 0.4, { detune: 100, minGapMs: 100, maxVoices: 2 }),
  stalactite: sfxDef('stalactite', 0.45, { detune: 150, minGapMs: 80, maxVoices: 3 }),
  freeze: sfxDef('freeze', 0.5, { minGapMs: 80, maxVoices: 2 }),
  thaw: sfxDef('thaw', 0.45, { detune: 150, minGapMs: 80, maxVoices: 2 }),
  capture: sfxDef('capture', 0.45, { minGapMs: 120, maxVoices: 2 }),
  release: sfxDef('release', 0.45, { minGapMs: 100, maxVoices: 2 }),
  rock_break: sfxDef('rock_break', 0.5, { detune: 150, minGapMs: 100, maxVoices: 2 }),
  heal: sfxDef('heal', 0.3, { detune: 100, minGapMs: 150, maxVoices: 2 }),
  // boss
  boss_arrive: sfxDef('boss_arrive', 0.8),
  boss_down: sfxDef('boss_down', 0.8),
  boss_enrage: sfxDef('boss_enrage', 0.7),
};
export type SfxId = keyof typeof SFX;

// Sons ajoutés depuis la page `?sounds` (bouton « Nouveau son ») : présents dans `SFX_TUNING` mais pas dans le catalogue ci-dessus ; ils rejoignent `SFX` (non branchés au jeu :
// pour les jouer, appeler `playSfx(scene, '<nom>')` depuis la vue, voir docs/SONS.md).
for (const name of Object.keys(SFX_TUNING)) if (!(name in SFX)) (SFX as Record<string, unknown>)[name] = sfxDef(name, 0.5);

export const settings = {
  /** L'onboarding scripté (voir `sim/Tutorial.ts`) a déjà été terminé : les parties suivantes commencent directement par les vagues normales. */
  tutorialDone: storage.get<boolean>('settings.tutorialDone', false) === true,
  /** Multiplicateur du zoom total de la caméra (1 = zoom d'origine). */
  zoom: clamp(storage.get('settings.zoom', 1), ZOOM_MIN, ZOOM_MAX),
  /** Volume de la musique, en crans de 0 à `MUSIC_STEPS` (menu Options). Par défaut 5 (50 %). */
  musicVolume: clamp(Math.round(storage.get('settings.musicVolume', MUSIC_DEFAULT)), 0, MUSIC_STEPS),
  /** Volume des bruitages (tirs…), en crans de 0 à `MUSIC_STEPS` (menu Options). */
  sfxVolume: clamp(Math.round(storage.get('settings.sfxVolume', SFX_DEFAULT)), 0, MUSIC_STEPS),
  /** Mode debug (menu Options, dev seulement) : affiche les boutons des outils de dev en haut à gauche du HUD. Activé par défaut en dev. */
  debugMode: storage.get<boolean>('settings.debugMode', DEV_TOOLS) === true,

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

  /** Dernier niveau de difficulté choisi avec les boutons de l'écran d'accueil (mémorisé) : la run suivante démarre dans ce niveau. */
  difficulty: parseDifficultyLevel(storage.get<string>('settings.difficulty', 'normal')),

  /** Niveaux débloqués : `normal` d'emblée ; finir `normal` débloque `expert`, finir `expert` débloque `impossible` (mémorisé). `?unlockall=1` les débloque tous (test). */
  unlocked: DIFFICULTY_LEVELS.filter((l) => storage.get<boolean>(`settings.unlocked.${l}`, l === 'normal') === true),

  isUnlocked(level: DifficultyLevel): boolean {
    return this.unlocked.includes(level) || poki.getURLParam('unlockall') !== undefined;
  },

  /** Plus haut niveau débloqué dont `level` est au plus : un niveau verrouillé retombe sur le dernier accessible. */
  clampDifficulty(level: DifficultyLevel): DifficultyLevel {
    for (let i = DIFFICULTY_LEVELS.indexOf(level); i > 0; i--) if (this.isUnlocked(DIFFICULTY_LEVELS[i])) return DIFFICULTY_LEVELS[i];
    return 'normal';
  },

  /** Victoire au niveau `level` : débloque le suivant. Renvoie le niveau débloqué (null si rien de nouveau). */
  unlockAfterWin(level: DifficultyLevel): DifficultyLevel | null {
    const next = DIFFICULTY_LEVELS[DIFFICULTY_LEVELS.indexOf(level) + 1];
    if (!next || this.unlocked.includes(next)) return null;
    this.unlocked.push(next);
    storage.set(`settings.unlocked.${next}`, true);
    return next;
  },

  setDifficulty(level: DifficultyLevel): void {
    this.difficulty = level;
    storage.set('settings.difficulty', level);
  },

  /** Diamants verts du joueur (ramassés près des coffres des boss, dépensés dans la boutique de skins) : mémorisés, jamais remis à zéro par `SAVE_VERSION`. */
  gems: Math.max(0, Math.floor(storage.get<number>('gems', 0))),
  /** Skins achetés (ids de `data/skins.ts`) et skin équipé (null : soldats bleus d'origine). */
  ownedSkins: storage.get<string[]>('skins.owned', []).map((id) => (id === 'cyan' ? 'ninja' : id)).filter((id) => skinById(id)), // l'ancien skin « cyan » est devenu le ninja
  skin: ((id) => (skinById(id) ? id : null))(((v) => (v === 'cyan' ? 'ninja' : v))(storage.get<string | null>('skins.equipped', null))) as string | null,

  /** Trails achetées et trail équipée (ids de `data/trails.ts`, null : aucune). */
  ownedTrails: storage.get<string[]>('trails.owned', []).filter((id) => trailById(id)),
  trail: ((id) => (trailById(id) ? id : null))(storage.get<string | null>('trails.equipped', null)) as string | null,

  buyTrail(id: string): boolean {
    const tr = trailById(id);
    if (!tr || this.ownedTrails.includes(id) || this.gems < trailPrice(tr)) return false;
    this.addGems(-trailPrice(tr));
    this.ownedTrails.push(id);
    storage.set('trails.owned', this.ownedTrails);
    this.equipTrail(id);
    return true;
  },

  equipTrail(id: string | null): void {
    if (id !== null && !this.ownedTrails.includes(id)) return;
    this.trail = id;
    storage.set('trails.equipped', id);
  },

  /** Pièces d'or (lâchées par les aliens, solo) : monnaie de l'armurerie ; mémorisées comme les diamants. */
  coins: Math.max(0, Math.floor(storage.get<number>('coins', 0))),
  /** Armurerie : unités débloquées (le Trooper l'est d'office) et upgrades achetées, permanentes. */
  ownedUnits: storage.get<string[]>('armory.units', []).filter((id) => unitUnlockById(id)),
  ownedPerks: storage.get<string[]>('armory.perks', []).filter((id) => perkById(id)),

  addCoins(n: number): void {
    this.coins = Math.max(0, this.coins + Math.floor(n));
    storage.set('coins', this.coins);
  },

  hasUnit(id: string): boolean {
    return id === 'trooper' || this.ownedUnits.includes(id);
  },

  /** Débloque une unité contre des pièces d'or. Faux : déjà débloquée ou pas assez de pièces. */
  buyUnit(id: string): boolean {
    const u = unitUnlockById(id);
    if (!u || this.ownedUnits.includes(id) || this.coins < u.price) return false;
    this.addCoins(-u.price);
    this.ownedUnits.push(id);
    storage.set('armory.units', this.ownedUnits);
    return true;
  },

  /** Achète une upgrade (permanente) : il faut avoir débloqué son unité. */
  buyPerk(id: string): boolean {
    const p = perkById(id);
    if (!p || this.ownedPerks.includes(id) || !this.hasUnit(p.unit) || this.coins < p.price) return false;
    this.addCoins(-p.price);
    this.ownedPerks.push(id);
    storage.set('armory.perks', this.ownedPerks);
    return true;
  },

  /** Ce que le joueur envoie à l'hôte (et applique à sa squad hors ligne) : unités débloquées (Trooper compris) et upgrades. */
  loadout(): { units: SoldierClassId[]; perks: string[] } {
    return { units: ['trooper', ...UNIT_UNLOCKS.filter((u) => this.ownedUnits.includes(u.id)).map((u) => u.id)], perks: [...this.ownedPerks] };
  },

  addGems(n: number): void {
    this.gems = Math.max(0, this.gems + Math.floor(n));
    storage.set('gems', this.gems);
  },

  /** Achète un skin avec les diamants du joueur (et l'équipe). Faux : déjà acheté ou pas assez de diamants. */
  buySkin(id: string): boolean {
    const s = skinById(id);
    if (!s || this.ownedSkins.includes(id) || this.gems < skinPrice(s)) return false;
    this.addGems(-skinPrice(s));
    this.ownedSkins.push(id);
    storage.set('skins.owned', this.ownedSkins);
    this.equipSkin(id);
    return true;
  },

  /** Équipe un skin acheté (null : retour aux soldats d'origine). */
  equipSkin(id: string | null): void {
    if (id !== null && !this.ownedSkins.includes(id)) return;
    this.skin = id;
    storage.set('skins.equipped', id);
  },

  setTutorialDone(done: boolean): void {
    this.tutorialDone = done;
    storage.set('settings.tutorialDone', done);
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

// dev / `?debug=1` : `?gems=500` ajoute 500 diamants à chaque chargement (test de la boutique de skins)
if (DEV_TOOLS) {
  const extra = Number(poki.getURLParam('gems'));
  if (extra > 0) settings.addGems(extra);
  const coins = Number(poki.getURLParam('coins')); // `?coins=2000` : pièces d'or pour tester l'armurerie
  if (coins > 0) settings.addCoins(coins);
}
