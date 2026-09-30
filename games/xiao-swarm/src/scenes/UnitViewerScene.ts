import Phaser from 'phaser';
import { clamp, sprites, theme } from '@xiao/engine';
import { ALIENS, type AlienId } from '../data/aliens';
import { CLASSES } from '../data/classes';
import { PALETTE, SCENES } from '../config';
import { header } from '../dev/devUi';
import { fillMuzzle, placementSnippet, resetPlacement, setAnchor, setMuzzleFrame, setPlacement } from '../debugSprites';

/**
 * Visionneuse d'unités (dev uniquement) : affiche une ou toutes les unités du jeu et joue leurs animations.
 * Ouverture : `?viewer` dans l'URL, ou bouton « soldat » en haut à gauche du jeu.
 *
 * Les animations proposées viennent du catalogue `sprites` (planches déclarées dans assets/manifest.ts).
 * Une unité sans planche animée retombe sur son animation procédurale (rebond, squash), comme en jeu.
 *
 * Avec une seule unité affichée, un éditeur de placement permet de régler :
 *  - l'ancrage (croix jaune) : pour toute l'unité, une séquence, ou une séquence dans une direction ;
 *  - la bouche du canon (point rouge) frame par frame.
 * Voir debugSprites.ts pour la sauvegarde et la copie vers assets/manifest.ts.
 */

type Kind = 'soldier' | 'alien' | 'recruit';
type Point = [number, number];
type Scope = 'all' | 'anim' | 'animDir';

interface Entry {
  id: string;
  kind: Kind;
  /** Id de l'unité sans préfixe (`gunner`, `slime`…). */
  unit: string;
  sprite: Phaser.GameObjects.Sprite;
  gun?: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
  baseScale: number;
  floats: boolean;
  /** Animation de planche en cours, sinon procédural. */
  key?: string;
  /** Nom logique réellement joué (la demande, ou `idle` à défaut). */
  playing: string;
  /** Décalage vertical procédural (rebond), à prendre en compte pour les repères. */
  dy: number;
  x: number;
  y: number;
}

