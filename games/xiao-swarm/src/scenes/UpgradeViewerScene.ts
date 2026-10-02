import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { PALETTE, SCENES, VIEW_BG } from '../config';
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from '../data/progression';
import { getUpgradeStats, resetUpgrade, saveUpgradeToCode, setUpgradeStat } from '../debugUpgrades';
import { button, header, line, note, panel, slider } from '../dev/devUi';
import { t } from '../i18n';
import { UPGRADE_ICONS } from '../view/PickupViews';

/**
 * Visionneuse d'upgrades (dev uniquement) : toutes les cartes de choix d'upgrade affichées d'un coup, comme dans la fenêtre de montée de
 * niveau. Un clic sur une carte la sélectionne et ouvre son panneau de stats (bonus, nombre de prises max) pour l'équilibrage :
 * les cartes se mettent à jour en direct, Save écrit dans data/progression.ts, Reset revient à la dernière sauvegarde.
 */
const CARD_W = 270;
const CARD_H = 110;
const GAP = 16;

interface Card {
  id: UpgradeId;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  desc: Phaser.GameObjects.Text;
  stack: Phaser.GameObjects.Text;
}

export class UpgradeViewerScene extends Phaser.Scene {
  private cards: Card[] = [];
  private selected: UpgradeId | null = null;
  private panel?: HTMLDivElement;
  private statsPanel?: HTMLDivElement;

