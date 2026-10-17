import Phaser from 'phaser';
import { Button, sprites, theme } from '@xiao/engine';
import { COIN_KEY, ensureGemTextures } from '../art/gems';
import { SCENES } from '../config';
import { PERKS, UNIT_UNLOCKS } from '../data/armory';
import type { SoldierClassId } from '../data/classes';
import { t } from '../i18n';
import { settings } from '../settings';
import { hudTop } from '../view/hudLayout';
import type { GameScene } from './GameScene';
import { hudOnTop } from './hudOnTop';

/**
 * Armurerie (`ArmoryScreen`, bouton « Armory » de l'écran Solo) : on y dépense les pièces d'or (compteur du HUD, au-dessus de l'écran) pour **débloquer des unités**
 * (elles entrent dans le tirage des recrues du joueur) et acheter des **upgrades** propres à une unité. Tout est permanent (« tu l'as ou tu l'as pas ») et s'applique
 * aussi en multi pour le joueur qui l'a acheté (`data/armory.ts`). Back ramène à l'écran Solo.
 */
export class ArmoryScene extends Phaser.Scene {
  private game_!: GameScene;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private toast?: Phaser.GameObjects.Text;
  /** Onglet affiché (gardé d'une ouverture à l'autre). */
  private static tab: 'soldiers' | 'equipment' = 'soldiers';

  constructor() {
    super(SCENES.armory);
  }

