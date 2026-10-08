import Phaser from 'phaser';
import { SCENES, VIEW_BG } from '../config';
import { DISABLED_UPGRADES, UPGRADE_IDS, UPGRADES, type UpgradeId } from '../data/progression';
import { getDefaultUpgradeStats, getUpgradeStats, resetUpgrade, saveUpgradeToCode, setUpgradeStat } from '../debugUpgrades';
import { button, checkbox, header, line, note, panel, slider } from '../dev/devUi';
import { t } from '../i18n';
import { CARD, buildUpgradeCard, resizeUpgradeCard } from '../view/upgradeCards';

/** Opacité d'une upgrade désactivée (`DISABLED_UPGRADES`), comme les unités inactives de la vue d'unités. */
const DISABLED_ALPHA = 0.25;

/**
 * Visionneuse d'upgrades (dev uniquement) : toutes les cartes de choix d'upgrade affichées d'un coup, dessinées par le même code que la fenêtre
 * de montée de niveau (`view/upgradeCards.ts` : fond en image, icône, nom, description, slots, « Claim »). Un clic sur une carte la sélectionne
 * et ouvre son panneau de stats (bonus, nombre de prises max) pour l'équilibrage : les cartes se mettent à jour en direct, Save écrit dans
 * data/progression.ts, Reset revient à la dernière sauvegarde. Le panneau de gauche règle l'aperçu (prises faites, carte prismatique).
 */
const CARD_W = 200;
const CARD_H = (CARD_W * CARD.H) / CARD.W;
const GAP = 16;

interface Card {
  id: UpgradeId;
  box: Phaser.GameObjects.Container;
  /** Carte dessinée (reconstruite à chaque `refresh` : les valeurs, les slots et le fond peuvent changer). */
  view?: Phaser.GameObjects.Container;
  /** Cadre de sélection. */
  frame: Phaser.GameObjects.Graphics;
}

export class UpgradeViewerScene extends Phaser.Scene {
  private cards: Card[] = [];
  private selected: UpgradeId | null = null;
  /** Aperçu : prises faites (celle qu'on s'apprête à prendre comprise) et carte prismatique (bonus ×2, fond holographique). */
  private previewCount = 0;
  private previewPrism = false;
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
    const frame = this.add.graphics();
    const hit = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.select(id));
    box.add([frame, hit]);
    const card: Card = { id, box, frame };
    this.refresh(card);
    return card;
  }

  /** Redessine une carte avec les valeurs courantes (bonus, prises max) et l'aperçu choisi ; cadre blanc si elle est sélectionnée. */
  private refresh(c: Card): void {
    c.view?.destroy();
    const count = Math.min(this.previewCount, UPGRADES[c.id].maxStacks);
    const view = buildUpgradeCard(this, c.id, count, this.previewPrism);
    resizeUpgradeCard(view, CARD_W, CARD_H, false);
    c.box.addAt(view, 1); // au-dessus du cadre, sous la zone cliquable
    c.view = view;
    view.setAlpha(DISABLED_UPGRADES.includes(c.id) ? DISABLED_ALPHA : 1); // désactivée (jamais proposée) : transparente, comme les unités inactives
    c.frame.clear();
    if (this.selected === c.id) c.frame.lineStyle(4, 0xffffff, 1).strokeRoundedRect(-CARD_W / 2 - 4, -CARD_H / 2 - 4, CARD_W + 8, CARD_H + 8, 14);
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
    const ref = Math.max(u.value, getDefaultUpgradeStats(id).value); // échelle d'après la valeur du code : à 0, on peut remonter
    const unit = u.mod?.flat !== undefined ? '' : ' %';
    const v = slider(`Bonus${unit}`, {
      min: 0,
      max: Math.max(10, Math.ceil(ref * 3)),
      step: ref >= 10 ? 1 : 0.5,
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
      header(t(`up_${id}`), () => {
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
      slider('Prises (aperçu)', {
        min: 0,
        max: 10,
        step: 1,
        get: () => this.previewCount,
        set: (v) => {
          this.previewCount = Math.round(v);
          this.refreshAll();
        },
        hint: 'Nombre de slots pleins sur les cartes : les prises déjà faites (pas celle qu’on s’apprête à faire)',
      }).row,
      checkbox('Carte prismatique (bonus ×2)', this.previewPrism, (v) => {
        this.previewPrism = v;
        this.refreshAll();
      }),
    );
    document.body.append(p);
    this.panel = p;
  }
}
