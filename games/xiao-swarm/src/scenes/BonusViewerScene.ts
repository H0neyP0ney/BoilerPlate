import Phaser from 'phaser';
import { sprites, theme } from '@xiao/engine';
import { ACTIVE_CLASSES, CLASSES, type SoldierClassId } from '../data/classes';
import { PALETTE, SCENES } from '../config';
import { getName } from '../debugNames';
import { header, note, panel } from '../dev/devUi';
import { makePowerUpIcon, POWERUP_INFO } from '../view/PickupViews';
import type { PowerUpKind } from '../sim/entities';

/**
 * Visionneuse « bonus » (dev uniquement) : les bonus ramassés par les soldats — recrues (une par classe) et power-ups (stimpack, aimant,
 * globes de soin / stase, roquettes). Vue d'observation : les recrues et les power-ups se règlent dans le code (art/recruits.ts,
 * view/PickupViews.ts), leurs effets dans la vue Particules.
 */
const COL_GAP = 150;
const ROW_GAP = 260;

interface Item {
  node: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  phase: number;
}

export class BonusViewerScene extends Phaser.Scene {
  private panel?: HTMLDivElement;
  private items: Item[] = [];
  private titles: { text: Phaser.GameObjects.Text; y: number }[] = [];

  constructor() {
    super(SCENES.bonus);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x2b3a2e);
    this.drawGrid();
    this.buildPanel();
    this.build();
    this.fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit);
      this.panel?.remove();
      this.items = [];
      this.titles = [];
    });
  }

  update(time: number): void {
    const t = time / 1000;
    for (const it of this.items) it.node.y = it.y + Math.sin(t * 3 + it.phase) * 4;
  }

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: theme.font, fontSize: '13px', color: PALETTE.textDim, align: 'center' })
      .setOrigin(0.5, 0);
  }

  private sectionTitle(y: number, text: string): void {
    const t = this.add.text(0, y, text, { fontFamily: theme.font, fontSize: '18px', fontStyle: 'bold', color: '#ffd166' }).setOrigin(0.5, 1);
    this.titles.push({ text: t, y });
  }

  private build(): void {
    const classes = Object.keys(CLASSES) as SoldierClassId[];
    const kinds = Object.keys(POWERUP_INFO) as PowerUpKind[];
    const y0 = -ROW_GAP / 2;
    const y1 = ROW_GAP / 2;
    this.sectionTitle(y0 - 70, 'Bonus recrue');
    this.sectionTitle(y1 - 70, 'Power-ups');

    classes.forEach((cls, c) => {
      const id = `recruit_${cls}`;
      const x = (c - (classes.length - 1) / 2) * COL_GAP;
      const img = sprites.add(this, id, x, y0).setScale(sprites.scaleOf(id));
      const name = getName(`class_${cls}`, 'en') || cls;
      const inactive = ACTIVE_CLASSES.includes(cls) ? '' : '\n(inactif)';
      if (inactive) img.setAlpha(0.25);
      this.items.push({ node: img, label: this.label(x, y0 + 40, `${name}\n${id}${inactive}`).setAlpha(inactive ? 0.25 : 1), x, y: y0, phase: c });
    });
    kinds.forEach((kind, c) => {
      const x = (c - (kinds.length - 1) / 2) * COL_GAP;
      const box = makePowerUpIcon(this, kind).setPosition(x, y1).setScale(1.6);
      const name = getName(`pu_${kind}`, 'en') || kind;
      this.items.push({ node: box, label: this.label(x, y1 + 40, `${name}\npu_${kind}`), x, y: y1, phase: c });
    });
  }

  /** Zoom adapté à la largeur de la fenêtre ; étiquettes de taille constante à l'écran. */
  private readonly fit = (): void => {
    const cam = this.cameras.main;
    const cols = Math.max(Object.keys(CLASSES).length, Object.keys(POWERUP_INFO).length);
    const zoom = Math.min(1, (this.scale.width - 340) / (cols * COL_GAP));
    cam.setZoom(zoom);
    for (const it of this.items) it.label.setScale(1 / zoom).setY(it.y + 40 / zoom);
    for (const t of this.titles) t.text.setScale(1 / zoom);
    cam.centerOn(-(300 / 2) / zoom, 0); // décalé pour laisser la place au panneau
  };

  private drawGrid(): void {
    const g = this.add.graphics().setDepth(-1);
    g.lineStyle(1, 0xffffff, 0.06);
    for (let i = -40; i <= 40; i++) g.lineBetween(i * 50, -2000, i * 50, 2000).lineBetween(-2000, i * 50, 2000, i * 50);
  }

  private buildPanel(): void {
    const p = panel(290);
    p.append(
      header('Visionneuse de bonus', () => this.scene.start(SCENES.game)),
      note('Bonus ramassés par les soldats : recrues (une par classe) et power-ups. Vue d\'observation.'),
    );
    document.body.append(p);
    this.panel = p;
  }
}