  create(): void {
    hudOnTop(this);
    this.game_ = this.scene.get(SCENES.game) as GameScene;
    ensureGemTextures(this);
    this.rebuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild, this);
      this.clear();
    });
  }

  private rebuild(): void {
    this.clear();
    const tab = ArmoryScene.tab;
    const { width: w, height: h } = this.scale;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    const top = hudTop();
    add(this.add.text(w / 2, top + 30, t('armoryTitle'), { fontFamily: theme.font, fontSize: '40px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 7 }).setOrigin(0.5));

    // onglets : Soldats (unités à débloquer) et Équipement (upgrades)
    const tabW = Math.min(190, (w - 40) / 2);
    (['soldiers', 'equipment'] as const).forEach((id, i) => {
      add(
        new Button(this, w / 2 + (i - 0.5) * (tabW + 10), top + 92, {
          label: t(id === 'soldiers' ? 'armoryTabSoldiers' : 'armoryTabEquipment'),
          variant: tab === id ? 'primary' : 'secondary',
          width: tabW,
          height: 46,
          onClick: () => {
            if (ArmoryScene.tab === id) return;
            ArmoryScene.tab = id;
            this.rebuild();
          },
        }),
      );
    });

    // grille de cartes de l'onglet (centrée dans la zone entre les onglets et le bouton Back)
    const areaTop = top + 128;
    const backH = 56;
    const areaBottom = h - backH - 36;
    const gap = 12;
    const soldiers = tab === 'soldiers';
    const count = soldiers ? UNIT_UNLOCKS.length : PERKS.length;
    const maxW = soldiers ? 190 : 270;
    const cols = Math.max(1, Math.min(count, Math.floor((w - 24 + gap) / (Math.min(maxW, 150) + gap))));
    const rows = Math.ceil(count / cols);
    const cw = Math.min(maxW, (w - 24 - (cols - 1) * gap) / cols);
    const ch = Math.min(soldiers ? 230 : 200, (areaBottom - areaTop - (rows - 1) * gap) / rows);
    const k = Math.max(0.6, Math.min(1, ch / (soldiers ? 190 : 170)));
    const blockH = rows * ch + (rows - 1) * gap;
    const y0 = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);
    const pos = (i: number): { cx: number; cy: number } => {
      const inRow = Math.min(cols, count - Math.floor(i / cols) * cols);
      return { cx: w / 2 + ((i % cols) - (inRow - 1) / 2) * (cw + gap), cy: y0 + ch / 2 + Math.floor(i / cols) * (ch + gap) };
    };
    if (soldiers) {
      UNIT_UNLOCKS.forEach((u, i) => {
        const { cx, cy } = pos(i);
        this.card(add, cx, cy, cw, ch, k, {
          name: t(`class_${u.id as 'medic'}`),
          owned: settings.hasUnit(u.id),
          price: u.price,
          ownedLabel: t('armoryUnlocked'),
          buy: () => settings.buyUnit(u.id),
          preview: (px, py) => this.unitPreview(add, u.id, px, py, k, !settings.hasUnit(u.id)),
        });
      });
    } else {
      PERKS.forEach((p, i) => {
        const { cx, cy } = pos(i);
        const unitName = t(`class_${p.unit as 'medic'}`);
        this.card(add, cx, cy, cw, ch, k, {
          name: t(`perk_${p.id}`),
          sub: t('armoryFor', { unit: unitName }),
          desc: t(`perk_${p.id}_desc`),
          owned: settings.ownedPerks.includes(p.id),
          locked: !settings.hasUnit(p.unit) ? t('armoryNeeds', { unit: unitName }) : undefined,
          price: p.price,
          ownedLabel: t('armoryOwned'),
          buy: () => settings.buyPerk(p.id),
        });
      });
    }

    const backY = h - 36 - backH / 2 + 8;
    add(new Button(this, w / 2, backY, { label: t('mpBack'), variant: 'secondary', width: Math.min(300, w - 40), height: backH, onClick: () => this.back() }));
    this.toast = add(this.add.text(w / 2, areaBottom + 10, '', { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#ff8a8a', stroke: '#13233a', strokeThickness: 5 }).setOrigin(0.5, 0).setAlpha(0).setDepth(5));
  }

  private unitPreview(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, id: SoldierClassId, x: number, y: number, k: number, locked: boolean): void {
    const sid = `soldier_${id}`;
    if (!sprites.has(sid)) return;
    this.time.delayedCall(0, () => {
      if (!this.sys.isActive()) return;
      const sp = add(sprites.add(this, sid, x, y));
      if (sprites.hasAnim(sid, 'idle')) sprites.play(sp, sid, 'idle');
      sprites.place(sp, sid);
      sp.setScale(sp.scaleX * 1.5 * k, sp.scaleY * 1.5 * k);
      if (locked) sp.setTint(0x555a66).setAlpha(0.6); // verrouillée : silhouette assombrie
    });
  }

  /** Carte d'achat : nom, aperçu ou description, puis bouton (prix en pièces d'or, « débloquée » / « possédée » ou condition manquante). */
  private card(
    add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    cx: number,
    cy: number,
    cw: number,
    ch: number,
    k: number,
    o: { name: string; sub?: string; desc?: string; owned: boolean; locked?: string; price: number; ownedLabel: string; buy: () => boolean; preview?: (x: number, y: number) => void },
  ): void {
    const g = add(this.add.graphics());
    g.fillStyle(0x16264a, 0.96).fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    g.lineStyle(o.owned ? 5 : 3, o.owned ? 0x7dff9a : 0xffc83d, 0.95).strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    add(this.add.text(cx, cy - ch / 2 + 18 * k, o.name, { fontFamily: theme.font, fontSize: `${Math.round(22 * k)}px`, fontStyle: 'bold', color: '#ffffff', wordWrap: { width: cw - 12 }, align: 'center' }).setOrigin(0.5));
    if (o.sub) add(this.add.text(cx, cy - ch / 2 + 40 * k, o.sub, { fontFamily: theme.font, fontSize: `${Math.round(15 * k)}px`, color: '#9fb4d6' }).setOrigin(0.5));
    if (o.desc) add(this.add.text(cx, cy - 6 * k, o.desc, { fontFamily: theme.font, fontSize: `${Math.round(17 * k)}px`, color: '#dfe8ff', wordWrap: { width: cw - 20 }, align: 'center' }).setOrigin(0.5));
    o.preview?.(cx, cy + ch * 0.1);
    const by = cy + ch / 2 - 30 * k;
    const bw = cw - 20;
    const bh = Math.round(46 * k);
    if (o.owned) {
      add(new Button(this, cx, by, { label: `✓ ${o.ownedLabel}`, variant: 'primary', fill: 0x2f9e55, textColor: '#ffffff', width: bw, height: bh, onClick: () => undefined })).setEnabled(false, false);
    } else if (o.locked) {
      add(new Button(this, cx, by, { label: o.locked, variant: 'secondary', width: bw, height: bh, onClick: () => this.say(o.locked as string) }));
    } else {
      const can = settings.coins >= o.price;
      add(
        new Button(this, cx, by, {
          label: `${o.price}`,
          variant: can ? 'primary' : 'secondary',
          width: bw,
          height: bh,
          onClick: () => {
            if (!o.buy()) return this.say(t('armoryNotEnough'));
            this.game_.refreshLoadout(); // la squad du joueur prend tout de suite son achat
            this.rebuild();
          },
        }),
      );
      add(this.add.image(cx - Math.min(34, bw / 4) - 14 * k, by, COIN_KEY).setScale(0.36 * k).setDepth(2));
    }
  }

  private say(text: string): void {
    if (!this.toast) return;
    this.toast.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 400 });
  }

  private back(): void {
    this.scene.stop();
    this.scene.launch(({ title: SCENES.title, multiplayer: SCENES.multiplayer } as Record<string, string>)[this.registry.get('menuFrom')] ?? SCENES.solo); // retour là d'où on est venu (écran titre ou Solo)
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
