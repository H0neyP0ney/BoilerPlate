import Phaser from 'phaser';
import { clamp, sprites } from '@xiao/engine';
import { OBSTACLES, OBSTACLE_IDS, STAIN_IDS, type HitCircle, type ObstacleId, type StainDef, type StainId } from '../data/obstacles';
import { SCENES, VISUAL } from '../config';
import { header } from '../dev/devUi';
import { obstacleSnippet, resetObstacle, setObstacle } from '../debugObstacles';

/**
 * Visionneuse d'obstacles (dev uniquement) : règle, pour chaque obstacle, sa hitbox (cercles de collision) et son
 * jeu de taches sombres (le jeu en tire une au hasard par obstacle posé).
 * Ouverture : bouton « hitbox » en haut à gauche du jeu, ou `?obstacles` dans l'URL.
 *
 * Le champ « Taille (échelle) » redimensionne l'obstacle entier (sprite, hitbox et taches). En jeu, chaque obstacle posé
 * varie en plus de ±10 % (voir OBSTACLE_SIZE_JITTER dans data/maps.ts).
 *
 * Deux modes (liste « Édition ») : sur le canvas, glisser un élément le déplace, glisser sa poignée blanche change
 * son rayon (hitbox) ou sa largeur (tache) ; flèches = 1 px (Maj = 5 px) ; Suppr = supprime. Un Gunner de référence
 * donne l'échelle. Réglages mémorisés dans le navigateur (debugObstacles.ts), appliqués à la prochaine partie ;
 * « Copier le code » donne l'entrée à coller dans data/obstacles.ts.
 */
type Mode = 'hitbox' | 'stain';
const ZOOMS = [1, 1.5, 2, 3, 4];
const GUNNER_X = 170;
const STAIN_DEPTH = 0.5;

export class ObstacleEditorScene extends Phaser.Scene {
  private id: ObstacleId = OBSTACLE_IDS[0];
  private mode: Mode = 'hitbox';
  private selected = 0;
  private selectedStain = 0;
  private showAllStains = false;
  private zoom = 2;
  private sprite!: Phaser.GameObjects.Image;
  private gunner?: Phaser.GameObjects.Sprite;
  private overlay!: Phaser.GameObjects.Graphics;
  private stainImgs: Phaser.GameObjects.Image[] = [];
  private panel?: HTMLDivElement;
  private info!: HTMLDivElement;
  private obstacleSelect!: HTMLSelectElement;
  private modeSelect!: HTMLSelectElement;
  private circleSelect!: HTMLSelectElement;
  private stainSelect!: HTMLSelectElement;
  private stainTexSelect!: HTMLSelectElement;
  private flipBox!: HTMLInputElement;
  private fields!: Record<'x' | 'y' | 'r' | 'scale' | 'sx' | 'sy' | 'sw' | 'ssy', HTMLInputElement>;
  private drag: { mode: 'move' | 'resize' | 'resizeY'; dx: number; dy: number } | null = null;

  constructor() {
    super(SCENES.obstacles);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x2b3a2e);
    this.drawGrid();
    this.sprite = this.add.image(0, 0, OBSTACLE_IDS[0]).setDepth(1);
    this.overlay = this.add.graphics().setDepth(10);
    if (this.textures.exists('soldier_gunner')) {
      this.gunner = sprites.add(this, 'soldier_gunner', GUNNER_X, 0).setDepth(1);
      sprites.play(this.gunner, 'soldier_gunner', 'idle');
    }
    this.buildPanel();
    this.show(this.id);

