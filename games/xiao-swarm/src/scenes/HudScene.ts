import Phaser from 'phaser';
import { device, sprites, theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { CLASSES, type SoldierClassId } from '../data/classes';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

const ORDER: SoldierClassId[] = ['medic', 'gunner', 'flammer', 'sniper', 'tank'];

interface Card {
  id: SoldierClassId;
  root: Phaser.GameObjects.Container;
  count: Phaser.GameObjects.Text;
}

/**
 * HUD en scène parallèle (non affecté par le zoom caméra), style réf DA :
 * panneaux bleu nuit à bord cyan. Haut : temps, vague, kills. Bas : composition de la squad.
 */
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private info!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Graphics;
  private topPanel!: Phaser.GameObjects.Graphics;
  private bottomPanel!: Phaser.GameObjects.Graphics;
  private squadText!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Container;
  private cards: Card[] = [];
  private lastKey = '';

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    this.game_ = this.scene.get(SCENES.game) as GameScene;
    this.cards = [];
    this.lastKey = '';

    this.topPanel = this.add.graphics();
    this.timeText = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '30px', fontStyle: 'bold', color: '#ffffff' });
    this.info = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '18px', color: PALETTE.textDim });
    this.progress = this.add.graphics();

    this.bottomPanel = this.add.graphics();
    this.squadText = this.add
      .text(0, 0, '', { fontFamily: theme.font, fontSize: '16px', fontStyle: 'bold', color: PALETTE.textDim })
      .setOrigin(0.5, 1);

    this.pauseBtn = this.makePauseButton();
    this.hint = this.makeHint();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout));
    this.layout();
  }

  update(): void {
    const g = this.game_;
    const time = g.runTime;
    const remaining = Math.max(0, g.mode.duration - time);
    this.timeText.setText(fmt(remaining));
    const first = g.mode.id === 'royale' ? t('squadsLeft', { value: g.squadsAlive }) : t('wave', { value: g.waveNumber });
    this.info.setText(`${first}  ·  ${t('kills', { value: g.kills })}`);

    const w = 220;
    this.progress.clear();
    this.progress.fillStyle(0x0a1422, 1).fillRoundedRect(20, 104, w, 8, 4);
    this.progress.fillStyle(PALETTE.primary, 1).fillRoundedRect(20, 104, Math.max(8, w * (time / g.mode.duration)), 8, 4);

    const comp = g.composition();
    const key = ORDER.map((id) => comp.get(id) ?? 0).join(',') + '/' + g.localSquad.maxSize;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.rebuildCards(comp);
    }
    this.hint.setVisible(g.flow.state === 'ready');
  }

  private rebuildCards(comp: Map<SoldierClassId, number>): void {
    for (const c of this.cards) c.root.destroy();
    this.cards = [];
    for (const id of ORDER) {
      const n = comp.get(id) ?? 0;
      if (n === 0) continue;
      const root = this.add.container(0, 0);
      const bg = this.add.graphics();
      bg.fillStyle(0x0a1422, 0.9).fillRoundedRect(-36, -44, 72, 88, 10);
      bg.lineStyle(2, PALETTE.panelBorder, 0.8).strokeRoundedRect(-36, -44, 72, 88, 10);
      bg.fillStyle(CLASSES[id].color, 1).fillRoundedRect(-28, 30, 56, 6, 3);
      const portrait = sprites.add(this, `portrait_${id}`, 0, 8);
      const count = this.add
        .text(0, 22, `×${n}`, { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#0a1422', strokeThickness: 4 })
        .setOrigin(0.5, 0.5);
      root.add([bg, portrait, count]);
      this.tweens.add({ targets: root, scale: { from: 1.15, to: 1 }, duration: 180 });
      this.cards.push({ id, root, count });
    }
    this.squadText.setText(t('squad', { value: this.game_.localSquad.size, max: this.game_.localSquad.maxSize }));
    this.layout();
  }

  private makePauseButton(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(PALETTE.panel, 0.92).fillRoundedRect(-30, -30, 60, 60, 12);
    g.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(-30, -30, 60, 60, 12);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-11, -13, 8, 26, 2).fillRoundedRect(3, -13, 8, 26, 2);
    const hit = this.add.zone(0, 0, 60, 60).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.game_.pauseGame());
    c.add([g, hit]);
    return c;
  }

  private makeHint(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const label = this.add
      .text(0, 70, device.isTouch ? t('hintDrag') : t('hintKeys'), {
        fontFamily: theme.font,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#13233a',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    c.add(label);
    if (device.isTouch) {
      const hand = this.add.image(-60, 0, 'hand').setScale(0.8);
      c.add(hand);
      this.tweens.add({ targets: hand, x: 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      this.tweens.add({ targets: label, scale: 1.06, duration: 600, yoyo: true, repeat: -1 });
    }
    return c;
  }

  private readonly layout = (): void => {
    const { width, height } = this.scale;
    // Panneau haut-gauche (décalé sous la pill Poki sur mobile)
    const top = device.isTouch ? 70 : 12;
    this.topPanel.clear();
    this.topPanel.fillStyle(PALETTE.panel, 0.88).fillRoundedRect(8, top, 248, 112, 14);
    this.topPanel.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(8, top, 248, 112, 14);
    this.timeText.setPosition(20, top + 10);
    this.info.setPosition(20, top + 50);
    this.progress.setY(top - 12);

    this.pauseBtn.setPosition(width - 44, top + 34);

    // Barre du bas : cartes de classes
    const cardW = 80;
    const barW = Math.max(200, this.cards.length * cardW + 24);
    const barH = 116;
    const bx = width / 2 - barW / 2;
    const by = height - barH - 8;
    this.bottomPanel.clear();
    this.bottomPanel.fillStyle(PALETTE.panel, 0.85).fillRoundedRect(bx, by, barW, barH, 14);
    this.bottomPanel.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(bx, by, barW, barH, 14);
    this.cards.forEach((c, i) => c.root.setPosition(bx + 12 + cardW / 2 + i * cardW, by + barH / 2 + 8));
    this.squadText.setPosition(width / 2, by + 18);

    this.hint.setPosition(width / 2, height * 0.62);
  };
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
