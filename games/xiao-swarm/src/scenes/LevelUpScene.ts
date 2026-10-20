import Phaser from 'phaser';
import { devLog, poki, REWARDED_ICON, theme } from '@xiao/engine';
import { SCENES, UPGRADE_CHOICE_TIME } from '../config';
import type { UpgradeId } from '../data/progression';
import { settings } from '../settings';
import { CardTilt } from '../view/CardTilt';
import { createButtonShine } from '../view/ButtonShine';
import { starTexture } from '../art/upgradeOrbs';
import { powerUpIconKey } from '../view/PickupViews';
import { playSfx } from '../playSfx';
import { createPrismRain, setPrismZone } from '../view/PrismFx';
import { CARD, CARD_TEXT_RES, buildUpgradeCard, resizeUpgradeCard } from '../view/upgradeCards';
import { t } from '../i18n';
import type { GameScene } from './GameScene';

/** Largeur (px) du bouton « Relancer ». */
const REROLL_W = 253; // 190 avant le 13/10, 230 puis +10 % : bouton plus gros, avec l'icône de dé
/** Hauteur de l'icône de dé en part de la hauteur du fond : 0,5 × 0,9 ÷ 1,1 (fond +10 %, icône −10 % en taille réelle par rapport à avant). */
const REROLL_ICON = (0.5 * 0.9) / 1.1;
/** Valeur de `pressed` quand le bouton enfoncé est « Relancer » (les cartes utilisent leur indice, -1 = rien). */
const REROLL_PRESSED = -2;
/** Hauteur de l'icône « pub vidéo » (relance contre vidéo, solo) en part de la hauteur du fond. */
const REROLL_AD_ICON = 0.42;

export interface LevelUpData {
  /** Propositions du joueur local, ou null : il a déjà choisi (en ligne, on attend les autres joueurs). */
  offer: UpgradeId[] | null;
  /** Upgrades prismatiques (mêmes indices que `offer`) : bonus doublé. */
  prism: boolean[];
  level: number;
  /** Relances restantes. */
  rerolls: number;
  /** Solo : à 0 relance, le bouton reste affiché avec l'icône vidéo (relance contre une vidéo récompensée). */
  rewardedReroll?: boolean;
  /** Onboarding : upgrade imposée, mise en avant par une flèche verte sur sa carte ; les autres cartes ont l'air normales mais ne répondent pas (clic, toucher, touches) : le blocage n'est pas signalé. */
  suggest?: UpgradeId;
  /** Onboarding : clé de texte sous la flèche, à la place de « Claim upgrade » (ex. l'upgrade prismatique). */
  tip?: 'tutoPrism';
}

/**
 * Choix d'upgrade à la montée de niveau : le jeu est EN PAUSE (pour tout le monde en ligne, voir `Sim.choiceT`). Les 3 cartes
 * apparaissent au centre de l'écran (animation outBack). En ligne, une barre de temps se vide de droite à gauche ; sans choix à la
 * fin, la simulation en tire une au hasard. En solo, pas de limite : le jeu attend le choix. Clic / toucher sur une carte (appui
 * ET relâchement dans la fenêtre), ou touches 1 / 2 / 3 du haut du clavier.
 */
