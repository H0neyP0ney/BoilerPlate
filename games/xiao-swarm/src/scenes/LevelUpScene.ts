import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { SCENES, UPGRADE_CHOICE_TIME } from '../config';
import type { UpgradeId } from '../data/progression';
import { settings } from '../settings';
import { createPrismRain, setPrismZone } from '../view/PrismFx';
import { CARD, CARD_TEXT_RES, buildUpgradeCard, resizeUpgradeCard } from '../view/upgradeCards';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

/** Largeur (px) du bouton « Relancer ». */
const REROLL_W = 190;
/** Valeur de `pressed` quand le bouton enfoncé est « Relancer » (les cartes utilisent leur indice, -1 = rien). */
const REROLL_PRESSED = -2;

export interface LevelUpData {
  /** Propositions du joueur local, ou null : il a déjà choisi (en ligne, on attend les autres joueurs). */
  offer: UpgradeId[] | null;
  /** Upgrades prismatiques (mêmes indices que `offer`) : bonus doublé. */
  prism: boolean[];
  level: number;
  /** Relances restantes. */
  rerolls: number;
  /** Onboarding : upgrade recommandée, mise en avant par une flèche verte sur sa carte (le joueur choisit ce qu'il veut). */
  suggest?: UpgradeId;
}

/**
 * Choix d'upgrade à la montée de niveau : le jeu est EN PAUSE (pour tout le monde en ligne, voir `Sim.choiceT`). Les 3 cartes
 * apparaissent au centre de l'écran (animation outBack). En ligne, une barre de temps se vide de droite à gauche ; sans choix à la
 * fin, la simulation en tire une au hasard. En solo, pas de limite : le jeu attend le choix. Clic / toucher sur une carte (appui
 * ET relâchement dans la fenêtre), ou touches 1 / 2 / 3 du haut du clavier.
 */
export class LevelUpScene extends Phaser.Scene {
  private busy = false;
  private cards: Phaser.GameObjects.Container[] = [];
  /** Particules arc-en-ciel des cartes prismatiques (par indice de carte). */
  private prismFx = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();
  private timerBar!: Phaser.GameObjects.Graphics;
  private timerBox = { x: 0, y: 0, w: 0 };
  private waitText!: Phaser.GameObjects.Text;
  /** Carte (ou « Relancer », `REROLL_PRESSED`) sur laquelle le bouton a été enfoncé DANS cette fenêtre (-1 : aucune). */
  private pressed = -1;

  constructor() {
    super(SCENES.levelUp);
  }

  private get game_(): GameScene {
    return this.scene.get(SCENES.game) as GameScene;
  }