  constructor() {
    super(SCENES.upgrades);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(VIEW_BG);
    this.cards = [];
    this.selected = null;
    this.buildPanel();
    UPGRADE_IDS.forEach((id) => this.cards.push(this.makeCard(id)));
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout);
      this.panel?.remove();
      this.statsPanel?.remove();
    });
  }

  private makeCard(id: UpgradeId): Card {
    const box = this.add.container(0, 0);
    const bg = this.add.graphics();
    const badge = this.add.graphics();
    const color = UPGRADES[id].color;
    badge.fillStyle(color, 1).fillCircle(-CARD_W / 2 + 14 + 18, 0, 18).lineStyle(2, 0xffffff, 0.7).strokeCircle(-CARD_W / 2 + 14 + 18, 0, 18);
    const icon = this.add.text(-CARD_W / 2 + 32, 0, UPGRADE_ICONS[id], { fontFamily: theme.font, fontSize: '20px' }).setOrigin(0.5);
    const tx = -CARD_W / 2 + 14 + 36 + 10;
    const name = this.add.text(tx, -CARD_H / 2 + 24, t(`up_${id}`), { fontFamily: theme.font, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5);
    const desc = this.add.text(tx, -CARD_H / 2 + 40, '', { fontFamily: theme.font, fontSize: '15px', color: '#dfe8ff', wordWrap: { width: CARD_W - (tx + CARD_W / 2) - 10 } });
    const stack = this.add.text(CARD_W / 2 - 10, CARD_H / 2 - 6, '', { fontFamily: theme.font, fontSize: '13px', color: theme.textDim }).setOrigin(1, 1);
    const idText = this.add.text(tx, CARD_H / 2 - 6, id, { fontFamily: theme.font, fontSize: '12px', color: theme.textDim }).setOrigin(0, 1);
    const hit = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.select(id));
    box.add([bg, badge, icon, name, desc, stack, idText, hit]);
    const card = { id, box, bg, desc, stack };
    this.refresh(card);
    return card;
  }

  /** Redessine une carte : cadre (surligné si sélectionnée), description et nombre de prises avec les valeurs courantes. */
  private refresh(c: Card): void {
    const u = UPGRADES[c.id];
    const color = u.color;
    const sel = this.selected === c.id;
    c.bg.clear();
    c.bg.fillStyle(PALETTE.panel, 0.9).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    c.bg.fillStyle(color, 0.95).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, 7, CARD_H, { tl: 12, tr: 0, bl: 12, br: 0 });
    c.bg.lineStyle(sel ? 4 : 2, sel ? 0xffffff : color, sel ? 1 : 0.85).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    c.desc.setText(t(`up_${c.id}_desc`, { value: u.value }));
    c.stack.setText(u.maxStacks < 99 ? `max ×${u.maxStacks}` : '');
  }

  private select(id: UpgradeId): void {
    this.selected = id;
    for (const c of this.cards) this.refresh(c);
    this.buildStats(id);
    this.layout();
  }

  /** Second panneau : bonus et prises max de l'upgrade sélectionnée, Save / Reset. */
  private buildStats(id: UpgradeId): void {
    this.statsPanel?.remove();
    const p = panel(270);
    p.style.left = '330px';
    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:#9fe;white-space:pre-wrap';
    const syncs: (() => void)[] = [];
    const u = UPGRADES[id];
    const unit = u.mod?.flat !== undefined ? '' : ' %';
    const v = slider(`Bonus${unit}`, {
      min: 0,
      max: Math.max(10, Math.ceil(u.value * 3)),
      step: u.value >= 10 ? 1 : 0.5,
      get: () => getUpgradeStats(id).value,
      set: (nv) => {
        setUpgradeStat(id, 'value', nv);
        this.refreshAll();
      },
      hint: 'Valeur affichée sur la carte ; fixe aussi le modificateur appliqué à la squad (pourcentage = valeur / 100)',
    });
    const m = slider('Prises max', {
      min: 1,
      max: 99,
      step: 1,
      get: () => getUpgradeStats(id).maxStacks,
      set: (nv) => {
        setUpgradeStat(id, 'maxStacks', Math.round(nv));
        this.refreshAll();
      },
    });
    syncs.push(v.sync, m.sync);
    p.append(
      header(`${UPGRADE_ICONS[id]} ${t(`up_${id}`)}`, () => {
        this.statsPanel?.remove();
        this.statsPanel = undefined;
        this.selected = null;
        this.refreshAll();
        this.layout();
      }),
      note("Équilibrage : le bonus s'applique aux prochaines prises (la carte se met à jour tout de suite). Save écrit dans data/progression.ts."),
      line(
        button('Save', () => void saveUpgradeToCode(id).then((msg) => (info.textContent = msg))),
        button('Reset', () => {
          resetUpgrade(id);
          for (const s of syncs) s();
          this.refreshAll();
          info.textContent = 'Retour à la dernière sauvegarde.';
        }),
      ),
      info,
      v.row,
      m.row,
    );
    document.body.append(p);
    this.statsPanel = p;
  }

  private refreshAll(): void {
    for (const c of this.cards) this.refresh(c);
  }

  /** Grille de cartes centrée à droite des panneaux : le nombre de colonnes et le zoom sont choisis pour tout voir d'un coup d'œil. */
  private readonly layout = (): void => {
    const { width, height } = this.scale;
    const k = this.scale.displayScale; // les panneaux sont en pixels d'écran, la scène en pixels de jeu
    const left = (this.selected ? 620 : 330) * k.x;
    const availW = width - left - 20 * k.x;
    const availH = height - 20 * k.y;
    let best = { cols: 1, zoom: 0 };
    for (let cols = 1; cols <= this.cards.length; cols++) {
      const rows = Math.ceil(this.cards.length / cols);
      const z = Math.min(1, availW / (cols * CARD_W + (cols - 1) * GAP), availH / (rows * CARD_H + (rows - 1) * GAP));
      if (z > best.zoom) best = { cols, zoom: z };
    }
    const { cols, zoom } = best;
    const rows = Math.ceil(this.cards.length / cols);
    const x0 = -((cols - 1) * (CARD_W + GAP)) / 2;
    const y0 = -((rows - 1) * (CARD_H + GAP)) / 2;
    this.cards.forEach((c, i) => c.box.setPosition(x0 + (i % cols) * (CARD_W + GAP), y0 + Math.floor(i / cols) * (CARD_H + GAP)));
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    cam.centerOn(-left / 2 / zoom, 0); // le centre de la grille est au centre de l'espace libre à droite des panneaux
  };

  private buildPanel(): void {
    const p = panel(290);
    p.append(
      header("Visionneuse d'upgrades", () => this.scene.start(SCENES.game)),
      note('Toutes les cartes de choix à la montée de niveau. Clique sur une carte pour régler ses stats (bonus, prises max).'),
    );
    document.body.append(p);
    this.panel = p;
  }
}