    const p = this.input;
    p.on('pointerdown', this.onDown);
    p.on('pointermove', this.onMove);
    p.on('pointerup', () => (this.drag = null));
    const kb = p.keyboard!;
    kb.on('keydown', this.onKey);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
    });
  }

  update(): void {
    this.draw();
  }

  // ---------- Données ----------

  private get def() {
    return OBSTACLES[this.id];
  }

  private get circle(): HitCircle | undefined {
    return this.def.hitbox[this.selected];
  }

  private get stain(): StainDef | undefined {
    return this.def.stains[this.selectedStain];
  }

  /** Modifie la hitbox (et/ou l'échelle), enregistre et rafraîchit l'interface. */
  private edit(fn: (hitbox: HitCircle[]) => void, scale?: number): void {
    const hitbox = this.def.hitbox.map((c) => ({ ...c }));
    fn(hitbox);
    setObstacle(this.id, { hitbox, scale });
    if (scale !== undefined) this.applyScale();
    this.selected = clamp(this.selected, 0, Math.max(0, hitbox.length - 1));
    this.refreshPanel();
  }

  /** Modifie le jeu de taches, enregistre et rafraîchit l'interface. */
  private editStains(fn: (stains: StainDef[]) => void): void {
    const stains = this.def.stains.map((s) => ({ ...s }));
    fn(stains);
    setObstacle(this.id, { stains });
    this.selectedStain = clamp(this.selectedStain, 0, Math.max(0, stains.length - 1));
    this.refreshPanel();
  }

  /**
   * Change la taille de l'obstacle : l'échelle du sprite, mais aussi la hitbox et les taches dans la même proportion
   * (leurs coordonnées sont en pixels du monde), pour que l'ensemble reste cohérent.
   */
  private rescale(scale: number): void {
    const k = scale / this.def.scale;
    const r = (v: number) => Math.round(v * 10) / 10;
    const hitbox = this.def.hitbox.map((c) => ({ x: r(c.x * k), y: r(c.y * k), r: r(c.r * k) }));
    const stains = this.def.stains.map((s) => ({ ...s, x: r(s.x * k), y: r(s.y * k), w: r(s.w * k) }));
    setObstacle(this.id, { scale, hitbox, stains });
    this.applyScale();
    this.refreshPanel();
  }

  private show(id: ObstacleId): void {
    this.id = id;
    this.selected = 0;
    this.selectedStain = 0;
    this.sprite.setTexture(id);
    const d = this.def;
    this.sprite.setOrigin(d.originX, d.originY);
    this.applyScale();
    this.obstacleSelect.value = id;
    this.refreshPanel();
    this.fit();
  }

  private applyScale(): void {
    this.sprite.setScale(this.def.scale);
  }

  // ---------- Canvas ----------

  /** Une unité d'écran = 1 px à l'écran : les poignées gardent une taille constante quel que soit le zoom. */
  private get px(): number {
    return 1 / this.cameras.main.zoom;
  }

  /** (Re)crée les images de taches : la sélectionnée est montrée comme en jeu, les autres en fantômes si demandé. */
  private syncStains(): void {
    for (const i of this.stainImgs) i.destroy();
    this.stainImgs = [];
    this.def.stains.forEach((s, i) => {
      const sel = i === this.selectedStain;
      if (!sel && !this.showAllStains) return;
      if (!this.textures.exists(s.tex)) return;
      const img = this.add.image(s.x, s.y, s.tex).setFlipX(s.flip).setDepth(STAIN_DEPTH);
      img.setScale(s.w / img.width, (s.w * s.sy) / img.width).setAlpha(sel ? VISUAL.stainAlpha : VISUAL.stainAlpha * 0.35);
      this.stainImgs.push(img);
    });
  }

  private draw(): void {
    const g = this.overlay;
    g.clear();
    const u = this.px;
    // ancrage (point posé sur la carte)
    g.lineStyle(1.5 * u, 0xffd166, 1).lineBetween(-10 * u, 0, 10 * u, 0).lineBetween(0, -10 * u, 0, 10 * u);
    const hitMode = this.mode === 'hitbox';
    this.def.hitbox.forEach((c, i) => {
      const sel = hitMode && i === this.selected;
      const a = hitMode ? 1 : 0.35;
      g.fillStyle(sel ? 0xffd166 : 0xff5a5a, (sel ? 0.28 : 0.2) * a).fillCircle(c.x, c.y, c.r);
      g.lineStyle((sel ? 2.5 : 1.5) * u, sel ? 0xffd166 : 0xff7a7a, a).strokeCircle(c.x, c.y, c.r);
      if (hitMode) g.fillStyle(sel ? 0xffd166 : 0xff7a7a, 1).fillCircle(c.x, c.y, 3 * u);
      if (sel) g.fillStyle(0xffffff, 1).lineStyle(1.5 * u, 0x000000, 1).fillCircle(c.x + c.r, c.y, 6 * u).strokeCircle(c.x + c.r, c.y, 6 * u);
    });
    if (!hitMode) {
      // cadre de la tache sélectionnée + poignée de largeur à droite
      this.def.stains.forEach((s, i) => {
        const b = this.stainBounds(s);
        const sel = i === this.selectedStain;
        if (!sel && !this.showAllStains) return;
        g.lineStyle((sel ? 2 : 1) * u, sel ? 0x7dd3ff : 0x7dd3ff, sel ? 1 : 0.35).strokeRect(b.x, b.y, b.w, b.h);
        if (sel) {
          g.fillStyle(0x7dd3ff, 1).fillCircle(s.x, s.y, 3 * u);
          g.fillStyle(0xffffff, 1).lineStyle(1.5 * u, 0x000000, 1).fillCircle(s.x + s.w / 2, s.y, 6 * u).strokeCircle(s.x + s.w / 2, s.y, 6 * u);
          // poignée de hauteur (échelle Y) en bas
          g.fillStyle(0xffe08a, 1).lineStyle(1.5 * u, 0x000000, 1).fillCircle(s.x, b.y + b.h, 6 * u).strokeCircle(s.x, b.y + b.h, 6 * u);
        }
      });
    }
  }

  /** Boîte d'une tache dans le monde (hauteur selon le ratio de son image). */
  private stainBounds(s: StainDef): { x: number; y: number; w: number; h: number } {
    const f = this.textures.exists(s.tex) ? this.textures.getFrame(s.tex) : undefined;
    const h = (f ? (s.w * f.height) / f.width : s.w) * s.sy;
    return { x: s.x - s.w / 2, y: s.y - h / 2, w: s.w, h };
  }

  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    const u = this.px;
    if (this.mode === 'hitbox') {
      const c = this.circle;
      // poignée de rayon du cercle sélectionné
      if (c && Math.hypot(p.worldX - (c.x + c.r), p.worldY - c.y) < 10 * u) {
        this.drag = { mode: 'resize', dx: 0, dy: 0 };
        return;
      }
      // cercle sous le pointeur (le plus petit d'abord : on peut atteindre les cercles imbriqués)
      const hits = this.def.hitbox
        .map((h, i) => ({ h, i, d: Math.hypot(p.worldX - h.x, p.worldY - h.y) }))
        .filter((o) => o.d <= o.h.r)
        .sort((a, b) => a.h.r - b.h.r);
      if (!hits.length) return;
      this.selected = hits[0].i;
      const h = hits[0].h;
      this.drag = { mode: 'move', dx: h.x - p.worldX, dy: h.y - p.worldY };
      this.refreshPanel();
      return;
    }
    // mode taches : poignée de largeur de la tache sélectionnée, sinon tache sous le pointeur (la plus petite d'abord)
    const s = this.stain;
    if (s && Math.hypot(p.worldX - (s.x + s.w / 2), p.worldY - s.y) < 10 * u) {
      this.drag = { mode: 'resize', dx: 0, dy: 0 };
      return;
    }
    if (s) {
      const b = this.stainBounds(s);
      if (Math.hypot(p.worldX - s.x, p.worldY - (b.y + b.h)) < 10 * u) {
        this.drag = { mode: 'resizeY', dx: 0, dy: 0 };
        return;
      }
    }
    const hits = this.def.stains
      .map((st, i) => ({ st, i, b: this.stainBounds(st) }))
      .filter((o) => p.worldX >= o.b.x && p.worldX <= o.b.x + o.b.w && p.worldY >= o.b.y && p.worldY <= o.b.y + o.b.h)
      .filter((o) => o.i === this.selectedStain || this.showAllStains)
      .sort((a, b) => a.b.w * a.b.h - b.b.w * b.b.h);
    if (!hits.length) return;
    this.selectedStain = hits[0].i;
    this.drag = { mode: 'move', dx: hits[0].st.x - p.worldX, dy: hits[0].st.y - p.worldY };
    this.refreshPanel();
  };

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    if (!this.drag || !p.isDown) return;
    const drag = this.drag;
    if (this.mode === 'hitbox') {
      this.edit((hb) => {
        const c = hb[this.selected];
        if (!c) return;
        if (drag.mode === 'move') {
          c.x = Math.round(p.worldX + drag.dx);
          c.y = Math.round(p.worldY + drag.dy);
        } else {
          c.r = Math.max(2, Math.round(Math.hypot(p.worldX - c.x, p.worldY - c.y)));
        }
      });
      return;
    }
    this.editStains((st) => {
      const s = st[this.selectedStain];
      if (!s) return;
      if (drag.mode === 'move') {
        s.x = Math.round(p.worldX + drag.dx);
        s.y = Math.round(p.worldY + drag.dy);
      } else if (drag.mode === 'resize') {
        s.w = Math.max(10, Math.round(2 * (p.worldX - s.x)));
      } else {
        // poignée du bas : la hauteur affichée vaut 2 × (distance au centre) ; sy = hauteur / hauteur d'origine
        const f = this.textures.exists(s.tex) ? this.textures.getFrame(s.tex) : undefined;
        const natural = f ? (s.w * f.height) / f.width : s.w;
        s.sy = Math.max(0.1, Math.round(((2 * (p.worldY - s.y)) / natural) * 100) / 100);
      }
    });
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    const step = e.shiftKey ? 5 : 1;
    const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = dir[e.key];
    if (d) {
      if (this.mode === 'hitbox') {
        this.edit((hb) => {
          const c = hb[this.selected];
          if (c) {
            c.x += d[0];
            c.y += d[1];
          }
        });
      } else {
        this.editStains((st) => {
          const s = st[this.selectedStain];
          if (s) {
            s.x += d[0];
            s.y += d[1];
          }
        });
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.mode === 'hitbox') this.removeCircle();
      else this.removeStain();
    }
  };

  private readonly fit = (): void => {
    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    // décalé vers la droite (panneau à gauche) et vers le haut (l'obstacle s'élève au-dessus de son ancrage)
    const h = this.sprite.displayHeight * this.def.originY;
    cam.centerOn(-(300 / 2) / this.zoom + GUNNER_X / 2, -h / 2 + 10);
  };

  private drawGrid(): void {
    const g = this.add.graphics().setDepth(-1);
    g.lineStyle(1, 0xffffff, 0.06);
    for (let i = -40; i <= 40; i++) g.lineBetween(i * 50, -2000, i * 50, 2000).lineBetween(-2000, i * 50, 2000, i * 50);
    g.lineStyle(1, 0xffffff, 0.12).lineBetween(-2000, 0, 2000, 0); // ligne de sol (y = 0)
  }

  // ---------- Actions ----------

  private addCircle(): void {
    this.edit((hb) => {
      hb.push({ x: 0, y: -20, r: 24 });
      this.selected = hb.length - 1;
    });
  }

  private duplicateCircle(): void {
    const c = this.circle;
    if (!c) return;
    this.edit((hb) => {
      hb.push({ x: c.x + 16, y: c.y, r: c.r });
      this.selected = hb.length - 1;
    });
  }

  private removeCircle(): void {
    if (this.def.hitbox.length <= 1) return; // au moins un cercle : un obstacle sans collision n'en est plus un
    this.edit((hb) => hb.splice(this.selected, 1));
  }

  private addStain(): void {
    const ref = this.stain;
    const w = ref?.w ?? Math.round(this.sprite.displayWidth * 1.45);
    this.editStains((st) => {
      st.push({ tex: STAIN_IDS[st.length % STAIN_IDS.length], x: ref?.x ?? 0, y: ref?.y ?? 0, w, sy: ref?.sy ?? 1, flip: false });
      this.selectedStain = st.length - 1;
    });
  }

  private duplicateStain(): void {
    const s = this.stain;
    if (!s) return;
    this.editStains((st) => {
      st.push({ ...s });
      this.selectedStain = st.length - 1;
    });
  }

  private removeStain(): void {
    if (!this.stain) return;
    this.editStains((st) => st.splice(this.selectedStain, 1));
  }

  // ---------- Interface ----------

  private buildPanel(): void {
    const p = document.createElement('div');
    p.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:99999;width:290px;max-height:calc(100vh - 16px);overflow:auto;padding:10px;' +
      'background:rgba(0,0,0,0.78);color:#dfe;font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:8px';
    const heading = (text: string) => {
      const b = document.createElement('b');
      b.textContent = text;
      b.style.cssText = 'color:#ffd166;border-top:1px solid #444;padding-top:6px';
      return b;
    };
    const title = header("Visionneuse d'obstacles", () => this.back());
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:#aab';
    note.textContent =
      "Glisse un élément pour le déplacer, sa poignée blanche pour le rayon (hitbox) ou la largeur (tache), la poignée jaune du bas pour l'échelle Y d'une tache. Flèches : 1 px (Maj : 5). Suppr : supprimer. Croix jaune = ancrage.";

    const obstacle = this.select('Obstacle', OBSTACLE_IDS.map((id) => [id, id] as [string, string]));
    this.obstacleSelect = obstacle.select;
    obstacle.select.addEventListener('change', () => this.show(obstacle.select.value as ObstacleId));

    const mode = this.select('Édition', [
      ['hitbox', 'Hitbox (cercles)'],
      ['stain', 'Taches (jeu de variantes)'],
    ]);
    this.modeSelect = mode.select;
    mode.select.addEventListener('change', () => {
      this.mode = mode.select.value as Mode;
      this.drag = null;
    });

    const zoom = this.select('Zoom', ZOOMS.map((z) => [String(z), `${z * 100} %`] as [string, string]));
    zoom.select.value = String(this.zoom);
    zoom.select.addEventListener('change', () => {
      this.zoom = Number(zoom.select.value);
      this.fit();
    });

    const field = (label: string, onSet: (v: number) => void, step = 1) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(step);
      input.style.cssText = 'width:66px;padding:2px;font:inherit';
      input.addEventListener('input', () => Number.isFinite(input.valueAsNumber) && onSet(input.valueAsNumber));
      input.addEventListener('change', () => input.blur());
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:4px;align-items:center';
      row.append(label, input);
      return { row, input };
    };
    const line = (...items: (HTMLElement | string)[]) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
      d.append(...items);
      return d;
    };

    // --- hitbox ---
    const circle = this.select('Cercle', []);
    this.circleSelect = circle.select;
    circle.select.addEventListener('change', () => {
      this.selected = Number(circle.select.value);
      this.mode = 'hitbox';
      this.modeSelect.value = 'hitbox';
      this.refreshPanel();
    });
    const fx = field('x', (v) => this.edit((hb) => hb[this.selected] && (hb[this.selected].x = v)));
    const fy = field('y', (v) => this.edit((hb) => hb[this.selected] && (hb[this.selected].y = v)));
    const fr = field('r', (v) => this.edit((hb) => hb[this.selected] && (hb[this.selected].r = Math.max(2, v))));
    const fs = field('Taille (échelle)', (v) => v > 0.05 && this.rescale(v), 0.01);

    // --- taches ---
    const stain = this.select('Tache', []);
    this.stainSelect = stain.select;
    stain.select.addEventListener('change', () => {
      this.selectedStain = Number(stain.select.value);
      this.mode = 'stain';
      this.modeSelect.value = 'stain';
      this.refreshPanel();
    });
    const tex = this.select('Image', STAIN_IDS.map((id) => [id, id] as [string, string]));
    this.stainTexSelect = tex.select;
    tex.select.addEventListener('change', () => this.editStains((st) => st[this.selectedStain] && (st[this.selectedStain].tex = tex.select.value as StainId)));
    const sx = field('x', (v) => this.editStains((st) => st[this.selectedStain] && (st[this.selectedStain].x = v)));
    const sy = field('y', (v) => this.editStains((st) => st[this.selectedStain] && (st[this.selectedStain].y = v)));
    const sw = field('largeur', (v) => this.editStains((st) => st[this.selectedStain] && (st[this.selectedStain].w = Math.max(10, v))));
    const ssy = field('échelle Y', (v) => v > 0.05 && this.editStains((st) => st[this.selectedStain] && (st[this.selectedStain].sy = v)), 0.05);
    this.fields = { x: fx.input, y: fy.input, r: fr.input, scale: fs.input, sx: sx.input, sy: sy.input, sw: sw.input, ssy: ssy.input };
    const flip = document.createElement('label');
    flip.style.cssText = 'display:flex;gap:6px;align-items:center';
    this.flipBox = document.createElement('input');
    this.flipBox.type = 'checkbox';
    this.flipBox.addEventListener('change', () => {
      this.editStains((st) => st[this.selectedStain] && (st[this.selectedStain].flip = this.flipBox.checked));
      this.flipBox.blur();
    });
    flip.append(this.flipBox, 'Retourner (miroir)');
    const allStains = document.createElement('label');
    allStains.style.cssText = 'display:flex;gap:6px;align-items:center';
    const all = document.createElement('input');
    all.type = 'checkbox';
    all.addEventListener('change', () => {
      this.showAllStains = all.checked;
      this.syncStains();
      all.blur();
    });
    allStains.append(all, 'Montrer toutes les taches (fantômes)');

    const showGunner = document.createElement('label');
    showGunner.style.cssText = 'display:flex;gap:6px;align-items:center';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      this.gunner?.setVisible(cb.checked);
      cb.blur();
    });
    showGunner.append(cb, 'Afficher un Gunner (échelle)');

    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:12px;color:#9fe;min-height:2.4em;white-space:pre-wrap';

    const copy = this.button('Copier le code', () => {
      const code = obstacleSnippet(this.id);
      void navigator.clipboard?.writeText(code).catch(() => {});
      this.info.textContent = `Copié — à coller dans OBSTACLES (data/obstacles.ts) :\n${code}`;
    });
    const reset = this.button("Réinitialiser l'obstacle", () => {
      resetObstacle(this.id);
      this.show(this.id);
      this.info.textContent = 'Valeurs du fichier de données restaurées.';
    });

    p.append(
      title,
      note,
      obstacle.row,
      mode.row,
      zoom.row,
      fs.row,
      heading('Hitbox'),
      circle.row,
      line(fx.row, fy.row, fr.row),
      line(this.button('+ Cercle', () => this.addCircle()), this.button('Dupliquer', () => this.duplicateCircle()), this.button('Supprimer', () => this.removeCircle())),
      heading('Taches (une tirée au hasard par obstacle en jeu)'),
      stain.row,
      tex.row,
      line(sx.row, sy.row, sw.row),
      line(ssy.row),
      flip,
      line(this.button('+ Tache', () => this.addStain()), this.button('Dupliquer', () => this.duplicateStain()), this.button('Supprimer', () => this.removeStain())),
      allStains,
      heading('Divers'),
      showGunner,
      line(copy, reset),
      this.info,
    );
    document.body.append(p);
    this.panel = p;
  }

  /** Remet listes et champs en accord avec les données (sans toucher à un champ en cours de saisie). */
  private refreshPanel(): void {
    const hb = this.def.hitbox;
    this.circleSelect.replaceChildren(
      ...hb.map((c, i) => new Option(`Cercle ${i + 1} — (${Math.round(c.x)}, ${Math.round(c.y)}) r ${Math.round(c.r)}`, String(i), false, i === this.selected)),
    );
    const st = this.def.stains;
    this.stainSelect.replaceChildren(
      ...(st.length
        ? st.map((s, i) => new Option(`Tache ${i + 1} — ${s.tex} (${Math.round(s.x)}, ${Math.round(s.y)}) l ${Math.round(s.w)}`, String(i), false, i === this.selectedStain))
        : [new Option('(aucune tache)', '')]),
    );
    const set = (i: HTMLInputElement, v: number | undefined) => {
      if (document.activeElement !== i) i.value = v === undefined ? '' : String(Math.round(v * 100) / 100);
    };
    const c = this.circle;
    set(this.fields.x, c?.x);
    set(this.fields.y, c?.y);
    set(this.fields.r, c?.r);
    set(this.fields.scale, this.def.scale);
    const s = this.stain;
    set(this.fields.sx, s?.x);
    set(this.fields.sy, s?.y);
    set(this.fields.sw, s?.w);
    set(this.fields.ssy, s?.sy);
    this.stainTexSelect.value = s?.tex ?? STAIN_IDS[0];
    this.flipBox.checked = !!s?.flip;
    this.syncStains();
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

  private back(): void {
    this.scene.start(SCENES.game);
  }
}
