import Phaser from 'phaser';
import { getName, nameKey } from '../debugNames';
import { clamp, sprites, theme } from '@xiao/engine';
import { ACTIVE_ALIENS, ALIENS, type AlienId } from '../data/aliens';
import { ACTIVE_CLASSES, CLASSES, type SoldierClassId } from '../data/classes';
import { PALETTE, SCENES, SHADOW_ALPHA, VIEW_BG } from '../config';
import { button, header, line, note, slider } from '../dev/devUi';
import type { AlienTestRequest } from '../dev/alienTest';
import { ScaleRef } from '../dev/scaleRef';
import { getDefaultStat, getStat, listStats, resetStats, saveAllStatsToCode, setStat } from '../debugStats';
import { fillMuzzle, placementSnippet, resetPlacement, saveSpriteToCode, setAnchor, setMuzzleFrame, setPlacement } from '../debugSprites';

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
/** Nombre maximal d'unités affichées sur une ligne (vue « toutes les unités »). */
const MAX_PER_ROW = 6;
/** Opacité des unités inactives (hors ACTIVE_CLASSES / ACTIVE_ALIENS). */
const INACTIVE_ALPHA = 0.25;

const GROUPS: { kind: Kind; prefix: string; ids: string[] }[] = [
  { kind: 'soldier', prefix: 'soldier_', ids: Object.keys(CLASSES) },
  { kind: 'alien', prefix: 'alien_', ids: Object.keys(ALIENS).filter((id) => !id.startsWith('boss_')) },
  { kind: 'alien', prefix: 'alien_', ids: Object.keys(ALIENS).filter((id) => id.startsWith('boss_')) }, // boss : ligne à part
];
const ZOOMS = [0.5, 1, 1.5, 2, 3, 4];
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export class UnitViewerScene extends Phaser.Scene {
  private entries: Entry[] = [];
  private panel?: HTMLDivElement;
  private animSelect!: HTMLSelectElement;
  private info!: HTMLDivElement;
  private selected = ALL;
  private unitSelect?: HTMLSelectElement;
  private closeBtn?: HTMLButtonElement;
  /** Second panneau (vue détaillée) : statistiques de l'unité pour l'équilibrage. */
  private statsPanel?: HTMLDivElement;
  /** Vue d'ensemble : hauteur du contenu (monde) et barre de défilement (DOM) à droite. */
  private worldH = 0;
  private scrollBar?: HTMLDivElement;
  private scrollSpacer?: HTMLDivElement;
  private anim = 'idle';
  private facing = 1;
  /** Met à jour le surlignage des boutons d'orientation (défini à la création du panneau). */
  private syncSide?: () => void;
  private zoomFactor = 1;
  // Éditeur de placement (une seule unité affichée)
  private editorBox!: HTMLDivElement;
  private actionsRow!: HTMLElement;
  private fields!: Record<'ox' | 'oy' | 'mx' | 'my', HTMLInputElement>;
  private shadowSlider!: HTMLInputElement;
  private shadowLabel!: HTMLSpanElement;
  private scaleSlider!: HTMLInputElement;
  private scaleLabel!: HTMLSpanElement;
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
  private scope: Scope = 'animDir';
  /** Mode « placer le canon » : le clic gauche pose la bouche du canon au lieu de déplacer le sprite. */
  private placeMuzzle = false;
  private placeBtn!: HTMLButtonElement;
  private flashBox!: HTMLInputElement;
  private muzzleSection!: HTMLDivElement;

  constructor() {
    super(SCENES.viewer);
  }

  /** Trooper de référence (échelle) + bouton pour le masquer. */
  private scaleRef?: ScaleRef;

  create(): void {
    this.scaleRef = new ScaleRef(this);
    this.selected = ALL; // la scène est réutilisée : toujours rouvrir sur la vue de toutes les unités
    this.facing = 1; // et regardant à droite
    this.cameras.main.setBackgroundColor(VIEW_BG);
    this.drawGrid();
    this.buildPanel();
    this.buildEditorMarkers();
    this.rebuild();
    // retour d'un test d'alien (bouton « Tester ») : on rouvre la vue détaillée de cet alien
    const back = this.registry.get('viewerSelect') as string | undefined;
    this.registry.remove('viewerSelect');
    if (back) this.select_(back);

    const kb = this.input.keyboard!;
    // mode « placer le canon » : le clic gauche (maintenu ou non) pose la bouche du canon sur la frame affichée
    const place = (p: Phaser.Input.Pointer) => {
      if (this.placeMuzzle && p.leftButtonDown() && this.hasFlash()) this.dragMuzzle(p.worldX, p.worldY);
    };
    this.input.on('pointerdown', place);
    this.input.on('pointermove', place);
    kb.on('keydown-LEFT', () => this.stepFrame(-1));
    kb.on('keydown-RIGHT', () => this.stepFrame(1));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
      this.scaleRef?.destroy();
      this.closeBtn?.remove();
      this.statsPanel?.remove();
      this.scrollBar?.remove();
    });
  }

  update(time: number): void {
    this.scaleRef?.place();
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

    const groups = GROUPS.map((g) => ({ ...g, ids: g.ids.filter((u) => this.selected === ALL || `${g.prefix}${u}` === this.selected) })).filter(
      (g) => g.ids.length,
    );
    // au plus MAX_PER_ROW unités par ligne : un groupe plus long passe à la ligne
    const rows = groups.flatMap((g) => {
      const lines: typeof groups = [];
      for (let i = 0; i < g.ids.length; i += MAX_PER_ROW) lines.push({ ...g, ids: g.ids.slice(i, i + MAX_PER_ROW) });
      return lines;
    });
    const totalRows = rows.length;
    this.worldH = (totalRows - 1) * 190 + 280; // hauteur du contenu de la vue d'ensemble (marges : sprites hauts + étiquettes)
    const gap = this.selected === ALL ? 170 : 0;
    const rowGap = this.selected === ALL ? 190 : 0;
    rows.forEach((g, r) => {
      g.ids.forEach((unit, c) => {
        const x = (c - (g.ids.length - 1) / 2) * gap;
        const y = (r - (totalRows - 1) / 2) * rowGap;
        this.entries.push(this.makeEntry(g.kind, g.prefix, unit, x, y));
      });
    });

    this.fillAnimSelect();
    this.setupEditor();
    this.buildStats();
    this.fit();
  }

  /** Libellé sous l'unité : son nom affiché en jeu (FR) puis son id de visuel. */
  private labelOf(kind: Kind, unit: string, id: string): string {
    const name = getName(nameKey(kind, unit), 'en');
    const text = name ? `${name}
${id}` : id;
    return this.isInactive(kind, unit) ? `${text}
(inactif)` : text;
  }

  /** Unité définie mais écartée du jeu (hors ACTIVE_CLASSES / ACTIVE_ALIENS ; les boss, pilotés par la timeline, comptent comme actifs). */
  private isInactive(kind: Kind, unit: string): boolean {
    if (kind === 'alien') return !ALIENS[unit as AlienId].boss && !ACTIVE_ALIENS.includes(unit as AlienId);
    return !ACTIVE_CLASSES.includes(unit as SoldierClassId);
  }

  /** Texte d'une entrée de la liste « Unité » : nom anglais puis id. */
  private optionLabel(kind: Kind, prefix: string, unit: string): string {
    const name = getName(nameKey(kind, unit), 'en');
    const base = name ? `${name} (${prefix}${unit})` : `${prefix}${unit}`;
    return this.isInactive(kind, unit) ? `${base} — inactif` : base;
  }

  /** Sélectionne une unité (ou `ALL`) : met à jour la liste déroulante et reconstruit la vue. */
  private select_(value: string): void {
    this.selected = value;
    if (value === ALL) {
      this.facing = 1; // la vue de toutes les unités remet toujours l'orientation à droite
      this.syncSide?.();
    }
    this.syncChrome();
    if (this.unitSelect) this.unitSelect.value = value;
    this.rebuild();
  }

  private makeEntry(kind: Kind, prefix: string, unit: string, x: number, y: number): Entry {
    const id = `${prefix}${unit}`;
    // mêmes proportions qu'en jeu (WorldView.drawOverlay) ; la taille réglable s'applique en échelle
    const radius = kind === 'alien' ? ALIENS[unit as AlienId].radius : CLASSES[unit as keyof typeof CLASSES].radius;
    const shadow =
      kind === 'alien'
        ? this.add.ellipse(x, y, radius * 2.1, radius * 0.9, 0x000000, SHADOW_ALPHA)
        : this.add.ellipse(x, y, radius * 2.2, radius, 0x000000, SHADOW_ALPHA);
    const sprite = sprites.add(this, id, x, y);
    // unités inactives : affichées à moitié transparentes
    if (this.isInactive(kind, unit)) sprite.setAlpha(INACTIVE_ALPHA);
    // vue d'ensemble : un clic sur une unité ouvre sa vue détaillée
    if (this.selected === ALL) sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select_(id));
    const gunId = kind === 'soldier' ? `gun_${unit}` : undefined;
    const gun = gunId && !sprites.get(gunId).hidden ? sprites.add(this, gunId, x, y) : undefined;
    if (gun && this.isInactive(kind, unit)) gun.setAlpha(INACTIVE_ALPHA); // l'arme d'une classe inactive est transparente comme son soldat
    const label = this.add
      .text(x, y + 26, this.labelOf(kind, unit, id), { fontFamily: theme.font, fontSize: '13px', color: PALETTE.textDim, align: 'center' })
      .setOrigin(0.5, 0)
      .setAlpha(this.isInactive(kind, unit) ? INACTIVE_ALPHA : 1);
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

  /**
   * Noms d'animations proposés : uniquement celles qui existent dans les planches affichées. L'idle des aliens n'est pas listé quand
   * ils ont une marche : c'est le même cycle, plus lent. `idle` seul si rien n'est animé (rendu procédural).
   */
  private animNames(): string[] {
    const names = new Set<string>();
    for (const e of this.entries) {
      const anims = sprites.get(e.id).anims ?? {};
      for (const k of Object.keys(anims)) if (!(k === 'idle' && e.kind === 'alien' && anims.walk)) names.add(k);
    }
    if (!names.size) names.add('idle');
    const first = ['idle', 'walk'];
    return [...names].sort((a, b) => (first.indexOf(a) + 1 || 99) - (first.indexOf(b) + 1 || 99) || a.localeCompare(b));
  }

  private fillAnimSelect(): void {
    const names = this.animNames();
    if (!names.includes(this.anim)) this.anim = names.includes('idle') ? 'idle' : names[0];
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
    // Un alien qui a une marche ne joue jamais son idle en jeu (UnitViews : toujours `walk`) et seule sa marche a un ancrage réglé :
    // « idle » demandé (vue d'ensemble au premier affichage) → sa marche, sinon l'ombre paraît décalée.
    const wanted = this.anim === 'idle' && e.kind === 'alien' && sprites.hasAnim(e.id, 'walk') ? 'walk' : this.anim;
    const asked = sprites.get(e.id).anims?.[wanted];
    // Anim demandée, sinon idle (ou marche) de la planche, sinon procédural (aucune anim de planche).
    const name = asked ? wanted : (['idle', 'walk'].find((n) => sprites.hasAnim(e.id, n)));
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
    e.baseScale = sprites.scaleOf(e.id); // relue chaque frame : réglable avec le curseur Échelle
    const moving = e.playing === 'walk';
    let bob = 0;
    let lift = 0;
    let sx = e.baseScale;
    let sy = e.baseScale;
    if (!e.key) {
      if (e.kind === 'soldier') bob = moving ? -Math.abs(Math.sin(t * 14)) * 3 : Math.sin(t * 2.2) * 0.8;
      else if (e.kind === 'recruit') bob = Math.sin(t * 5) * 4;
      else {
        const f = 7;
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
    e.shadow.setScale((e.floats ? 0.7 : 1) * k, k).setAlpha(this.isInactive(e.kind, e.unit) ? INACTIVE_ALPHA : SHADOW_ALPHA);

    if (e.gun) {
      const aim = this.facing > 0 ? 0 : Math.PI;
      e.gun
        .setPosition(e.x + this.facing * 4, e.y - 17 * (e.unit === 'bruiser' ? 1.15 : 1) + bob)
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
    this.scopeSelect.value = this.scope;
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

    // --- Échelle ---
    this.scaleSlider = document.createElement('input');
    this.scaleSlider.type = 'range';
    this.scaleSlider.min = '0.2';
    this.scaleSlider.max = '3';
    this.scaleSlider.step = '0.01';
    this.scaleSlider.style.cssText = 'flex:1;min-width:80px';
    this.scaleLabel = document.createElement('span');
    this.scaleLabel.style.cssText = 'min-width:44px;text-align:right';
    this.scaleSlider.addEventListener('input', () => {
      const t = this.target;
      if (t) setPlacement(t.id, { scale: Number(this.scaleSlider.value) });
    });
    this.scaleSlider.addEventListener('change', () => this.scaleSlider.blur());

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

    // --- Muzzle flash de l'unité (case) + pose au clic ---
    const flashRow = document.createElement('label');
    flashRow.style.cssText = 'display:flex;gap:6px;align-items:center';
    this.flashBox = document.createElement('input');
    this.flashBox.type = 'checkbox';
    this.flashBox.addEventListener('change', () => {
      const t = this.target;
      if (t) setPlacement(t.id, { muzzleFlash: this.flashBox.checked });
      if (!this.flashBox.checked) this.setPlaceMuzzle(false);
      this.flashBox.blur();
    });
    flashRow.append(this.flashBox, 'Cette unité a un muzzle flash');
    this.placeBtn = this.button('Placer le canon au clic : non', () => this.setPlaceMuzzle(!this.placeMuzzle));

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
    const save = this.button('Save', () => {
      const t = this.target;
      if (t) void saveSpriteToCode(t.id).then((msg) => (this.info.textContent = msg));
    });
    const reset = this.button('Reset', () => {
      const t = this.target;
      if (!t) return;
      resetPlacement(t.id);
      this.info.textContent = 'Retour à la dernière sauvegarde.';
    });

    this.muzzleSection = document.createElement('div');
    this.muzzleSection.style.cssText = 'display:none;flex-direction:column;gap:6px';
    this.muzzleSection.append(
      note('Active « Placer au clic » : le clic gauche pose le canon sur la frame affichée (clic gauche normal : déplacer le sprite). Le point rouge se glisse aussi. ← → : frame précédente / suivante.'),
      this.placeBtn,
      line(this.pauseBox, 'Pause', this.frameSlider, this.frameLabel),
      line(mx.row, my.row),
      line(allFrames, clearFrame, unitDefault),
      flash,
    );

    box.append(
      title('Échelle'),
      note("Taille d'affichage de l'unité (1 = planche telle quelle). Ne change pas la hitbox."),
      line(this.scaleSlider, this.scaleLabel),
      title('Ancrage'),
      note("Glisse le sprite sous la croix jaune. La portée dit où le réglage s'applique."),
      this.scopeSelect,
      this.status,
      line(ox.row, oy.row),
      line(clearAnchor),
      title('Ombre portée'),
      note("Taille de l'ombre sous l'unité (1 = défaut). Appliquée aussi en jeu."),
      line(this.shadowSlider, this.shadowLabel),
      title('Muzzle flash'),
      note('Coche pour que cette unité tire avec un flash (seul le Trooper en a un). Décoche pour le retirer.'),
      flashRow,
      this.muzzleSection,
    );
    // Save / Reset / Copier : en haut du panneau, sous le titre (affichés avec l'éditeur)
    this.actionsRow = line(save, reset, copy);
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

  /** L'unité éditée a-t-elle un muzzle flash (case cochée) ? */
  private hasFlash(): boolean {
    const t = this.target;
    return !!t && !!sprites.get(t.id).muzzleFlash;
  }

  private setPlaceMuzzle(on: boolean): void {
    this.placeMuzzle = on && this.hasFlash();
    this.placeBtn.textContent = `Placer le canon au clic : ${this.placeMuzzle ? 'oui' : 'non'}`;
    this.placeBtn.style.background = this.placeMuzzle ? '#c0392b' : '';
    if (this.placeMuzzle) this.setPaused(true); // la frame affichée doit rester fixe pour y poser le point
    this.input.setDefaultCursor(this.placeMuzzle ? 'crosshair' : 'default');
  }

  /** Active l'édition si une seule unité est affichée. */
  private setupEditor(): void {
    const t = this.target;
    this.editorBox.style.display = t ? 'flex' : 'none';
    this.actionsRow.style.display = t ? 'flex' : 'none';
    this.cross.setVisible(!!t);
    this.muzzleDot.setVisible(!!t && this.hasFlash());
    this.flash.setAlpha(0);
    this.setPlaceMuzzle(false);
    if (!t) return;
    t.sprite.setInteractive({ draggable: true, useHandCursor: true });
    let last = { x: 0, y: 0 };
    t.sprite.on('dragstart', (p: Phaser.Input.Pointer) => (last = { x: p.worldX, y: p.worldY }));
    t.sprite.on('drag', (p: Phaser.Input.Pointer) => {
      if (this.placeMuzzle) return; // le clic pose le canon, il ne déplace pas le sprite
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
    if (key) {
      setAnchor(t.id, key, value);
      // le décalage vertical doit être le même à gauche et à droite : le côté opposé reçoit le même Y (son X, lui, est en miroir)
      const m = /^(.+):(left|right)$/.exec(key);
      if (m) {
        const other = `${m[1]}:${m[2] === 'left' ? 'right' : 'left'}`;
        const prev = sprites.get(t.id).anchors?.[other];
        setAnchor(t.id, other, [prev ? prev[0] : 1 - value[0], value[1]]);
      }
    } else setPlacement(t.id, { originX: value[0], originY: value[1] });
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
    const hasFlash = this.hasFlash();
    const m = hasFlash ? sprites.muzzleFor(t.id, t.playing, idx) : undefined;
    const own = !!sprites.get(t.id).muzzles?.[t.playing]?.[idx];
    const spot = this.worldOf(t, m?.[0] ?? 0.85, m?.[1] ?? 0.5);
    this.muzzleDot
      .setVisible(hasFlash)
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
    const sc = sprites.scaleOf(t.id);
    if (document.activeElement !== this.scaleSlider) this.scaleSlider.value = String(sc);
    this.scaleLabel.textContent = `×${r3(sc)}`;
    const sh = sprites.get(t.id).shadow ?? 1;
    if (document.activeElement !== this.shadowSlider) this.shadowSlider.value = String(sh);
    this.shadowLabel.textContent = `×${r3(sh)}`;
    const flashOn = !!sprites.get(t.id).muzzleFlash;
    if (this.flashBox.checked !== flashOn) this.flashBox.checked = flashOn;
    this.muzzleSection.style.display = flashOn ? 'flex' : 'none';
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
    const title = header("Visionneuse d'unités", () => this.select_(ALL));

    const units = this.select('Unité', [
      [ALL, 'Toutes les unités'],
      ...GROUPS.flatMap((g) => g.ids.map((u) => [`${g.prefix}${u}`, this.optionLabel(g.kind, g.prefix, u)] as [string, string])),
    ]);
    this.unitSelect = units.select;
    units.select.addEventListener('change', () => this.select_(units.select.value));

    const anims = this.select('Animation', []);
    this.animSelect = anims.select;
    anims.select.addEventListener('change', () => {
      this.anim = anims.select.value;
      this.playAll();
    });

    // orientation : deux boutons flèche (le bouton actif est surligné)
    const sideRow = document.createElement('div');
    sideRow.style.cssText = 'display:flex;gap:6px;align-items:center';
    const sideBtns = [-1, 1].map((dir) => {
      const b = this.button(dir < 0 ? '←' : '→', () => {
        this.facing = dir;
        sync();
        this.playAll();
      });
      b.title = dir < 0 ? 'Regarde à gauche' : 'Regarde à droite';
      return { dir, b };
    });
    const sync = (): void => {
      for (const { dir, b } of sideBtns) b.style.background = dir === this.facing ? '#4a8' : '';
    };
    sync();
    this.syncSide = sync;
    sideRow.append('Orientation', ...sideBtns.map((x) => x.b));

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

    const editor = this.buildEditorBox(); // crée aussi la rangée Save / Reset / Copier
    p.append(title, this.actionsRow, zoom.row, units.row, anims.row, sideRow, editor, this.info);
    document.body.append(p);
    this.panel = p;

    // vue d'ensemble : pas de panneau, seulement une croix en haut à droite pour quitter
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Fermer et retourner au jeu';
    close.style.cssText =
      'position:fixed;top:8px;right:28px;z-index:99999;font:22px system-ui,sans-serif;line-height:1;cursor:pointer;padding:4px 12px;' +
      'background:rgba(0,0,0,0.78);color:#dfe;border:1px solid #444;border-radius:6px';
    close.addEventListener('click', () => {
      close.blur();
      this.back();
    });
    document.body.append(close);
    this.closeBtn = close;

    // barre de défilement native (vue d'ensemble) ; la molette de la souris la fait aussi défiler
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:16px;overflow-y:scroll;z-index:99998;display:none';
    const spacer = document.createElement('div');
    spacer.style.width = '1px';
    bar.append(spacer);
    bar.addEventListener('scroll', this.fit);
    document.body.append(bar);
    this.scrollBar = bar;
    this.scrollSpacer = spacer;
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.selected === ALL && this.scrollBar) this.scrollBar.scrollTop += dy;
    });
    this.syncChrome();
  }

  /** Étiquette lisible d'un chemin de stat (`lob.range` → « lob · range »). */
  private statLabel(path: string): string {
    return path.split('.').join(' · ');
  }

  /** Second panneau : un slider par statistique de l'unité (PV, vitesse, dégâts, capacités…), appliqué en direct, avec Save / Reset. */
  private buildStats(): void {
    this.statsPanel?.remove();
    this.statsPanel = undefined;
    const t = this.target;
    if (!t || t.kind === 'recruit') return;
    const kind = t.kind === 'alien' ? 'alien' : 'soldier';
    const id = t.unit;
    const p = document.createElement('div');
    p.style.cssText =
      'position:fixed;top:8px;left:330px;z-index:99999;width:270px;max-height:calc(100vh - 16px);overflow:auto;padding:10px;' +
      'background:rgba(0,0,0,0.78);color:#dfe;font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:8px';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap';
    const syncs: (() => void)[] = [];
    const rows = listStats(kind, id).map((st) => {
      // échelle d'après la plus grande des valeurs courante et du code : à 0, la réglette garde sa course (on peut remonter à la valeur d'origine)
      const mag = Math.max(Math.abs(st.value), Math.abs(getDefaultStat(kind, id, st.path)));
      const step = mag >= 50 ? 1 : mag >= 10 ? 0.5 : mag >= 1 ? 0.05 : 0.01;
      const c = slider(this.statLabel(st.path), {
        min: 0,
        max: Math.max(5, Math.ceil(mag * 3)),
        step,
        get: () => getStat(kind, id, st.path),
        set: (nv) => setStat(kind, id, st.path, nv),
      });
      syncs.push(c.sync);
      return c.row;
    });
    p.append(
      header(`Stats — ${getName(nameKey(t.kind, t.unit), 'en') || id}`, () => this.select_(ALL)),
      ...(kind === 'alien'
        ? [
            line(
              button('▶ Test', () => {
                this.registry.set('alienTest', { alien: id as AlienId, back: this.selected } satisfies AlienTestRequest);
                this.scene.start(SCENES.game);
              }),
            ),
          ]
        : []),
      note("Équilibrage : appliqué en direct aux prochaines apparitions (les unités déjà en jeu gardent leurs valeurs). Save écrit dans data/aliens.ts / data/classes.ts."),
      line(
        button('Save (toutes les unités modifiées)', () => void saveAllStatsToCode(kind, id).then((m) => (info.textContent = m))),
        button('Reset', () => {
          resetStats(kind, id);
          for (const sy of syncs) sy();
          info.textContent = 'Retour à la dernière sauvegarde.';
        }),
      ),
      info,
      ...rows,
    );
    document.body.append(p);
    this.statsPanel = p;
  }

  /** Vue d'ensemble : panneau masqué, croix de sortie affichée ; vue d'une unité : l'inverse. */
  private syncChrome(): void {
    const all = this.selected === ALL;
    if (this.panel) this.panel.style.display = all ? 'none' : 'flex';
    if (this.closeBtn) this.closeBtn.style.display = all ? 'block' : 'none';
    if (!all && this.scrollBar) this.scrollBar.style.display = 'none';
    this.scaleRef?.setEnabled(!all); // trooper de référence : seulement dans les vues détaillées
    if (all) this.statsPanel?.remove();
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
    const all = this.selected === ALL;
    cam.setZoom(all ? 0.8 : this.zoomFactor); // vue d'ensemble : toujours à 80 %
    // vue d'ensemble : si le contenu dépasse l'écran, la barre de défilement fait glisser la caméra
    const contentPx = this.worldH * cam.zoom;
    const overflow = all && contentPx > this.scale.height;
    if (this.scrollBar && this.scrollSpacer) {
      this.scrollBar.style.display = overflow ? 'block' : 'none';
      this.scrollSpacer.style.height = `${contentPx}px`;
    }
    const scrollPx = overflow && this.scrollBar ? this.scrollBar.scrollTop : 0;
    // repères et étiquettes de taille constante à l'écran
    this.cross?.setScale(1 / cam.zoom);
    this.muzzleDot?.setScale(1 / cam.zoom);
    for (const e of this.entries) e.label.setScale(1 / cam.zoom).setY(e.y + 26 / cam.zoom);
    // décalé vers la droite pour laisser la place au panneau
    cam.centerOn(all ? 0 : -(300 / 2) / cam.zoom, overflow ? (-contentPx / 2 + scrollPx + this.scale.height / 2) / cam.zoom : 0);
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
