import { setDocked } from './dock';

/**
 * Petits éléments d'interface DOM pour les visionneuses de dev (particules, divers) : panneau, listes, boutons,
 * sliders. Même style que les autres visionneuses ; rien de tout cela n'est livré dans le build Poki.
 */
export function panel(width = 300): HTMLDivElement {
  const p = document.createElement('div');
  p.style.cssText =
    `position:fixed;top:8px;left:8px;z-index:99999;width:${width}px;max-height:calc(100vh - 16px);overflow:auto;padding:10px;` +
    'background:rgba(0,0,0,0.78);color:#dfe;font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:8px';
  return p;
}

export function title(text: string): HTMLElement {
  const b = document.createElement('b');
  b.textContent = text;
  b.style.color = '#ffd166';
  return b;
}

export function heading(text: string): HTMLElement {
  const b = document.createElement('b');
  b.textContent = text;
  b.style.cssText = 'color:#ffd166;border-top:1px solid #444;padding-top:6px';
  return b;
}

export function note(text: string): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = 'font-size:11px;color:#aab;white-space:pre-wrap';
  d.textContent = text;
  return d;
}

export function line(...items: (HTMLElement | string)[]): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  d.append(...items);
  return d;
}

export function button(label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'padding:4px 8px;font:inherit;cursor:pointer';
  b.addEventListener('click', () => {
    fn();
    b.blur(); // rend le focus au jeu : les touches restent actives
  });
  return b;
}

/** Libellé + liste déroulante ; options `[valeur, texte]` ou groupes `{ group, options }`. */
export function select(
  label: string,
  options: ([string, string] | { group: string; options: [string, string][] })[],
): { row: HTMLLabelElement; select: HTMLSelectElement } {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  row.append(label);
  const sel = document.createElement('select');
  sel.style.cssText = 'padding:4px;font:inherit';
  for (const o of options) {
    if (Array.isArray(o)) sel.append(new Option(o[1], o[0]));
    else {
      const g = document.createElement('optgroup');
      g.label = o.group;
      g.append(...o.options.map(([v, t]) => new Option(t, v)));
      sel.append(g);
    }
  }
  sel.addEventListener('change', () => sel.blur());
  row.append(sel);
  return { row, select: sel };
}

export function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.addEventListener('change', () => {
    onChange(cb.checked);
    cb.blur();
  });
  row.append(cb, label);
  return row;
}

/** Slider + valeur numérique modifiable, synchronisés. `sync()` relit la valeur (après un reset). */
export function slider(
  label: string,
  o: { min: number; max: number; step: number; get: () => number; set: (v: number) => void; hint?: string },
): { row: HTMLElement; sync: () => void } {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;flex-direction:column;gap:2px';
  if (o.hint) row.title = o.hint;
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:center';
  const name = document.createElement('span');
  name.textContent = label;
  const num = document.createElement('input');
  num.type = 'number';
  num.min = String(o.min);
  num.max = String(o.max);
  num.step = String(o.step);
  num.style.cssText = 'width:72px;padding:1px 3px;font:inherit';
  head.append(name, num);
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(o.min);
  range.max = String(o.max);
  range.step = String(o.step);
  range.style.cssText = 'width:100%;margin:0';
  const decimals = (String(o.step).split('.')[1] ?? '').length;
  const sync = () => {
    const v = o.get();
    range.value = String(v);
    if (document.activeElement !== num) num.value = v.toFixed(decimals);
  };
  range.addEventListener('input', () => {
    o.set(Number(range.value));
    sync();
  });
  range.addEventListener('change', () => range.blur());
  num.addEventListener('input', () => {
    if (!Number.isFinite(num.valueAsNumber)) return;
    o.set(num.valueAsNumber);
    range.value = String(num.valueAsNumber);
  });
  num.addEventListener('change', () => {
    num.blur();
    sync();
  });
  row.append(head, range);
  sync();
  return { row, sync };
}

/** Sélecteur de couleur : valeur en nombre 0xRRGGBB. */
export function colorInput(label: string, get: () => number, set: (v: number) => void): { row: HTMLElement; sync: () => void } {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;gap:8px;align-items:center';
  const input = document.createElement('input');
  input.type = 'color';
  const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`;
  const sync = () => (input.value = hex(get()));
  input.addEventListener('input', () => set(parseInt(input.value.slice(1), 16)));
  input.addEventListener('change', () => input.blur());
  row.append(input, label);
  sync();
  return { row, sync };
}

export interface FloatingPanel {
  /** Contenu : y ajouter les éléments. */
  body: HTMLDivElement;
  toggle(open?: boolean): void;
  readonly isOpen: boolean;
  destroy(): void;
}

/**
 * Panneau flottant (fermé au départ) avec titre et bouton de fermeture : pour les outils qui restent ouverts pendant
 * que le jeu tourne (panneaux « Foule » et « Triche »). Toujours à gauche, rangé par `dock.ts`.
 */
export function floatingPanel(titleText: string, opts: { width?: number } = {}): FloatingPanel {
  const root = document.createElement('div');
  root.style.cssText =
    `position:fixed;top:64px;left:8px;z-index:99998;width:${opts.width ?? 290}px;` +
    'max-height:calc(100vh - 76px);overflow:auto;background:rgba(0,0,0,0.82);color:#dfe;font:13px system-ui,sans-serif;' +
    'border-radius:6px;display:none;flex-direction:column';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #444;position:sticky;top:0;background:rgba(0,0,0,0.9)';
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'font:inherit;cursor:pointer;padding:0 8px';
  head.append(title(titleText), close);
  const body = document.createElement('div');
  body.style.cssText = 'padding:10px;display:flex;flex-direction:column;gap:8px';
  root.append(head, body);
  document.body.append(root);
  let open = false;
  const toggle = (v = !open) => {
    open = v;
    root.style.display = v ? 'flex' : 'none';
    setDocked(root, v);
  };
  close.addEventListener('click', () => {
    toggle(false);
    close.blur();
  });
  return {
    body,
    toggle,
    get isOpen() {
      return open;
    },
    destroy: () => {
      setDocked(root, false);
      root.remove();
    },
  };
}

/**
 * En-tête d'un panneau de visionneuse : titre à gauche, croix de fermeture en haut à droite (toujours visible,
 * même quand le panneau défile). `onClose` ramène au jeu.
 */
export function header(text: string, onClose: () => void): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;position:sticky;top:-10px;z-index:1;' +
    'margin:-10px -10px 0;padding:8px 10px;background:rgba(0,0,0,0.92);border-bottom:1px solid #444';
  const close = document.createElement('button');
  close.textContent = '×';
  close.title = 'Fermer et retourner au jeu';
  close.style.cssText = 'font:inherit;cursor:pointer;padding:0 8px';
  close.addEventListener('click', () => {
    close.blur();
    onClose();
  });
  row.append(title(text), close);
  return row;
}
