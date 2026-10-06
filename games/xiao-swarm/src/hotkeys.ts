/**
 * Touches rebindables du joueur (menu Options > Hotkeys) : déplacement, choix d'upgrade et relance. Les touches sont identifiées par leur code
 * PHYSIQUE (`KeyboardEvent.code`) : « KeyW » est la touche à la place du W d'un QWERTY, donc Z sur un AZERTY ; les défauts marchent ainsi sur tous
 * les claviers sans rien régler. Les flèches et le pavé numérique restent toujours actifs pour se déplacer (voir `MoveInput`).
 * Ce module ne dépend ni de Phaser ni de `settings` ; l'état (touches choisies) vit dans `settings.hotkeys`.
 */
export const HOTKEY_ACTIONS = ['up', 'down', 'left', 'right', 'pick1', 'pick2', 'pick3', 'reroll'] as const;
export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];

/** Touche choisie pour une action : code physique et, si le joueur l'a assignée lui-même, le caractère lu sur sa touche (ex. « Z » sur AZERTY). */
export interface HotkeyBind {
  code: string;
  label?: string;
}

/** Touches par défaut : WASD, 1 / 2 / 3 du haut du clavier et R. */
export const HOTKEY_DEFAULTS: Record<HotkeyAction, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  pick1: 'Digit1',
  pick2: 'Digit2',
  pick3: 'Digit3',
  reroll: 'KeyR',
};

/** Touches que le jeu garde pour lui (pause, fermer un menu, valider) : jamais assignables. */
export const RESERVED_CODES: readonly string[] = ['Escape', 'Enter', 'NumpadEnter', 'KeyP'];

export const isReserved = (code: string): boolean => RESERVED_CODES.includes(code);

/** Disposition réelle du clavier (Chrome : `navigator.keyboard.getLayoutMap`, absente dans une iframe sans autorisation et sur Firefox / Safari) : code physique → caractère. */
let layout: { get(code: string): string | undefined } | undefined;
try {
  const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<{ get(code: string): string | undefined }> } }).keyboard;
  void kb?.getLayoutMap?.().then((m) => (layout = m)).catch(() => undefined);
} catch {
  // indisponible : libellés tirés du code physique (QWERTY)
}

const NAMED: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  CapsLock: 'Caps',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
};

/** Nom d'une touche d'après son code physique (lettres et chiffres QWERTY, flèches, pavé numérique). */
export function nominalLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Libellé à afficher : celui lu quand le joueur a assigné la touche, sinon la lettre de sa disposition de clavier (Chrome) ou le nom QWERTY. */
export function keyLabel(bind: HotkeyBind): string {
  if (bind.label) return bind.label;
  if (!bind.code.startsWith('Digit')) {
    const ch = layout?.get(bind.code);
    if (ch && ch.length === 1) return ch.toUpperCase();
  }
  return nominalLabel(bind.code);
}

/** Libellé à mémoriser au moment où le joueur appuie sur la touche : la lettre réellement imprimée dessus (« Z » pour la touche W d'un AZERTY). */
export function labelFromEvent(e: KeyboardEvent): string {
  if (e.code.startsWith('Key') && e.key.length === 1) return e.key.toUpperCase();
  return nominalLabel(e.code);
}

/** Lit des touches mémorisées en ignorant tout ce qui est invalide ; une action absente ou invalide reprend sa touche par défaut. */
export function parseHotkeys(raw: unknown): Record<HotkeyAction, HotkeyBind> {
  const out = {} as Record<HotkeyAction, HotkeyBind>;
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const a of HOTKEY_ACTIONS) {
    const b = src[a] as Partial<HotkeyBind> | undefined;
    const ok = !!b && typeof b.code === 'string' && b.code.length > 0 && b.code.length < 24 && !isReserved(b.code);
    out[a] = ok ? { code: b!.code!, label: typeof b!.label === 'string' && b!.label.length < 12 ? b!.label : undefined } : { code: HOTKEY_DEFAULTS[a] };
  }
  return out;
}
