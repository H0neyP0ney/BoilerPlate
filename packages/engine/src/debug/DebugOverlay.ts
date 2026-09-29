import Phaser from 'phaser';

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (value: number) => void;
  /** Infobulle (survol du libellé). */
  hint?: string;
}

/**
 * Panneau de debug (dev uniquement) : FPS + stats libres + menu de réglages (sliders, boutons).
 * Touche ² / ` / F2 pour afficher / masquer le tout.
 * En build de prod, `DebugOverlay.create` renvoie undefined et tout est tree-shaké.
 *
 *   const dbg = DebugOverlay.create(this);
 *   dbg?.set('enemies', enemies.length);
 *   dbg?.slider('Vitesse', { min: 50, max: 500, step: 5, get: () => cfg.speed, set: (v) => (cfg.speed = v) });
 *   dbg?.button('Réinitialiser', () => …);
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly stats = new Map<string, string | number>();
  private readonly cheats: { key: string; label: string }[] = [];
  private elapsed = 0;
  private menu?: HTMLDivElement;
  private menuVisible = false;
  private status?: HTMLDivElement;
  private readonly syncers: (() => void)[] = [];

  /** `top` : décalage vertical du texte de stats (pour laisser la place à un bouton du HUD en haut à gauche). */
  static create(scene: Phaser.Scene, opts: { top?: number } = {}): DebugOverlay | undefined {
    return import.meta.env.DEV ? new DebugOverlay(scene, opts.top ?? 8) : undefined;
  }

  private constructor(
    private readonly scene: Phaser.Scene,
    top: number,
  ) {
    this.text = scene.add
      .text(8, top, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#7CFFB2',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(1e6)
      .setVisible(false);
    scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === 'F2') this.toggleMenu();
    });
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.refresh);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.refresh);
      this.menu?.remove();
    });
  }

  /** Affiche / masque le panneau de stats et le menu de réglages (touche ² / F2, ou bouton du HUD). */
  toggleMenu(open = !this.menuVisible): void {
    this.menuVisible = open;
    this.text.setVisible(open);
    if (this.menu) this.menu.style.display = open ? 'block' : 'none';
  }

  get isOpen(): boolean {
    return this.menuVisible;
  }

  set(key: string, value: string | number): void {
    this.stats.set(key, value);
  }

  /** Raccourci de triche : `dbg?.cheat('K', 'kill all', () => …)`. */
  cheat(key: string, label: string, fn: () => void): void {
    this.cheats.push({ key, label });
    this.scene.input.keyboard?.on(`keydown-${key}`, fn);
  }

  /** Slider de réglage dans le menu debug (mise à jour en direct). */
  slider(label: string, o: SliderOptions): void {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin:0 0 7px';
    if (o.hint) row.title = o.hint;
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;gap:8px';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('b');
    head.append(name, value);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(o.min);
    input.max = String(o.max);
    input.step = String(o.step);
    input.style.cssText = 'width:100%;margin:2px 0 0';
    const decimals = (String(o.step).split('.')[1] ?? '').length;
    const show = (v: number) => (value.textContent = v.toFixed(decimals));
    const sync = () => {
      input.value = String(o.get());
      show(o.get());
    };
    input.addEventListener('input', () => {
      o.set(Number(input.value));
      show(Number(input.value));
    });
    // Rend le focus au jeu : sinon les flèches déplaceraient le slider au lieu de la squad.
    input.addEventListener('change', () => input.blur());
    input.addEventListener('pointerup', () => input.blur());
    row.append(head, input);
    this.ensureMenu().append(row);
    this.syncers.push(sync);
    sync();
  }

  /** Bouton dans le menu debug. */
  button(label: string, fn: () => void): void {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px 4px 2px 0;padding:3px 8px;font:inherit;cursor:pointer';
    b.addEventListener('click', () => {
      fn();
      b.blur();
    });
    this.ensureMenu().append(b);
  }

  /** Titre de section dans le menu debug. */
  section(title: string): void {
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'margin:8px 0 6px;font-weight:bold;color:#ffd166;border-bottom:1px solid #444';
    this.ensureMenu().append(h);
  }

  /** Message court en bas du menu (« config sauvegardée »…), remplacé à chaque appel. */
  message(text: string): void {
    if (!this.status) {
      this.status = document.createElement('div');
      this.status.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #444;color:#9fe;min-height:1.2em';
    }
    this.status.textContent = text;
    // toujours en dernier dans le menu
    this.ensureMenu().append(this.status);
  }

  /** Relit les valeurs (après un reset par exemple) et met les sliders à jour. */
  syncSliders(): void {
    for (const fn of this.syncers) fn();
  }

  private ensureMenu(): HTMLDivElement {
    if (this.menu) return this.menu;
    const m = document.createElement('div');
    m.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:99999;width:260px;max-height:calc(100vh - 16px);overflow:auto;' +
      'padding:8px 10px;background:rgba(0,0,0,0.78);color:#dfe;font:12px monospace;border-radius:6px;' +
      `display:${this.menuVisible ? 'block' : 'none'}`;
    document.body.append(m);
    this.menu = m;
    return m;
  }

  private readonly refresh = (_t: number, delta: number): void => {
    this.elapsed += delta;
    if (!this.text.visible || this.elapsed < 250) return;
    this.elapsed = 0;
    const lines = [`fps ${this.scene.game.loop.actualFps.toFixed(0)}`];
    for (const [k, v] of this.stats) lines.push(`${k} ${typeof v === 'number' ? Math.round(v * 10) / 10 : v}`);
    for (const c of this.cheats) lines.push(`[${c.key}] ${c.label}`);
    this.text.setText(lines.join('\n'));
  };
}
