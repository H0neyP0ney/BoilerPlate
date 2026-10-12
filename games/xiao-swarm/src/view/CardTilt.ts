import Phaser from 'phaser';
import { HoloLight } from './HoloLight';

/** Inclinaison maximale (rad) de la carte quand le curseur est sur un bord, et distance (en hauteurs de carte) de la « caméra » de la perspective. */
const MAX_TILT = 0.34;
const CAMERA = 3.2;
/** Définition de la capture : la carte est dessinée 2 fois plus grande que sa taille à l'écran puis réduite (reste nette). */
const SUPERSAMPLE = 2;
/** Maillage : colonnes × lignes de cases (assez fin pour que la perspective ne se voie pas comme deux triangles). */
const COLS = 8;
const ROWS = 10;
/** Vitesse de rattrapage de l'inclinaison vers celle du curseur (par seconde) et seuil (rad) sous lequel le retour à plat est terminé. */
const FOLLOW = 14;
const REST = 0.004;
/** Lumière (reflet des cartes normales, lumière holographique des prismatiques) : vitesse de rattrapage du point de lumière et, pour les prismatiques, intensité au repos (1 au survol). */
const LIGHT_FOLLOW = 9;
const LIGHT_IDLE = 0.55;

let counter = 0;

/**
 * Effet « carte à collectionner » : tant que le curseur est sur la carte, elle pivote en perspective (en 3D) vers lui, et un reflet clair suit
 * son point de visée. La carte (un conteneur d'images et de textes) est photographiée une fois dans une texture dynamique, puis affichée par un
 * maillage dont les sommets sont recalculés à chaque image ; le conteneur d'origine reste là (sa zone cliquable aussi), mais ses éléments visibles sont masqués.
 * WebGL uniquement (Mesh2D) : sans WebGL l'effet est ignoré. Une seule instance par carte.
 *
 * Carte prismatique (`holo`) : en plus, sa lumière blanche (bandes, halo, étincelles : `HoloLight`) suit le curseur (et se promène doucement au repos) ;
 * elle est dessinée dans une texture à part, affichée en voile additif sur la carte, à plat ou sur un second maillage identique quand elle est inclinée.
 */
