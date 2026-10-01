import Phaser from 'phaser';
import { clamp } from '@xiao/engine';
import { MAP_ZONES, type ObstacleZone } from '../data/mapZones';
import { JUNGLE_SIZE, makeJungleMap } from '../data/maps';
import { OBSTACLES } from '../data/obstacles';
import { SCENES, VISUAL } from '../config';
import { button, checkbox, header, line, note, panel, title } from '../dev/devUi';
import { mapZonesSnippet, persistMapZones, resetMapZones, saveMapZonesToCode } from '../debugMapZones';

/**
 * Éditeur de carte (dev uniquement) : place les ZONES D'OBSTACLE de l'arène solo / coop. À chaque début de partie, la carte tire
 * un obstacle au hasard (et sa position) dans chaque zone, avec la seed de la partie : tous les joueurs ont la même carte
 * (`makeJungleMap`, data/maps.ts). L'aperçu utilise exactement ce tirage avec une seed d'aperçu : « Nouveau tirage » en change.
 * Ouverture : bouton « Carte » en haut à gauche du jeu, ou `?mapedit` dans l'URL.
 *
 * Souris : clic sur une zone = la sélectionner, glisser = la déplacer, glisser un coin = la redimensionner ; clic droit
 * glissé = déplacer la vue ; molette = zoom. Clavier : Suppr = supprimer, flèches = 5 px (Maj = 25 px).
 * Save écrit les zones comme valeurs par défaut dans data/mapZones.ts ; Reset revient à la dernière sauvegarde.
 */
const PANEL_W = 310;
const MIN_SIZE = 40;
const HANDLE = 12;
const GRID = 5;

type Drag = { mode: 'move'; dx: number; dy: number } | { mode: 'resize'; ox: number; oy: number } | null;

export class MapEditorScene extends Phaser.Scene {
  private sel = -1;
  private addMode = false;
  private drag: Drag = null;
  private previewSeed = 1;
  private showPreview = true;
  private showHitbox = false;
  private zoneG!: Phaser.GameObjects.Graphics;
  private hitG!: Phaser.GameObjects.Graphics;
  private previewImgs: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private panel?: HTMLDivElement;
  private status!: HTMLDivElement;
  private info!: HTMLDivElement;
  private addBtn!: HTMLButtonElement;
  private fields!: Record<'x' | 'y' | 'w' | 'h' | 'chance', HTMLInputElement>;

  constructor() {
    super(SCENES.mapEditor);
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x0c0a10);
    this.input.mouse?.disableContextMenu();
    this.drawMap();
    this.hitG = this.add.graphics().setDepth(4000);
    this.zoneG = this.add.graphics().setDepth(5000);
    this.buildPanel();
    this.fit();
    this.rebuildPreview();

