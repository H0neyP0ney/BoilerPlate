import Phaser from 'phaser';
import { Button, sprites, theme } from '@xiao/engine';
import { ensureGemTextures, GEM_KEY } from '../art/gems';
import { soldierSpriteId } from '../art/playerVariants';
import { onSkinSheetReady, retainSkinSheets } from '../assets/skinSheets';
import { SCENES } from '../config';
import { SKINS, skinPrice, skinSlot, type SkinTier } from '../data/skins';
import { TRAILS, trailPrice, type TrailDef } from '../data/trails';
import { t } from '../i18n';
import { settings } from '../settings';
import { hudTop } from '../view/hudLayout';
import { trailColorAt } from '../view/TrailFx';
import type { GameScene } from './GameScene';
import { hudOnTop } from './hudOnTop';

/** Couleur du cadre de chaque rang de prix. */
const TIER_COLORS: Record<SkinTier, number> = { 0: 0x6fa0e0, 1: 0xb07cff, 2: 0xffc83d };

type Tab = 'skins' | 'trails';

/** Un article de la boutique (skin ou trail), tel que dessiné par une carte. */
interface Item {
  id: string;
  name: string;
  tier: SkinTier;
  price: number;
  owned: boolean;
  equipped: boolean;
  buy: () => boolean;
  equip: () => void;
  /** Dessine l'aperçu au centre (`cx`, `cy`) de la carte. */
  preview: (cx: number, cy: number, cw: number, ch: number, k: number) => void;
}

/**
 * Boutique (`ShopScreen`, ouverte par le gros bouton « Skins » de l'écran Solo) : deux onglets, **Skins** (douze skins : teinte des soldats ou, plus tard, planches
 * dédiées chargées à la demande, `assets/skinSheets.ts`) et **Trails** (ruban coloré derrière chaque soldat, visible par tous en multi), en trois rangs de prix,
 * payés en diamants verts (`settings.gems`, compteur du HUD au-dessus de l'écran). Un achat est équipé tout de suite ; le premier cadre de chaque onglet (« Classic » / « No trail », possédé d'office) retire
 * l'équipement. Back ramène à l'écran Solo.
 */
export class ShopScene extends Phaser.Scene {
  private game_!: GameScene;
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** Numéro de la construction en cours : les aperçus différés d'une construction périmée s'abandonnent. */
  private build = 0;
  private toast?: Phaser.GameObjects.Text;
  /** Onglet affiché (gardé d'une ouverture à l'autre). */
  private static tab: Tab = 'skins';

  constructor() {
    super(SCENES.shop);
  }