const ALL = '*';
const GROUPS: { kind: Kind; prefix: string; ids: string[] }[] = [
  { kind: 'soldier', prefix: 'soldier_', ids: Object.keys(CLASSES) },
  { kind: 'alien', prefix: 'alien_', ids: Object.keys(ALIENS) },
  { kind: 'recruit', prefix: 'recruit_', ids: Object.keys(CLASSES) },
];
const ZOOMS = [0.5, 1, 1.5, 2, 3, 4];
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export class UnitViewerScene extends Phaser.Scene {
  private entries: Entry[] = [];
  private panel?: HTMLDivElement;
  private animSelect!: HTMLSelectElement;
  private info!: HTMLDivElement;
  private selected = ALL;
  private anim = 'idle';
  private facing = 1;
  private zoomFactor = 1;
  // Éditeur de placement (une seule unité affichée)
  private editorBox!: HTMLDivElement;
  private fields!: Record<'ox' | 'oy' | 'mx' | 'my', HTMLInputElement>;
  private shadowSlider!: HTMLInputElement;
  private shadowLabel!: HTMLSpanElement;
  private scopeSelect!: HTMLSelectElement;
  private status!: HTMLDivElement;
  private pauseBox!: HTMLInputElement;
  private frameSlider!: HTMLInputElement;
  private frameLabel!: HTMLSpanElement;
  private cross!: Phaser.GameObjects.Graphics;
  private muzzleDot!: Phaser.GameObjects.Arc;
  private flash!: Phaser.GameObjects.Image;
  private flashOn = false;
  private lastShot = 0;
  private paused = false;
  private scope: Scope = 'all';

  constructor() {
    super(SCENES.viewer);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x2b3a2e);
    this.drawGrid();
    this.buildPanel();
    this.buildEditorMarkers();
    this.rebuild();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.stepFrame(-1));
    kb.on('keydown-RIGHT', () => this.stepFrame(1));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
    });
  }

  update(time: number): void {
    const t = time / 1000;
    for (const e of this.entries) this.animate(e, t);
    this.updateEditor(t);
  }

  // ---------- Contenu affiché ----------

  /** (Re)crée les sprites pour la sélection courante. */
  private rebuild(): void {
    for (const e of this.entries) {
      e.sprite.destroy();
      e.gun?.destroy();
      e.label.destroy();
      e.shadow.destroy();
    }
    this.entries = [];

    const rows = GROUPS.map((g) => ({ ...g, ids: g.ids.filter((u) => this.selected === ALL || `${g.prefix}${u}` === this.selected) })).filter(
      (g) => g.ids.length,
    );
    const gap = this.selected === ALL ? 170 : 0;
    const rowGap = this.selected === ALL ? 190 : 0;
    rows.forEach((g, r) => {
      g.ids.forEach((unit, c) => {
        const x = (c - (g.ids.length - 1) / 2) * gap;
        const y = (r - (rows.length - 1) / 2) * rowGap;
        this.entries.push(this.makeEntry(g.kind, g.prefix, unit, x, y));
      });
    });

    this.fillAnimSelect();
    this.setupEditor();
    this.fit();
  }

  private makeEntry(kind: Kind, prefix: string, unit: string, x: number, y: number): Entry {
    const id = `${prefix}${unit}`;
    // mêmes proportions qu'en jeu (WorldView.drawOverlay) ; la taille réglable s'applique en échelle
    const radius = kind === 'alien' ? ALIENS[unit as AlienId].radius : CLASSES[unit as keyof typeof CLASSES].radius;
    const shadow =
      kind === 'alien'
        ? this.add.ellipse(x, y, radius * 2.1, radius * 0.9, 0x000000, 0.3)
        : this.add.ellipse(x, y, radius * 2.2, radius, 0x000000, 0.3);
    const sprite = sprites.add(this, id, x, y);
    const gunId = kind === 'soldier' ? `gun_${unit}` : undefined;
    const gun = gunId && !sprites.get(gunId).hidden ? sprites.add(this, gunId, x, y) : undefined;
    const label = this.add
      .text(x, y + 26, id, { fontFamily: theme.font, fontSize: '13px', color: PALETTE.textDim })
      .setOrigin(0.5, 0);
    return {
      id,
      kind,
      unit,
      sprite,
      gun,
      label,
      shadow,
      baseScale: sprites.scaleOf(id),
      floats: kind === 'alien' && !!ALIENS[unit as AlienId].floats,
      playing: this.anim,
      dy: 0,
      x,
      y,
    };
  }

  /** Noms d'animations proposés : ceux des planches affichées, plus idle / walk (procéduraux à défaut). */
  private animNames(): string[] {
    const names = new Set<string>(['idle', 'walk']);
    for (const e of this.entries) for (const k of Object.keys(sprites.get(e.id).anims ?? {})) names.add(k);
    const first = ['idle', 'walk'];
    return [...names].sort((a, b) => (first.indexOf(a) + 1 || 99) - (first.indexOf(b) + 1 || 99) || a.localeCompare(b));
  }

  private fillAnimSelect(): void {
    const names = this.animNames();
    if (!names.includes(this.anim)) this.anim = 'idle';
    this.animSelect.replaceChildren(...names.map((n) => new Option(n, n, false, n === this.anim)));
    this.playAll();
  }

  // ---------- Animation ----------

  private playAll(): void {
    this.setPaused(false);
    for (const e of this.entries) this.play(e);
    this.updateInfo();
  }

  private play(e: Entry): void {
    const s = e.sprite;
    s.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    const asked = sprites.get(e.id).anims?.[this.anim];
    // Anim demandée, sinon idle de la planche, sinon procédural (aucune anim de planche).
    const name = asked ? this.anim : sprites.hasAnim(e.id, 'idle') ? 'idle' : undefined;
    if (name && sprites.play(s, e.id, name)) {
      e.key = sprites.get(e.id).anims![name];
      e.playing = name;
      // anim sans boucle (mort…) : on la rejoue après une courte pause
      s.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.time.delayedCall(600, () => e.key && !this.paused && s.play(e.key)));
    } else {
      e.key = undefined;
      e.playing = this.anim;
      s.setData('anim', this.anim);
      s.anims.stop();
      const d = sprites.get(e.id);
      s.setTexture(d.texture, d.frame);
    }
    s.setFlipX(sprites.flipFor(e.id, this.facing));
  }

  /** Mouvement procédural (rebond, squash) — même logique que view/UnitViews.ts — pour les unités sans planche. */
  private animate(e: Entry, t: number): void {
    const s = e.sprite;
    const moving = e.playing === 'walk';
    let bob = 0;
    let lift = 0;
    let sx = e.baseScale;
    let sy = e.baseScale;
    if (!e.key) {
      if (e.kind === 'soldier') bob = moving ? -Math.abs(Math.sin(t * 14)) * 3 : Math.sin(t * 2.2) * 0.8;
      else if (e.kind === 'recruit') bob = Math.sin(t * 5) * 4;
      else {
        const f = e.unit === 'spider' ? 18 : 7;
        const squash = e.floats ? 0 : Math.sin(t * f) * 0.06;
        lift = e.floats ? Math.sin(t * 3) * 5 : 0;
        sx = e.baseScale * (1 + squash);
        sy = e.baseScale * (1 - squash);
      }
    }
    e.dy = bob + lift;
    // Ancrage de la séquence / direction affichées (même résolution que le jeu, sprites.place).
    const [ax, ay] = sprites.anchorFor(e.id, e.playing, sprites.dirOf(e.id, s.flipX));
    if (s.originX !== ax || s.originY !== ay) s.setOrigin(ax, ay);
    s.setPosition(e.x, e.y + e.dy).setScale(sx, sy);
    const k = sprites.get(e.id).shadow ?? 1;
    e.shadow.setScale((e.floats ? 0.7 : 1) * k, k).setAlpha(e.floats ? 0.2 : 0.3);

    if (e.gun) {
      const aim = this.facing > 0 ? 0 : Math.PI;
      e.gun
        .setPosition(e.x + this.facing * 4, e.y - 17 * (e.unit === 'tank' ? 1.15 : 1) + bob)
        .setRotation(aim)
        .setFlipY(Math.cos(aim) < 0);
    }
  }

  // ---------- Frames ----------

  private frameCount(e: Entry): number {
    return e.key ? (e.sprite.anims.currentAnim?.frames.length ?? 1) : 1;
  }

  /** Index (0 = première) de la frame affichée dans la séquence. */
  private frameIndex(e: Entry): number {
    return e.key && e.sprite.anims.currentFrame ? e.sprite.anims.currentFrame.index - 1 : 0;
  }

  private setPaused(v: boolean): void {
    this.paused = v;
    if (this.pauseBox) this.pauseBox.checked = v;
    const t = this.target;
    if (!t?.key) return;
    if (v) t.sprite.anims.pause();
    else if (t.sprite.anims.isPaused) t.sprite.anims.resume();
    else if (!t.sprite.anims.isPlaying) t.sprite.play(t.key);
  }

  /** Affiche la frame `i` (met en pause). */
  private showFrame(i: number): void {
    const t = this.target;
    const anim = t?.sprite.anims.currentAnim;
    if (!t || !anim) return;
    if (!t.sprite.anims.isPlaying && !t.sprite.anims.isPaused) t.sprite.play(anim.key);
    t.sprite.anims.pause(anim.frames[clamp(i, 0, anim.frames.length - 1)]);
    this.paused = true;
    this.pauseBox.checked = true;
  }

  private stepFrame(delta: number): void {
    const t = this.target;
    if (!t) return;
    const n = this.frameCount(t);
    this.showFrame((this.frameIndex(t) + delta + n) % n);
  }

  // ---------- Éditeur de placement (ancrage + bouche du canon) ----------

  /** Unité éditée : la seule affichée (sinon aucune). */
  private get target(): Entry | undefined {
    return this.entries.length === 1 ? this.entries[0] : undefined;
  }

  private buildEditorBox(): HTMLDivElement {
    const box = document.createElement('div');
    box.style.cssText = 'display:none;flex-direction:column;gap:6px;padding-top:6px;border-top:1px solid #444';
    const title = (text: string) => {
      const b = document.createElement('b');
      b.textContent = text;
      b.style.color = '#ffd166';
      return b;
    };
    const note = (text: string) => {
      const d = document.createElement('div');
      d.style.cssText = 'font-size:11px;color:#aab';
      d.textContent = text;
      return d;
    };
    const line = (...items: (HTMLElement | string)[]) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
      d.append(...items);
      return d;
    };
    const field = (label: string, onSet: () => void) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.005';
      input.style.cssText = 'width:62px;padding:2px;font:inherit';
      input.addEventListener('input', onSet);
      input.addEventListener('change', () => input.blur());
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:4px;align-items:center';
      row.append(label, input);
      return { row, input };
    };
    const onOrigin = () => {
      const ox = this.fields.ox.valueAsNumber;
      const oy = this.fields.oy.valueAsNumber;
      if (Number.isFinite(ox) && Number.isFinite(oy)) this.editAnchor([ox, oy]);
    };
    const onMuzzle = () => {
      const mx = this.fields.mx.valueAsNumber;
      const my = this.fields.my.valueAsNumber;
      if (Number.isFinite(mx) && Number.isFinite(my)) this.editMuzzle([mx, my]);
    };

    // --- Ancrage ---
    this.scopeSelect = document.createElement('select');
    this.scopeSelect.style.cssText = 'padding:3px;font:inherit;width:100%';
    this.scopeSelect.replaceChildren(
      new Option("Toute l'unité (défaut)", 'all'),
      new Option('Cette séquence', 'anim'),
      new Option('Cette séquence + direction', 'animDir'),
    );
    this.scopeSelect.addEventListener('change', () => {
      this.scope = this.scopeSelect.value as Scope;
      this.scopeSelect.blur();
    });
    this.status = document.createElement('div');
    this.status.style.cssText = 'font-size:11px;color:#9fe;min-height:2.2em;white-space:pre-line';
    const ox = field('Ancrage X', onOrigin);
    const oy = field('Y', onOrigin);
    const clearAnchor = this.button('Effacer cet ancrage', () => {
      const t = this.target;
      const key = this.anchorKey();
      if (!t || !key) return;
      setAnchor(t.id, key, null);
    });

    // --- Ombre ---
    this.shadowSlider = document.createElement('input');
    this.shadowSlider.type = 'range';
    this.shadowSlider.min = '0';
    this.shadowSlider.max = '3';
    this.shadowSlider.step = '0.05';
    this.shadowSlider.style.cssText = 'flex:1;min-width:80px';
    this.shadowLabel = document.createElement('span');
    this.shadowLabel.style.cssText = 'min-width:36px;text-align:right';
    this.shadowSlider.addEventListener('input', () => {
      const t = this.target;
      if (t) setPlacement(t.id, { shadow: Number(this.shadowSlider.value) });
    });
    this.shadowSlider.addEventListener('change', () => this.shadowSlider.blur());

    // --- Frames + canon ---
    this.pauseBox = document.createElement('input');
    this.pauseBox.type = 'checkbox';
    this.pauseBox.addEventListener('change', () => {
      this.setPaused(this.pauseBox.checked);
      this.pauseBox.blur();
    });
    this.frameSlider = document.createElement('input');
    this.frameSlider.type = 'range';
    this.frameSlider.min = '0';
    this.frameSlider.max = '0';
    this.frameSlider.style.cssText = 'flex:1;min-width:80px';
    this.frameSlider.addEventListener('input', () => this.showFrame(Number(this.frameSlider.value)));
    this.frameSlider.addEventListener('change', () => this.frameSlider.blur());
    this.frameLabel = document.createElement('span');
    this.frameLabel.style.cssText = 'min-width:44px;text-align:right';
    const mx = field('Canon X', onMuzzle);
    const my = field('Y', onMuzzle);
    this.fields = { ox: ox.input, oy: oy.input, mx: mx.input, my: my.input };

    const allFrames = this.button('Toutes les frames', () => {
      const t = this.target;
      const m = t && sprites.muzzleFor(t.id, t.playing, this.frameIndex(t));
      if (t && m) fillMuzzle(t.id, t.playing, m, this.frameCount(t));
    });
    const clearFrame = this.button('Effacer la frame', () => {
      const t = this.target;
      if (t) setMuzzleFrame(t.id, t.playing, this.frameIndex(t), null, this.frameCount(t));
    });
    const unitDefault = this.button("Défaut unité", () => {
      const t = this.target;
      const m = t && sprites.muzzleFor(t.id, t.playing, this.frameIndex(t));
      if (t && m) setPlacement(t.id, { muzzle: m });
    });

    const flash = document.createElement('label');
    flash.style.cssText = 'display:flex;gap:6px;align-items:center';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      this.flashOn = cb.checked;
      cb.blur();
    });
    flash.append(cb, 'Prévisualiser le flash de tir');

    const copy = this.button('Copier le code', () => {
      const t = this.target;
      if (!t) return;
      const code = placementSnippet(t.id);
      void navigator.clipboard?.writeText(code).catch(() => {});
      this.info.textContent = `Copié — à coller dans ${t.id} de assets/manifest.ts :\n${code}`;
    });
    const reset = this.button("Réinitialiser l'unité", () => {
      const t = this.target;
      if (!t) return;
      resetPlacement(t.id);
      this.updateInfo();
    });

    box.append(
      title('Ancrage'),
      note("Glisse le sprite sous la croix jaune. La portée dit où le réglage s'applique."),
      this.scopeSelect,
      this.status,
      line(ox.row, oy.row),
      line(clearAnchor),
      title('Ombre portée'),
      note("Taille de l'ombre sous l'unité (1 = défaut). Appliquée aussi en jeu."),
      line(this.shadowSlider, this.shadowLabel),
      title('Bouche du canon (par frame)'),
      note('Glisse le point rouge (met en pause). ← → : frame précédente / suivante.'),
      line(this.pauseBox, 'Pause', this.frameSlider, this.frameLabel),
      line(mx.row, my.row),
      line(allFrames, clearFrame, unitDefault),
      flash,
      line(copy, reset),
    );
    this.editorBox = box;
    return box;
  }

  private button(label: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:4px 8px;font:inherit;cursor:pointer';
    b.addEventListener('click', () => {
      fn();
      b.blur();
    });
    return b;
  }

  private buildEditorMarkers(): void {
    // croix = position de l'unité dans le monde (là où le jeu place l'ancrage)
    this.cross = this.add.graphics().setDepth(1000);
    this.cross.lineStyle(1.5, 0xffd166, 1).lineBetween(-10, 0, 10, 0).lineBetween(0, -10, 0, 10).strokeCircle(0, 0, 4);
    this.muzzleDot = this.add
      .circle(0, 0, 5, 0xff4a30, 0.95)
      .setStrokeStyle(2, 0xffffff)
      .setDepth(1001)
      .setInteractive({ draggable: true, useHandCursor: true });
    this.muzzleDot.on('dragstart', () => this.setPaused(true));
    this.muzzleDot.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => this.dragMuzzle(x, y));
    this.flash = this.add.image(0, 0, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd27a).setDepth(1002).setAlpha(0);
    this.cross.setVisible(false);
    this.muzzleDot.setVisible(false);
  }

  /** Active l'édition si une seule unité est affichée. */
  private setupEditor(): void {
    const t = this.target;
    this.editorBox.style.display = t ? 'flex' : 'none';
    this.cross.setVisible(!!t);
    this.muzzleDot.setVisible(!!t);
    this.flash.setAlpha(0);
    if (!t) return;
    t.sprite.setInteractive({ draggable: true, useHandCursor: true });
    let last = { x: 0, y: 0 };
    t.sprite.on('dragstart', (p: Phaser.Input.Pointer) => (last = { x: p.worldX, y: p.worldY }));
    t.sprite.on('drag', (p: Phaser.Input.Pointer) => {
      const w = t.sprite.width * t.baseScale;
      const h = t.sprite.height * t.baseScale;
      // l'ancrage est fixe dans le monde : quand l'image suit le pointeur, il glisse sur l'image en sens inverse
      this.editAnchor([t.sprite.originX - (p.worldX - last.x) / w, t.sprite.originY - (p.worldY - last.y) / h]);
      last = { x: p.worldX, y: p.worldY };
    });
  }

  /** Clé d'ancrage selon la portée choisie (null = ancrage de l'unité). */
  private anchorKey(): string | null {
    const t = this.target;
    if (!t || this.scope === 'all') return null;
    return this.scope === 'anim' ? t.playing : `${t.playing}:${sprites.dirOf(t.id, t.sprite.flipX)}`;
  }

  private editAnchor(value: Point): void {
    const t = this.target;
    if (!t) return;
    const key = this.anchorKey();
    if (key) setAnchor(t.id, key, value);
    else setPlacement(t.id, { originX: value[0], originY: value[1] });
  }

  private editMuzzle(value: Point): void {
    const t = this.target;
    if (t) setMuzzleFrame(t.id, t.playing, this.frameIndex(t), value, this.frameCount(t));
  }

  /** Fractions de frame → monde. `originX/Y` se rapportent à la boîte : retournée, l'image y est en miroir. */
  private worldOf(t: Entry, fx: number, fy: number): { x: number; y: number } {
    const s = t.sprite;
    const bx = s.flipX ? 1 - fx : fx;
    return {
      x: t.x + (bx - s.originX) * s.width * t.baseScale,
      y: t.y + t.dy + (fy - s.originY) * s.height * t.baseScale,
    };
  }

  private dragMuzzle(wx: number, wy: number): void {
    const t = this.target;
    if (!t) return;
    const s = t.sprite;
    const bx = s.originX + (wx - t.x) / (s.width * t.baseScale);
    const fy = s.originY + (wy - t.y - t.dy) / (s.height * t.baseScale);
    this.editMuzzle([s.flipX ? 1 - bx : bx, fy]);
  }

  private updateEditor(time: number): void {
    const t = this.target;
    if (!t) return;
    this.cross.setPosition(t.x, t.y);

    // frame affichée
    const idx = this.frameIndex(t);
    const n = this.frameCount(t);
    const slider = this.frameSlider;
    if (slider.max !== String(n - 1)) slider.max = String(n - 1);
    if (!this.paused || slider !== document.activeElement) slider.value = String(idx);
    this.frameLabel.textContent = `${idx + 1}/${n}`;

    // bouche du canon de cette frame : rouge = propre à la frame, orange = héritée de l'unité, pâle = aucune
    const m = sprites.muzzleFor(t.id, t.playing, idx);
    const own = !!sprites.get(t.id).muzzles?.[t.playing]?.[idx];
    const spot = this.worldOf(t, m?.[0] ?? 0.85, m?.[1] ?? 0.5);
    this.muzzleDot
      .setPosition(spot.x, spot.y)
      .setAlpha(m ? 0.95 : 0.35)
      .setFillStyle(own ? 0xff4a30 : 0xffa030, m ? 0.95 : 0.35);

    // aperçu du flash : un éclair toutes les 0,5 s à la bouche du canon
    if (this.flashOn && m && time - this.lastShot > 0.5) this.lastShot = time;
    const age = time - this.lastShot;
    const on = this.flashOn && m && age < 0.12;
    this.flash.setPosition(spot.x, spot.y).setScale(0.45 / this.cameras.main.zoom).setAlpha(on ? 1 - age / 0.12 : 0);

    this.syncFields(t, m);
  }

  /** Met à jour champs et texte d'état (sans toucher à un champ en cours de saisie). */
  private syncFields(t: Entry, m: Point | undefined): void {
    const set = (i: HTMLInputElement, v: number | undefined) => {
      const text = v === undefined ? '' : String(r3(v));
      if (document.activeElement !== i && i.value !== text) i.value = text;
    };
    const sh = sprites.get(t.id).shadow ?? 1;
    if (document.activeElement !== this.shadowSlider) this.shadowSlider.value = String(sh);
    this.shadowLabel.textContent = `×${r3(sh)}`;
    set(this.fields.ox, t.sprite.originX);
    set(this.fields.oy, t.sprite.originY);
    set(this.fields.mx, m?.[0]);
    set(this.fields.my, m?.[1]);

    // quel ancrage est réellement appliqué ici ?
    const d = sprites.get(t.id);
    const dir = sprites.dirOf(t.id, t.sprite.flipX);
    const dirName = dir === 'left' ? 'gauche' : 'droite';
    const specific = d.anchors?.[`${t.playing}:${dir}`] ? `${t.playing}:${dir}` : d.anchors?.[t.playing] ? t.playing : null;
    const text =
      `Affiché : « ${t.playing} » · ${dirName}\nAncrage actif : ${specific ? `spécifique (${specific})` : "celui de l'unité"}` +
      (specific && this.scope === 'all' ? ' — la portée « unité » ne le modifie pas' : '');
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  private updateInfo(): void {
    const e = this.entries[0];
    if (!e) return;
    if (this.entries.length > 1) {
      this.info.textContent = `${this.entries.length} unités · animation « ${this.anim} » (procédurale si absente de la planche)`;
      return;
    }
    const d = sprites.get(e.id);
    const a = e.key ? this.anims.get(e.key) : undefined;
    this.info.textContent = a
      ? `${d.texture} · ${a.frames.length} frames · ${a.frameRate} fps · ${a.repeat === 0 ? 'une fois' : 'boucle'}`
      : `${d.texture} · animation procédurale (pas de planche pour « ${this.anim} »)`;
  }

  // ---------- Interface ----------

  private buildPanel(): void {
    const p = document.createElement('div');
    p.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:99999;width:290px;max-height:calc(100vh - 16px);overflow:auto;padding:10px;' +
      'background:rgba(0,0,0,0.78);color:#dfe;font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:8px';
    const title = header("Visionneuse d'unités", () => this.back());

    const units = this.select('Unité', [
      [ALL, 'Toutes les unités'],
      ...GROUPS.flatMap((g) => g.ids.map((u) => [`${g.prefix}${u}`, `${g.prefix}${u}`] as [string, string])),
    ]);
    units.select.addEventListener('change', () => {
      this.selected = units.select.value;
      this.rebuild();
    });

    const anims = this.select('Animation', []);
    this.animSelect = anims.select;
    anims.select.addEventListener('change', () => {
      this.anim = anims.select.value;
      this.playAll();
    });

    const side = this.select('Orientation', [
      ['1', 'Droite'],
      ['-1', 'Gauche'],
    ]);
    side.select.addEventListener('change', () => {
      this.facing = Number(side.select.value);
      this.playAll();
    });

    const zoom = this.select(
      'Zoom',
      ZOOMS.map((z) => [String(z), `${z * 100} %`] as [string, string]),
    );
    zoom.select.value = '1';
    zoom.select.addEventListener('change', () => {
      this.zoomFactor = Number(zoom.select.value);
      this.fit();
    });

    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:12px;color:#9fe;min-height:2.4em;white-space:pre-wrap';

    p.append(title, units.row, anims.row, side.row, zoom.row, this.buildEditorBox(), this.info);
    document.body.append(p);
    this.panel = p;
  }

  /** Libellé + liste déroulante ; rend le focus au jeu après un choix (les touches restent actives). */
  private select(label: string, options: [string, string][]): { row: HTMLLabelElement; select: HTMLSelectElement } {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    row.append(label);
    const select = document.createElement('select');
    select.style.cssText = 'padding:4px;font:inherit';
    select.replaceChildren(...options.map(([v, text]) => new Option(text, v)));
    select.addEventListener('change', () => select.blur());
    row.append(select);
    return { row, select };
  }

  /** Zoom utilisateur, réduit si besoin pour que toutes les unités tiennent dans la fenêtre. */
  private readonly fit = (): void => {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    const rowsW = Math.max(...GROUPS.map((g) => g.ids.length)) * 170 + 120;
    const fitZoom = this.selected === ALL ? Math.min(1, width / rowsW, height / (GROUPS.length * 190 + 80)) : 1;
    cam.setZoom(fitZoom * this.zoomFactor);
    // repères et étiquettes de taille constante à l'écran
    this.cross?.setScale(1 / cam.zoom);
    this.muzzleDot?.setScale(1 / cam.zoom);
    for (const e of this.entries) e.label.setScale(1 / cam.zoom).setY(e.y + 26 / cam.zoom);
    // décalé vers la droite pour laisser la place au panneau
    cam.centerOn(-(300 / 2) / cam.zoom, 0);
  };

  private drawGrid(): void {
    const g = this.add.graphics().setDepth(-1);
    g.lineStyle(1, 0xffffff, 0.06);
    for (let i = -40; i <= 40; i++) g.lineBetween(i * 50, -2000, i * 50, 2000).lineBetween(-2000, i * 50, 2000, i * 50);
  }

  private back(): void {
    this.scene.start(SCENES.game);
  }
}