/** Taille de base de la flèche + texte « Claim upgrade » du tutoriel (1,15 = +15 % le 13/10). */
const SUGGEST_SCALE = 1.15;

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
  /** Temps restant du choix à l'image précédente : une hausse = un équipier a relancé (la jauge repart de zéro pour tous). */
  private prevLeft = -1;
  /** Fin (ms, horloge de la scène) de l'affichage « Ally rerolled » à la place de l'attente. */
  private rerolledUntil = 0;
  /** Onboarding : indice de la seule carte qu'on peut prendre (-1 : toutes). */
  private onlyCard = -1;

  constructor() {
    super(SCENES.levelUp);
  }

  private get game_(): GameScene {
    return this.scene.get(SCENES.game) as GameScene;
  }

  create(data: LevelUpData): void {
    playSfx(this, 'ui_open');
    this.busy = false;
    this.pressed = -1;
    this.prevLeft = -1;
    this.rerolledUntil = 0;
    this.cards = [];
    this.onlyCard = data.suggest && data.offer ? data.offer.indexOf(data.suggest) : -1; // tutoriel : seule la carte recommandée peut être prise
    this.input.on('pointerup', () => (this.pressed = -1)); // relâché ailleurs : l'appui ne compte plus
    this.prismFx = new Map();
    const game = this.game_;
    const offer = data.offer ?? [];
    devLog(`choix d'upgrade : ouverture (${offer.length} cartes)`);

    const dim = this.add.rectangle(0, 0, 10, 10, 0x05101c, 0.5).setOrigin(0).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 160 });
    const title = this.add.image(0, 0, 'ui_levelup_title').setOrigin(0.5, 1); // art-src/levelup.png
    this.waitText = this.add
      .text(0, 0, t('waitingPlayers'), { fontFamily: theme.font, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#13233a', strokeThickness: 6 })
      .setOrigin(0.5)
      .setVisible(offer.length === 0);
    offer.forEach((id, i) => {
      const count = game.localSquad.picked[id] ?? 0; // prises déjà faites (pas celle qu'on s'apprête à prendre)
      const card = this.makeCard(id, i, count, data.prism[i] === true, game.localSquad.prismPicked[id] ?? 0);
      // apparition : chaque carte « pop » (outBack), l'une après l'autre
      card.setScale(0);
      this.tweens.add({ targets: card, scale: 1, duration: 380, delay: 60 + i * 90, ease: 'Back.Out', onComplete: () => this.prismFx.get(i)?.start() }); // la pluie prismatique ne part qu'une fois la carte entièrement apparue
      this.cards.push(card);
      if (data.prism[i] === true) {
        // carte prismatique : pluie de particules RGB qui montent sur toute la carte
        this.prismFx.set(i, createPrismRain(this).setDepth(10).stop()); // arrêtée jusqu'à la fin de l'apparition de la carte (onComplete ci-dessus) // au-dessus de la carte, y compris de sa version inclinée en 3D (`CardTilt`, profondeur de la carte + 0,5)
      }
    });
    this.timerBar = this.add.graphics();

    // onboarding : flèche verte (qui pulse) sur la carte recommandée, plus un petit mot « Recommended »
    const suggestIdx = data.suggest ? offer.indexOf(data.suggest) : -1;
    let suggestLabel: Phaser.GameObjects.Text | null = null;
    let suggestBottom: Phaser.GameObjects.Container | null = null; // flèche ▲ + texte sous la carte (origine = haut de la flèche)
    if (suggestIdx >= 0) {
      // flèche ▲ + texte « Claim upgrade » sous la carte recommandée
      suggestLabel = this.add
        .text(0, 0, t(data.tip ?? 'tutoTakeUpgrade'), { fontFamily: theme.font, fontSize: data.tip ? '31px' : '26px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 7, align: 'center' })
        .setOrigin(0.5, 0);
      const arrowUp = this.add
        .text(0, 0, '▲', { fontFamily: theme.font, fontSize: '40px', fontStyle: 'bold', color: '#5dff84', stroke: '#0a2210', strokeThickness: 7 })
        .setOrigin(0.5, 0);
      suggestLabel.setPosition(0, 44);
      suggestBottom = this.add.container(0, 0, [arrowUp, suggestLabel]).setDepth(30); // flèche vers le haut + texte sous la carte, toujours au premier plan (au-dessus des cartes, de leur inclinaison 3D et de la pluie prismatique)
      this.tweens.add({ targets: suggestBottom, scale: { from: SUGGEST_SCALE, to: SUGGEST_SCALE * 1.15 }, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    // bouton « Relancer » : visible tant qu'il reste des relances (clic / toucher, ou touche R) ; en solo, à 0 relance, il propose une vidéo récompensée (icône vidéo à la place du compteur)
    let rerollBtn: Phaser.GameObjects.Container | null = null;
    const rewarded = data.rerolls <= 0 && !!data.rewardedReroll;
    if (offer.length && (data.rerolls > 0 || rewarded)) {
      if (rewarded) poki.measure('reward', 'reroll', 'visible');
      // fond du bouton (art-src/bouton_reroll.png), texte blanc cerclé de noir par-dessus
      const bg = this.add.image(0, 0, 'ui_reroll');
      const k = REROLL_W / bg.width;
      bg.setScale(k);
      const label = this.add
        .text(0, 0, rewarded ? t('rerollAd') : t('reroll', { value: data.rerolls }), { fontFamily: theme.font, fontSize: '30px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 5 })
        .setOrigin(0.5)
        .setResolution(CARD_TEXT_RES);
      // icône de dé avant le texte (même image que le globe de relance), le tout centré sur le bouton
      const diceKey = powerUpIconKey('reroll');
      const dice = this.textures.exists(diceKey) ? this.add.image(0, 0, diceKey) : null;
      // relance contre vidéo : icône « pub vidéo » des boutons rewarded après le texte, à la place du compteur
      dice?.setScale((bg.displayHeight * REROLL_ICON) / dice.height);
      const ad = rewarded && this.textures.exists(REWARDED_ICON) ? this.add.image(0, 0, REWARDED_ICON) : null;
      ad?.setScale((bg.displayHeight * REROLL_AD_ICON) / ad.height);
      const gap = 8;
      const parts = [dice, label, ad].filter((o): o is Phaser.GameObjects.Image | Phaser.GameObjects.Text => !!o);
      const total = parts.reduce((n, o) => n + o.displayWidth, 0) + gap * (parts.length - 1);
      let x = -total / 2;
      for (const o of parts) {
        o.setX(x + o.displayWidth / 2);
        x += o.displayWidth + gap;
      }

      const hit = this.add.zone(0, 0, bg.displayWidth, bg.displayHeight).setInteractive({ useHandCursor: true });
      // comme les cartes : il faut appuyer PUIS relâcher sur le bouton, dans cette fenêtre (un clic déjà enfoncé à l'ouverture ne relance rien)
      hit.on('pointerdown', () => (this.pressed = REROLL_PRESSED));
      hit.on('pointerup', () => {
        if (this.pressed === REROLL_PRESSED) this.reroll();
        this.pressed = -1;
      });
      const shine = createButtonShine(this, 'ui_reroll', k, { echo: true }); // reflet blanc qui traverse le bouton de gauche à droite toutes les 3 s
      // étoile blanche en haut à droite : elle scintille (tourne, grossit puis rétrécit) juste après le passage du reflet, qui finit sa course de ce côté.
      // Texture : l'étoile du power-up magnet (`starTexture`), remplie de blanc ; à défaut (pièces de la recrue pas chargées), une étoile à quatre branches dessinée.
      const corner = bg.displayHeight * 0.42; // repère de position dans le coin (inchangé)
      const R = corner * 0.7; // rayon de l'étoile : 30 % plus petite
      const starKey = starTexture(this, 'magnet');
      let star: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      let full = 1; // échelle maximale du scintillement
      if (starKey) {
        const img = this.add.image(0, 0, starKey);
        img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); // remplie de blanc
        full = (R * 2) / img.width;
        star = img;
      } else {
        const g = this.add.graphics();
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 8; i++) pts.push(new Phaser.Math.Vector2(Math.sin((i * Math.PI) / 4) * (i % 2 === 0 ? R : R * 0.26), -Math.cos((i * Math.PI) / 4) * (i % 2 === 0 ? R : R * 0.26)));
        g.fillStyle(0xffffff, 1).fillPoints(pts, true);
        star = g;
      }
      star.setScale(0).setVisible(false);
      star.setPosition(bg.displayWidth / 2 - corner * 0.55 - 5, -bg.displayHeight / 2 + corner * 0.45 + 5); // décalée de 5 px vers la gauche et de 5 px vers le bas
      const SHINE = { period: 3000, first: 700, sweep: 550 }; // réglages par défaut de `createButtonShine` : le reflet part toutes les 3 s et traverse le bouton en 550 ms
      const sparkle = (): void => {
        if (!star.active) return;
        star.setVisible(true).setScale(0).setRotation(0);
        this.tweens.add({ targets: star, rotation: Math.PI / 2, duration: 650, ease: 'Sine.InOut' });
        this.tweens.add({ targets: star, scale: full, duration: 325, ease: 'Sine.Out', yoyo: true, onComplete: () => star.setVisible(false) }); // grossit puis rétrécit
      };
      this.time.addEvent({ delay: SHINE.period, loop: true, startAt: SHINE.period - (SHINE.first + SHINE.sweep * 0.8), callback: sparkle });
      rerollBtn = this.add.container(0, 0, [bg, ...parts, shine, star, hit]);
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
        (c.getData('tilt') as CardTilt | undefined)?.resize(); // la carte change de taille : sa photo et sa lumière ne sont plus valables
        resizeUpgradeCard(c, cw, ch, vertical);
        if (suggestBottom && i === suggestIdx) {
          suggestBottom.setPosition(x, y + ch / 2 - 42); // 50 px plus près de la carte (la flèche mord sur son bas ; 20 px de plus le 20/10)
          suggestLabel?.setWordWrapWidth(data.tip ? Math.min(w - 20, Math.max(320, cw * 2.8)) : Math.max(120, cw + 40), true); // texte prismatique : largeur assez grande pour que chacune de ses 2 lignes tienne sur une seule ligne
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      for (const c of this.cards) (c.getData('tilt') as CardTilt | undefined)?.destroy();
    });

    // Touches de choix et de relance rebindables (Options > Hotkeys), par position physique (`code`) : par défaut 1 / 2 / 3 et R, qui marchent aussi en AZERTY, où les chiffres donnent & é " sans Maj.
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const i = (['pick1', 'pick2', 'pick3'] as const).findIndex((a) => settings.hotkeyCode(a) === e.code);
      if (i >= 0 && i < offer.length && !e.repeat && this.allowed(i)) this.pick(i);
      if (e.code === settings.hotkeyCode('reroll') && rerollBtn && !e.repeat) this.reroll();
    });
  }

  /** Barre de temps : se vide de droite à gauche au rythme du choix de la simulation (le même chez tous les joueurs). */
  update(): void {
    if (!this.game_.session.online) return; // solo : pas de limite de temps, le jeu attend le choix du joueur
    const left = Math.max(0, this.game_.session.sim.choiceT);
    if (this.prevLeft >= 0 && left > this.prevLeft + 0.25 && this.waitText.visible) this.rerolledUntil = this.time.now + 2500; // moi j'ai fini : je vois que la jauge repart à cause d'un équipier
    this.prevLeft = left;
    this.waitText.setText(this.time.now < this.rerolledUntil ? t('allyRerolled') : t('waitingPlayers'));
    const k = Math.min(1, left / UPGRADE_CHOICE_TIME);
    const { x, y, w } = this.timerBox;
    const g = this.timerBar;
    g.clear();
    g.fillStyle(0x0a1422, 0.85).fillRoundedRect(x - 3, y - 3, w + 6, 16, 8);
    const color = k < 0.3 ? 0xff5a4a : k < 0.6 ? 0xffc23a : 0x5ad1ff;
    if (k > 0) g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(10, w * k), 10, 5);
    g.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(x - 3, y - 3, w + 6, 16, 8);
  }

  private makeCard(id: UpgradeId, index: number, count: number, prism: boolean, prismCount = 0): Phaser.GameObjects.Container {
    const c = buildUpgradeCard(this, id, count, prism, prismCount); // prismCount : prises prismatiques déjà faites (carrés arc-en-ciel)
    const hit = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      playSfx(this, 'ui_hover');
      this.tweens.add({ targets: c, scale: 1.05, duration: 90 });
    });
    hit.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    // il faut APPUYER puis relâcher sur la carte : un bouton déjà enfoncé quand la fenêtre s'ouvre (tir à la souris) ne choisit rien
    hit.on('pointerdown', () => (this.pressed = index));
    hit.on('pointerup', () => {
      if (this.pressed === index) this.pick(index); // carte bloquée (onboarding) : `pick` ne fait rien, sans aucun retour visuel
      this.pressed = -1;
    });
    c.add(hit);
    c.setData('hit', hit);
    c.setData('tilt', new CardTilt(this, c, hit, prism)); // la carte pivote en 3D vers le curseur (effet carte à collectionner) ; prismatique : sa lumière holographique suit aussi le curseur
    return c;
  }

  /** La fenêtre est relancée par GameScene quand les nouvelles propositions arrivent (clé d'offre différente). */
  private reroll(): void {
    if (this.busy) return;
    this.busy = true;
    playSfx(this, 'ui_reroll');
    void this.game_.rerollUpgrade().then((ok) => {
      if (!ok && this.scene.isActive()) this.busy = false; // vidéo ratée ou indisponible : on peut encore choisir une carte (ou réessayer)
    });
  }

  /** Cette carte peut-elle être prise ? Toujours, sauf pendant l'onboarding où seule la carte recommandée l'est. */
  private allowed(index: number): boolean {
    return this.onlyCard < 0 || index === this.onlyCard;
  }

  private pick(index: number): void {
    if (this.busy || !this.allowed(index)) return;
    this.busy = true;
    // retour visuel : la carte choisie grossit, les autres s'effacent ; en ligne, on attend les autres joueurs
    this.cards.forEach((c, i) => this.tweens.add({ targets: c, alpha: i === index ? 1 : 0.25, scale: i === index ? 1.08 : 0.92, duration: 140 }));
    if (this.game_.session.online) this.waitText.setVisible(true);
    this.game_.chooseUpgrade(index);
  }
}