export class CardTilt {
  private mesh?: Phaser.GameObjects.Mesh2D;
  private key = '';
  private hidden: Phaser.GameObjects.GameObject[] = [];
  private w = 0;
  private h = 0;
  /** Inclinaison actuelle (rad) et visée autour de l'axe Y et de l'axe X. */
  private ay = 0;
  private ax = 0;
  private tay = 0;
  private tax = 0;
  /** Position du reflet visée (−1 → 1 sur la carte). */
  private sx = 0;
  private sy = 0;
  private hovering = false;
  /** Lumière holographique (cartes prismatiques) : générateur, voile à plat, voile en perspective, point de lumière et intensité actuels. */
  private light?: HoloLight;
  private flat?: Phaser.GameObjects.Image;
  private glareMesh?: Phaser.GameObjects.Mesh2D;
  private lx = 0;
  private ly = 0;
  private lk = LIGHT_IDLE;
  private readonly onUpdate = (_t: number, dt: number): void => this.update(dt / 1000);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly card: Phaser.GameObjects.Container,
    private readonly zone: Phaser.GameObjects.Zone,
    private readonly holo = false,
  ) {
    zone.on('pointerover', (p: Phaser.Input.Pointer) => this.enter(p));
    zone.on('pointermove', (p: Phaser.Input.Pointer) => this.aim(p));
    zone.on('pointerout', () => this.leave());
    if (holo && this.enabled) scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate); // la lumière vit aussi au repos
  }

  private get enabled(): boolean {
    return this.scene.sys.game.renderer.type === Phaser.WEBGL;
  }

  private enter(p: Phaser.Input.Pointer): void {
    this.hovering = true;
    if (!this.enabled) return;
    if (!this.mesh) this.build();
    this.aim(p);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
  }

  private leave(): void {
    this.hovering = false;
    this.tax = this.tay = this.sx = this.sy = 0; // retour à plat, puis le maillage est retiré (`update`)
  }

  /** Curseur → inclinaison visée : le point visé s'enfonce (comme si on appuyait dessus du doigt) et le reflet le suit. */
  private aim(p: Phaser.Input.Pointer): void {
    if (!this.hovering || !this.enabled) return;
    const w = this.zone.width || 1;
    const h = this.zone.height || 1;
    const nx = Phaser.Math.Clamp((p.worldX - this.card.x) / (w / 2), -1, 1);
    const ny = Phaser.Math.Clamp((p.worldY - this.card.y) / (h / 2), -1, 1);
    this.sx = nx;
    this.sy = ny;
    if (!this.mesh) return;
    this.tay = -nx * MAX_TILT; // curseur à droite : le bord droit s'enfonce (il s'éloigne), comme si le doigt appuyait dessus
    this.tax = ny * MAX_TILT; // curseur en bas : le bord bas s'enfonce
  }

  /** Photographie la carte (dessinée 2× plus grande) dans une texture dynamique, masque ses éléments et crée le maillage + le reflet. */
  private build(): void {
    const w = this.zone.width;
    const h = this.zone.height;
    if (w < 8 || h < 8) return;
    this.w = w;
    this.h = h;
    this.key = `card_tilt_${counter++}`;
    const tex = this.scene.textures.addDynamicTexture(this.key, Math.ceil(w * SUPERSAMPLE), Math.ceil(h * SUPERSAMPLE), false);
    if (!tex) return;
    // la photo se prend carte à l'échelle 1 et opaque : si le survol commence pendant l'animation d'apparition (échelle < 1) ou le retour visuel du choix (échelle / opacité
    // réduites), la texture resterait minuscule ou délavée tant que la fenêtre est ouverte
    const sx = this.card.scaleX;
    const sy = this.card.scaleY;
    const alpha = this.card.alpha;
    // (le mode 'local' de `capture` prend l'échelle et l'opacité propres de la carte et ignore celles de la config : on les pose nous-mêmes)
    this.card.setScale(SUPERSAMPLE).setAlpha(1);
    tex.capture(this.card, { transform: 'local', x: (w * SUPERSAMPLE) / 2, y: (h * SUPERSAMPLE) / 2 });
    tex.render();
    this.card.setScale(sx, sy).setAlpha(alpha);
    this.mesh = this.makeMesh(this.key).setDepth(this.card.depth + 0.5);
    if (!this.holo) {
      // reflet clair sous le curseur : dessiné dans une texture coupée à la silhouette de la carte (il ne déborde pas), puis plaqué sur le maillage
      const bg = this.card.getData('bg') as Phaser.GameObjects.Image;
      this.light = new HoloLight(this.scene, Math.ceil(w * SUPERSAMPLE), Math.ceil(h * SUPERSAMPLE), bg.texture.getSourceImage() as CanvasImageSource, true);
      this.lx = this.ly = this.lk = 0;
    }
    // masque le contenu visible de la carte (la zone cliquable reste active)
    this.hidden = this.card.list.filter((o) => o !== this.zone);
    for (const o of this.hidden) (o as Phaser.GameObjects.Image).setVisible(false);
    this.project();
  }

  /** Maillage d'une texture de la taille de la carte : grille COLS × ROWS (x, y, u, v), deux triangles par case (a, b, c, page). */
  private makeMesh(key: string): Phaser.GameObjects.Mesh2D {
    const { w, h } = this;
    const vertices: number[] = [];
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++) vertices.push((i / COLS - 0.5) * w, (j / ROWS - 0.5) * h, i / COLS, j / ROWS);
    }
    const indices: number[] = [];
    const row = COLS + 1;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * row + i;
        indices.push(a, a + 1, a + row, 0, a + 1, a + row + 1, a + row, 0);
      }
    }
    return this.scene.add.mesh2d(this.card.x, this.card.y, key, vertices, indices, true); // la texture dynamique est tête en bas
  }

  /** Recalcule les sommets : rotation autour de Y puis de X, projection en perspective ; reflet sur le point visé. */
  private project(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const { w, h, ax, ay } = this;
    const d = h * CAMERA;
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    const cx = Math.cos(ax);
    const sx = Math.sin(ax);
    const v = mesh.vertices as number[];
    const g = this.glareMesh?.vertices as number[] | undefined;
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++) {
        const o = (j * (COLS + 1) + i) * 4;
        const px = (i / COLS - 0.5) * w;
        const py = (j / ROWS - 0.5) * h;
        // rotation autour de Y (x, z) puis de X (y, z)
        const x1 = px * cy;
        const z1 = -px * sy;
        const y2 = py * cx - z1 * sx;
        const z2 = py * sx + z1 * cx;
        const k = d / (d + z2);
        v[o] = x1 * k;
        v[o + 1] = y2 * k;
        if (g) {
          g[o] = v[o];
          g[o + 1] = v[o + 1];
        }
      }
    }
    // les sommets sont à la taille de la carte à l'écran : le maillage suit simplement l'échelle et l'opacité de la carte (les textures, 2× plus grandes, sont plaquées dessus)
    for (const m of [mesh, this.glareMesh]) m?.setPosition(this.card.x, this.card.y).setScale(this.card.scaleX, this.card.scaleY).setAlpha(this.card.alpha);
  }

  private update(dt: number): void {
    if (this.mesh || this.hovering) {
      const k = 1 - Math.exp(-FOLLOW * dt);
      this.ax += (this.tax - this.ax) * k;
      this.ay += (this.tay - this.ay) * k;
      this.project();
      if (!this.hovering && Math.abs(this.ax) < REST && Math.abs(this.ay) < REST) this.stop(); // revenu à plat : on remet la carte d'origine
    }
    if (this.holo) this.updateLight(dt);
    else this.updateSheen(dt);
  }

  /** Cartes normales : le reflet (halo clair) suit le curseur, d'autant plus fort que la carte est inclinée ; coupé à la carte, plaqué sur un maillage identique. */
  private updateSheen(dt: number): void {
    if (!this.light || !this.mesh) return;
    const k = 1 - Math.exp(-LIGHT_FOLLOW * dt);
    this.lx += (this.sx - this.lx) * k;
    this.ly += (this.sy - this.ly) * k;
    const tilt = Math.min(1, Math.hypot(this.ax, this.ay) / MAX_TILT);
    this.lk += (tilt - this.lk) * k;
    this.light.render(this.lx, this.ly, this.lk, 0);
    if (!this.glareMesh) {
      this.glareMesh = this.makeMesh(this.light.key).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.card.depth + 0.55);
      this.project();
    }
  }

  /** Lumière holographique : le point de lumière suit le curseur au survol (sinon promenade lente) ; le voile s'affiche à plat ou sur le maillage incliné. */
  private updateLight(dt: number): void {
    if (!this.light) {
      const w = this.zone.width;
      const h = this.zone.height;
      if (w < 8 || h < 8) return;
      const bg = this.card.getData('bg') as Phaser.GameObjects.Image;
      this.light = new HoloLight(this.scene, Math.ceil(w * SUPERSAMPLE), Math.ceil(h * SUPERSAMPLE), bg.texture.getSourceImage() as CanvasImageSource);
      this.w = w;
      this.h = h;
      this.flat = this.scene.add.image(this.card.x, this.card.y, this.light.key).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.card.depth + 0.4);
    }
    const t = this.scene.time.now / 1000;
    const hover = this.hovering;
    const tx = hover ? this.sx : 0.55 * Math.sin(t * 0.8);
    const ty = hover ? this.sy : 0.6 * Math.cos(t * 0.55);
    const tk = hover ? 1 : LIGHT_IDLE;
    const k = 1 - Math.exp(-LIGHT_FOLLOW * dt);
    this.lx += (tx - this.lx) * k;
    this.ly += (ty - this.ly) * k;
    this.lk += (tk - this.lk) * k;
    this.light.render(this.lx, this.ly, this.lk, t);
    if (this.mesh) {
      this.flat?.setVisible(false);
      if (!this.glareMesh) {
        this.glareMesh = this.makeMesh(this.light.key).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.card.depth + 0.55);
        this.project();
      }
    } else {
      this.glareMesh?.destroy();
      this.glareMesh = undefined;
      this.flat?.setVisible(true).setPosition(this.card.x, this.card.y).setDisplaySize(this.zone.width * this.card.scaleX, this.zone.height * this.card.scaleY).setAlpha(this.card.alpha);
    }
  }

  /** Remet la carte d'origine (éléments visibles) et détruit le maillage et sa texture ; la lumière holographique, elle, continue (`destroy` pour tout retirer). */
  stop(): void {
    if (!this.holo) this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    for (const o of this.hidden) (o as Phaser.GameObjects.Image).setVisible(true);
    this.hidden = [];
    this.mesh?.destroy();
    this.glareMesh?.destroy();
    this.mesh = this.glareMesh = undefined;
    if (!this.holo) {
      this.light?.destroy(); // le reflet des cartes normales n'existe que pendant l'inclinaison
      this.light = undefined;
    }
    if (this.key && this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    this.key = '';
    this.ax = this.ay = this.tax = this.tay = this.sx = this.sy = 0;
  }

  /** La carte change de taille (fenêtre redimensionnée) : l'inclinaison s'arrête et la lumière sera refaite à la nouvelle taille. */
  resize(): void {
    this.stop();
    this.light?.destroy();
    this.flat?.destroy();
    this.light = this.flat = undefined;
  }

  /** Retire tout (fermeture de la fenêtre de choix). */
  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    this.stop();
    this.light?.destroy();
    this.flat?.destroy();
    this.light = this.flat = undefined;
  }
}