  create(data: LevelUpData): void {
    this.busy = false;
    this.pressed = -1;
    this.cards = [];
    this.input.on('pointerup', () => (this.pressed = -1)); // relâché ailleurs : l'appui ne compte plus
    this.prismFx = new Map();
    const game = this.game_;
    const offer = data.offer ?? [];

    const dim = this.add.rectangle(0, 0, 10, 10, 0x05101c, 0.5).setOrigin(0).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 160 });
    const title = this.add.image(0, 0, 'ui_levelup_title').setOrigin(0.5, 1); // art-src/levelup.png
    this.waitText = this.add
      .text(0, 0, t('waitingPlayers'), { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 6 })
      .setOrigin(0.5)
      .setVisible(offer.length === 0);
    offer.forEach((id, i) => {
      const count = game.localSquad.picked[id] ?? 0; // prises déjà faites (pas celle qu'on s'apprête à prendre)
      const card = this.makeCard(id, i, count, data.prism[i] === true);
      // apparition : chaque carte « pop » (outBack), l'une après l'autre
      card.setScale(0);
      this.tweens.add({ targets: card, scale: 1, duration: 380, delay: 60 + i * 90, ease: 'Back.Out' });
      this.cards.push(card);
      if (data.prism[i] === true) {
        // carte prismatique : pluie de particules RGB qui montent sur toute la carte
        this.prismFx.set(i, createPrismRain(this));
      }
    });
    this.timerBar = this.add.graphics();

    // onboarding : flèche verte (qui pulse) sur la carte recommandée, plus un petit mot « Recommended »
    const suggestIdx = data.suggest ? offer.indexOf(data.suggest) : -1;
    let suggestBox: Phaser.GameObjects.Container | null = null; // flèche + texte : un seul composant qui pulse d'un bloc (origine = pointe de la flèche)
    let suggestLabel: Phaser.GameObjects.Text | null = null;
    if (suggestIdx >= 0) {
      // texte au-dessus de la flèche : « Claim upgrade » (la flèche montre laquelle)
      suggestLabel = this.add
        .text(0, -50, t('tutoTakeUpgrade'), { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 6, align: 'center' })
        .setOrigin(0.5, 1);
      const arrow = this.add
        .text(0, 0, '▼', { fontFamily: theme.font, fontSize: '40px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 7 })
        .setOrigin(0.5, 1);
      suggestBox = this.add.container(0, 0, [arrow, suggestLabel]);
      this.tweens.add({ targets: suggestBox, scale: { from: 1, to: 1.3 }, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    // bouton « Relancer » : visible tant qu'il reste des relances (clic / toucher, ou touche R)
    let rerollBtn: Phaser.GameObjects.Container | null = null;
    if (offer.length && data.rerolls > 0) {
      // fond du bouton (art-src/bouton_reroll.png), texte blanc cerclé de noir par-dessus
      const bg = this.add.image(0, 0, 'ui_reroll');
      const k = REROLL_W / bg.width;
      bg.setScale(k);
      const label = this.add
        .text(0, 0, t('reroll', { value: data.rerolls }), { fontFamily: theme.font, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 5 })
        .setOrigin(0.5)
        .setResolution(CARD_TEXT_RES);
      const hit = this.add.zone(0, 0, bg.displayWidth, bg.displayHeight).setInteractive({ useHandCursor: true });
      // comme les cartes : il faut appuyer PUIS relâcher sur le bouton, dans cette fenêtre (un clic déjà enfoncé à l'ouverture ne relance rien)
      hit.on('pointerdown', () => (this.pressed = REROLL_PRESSED));
      hit.on('pointerup', () => {
        if (this.pressed === REROLL_PRESSED) this.reroll();
        this.pressed = -1;
      });
      rerollBtn = this.add.container(0, 0, [bg, label, hit]);
    }

    const layout = () => {
      const { width: w, height: h } = this.scale;
      dim.setSize(w, h);
      const n = Math.max(1, this.cards.length);
      const vertical = w < 620; // petit écran : cartes plus serrées, textes plus petits
      const gap = vertical ? 8 : 14;
      const ratio = CARD.H / CARD.W;
      // cartes en portrait, côte à côte : limitées par la largeur de l'écran et par sa hauteur (il reste de la place pour le titre, la barre de temps et « Relancer »)
      const cw = Math.max(70, Math.min(190, (w - (vertical ? 24 : 40) - gap * (n - 1)) / n, (h * 0.46) / ratio));
      const ch = cw * ratio;
      const total = ch;
      // au centre de l'écran : titre, cartes, puis la barre de temps
      const top = h / 2 - total / 2;
      title.setPosition(w / 2, top - 20).setScale((Math.min(vertical ? 240 : 360, w - 40) * 0.7) / title.width);
      this.cards.forEach((c, i) => {
        const x = w / 2 + (i - (n - 1) / 2) * (cw + gap);
        const y = top + ch / 2;
        c.setPosition(x, y);
        resizeUpgradeCard(c, cw, ch, vertical);
        if (suggestBox && i === suggestIdx) {
          // au-dessus de la carte, pointe vers le bas
          suggestBox.setPosition(x, y - ch / 2 - 8);
          suggestLabel?.setWordWrapWidth(Math.max(120, cw + 40), true);
        }
        const fx = this.prismFx.get(i);
        if (fx) {
          setPrismZone(fx, x, y, cw, ch);
        }
      });
      const barW = n * cw + (n - 1) * gap;
      this.timerBox = { x: w / 2 - barW / 2, y: top + total + 22, w: barW };
      this.waitText.setPosition(w / 2, this.cards.length ? top + total + 62 : h / 2);
      if (!this.cards.length) this.timerBox.y = h / 2 + 30;
      rerollBtn?.setPosition(w / 2, top + total + (this.game_.session.online ? 126 : 84)); // 30 px plus bas
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));

    // Touches de choix et de relance rebindables (Options > Hotkeys), par position physique (`code`) : par défaut 1 / 2 / 3 et R, qui marchent aussi en AZERTY, où les chiffres donnent & é " sans Maj.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const i = (['pick1', 'pick2', 'pick3'] as const).findIndex((a) => settings.hotkeyCode(a) === e.code);
      if (i >= 0 && i < offer.length && !e.repeat) this.pick(i);
      if (e.code === settings.hotkeyCode('reroll') && rerollBtn && !e.repeat) this.reroll();
    });
  }

  /** Barre de temps : se vide de droite à gauche au rythme du choix de la simulation (le même chez tous les joueurs). */
  update(): void {
    if (!this.game_.session.online) return; // solo : pas de limite de temps, le jeu attend le choix du joueur
    const left = Math.max(0, this.game_.session.sim.choiceT);
    const k = Math.min(1, left / UPGRADE_CHOICE_TIME);
    const { x, y, w } = this.timerBox;
    const g = this.timerBar;
    g.clear();
    g.fillStyle(0x0a1422, 0.85).fillRoundedRect(x - 3, y - 3, w + 6, 16, 8);
    const color = k < 0.3 ? 0xff5a4a : k < 0.6 ? 0xffc23a : 0x5ad1ff;
    if (k > 0) g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(10, w * k), 10, 5);
    g.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(x - 3, y - 3, w + 6, 16, 8);
  }

  private makeCard(id: UpgradeId, index: number, count: number, prism: boolean): Phaser.GameObjects.Container {
    const c = buildUpgradeCard(this, id, count, prism);
    const hit = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.05, duration: 90 }));
    hit.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    // il faut APPUYER puis relâcher sur la carte : un bouton déjà enfoncé quand la fenêtre s'ouvre (tir à la souris) ne choisit rien
    hit.on('pointerdown', () => (this.pressed = index));
    hit.on('pointerup', () => {
      if (this.pressed === index) this.pick(index);
      this.pressed = -1;
    });
    c.add(hit);
    c.setData('hit', hit);
    return c;
  }

  /** La fenêtre est relancée par GameScene quand les nouvelles propositions arrivent (clé d'offre différente). */
  private reroll(): void {
    if (this.busy) return;
    this.busy = true;
    this.game_.rerollUpgrade();
  }

  private pick(index: number): void {
    if (this.busy) return;
    this.busy = true;
    // retour visuel : la carte choisie grossit, les autres s'effacent ; en ligne, on attend les autres joueurs
    this.cards.forEach((c, i) => this.tweens.add({ targets: c, alpha: i === index ? 1 : 0.25, scale: i === index ? 1.08 : 0.92, duration: 140 }));
    if (this.game_.session.online) this.waitText.setVisible(true);
    this.game_.chooseUpgrade(index);
  }
}