  create(): void {
    hudOnTop(this); // compteur de diamants et boutons du HUD au-dessus du calque sombre
    this.game_ = this.scene.get(SCENES.game) as GameScene;
    ensureGemTextures(this);
    this.rebuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    const off = onSkinSheetReady(() => this.rebuild()); // une planche de skin arrive : l'aperçu prend le vrai visuel
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild, this);
      off();
      this.clear();
      retainSkinSheets(new Set(settings.skin ? [settings.skin] : [])); // seul le skin équipé reste en mémoire
    });
  }

  private items(tab: Tab): Item[] {
    if (tab === 'skins') {
      const classic: Item = {
        id: 'classic',
        name: t('skinClassic'),
        tier: 0,
        price: 0,
        owned: true, // possédé d'office : les soldats bleus d'origine
        equipped: settings.skin === null,
        buy: () => true,
        equip: () => settings.equipSkin(null),
        preview: (cx, cy, _cw, ch, k) => this.skinPreview(0, cx, cy, ch, k),
      };
      return [classic, ...SKINS.map((s): Item => ({
        id: s.id,
        name: t(`skin_${s.id}`),
        tier: s.tier,
        price: skinPrice(s),
        owned: settings.ownedSkins.includes(s.id),
        equipped: settings.skin === s.id,
        buy: () => settings.buySkin(s.id),
        equip: () => settings.equipSkin(s.id),
        preview: (cx, cy, _cw, ch, k) => this.skinPreview(skinSlot(s), cx, cy, ch, k),
      }))];
    }
    const none: Item = {
      id: 'none',
      name: t('trailNone'),
      tier: 0,
      price: 0,
      owned: true, // possédé d'office : pas de trail
      equipped: settings.trail === null,
      buy: () => true,
      equip: () => settings.equipTrail(null),
      preview: (cx, cy, cw, _ch, k) => {
        const g = this.add.graphics(); // ruban barré : rien derrière les soldats
        this.objects.push(g);
        const len = cw * 0.55;
        g.lineStyle(6 * k, 0x6b7a99, 0.6).lineBetween(cx - len / 2, cy, cx + len / 2, cy);
        g.lineStyle(7 * k, 0xff6a6a, 0.9).lineBetween(cx - 16 * k, cy - 16 * k, cx + 16 * k, cy + 16 * k).lineBetween(cx - 16 * k, cy + 16 * k, cx + 16 * k, cy - 16 * k);
      },
    };
    return [none, ...TRAILS.map((tr): Item => ({
      id: tr.id,
      name: t(`trail_${tr.id}`),
      tier: tr.tier,
      price: trailPrice(tr),
      owned: settings.ownedTrails.includes(tr.id),
      equipped: settings.trail === tr.id,
      buy: () => settings.buyTrail(tr.id),
      equip: () => settings.equipTrail(tr.id),
      preview: (cx, cy, cw, _ch, k) => this.trailPreview(tr, cx, cy, cw, k),
    }))];
  }

  private rebuild(): void {
    this.clear();
    const mine = ++this.build;
    const tab = ShopScene.tab;
    const { width: w, height: h } = this.scale;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    add(this.add.rectangle(0, 0, w, h, 0x0a1422, 0.82).setOrigin(0)); // calque sombre
    const top = hudTop();
    add(this.add.text(w / 2, top + 30, t('shopTitle'), { fontFamily: theme.font, fontSize: '40px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 7 }).setOrigin(0.5));

    // onglets
    const tabW = Math.min(180, (w - 40) / 2);
    (['skins', 'trails'] as const).forEach((id, i) => {
      add(
        new Button(this, w / 2 + (i - 0.5) * (tabW + 10), top + 92, {
          label: t(id === 'skins' ? 'tabSkins' : 'tabTrails'),
          variant: tab === id ? 'primary' : 'secondary',
          width: tabW,
          height: 46,
          onClick: () => {
            if (ShopScene.tab === id) return;
            ShopScene.tab = id;
            this.rebuild();
          },
        }),
      );
    });

    // grille de cartes
    const items = this.items(tab);
    const cols = w >= 720 ? 5 : 3;
    const rows = Math.ceil(items.length / cols);
    const areaTop = top + 128;
    const backH = 56;
    const areaBottom = h - backH - 36;
    const gap = 12;
    const cardW = Math.min(200, (w - 24 - (cols - 1) * gap) / cols);
    const cardH = Math.min(230, (areaBottom - areaTop - (rows - 1) * gap) / rows);
    const k = Math.max(0.6, Math.min(1, cardH / 200)); // échelle des textes et de l'aperçu
    const x0 = w / 2 - ((cols - 1) * (cardW + gap)) / 2;
    items.forEach((it, i) => {
      const cx = x0 + (i % cols) * (cardW + gap);
      const cy = areaTop + cardH / 2 + Math.floor(i / cols) * (cardH + gap);
      this.card(add, it, tab, cx, cy, cardW, cardH, k, i, mine);
    });

    add(new Button(this, w / 2, h - 36 - backH / 2 + 8, { label: t('mpBack'), variant: 'secondary', width: Math.min(300, w - 40), height: backH, onClick: () => this.back() }));
    this.toast = add(this.add.text(w / 2, areaBottom + 10, '', { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#ff8a8a', stroke: '#13233a', strokeThickness: 5 }).setOrigin(0.5, 0).setAlpha(0).setDepth(5));
  }

  /** Aperçu d'un skin : le soldat (fabriqué à l'affichage, l'un après l'autre : 12 recolorations d'un coup feraient saccader ; sa planche, si elle existe, se charge à la demande). */
  private skinPreview(slot: number, cx: number, cy: number, ch: number, k: number): void {
    const sid = soldierSpriteId('trooper', slot);
    if (!sprites.has(sid)) return;
    const sp = sprites.add(this, sid, cx, cy + ch * 0.1);
    this.objects.push(sp);
    if (sprites.hasAnim(sid, 'idle')) sprites.play(sp, sid, 'idle');
    sprites.place(sp, sid);
    sp.setScale(sp.scaleX * 1.3 * k, sp.scaleY * 1.3 * k);
  }

  /** Aperçu d'une trail : un ruban ondulé qui s'effile, aux couleurs de la trail (tête à droite). */
  private trailPreview(tr: TrailDef, cx: number, cy: number, cw: number, k: number): void {
    const g = this.add.graphics();
    this.objects.push(g);
    const len = cw * 0.7;
    const n = 28;
    for (let i = 1; i < n; i++) {
      const u0 = (i - 1) / n;
      const u1 = i / n;
      const x0 = cx + len / 2 - u0 * len;
      const x1 = cx + len / 2 - u1 * len;
      const y0 = cy + Math.sin(u0 * 7) * 10 * k;
      const y1 = cy + Math.sin(u1 * 7) * 10 * k;
      g.lineStyle(Math.max(1.5, 12 * k * (1 - u1 * 0.85)), trailColorAt(tr, u1, 0), 0.95 * (1 - u1 * 0.8)).lineBetween(x0, y0, x1, y1);
    }
    g.fillStyle(0xffffff, 0.9).fillCircle(cx + len / 2, cy, 5 * k); // la « tête » du ruban
  }

  private card(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, it: Item, tab: Tab, cx: number, cy: number, cw: number, ch: number, k: number, index: number, mine: number): void {
    const g = add(this.add.graphics());
    g.fillStyle(0x16264a, 0.96).fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    g.lineStyle(it.equipped ? 5 : 3, it.equipped ? 0x7dff9a : TIER_COLORS[it.tier], 0.95).strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 16);
    add(this.add.text(cx, cy - ch / 2 + 18 * k, it.name, { fontFamily: theme.font, fontSize: `${Math.round(22 * k)}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    // aperçu : un après l'autre (les skins se fabriquent / se chargent à ce moment-là)
    this.time.delayedCall(tab === 'skins' ? index * 35 : 0, () => {
      if (mine === this.build) it.preview(cx, cy, cw, ch, k);
    });
    // bas de carte : prix + achat, ou équiper / équipé
    const by = cy + ch / 2 - 30 * k;
    const bw = cw - 20;
    const bh = Math.round(46 * k);
    if (it.equipped) {
      add(new Button(this, cx, by, { label: `✓ ${t('skinEquipped')}`, variant: 'primary', fill: 0x2f9e55, textColor: '#ffffff', width: bw, height: bh, onClick: () => undefined })).setEnabled(false, false);
    } else if (it.owned) {
      add(
        new Button(this, cx, by, {
          label: t('skinEquip'),
          variant: 'primary',
          width: bw,
          height: bh,
          onClick: () => {
            it.equip();
            this.changed();
          },
        }),
      );
    } else {
      const can = settings.gems >= it.price;
      add(
        new Button(this, cx, by, {
          label: `${it.price}`,
          variant: can ? 'primary' : 'secondary',
          width: bw,
          height: bh,
          onClick: () => {
            if (!it.buy()) return this.say(t('skinNotEnough'));
            this.changed();
          },
        }),
      );
      add(this.add.image(cx - Math.min(34, bw / 4) - 14 * k, by, GEM_KEY).setScale(0.42 * k).setDepth(2));
    }
  }

  /** Message court (rouge) sous la grille. */
  private say(text: string): void {
    if (!this.toast) return;
    this.toast.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 400 });
  }

  /** Achat ou changement d'équipement : les soldats du monde sont recréés (skin), la boutique est redessinée. */
  private changed(): void {
    this.game_.refreshSkins();
    this.rebuild();
  }

  private back(): void {
    this.scene.stop();
    this.scene.launch(SCENES.solo);
  }

  private clear(): void {
    this.build++; // abandonne les aperçus différés
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
