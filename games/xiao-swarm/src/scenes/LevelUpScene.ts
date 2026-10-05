import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { SCENES, UPGRADE_CHOICE_TIME } from '../config';
import { UPGRADES, type UpgradeId } from '../data/progression';
import { upgradeIconKey } from '../view/upgradeIcons';
import { CARD, cardTexture } from '../view/upgradeCards';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

/** Résolution du texte des cartes (multiple de la taille d'écran) : le texte est dessiné 3× plus grand puis affiché réduit, donc net, contour compris. */
const CARD_TEXT_RES = 3;
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
      const count = (game.localSquad.picked[id] ?? 0) + 1;
      const card = this.makeCard(id, i, count, data.prism[i] === true);
      // apparition : chaque carte « pop » (outBack), l'une après l'autre
      card.setScale(0);
      this.tweens.add({ targets: card, scale: 1, duration: 380, delay: 60 + i * 90, ease: 'Back.Out' });
      this.cards.push(card);
      if (data.prism[i] === true) {
        // carte prismatique : pluie de particules RGB qui montent sur toute la carte
        this.prismFx.set(
          i,
          this.add.particles(0, 0, 'fx_star', {
            speedY: { min: -38, max: -8 },
            speedX: { min: -12, max: 12 },
            scale: { start: 0.4, end: 0 },
            rotate: { start: 0, end: 160 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 600, max: 1100 },
            frequency: 16,
            quantity: 1,
            tint: [0xff3a3a, 0xffb43a, 0xfff03a, 0x3aff6a, 0x3ac8ff, 0x8a3aff, 0xff3aff],
            blendMode: 'ADD',
          }),
        );
      }
    });
    this.timerBar = this.add.graphics();

    // onboarding : flèche verte (qui pulse) sur la carte recommandée, plus un petit mot « Recommended »
    const suggestIdx = data.suggest ? offer.indexOf(data.suggest) : -1;
    let suggestArrow: Phaser.GameObjects.Text | null = null;
    let suggestLabel: Phaser.GameObjects.Text | null = null;
    if (suggestIdx >= 0) {
      // texte au-dessus de la flèche : « Prends l'upgrade Dégâts »
      suggestLabel = this.add
        .text(0, 0, t('tutoTakeUpgrade', { name: t(`up_${data.suggest}` as 'up_damage') }), { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 6, align: 'center' })
        .setOrigin(0.5, 1);
      suggestArrow = this.add
        .text(0, 0, '▼', { fontFamily: theme.font, fontSize: '40px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 7 })
        .setOrigin(0.5, 1);
      this.tweens.add({ targets: suggestArrow, scale: { from: 1, to: 1.3 }, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
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
      title.setPosition(w / 2, top - 44 - (suggestArrow ? 80 : 0)).setScale(Math.min(vertical ? 240 : 360, w - 40) / title.width); // plus haut quand la flèche recommandée est au-dessus d'une carte
      this.cards.forEach((c, i) => {
        const x = w / 2 + (i - (n - 1) / 2) * (cw + gap);
        const y = top + ch / 2;
        c.setPosition(x, y);
        this.resizeCard(c, cw, ch, vertical);
        if (suggestArrow && i === suggestIdx) {
          // au-dessus de la carte, pointe vers le bas
          suggestArrow.setText('▼').setOrigin(0.5, 1);
          suggestArrow.setPosition(x, y - ch / 2 - 8);
          suggestLabel?.setWordWrapWidth(Math.max(120, cw + 40), true);
          suggestLabel?.setOrigin(0.5, 1);
          suggestLabel?.setPosition(x, y - ch / 2 - 58);
        }
        const fx = this.prismFx.get(i);
        if (fx) {
          fx.setPosition(x, y);
          fx.clearEmitZones();
          fx.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-cw / 2, -ch / 2, cw, ch), quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData);
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

    // Touches 1 / 2 / 3 par position physique (`code`) : fonctionne aussi en AZERTY, où ces touches donnent & é " sans Maj.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0 && i < offer.length && !e.repeat) this.pick(i);
      if (e.code === 'KeyR' && rerollBtn && !e.repeat) this.reroll();
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
    const def = UPGRADES[id];
    const c = this.add.container(0, 0);
    const bg = this.add.image(0, 0, cardTexture(id, prism)); // prismatique : fond holographique
    // nom en haut ; icône ; description ; compteur ; « Claim » sur la plaque dorée
    const icon = this.add.image(0, 0, upgradeIconKey(id));
    const name = this.add.text(0, 0, t(`up_${id}`), { fontFamily: theme.font, fontStyle: 'bold', color: prism ? '#fff3a0' : '#ffffff', align: 'center' }).setOrigin(0.5);
    const claim = this.add.text(0, 0, t('claim'), { fontFamily: theme.font, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5); // sur la plaque dorée : le « bouton » de la carte
    const desc = this.add
      .text(0, 0, t(`up_${id}_desc`, { value: def.value * (prism ? 2 : 1) }), { fontFamily: theme.font, fontStyle: 'bold', color: prism ? '#fff3a0' : '#ffffff', align: 'center' })
      .setOrigin(0.5, 0);
    const slots = this.makeSlots(id, def.maxStacks, count);
    for (const txt of [name, claim, desc]) txt.setResolution(CARD_TEXT_RES); // texte rendu en haute résolution puis réduit : net malgré la réduction de la carte
    const hit = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.05, duration: 90 }));
    hit.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    // il faut APPUYER puis relâcher sur la carte : un bouton déjà enfoncé quand la fenêtre s'ouvre (tir à la souris) ne choisit rien
    hit.on('pointerdown', () => (this.pressed = index));
    hit.on('pointerup', () => {
      if (this.pressed === index) this.pick(index);
      this.pressed = -1;
    });
    c.add([bg, icon, desc, slots, name, claim, hit]);
    c.setData({ id, bg, icon, name, claim, desc, slots, hit });
    return c;
  }

  /**
   * Progression de l'upgrade en slots (images vide / plein) : une ligne par 5 prises maximum, chaque ligne centrée ; les prises faites
   * (y compris celle qu'on s'apprête à prendre) sont pleines, les autres vides. Aucun slot pour une upgrade sans limite (Renfort). Positions en pixels de
   * planche relatifs au centre de la carte (`CARD.slots`) : le conteneur est mis à l'échelle dans `resizeCard`.
   */
  private makeSlots(id: UpgradeId, max: number, count: number): Phaser.GameObjects.Container {
    const box = this.add.container(0, 0);
    if (max >= 99) return box;
    const S = CARD.slots;
    const rows = Math.ceil(max / S.cols);
    for (let i = 0; i < max; i++) {
      const row = Math.floor(i / S.cols);
      const inRow = Math.min(S.cols, max - row * S.cols);
      const col = i - row * S.cols;
      const img = this.add.image((col - (inRow - 1) / 2) * S.step, S.y - CARD.H / 2 + (row - (rows - 1) / 2) * S.rowStep, i < count ? 'ui_slot_full' : `ui_slot_empty_${id}`);
      img.setScale(S.size / img.width);
      box.add(img);
    }
    return box;
  }

  /** Met la carte à la largeur `w` (hauteur = w × CARD.H / CARD.W) : le fond, puis chaque texte à son repère (CARD) à la même échelle. */
  private resizeCard(c: Phaser.GameObjects.Container, w: number, h: number, vertical: boolean): void {
    const s = w / CARD.W;
    const bg = c.getData('bg') as Phaser.GameObjects.Image;
    const icon = c.getData('icon') as Phaser.GameObjects.Image;
    const name = c.getData('name') as Phaser.GameObjects.Text;
    const claim = c.getData('claim') as Phaser.GameObjects.Text;
    const desc = c.getData('desc') as Phaser.GameObjects.Text;
    const slots = c.getData('slots') as Phaser.GameObjects.Container;
    const hit = c.getData('hit') as Phaser.GameObjects.Zone;
    bg.setDisplaySize(w, h);
    const at = (txt: Phaser.GameObjects.Text, p: { x: number; y: number }, size: number, minPx: number, stroke = 0) => {
      txt.setFontSize(Math.max(minPx, size * s)).setPosition((p.x - CARD.W / 2) * s, (p.y - CARD.H / 2) * s);
      if (stroke) txt.setStroke('#0a1422', Math.max(2, stroke * s));
    };
    icon.setPosition((CARD.icon.x - CARD.W / 2) * s, (CARD.icon.y - CARD.H / 2) * s).setScale(Math.max(CARD.icon.size * s, vertical ? 30 : 40) / Math.max(icon.width, icon.height));
    slots.setScale(s); // positions en pixels de planche : le conteneur suit l'échelle de la carte
    at(desc, CARD.desc, CARD.desc.size, 12, 10);
    desc.setWordWrapWidth(CARD.desc.wrap * s, true);
    at(name, CARD.name, CARD.name.size, 12, 9);
    at(claim, CARD.claim, CARD.claim.size, 12, 11);
    claim.setStroke('#000000', Math.max(2, 11 * s)); // blanc cerclé de noir
    name.setWordWrapWidth(CARD.name.wrap * s, true);
    // un nom trop long pour la carte est rétréci pour tenir
    const maxNameW = CARD.name.wrap * s;
    if (name.width > maxNameW) name.setFontSize(parseFloat(String(name.style.fontSize)) * (maxNameW / name.width));
    hit.setSize(w, h);
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