    const p = this.input;
    p.on('pointerdown', this.onDown);
    p.on('pointermove', this.onMove);
    p.on('pointerup', () => (this.drag = null));
    p.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => cam.setZoom(clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.1, 2)));
    p.keyboard!.on('keydown', this.onKey);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.input.setDefaultCursor('default');
      this.panel?.remove();
    });
  }

  update(): void {
    this.draw();
    this.syncFields();
  }

  // ---------- Décor de l'éditeur ----------

  private drawMap(): void {
    const map = makeJungleMap(0);
    const W = map.width;
    const H = map.height;
    const B = map.border;
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0f0c).setDepth(-3); // bord (lave) : hors de la zone jouable
    if (this.textures.exists('ground_tile')) {
      this.add
        .tileSprite(B, B, W - 2 * B, H - 2 * B, 'ground_tile')
        .setOrigin(0)
        .setTileScale(VISUAL.groundScale)
        .setDepth(-2);
    } else {
      this.add.rectangle(W / 2, H / 2, W - 2 * B, H - 2 * B, 0x8a4a2a).setDepth(-2);
    }
    const g = this.add.graphics().setDepth(-1);
    g.lineStyle(4, 0xff8a4a, 0.8).strokeRect(B, B, W - 2 * B, H - 2 * B);
    g.lineStyle(2, 0xffffff, 0.12);
    for (let v = 0; v <= W; v += 240) g.lineBetween(v, 0, v, H).lineBetween(0, v, W, v);
    // point de départ de la squad (survie : centre de la carte)
    g.lineStyle(3, 0x39c6ff, 1).strokeCircle(W / 2, H / 2, 46).lineBetween(W / 2 - 60, H / 2, W / 2 + 60, H / 2).lineBetween(W / 2, H / 2 - 60, W / 2, H / 2 + 60);
    this.add.text(W / 2, H / 2 + 62, 'Départ de la squad', { fontFamily: 'system-ui', fontSize: '22px', color: '#7fd8ff' }).setOrigin(0.5).setDepth(-1);
  }

  private readonly fit = (): void => {
    const cam = this.cameras.main;
    const vw = Math.max(200, this.scale.width - PANEL_W - 10);
    const vh = this.scale.height;
    cam.setViewport(PANEL_W + 10, 0, vw, vh);
    cam.setZoom(Math.min(vw / (JUNGLE_SIZE + 120), vh / (JUNGLE_SIZE + 120)));
    cam.centerOn(JUNGLE_SIZE / 2, JUNGLE_SIZE / 2);
  };

  // ---------- Données ----------

  private get zones(): ObstacleZone[] {
    return MAP_ZONES.obstacleZones;
  }

  private get zone(): ObstacleZone | undefined {
    return this.zones[this.sel];
  }

  /** Une zone a changé : mémorise (navigateur) et redessine l'aperçu. */
  private changed(): void {
    persistMapZones();
    this.rebuildPreview();
  }

  private clampZone(z: ObstacleZone): void {
    z.w = Math.round(clamp(z.w, MIN_SIZE, JUNGLE_SIZE));
    z.h = Math.round(clamp(z.h, MIN_SIZE, JUNGLE_SIZE));
    z.x = Math.round(clamp(z.x, 0, JUNGLE_SIZE));
    z.y = Math.round(clamp(z.y, 0, JUNGLE_SIZE));
  }

  private addZone(x: number, y: number): void {
    this.zones.push({ x: Math.round(x), y: Math.round(y), w: 240, h: 240 });
    this.sel = this.zones.length - 1;
    this.changed();
  }

  private removeSelected(): void {
    if (!this.zone) return;
    this.zones.splice(this.sel, 1);
    this.sel = Math.min(this.sel, this.zones.length - 1);
    this.changed();
  }

  // ---------- Aperçu du tirage ----------

  /** Redessine les obstacles tels que la carte les tire avec la seed d'aperçu (même code que la partie). */
  private rebuildPreview(): void {
    for (const i of this.previewImgs) i.destroy();
    this.previewImgs = [];
    this.hitG.clear();
    if (!this.showPreview) return;
    const map = makeJungleMap(this.previewSeed);
    for (const o of map.obstacles) {
      const def = OBSTACLES[o.kind];
      const k = o.size ?? 1;
      if (this.textures.exists(o.kind)) {
        this.previewImgs.push(
          this.add
            .image(o.x, o.y, o.kind)
            .setOrigin(def.originX, def.originY)
            .setScale(def.scale * k)
            .setDepth(100 + o.y / 100),
        );
      }
      if (this.showHitbox) for (const c of def.hitbox) this.hitG.lineStyle(2, 0xff6a6a, 0.9).strokeCircle(o.x + c.x * k, o.y + c.y * k, c.r * k);
    }
    this.info.textContent = `${map.obstacles.length} obstacle(s) tiré(s) · ${this.zones.length} zone(s) · seed d'aperçu ${this.previewSeed}`;
  }

  // ---------- Dessin des zones ----------

  private draw(): void {
    const g = this.zoneG;
    g.clear();
    const z = this.cameras.main.zoom;
    this.zones.forEach((zone, i) => {
      const sel = i === this.sel;
      const x = zone.x - zone.w / 2;
      const y = zone.y - zone.h / 2;
      g.fillStyle(0xffd23a, sel ? 0.26 : 0.13).fillRect(x, y, zone.w, zone.h);
      g.lineStyle((sel ? 4 : 2.5) / z, 0xffe066, sel ? 1 : 0.7).strokeRect(x, y, zone.w, zone.h);
      if (sel) {
        g.fillStyle(0xffffff, 1);
        for (const [cx, cy] of [[x, y], [x + zone.w, y], [x, y + zone.h], [x + zone.w, y + zone.h]]) g.fillRect(cx - HANDLE / 2 / z, cy - HANDLE / 2 / z, HANDLE / z, HANDLE / z);
      }
    });
    // numéros des zones (et chance si < 100 %)
    while (this.labels.length < this.zones.length) {
      this.labels.push(this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '24px', color: '#fff3b0', stroke: '#000', strokeThickness: 4 }).setDepth(5001));
    }
    this.labels.forEach((t, i) => {
      const zone = this.zones[i];
      t.setVisible(!!zone);
      if (!zone) return;
      const c = zone.chance ?? 1;
      t.setText(c < 1 ? `${i + 1} · ${Math.round(c * 100)} %` : `${i + 1}`)
        .setScale(1 / Math.max(0.35, z) * 0.5)
        .setPosition(zone.x - zone.w / 2 + 6, zone.y - zone.h / 2 + 4);
    });
  }

  // ---------- Souris / clavier ----------

  private cornerAt(zone: ObstacleZone, wx: number, wy: number): { ox: number; oy: number } | null {
    const r = (HANDLE * 1.4) / this.cameras.main.zoom;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        if (Math.abs(wx - (zone.x + (sx * zone.w) / 2)) < r && Math.abs(wy - (zone.y + (sy * zone.h) / 2)) < r) return { ox: zone.x - (sx * zone.w) / 2, oy: zone.y - (sy * zone.h) / 2 };
      }
    }
    return null;
  }

  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    if (p.rightButtonDown()) return; // déplacement de la vue
    const wx = p.worldX;
    const wy = p.worldY;
    if (this.addMode) {
      this.addZone(wx, wy);
      this.setAddMode(false);
      return;
    }
    const cur = this.zone;
    const corner = cur ? this.cornerAt(cur, wx, wy) : null;
    if (cur && corner) {
      this.drag = { mode: 'resize', ox: corner.ox, oy: corner.oy };
      return;
    }
    // zone sous le curseur : la plus petite (les petites zones restent atteignables sous les grandes)
    let best = -1;
    let bestArea = Infinity;
    this.zones.forEach((z, i) => {
      if (Math.abs(wx - z.x) <= z.w / 2 && Math.abs(wy - z.y) <= z.h / 2 && z.w * z.h < bestArea) {
        best = i;
        bestArea = z.w * z.h;
      }
    });
    this.sel = best;
    const z = this.zone;
    this.drag = z ? { mode: 'move', dx: wx - z.x, dy: wy - z.y } : null;
  };

  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    const cam = this.cameras.main;
    if (p.rightButtonDown()) {
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      return;
    }
    const z = this.zone;
    if (!p.leftButtonDown() || !this.drag || !z) return;
    if (this.drag.mode === 'move') {
      z.x = Math.round((p.worldX - this.drag.dx) / GRID) * GRID;
      z.y = Math.round((p.worldY - this.drag.dy) / GRID) * GRID;
    } else {
      const { ox, oy } = this.drag;
      z.w = Math.max(MIN_SIZE, Math.round(Math.abs(p.worldX - ox) / GRID) * GRID);
      z.h = Math.max(MIN_SIZE, Math.round(Math.abs(p.worldY - oy) / GRID) * GRID);
      z.x = Math.round((ox + p.worldX) / 2);
      z.y = Math.round((oy + p.worldY) / 2);
    }
    this.clampZone(z);
    this.changed();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const z = this.zone;
    if (!z) return;
    const step = e.shiftKey ? 25 : 5;
    if (e.key === 'Delete' || e.key === 'Backspace') this.removeSelected();
    else if (e.key === 'ArrowLeft') z.x -= step;
    else if (e.key === 'ArrowRight') z.x += step;
    else if (e.key === 'ArrowUp') z.y -= step;
    else if (e.key === 'ArrowDown') z.y += step;
    else return;
    this.clampZone(z);
    this.changed();
  };

  // ---------- Interface ----------

  private setAddMode(on: boolean): void {
    this.addMode = on;
    this.addBtn.textContent = on ? 'Clique sur la carte… (annuler)' : '+ Ajouter une zone';
    this.addBtn.style.background = on ? '#2d7a3a' : '';
    this.input.setDefaultCursor(on ? 'crosshair' : 'default');
  }

  private buildPanel(): void {
    const p = panel(PANEL_W);
    this.panel = p;
    const num = (label: string, key: keyof ObstacleZone, step: number, min: number, max: number) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(step);
      input.min = String(min);
      input.max = String(max);
      input.style.cssText = 'width:70px;padding:2px;font:inherit';
      input.addEventListener('input', () => {
        const z = this.zone;
        const v = input.valueAsNumber;
        if (!z || !Number.isFinite(v)) return;
        if (key === 'chance') {
          const c = clamp(v / 100, 0, 1);
          if (c >= 1) delete z.chance;
          else z.chance = Math.round(c * 100) / 100;
        } else z[key] = v;
        this.clampZone(z);
        this.changed();
      });
      input.addEventListener('change', () => input.blur());
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:4px;align-items:center';
      row.append(label, input);
      return { row, input };
    };
    const fx = num('X', 'x', 5, 0, JUNGLE_SIZE);
    const fy = num('Y', 'y', 5, 0, JUNGLE_SIZE);
    const fw = num('Largeur', 'w', 5, MIN_SIZE, JUNGLE_SIZE);
    const fh = num('Hauteur', 'h', 5, MIN_SIZE, JUNGLE_SIZE);
    const fc = num('Chance (%)', 'chance', 5, 0, 100);
    this.fields = { x: fx.input, y: fy.input, w: fw.input, h: fh.input, chance: fc.input };

    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap';
    this.status = document.createElement('div');
    this.status.style.cssText = 'font-size:12px;color:#9fe;min-height:1.4em;white-space:pre-wrap';
    this.addBtn = button('+ Ajouter une zone', () => this.setAddMode(!this.addMode));

    p.append(
      header('Carte : zones d’obstacles', () => this.scene.start(SCENES.game)),
      note(
        `Arène ${JUNGLE_SIZE} × ${JUNGLE_SIZE} px. À chaque partie, UN obstacle au hasard est posé à une position au hasard dans chaque zone ` +
          '(même carte pour tous les joueurs de la partie). Les obstacles affichés sont un tirage d’aperçu.',
      ),
      this.info,
      line(this.addBtn, button('Supprimer', () => this.removeSelected()), button('Dupliquer', () => {
        const z = this.zone;
        if (!z) return;
        this.zones.push({ ...z, x: z.x + 40, y: z.y + 40 });
        this.sel = this.zones.length - 1;
        this.changed();
      })),
      title('Zone sélectionnée'),
      line(fx.row, fy.row),
      line(fw.row, fh.row),
      line(fc.row),
      note('Chance : probabilité que la zone donne un obstacle (100 % = toujours).'),
      title('Aperçu'),
      checkbox('Afficher le tirage d’aperçu', true, (v) => {
        this.showPreview = v;
        this.rebuildPreview();
      }),
      checkbox('Afficher les hitbox', false, (v) => {
        this.showHitbox = v;
        this.rebuildPreview();
      }),
      line(button('Nouveau tirage', () => {
        this.previewSeed = (Math.random() * 1e6) | 0;
        this.rebuildPreview();
      })),
      note('Souris : clic = sélectionner, glisser = déplacer, glisser un coin = redimensionner, clic droit glissé = déplacer la vue, molette = zoom. Suppr = supprimer, flèches = 5 px (Maj : 25).'),
      line(
        button('Save', () => void saveMapZonesToCode().then((m) => (this.status.textContent = m))),
        button('Reset', () => {
          resetMapZones();
          this.sel = -1;
          this.rebuildPreview();
          this.status.textContent = 'Retour à la dernière sauvegarde.';
        }),
        button('Copier le code', () => {
          void navigator.clipboard?.writeText(mapZonesSnippet()).catch(() => {});
          this.status.textContent = 'Copié — à coller dans DEFAULT_MAP_ZONES (data/mapZones.ts).';
        }),
        button('Jouer ▶', () => this.scene.start(SCENES.game)),
      ),
      this.status,
    );
    document.body.append(p);
  }

  /** Met les champs numériques à jour (sans toucher à celui qu'on est en train de saisir). */
  private syncFields(): void {
    const z = this.zone;
    const set = (i: HTMLInputElement, v: number | '') => {
      const text = String(v);
      if (document.activeElement !== i && i.value !== text) i.value = text;
      i.disabled = !z;
    };
    set(this.fields.x, z?.x ?? '');
    set(this.fields.y, z?.y ?? '');
    set(this.fields.w, z?.w ?? '');
    set(this.fields.h, z?.h ?? '');
    set(this.fields.chance, z ? Math.round((z.chance ?? 1) * 100) : '');
  }
}
