import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { PALETTE, SCENES } from '../config';
import { UPGRADES, type UpgradeId } from '../data/progression';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

export interface LevelUpData {
  offer: UpgradeId[];
  level: number;
}

/**
 * Choix d'upgrade à la montée de niveau : 3 petites cartes en bas de l'écran, PAR-DESSUS le jeu qui continue de tourner
 * (pas de pause, pas de voile sombre : on garde le champ de bataille visible). Clic / toucher sur une carte, ou touches
 * 1 / 2 / 3 du haut du clavier (le pavé numérique sert à se déplacer).
 */
export class LevelUpScene extends Phaser.Scene {
  private busy = false;
  private cards: Phaser.GameObjects.Container[] = [];

  constructor() {
    super(SCENES.levelUp);
  }

  create(data: LevelUpData): void {
    this.busy = false;
    this.cards = [];
    const game = this.scene.get(SCENES.game) as GameScene;

    const title = this.add
      .text(0, 0, `${t('levelUpTitle', { level: data.level })}  ·  ${t('chooseUpgradeShort')}`, {
        fontFamily: theme.font,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#9fd3ff',
        stroke: '#13233a',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1);
    data.offer.forEach((id, i) => {
      const count = (game.localSquad.picked[id] ?? 0) + 1;
      this.cards.push(this.makeCard(id, i, count));
    });

    const layout = () => {
      const { width: w, height: h } = this.scale;
      const n = this.cards.length;
      const vertical = w < 620;
      const gap = 10;
      const cw = vertical ? Math.min(w - 24, 360) : Math.min(250, (w - 40 - gap * (n - 1)) / n);
      const ch = vertical ? 64 : 88;
      const bottom = h - 54; // au-dessus de la jauge d'XP
      const total = vertical ? n * ch + (n - 1) * gap : ch;
      const top = bottom - total;
      title.setPosition(w / 2, top - 6).setFontSize(vertical ? 17 : 22);
      this.cards.forEach((c, i) => {
        const x = vertical ? w / 2 : w / 2 + (i - (n - 1) / 2) * (cw + gap);
        const y = vertical ? top + ch / 2 + i * (ch + gap) : top + ch / 2;
        c.setPosition(x, y);
        this.resizeCard(c, cw, ch, vertical);
      });
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));

    const kb = this.input.keyboard!;
    ['ONE', 'TWO', 'THREE'].slice(0, data.offer.length).forEach((name, i) => kb.on(`keydown-${name}`, () => this.pick(i)));
  }

  private makeCard(id: UpgradeId, index: number, count: number): Phaser.GameObjects.Container {
    const def = UPGRADES[id];
    const c = this.add.container(0, 0);
    const bg = this.add.graphics();
    const badge = this.add.graphics();
    const key = this.add.text(0, 0, String(index + 1), { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#13233a' }).setOrigin(0.5);
    const name = this.add.text(0, 0, t(`up_${id}`), { fontFamily: theme.font, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5);
    const desc = this.add.text(0, 0, t(`up_${id}_desc`, { value: def.value }), { fontFamily: theme.font, fontSize: '15px', color: '#dfe8ff' }).setOrigin(0, 0);
    const stack = this.add
      .text(0, 0, def.maxStacks < 99 ? t('upgradeCount', { value: count, max: def.maxStacks }) : '', { fontFamily: theme.font, fontSize: '13px', color: theme.textDim })
      .setOrigin(1, 1);
    const hit = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.05, duration: 90 }));
    hit.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    hit.on('pointerup', () => this.pick(index));
    c.add([bg, badge, key, name, desc, stack, hit]);
    c.setData({ id, bg, badge, key, name, desc, stack, hit });
    return c;
  }

  private resizeCard(c: Phaser.GameObjects.Container, w: number, h: number, vertical: boolean): void {
    const d = c.getData('id') as UpgradeId;
    const color = UPGRADES[d].color;
    const bg = c.getData('bg') as Phaser.GameObjects.Graphics;
    const badge = c.getData('badge') as Phaser.GameObjects.Graphics;
    const key = c.getData('key') as Phaser.GameObjects.Text;
    const name = c.getData('name') as Phaser.GameObjects.Text;
    const desc = c.getData('desc') as Phaser.GameObjects.Text;
    const stack = c.getData('stack') as Phaser.GameObjects.Text;
    const hit = c.getData('hit') as Phaser.GameObjects.Zone;
    bg.clear();
    bg.fillStyle(PALETTE.panel, 0.82).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.fillStyle(color, 0.95).fillRoundedRect(-w / 2, -h / 2, 7, h, { tl: 12, tr: 0, bl: 12, br: 0 });
    bg.lineStyle(2, color, 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    const r = vertical ? 15 : 18;
    const bx = -w / 2 + 14 + r;
    badge.clear();
    badge.fillStyle(color, 1).fillCircle(bx, 0, r);
    badge.lineStyle(2, 0xffffff, 0.7).strokeCircle(bx, 0, r);
    key.setPosition(bx, 0).setFontSize(vertical ? 18 : 22);
    const tx = bx + r + 10;
    const textW = w - (tx + w / 2) - 10;
    name.setWordWrapWidth(textW).setPosition(tx, -h / 2 + (vertical ? 18 : 24)).setFontSize(vertical ? 16 : 18);
    desc.setWordWrapWidth(textW).setPosition(tx, -h / 2 + (vertical ? 32 : 40)).setFontSize(vertical ? 13 : 15);
    stack.setPosition(w / 2 - 10, h / 2 - 6);
    hit.setSize(w, h);
  }

  private pick(index: number): void {
    if (this.busy) return;
    this.busy = true;
    (this.scene.get(SCENES.game) as GameScene).chooseUpgrade(index);
  }
}
