import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { COIN_KEY, ensureGemTextures, GEM_KEY } from '../art/gems';
import { SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { DIFFICULTY_LABEL_KEYS, DIFFICULTY_LEVELS, type DifficultyLevel } from '../data/difficultyLevels';
import { t } from '../i18n';
import { settings } from '../settings';
import type { GameScene } from './GameScene';

const FILLS: Record<DifficultyLevel, number | undefined> = { normal: undefined, expert: 0xe8892b, impossible: 0xc63b3b };

/**
 * Écran Solo (`SoloScreen`) : trois boutons de difficulté (la dernière difficulté jouée est présélectionnée, mémorisée dans `settings.difficulty`)
 * et un gros bouton Play en bas. Play referme l'écran : la partie attend le premier input, avec l'indice des commandes affiché.
 */
export class SoloScene extends Phaser.Scene {
  private game_!: GameScene;
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SCENES.solo);
  }

  create(): void {
    hudOnTop(this); // boutons debug et son / musique du HUD au-dessus du calque sombre de cet écran
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
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const level = this.game_.session.sim.difficulty;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    // les trois niveaux sur une ligne, juste au-dessus du bouton Play
    const playW = Math.min(440, w - 40);
    const gap = 10;
    const bw = (playW - 2 * gap) / 3; // la ligne des trois niveaux a la largeur du bouton Play
    const lift = h * 0.1; // l'ensemble niveaux + Play + Back est remonté de 10 % de la hauteur par rapport au bord bas
    const playY = h - 110 - lift;
    const rowY = playY - 55 - 50;
    const tip = this.makeTip(add);
    DIFFICULTY_LEVELS.forEach((l, i) => {
      const on = l === level;
      const locked = !settings.isUnlocked(l);
      add(
        new Button(this, cx + (i - 1) * (bw + gap), rowY, {
          label: locked ? `🔒 ${t(DIFFICULTY_LABEL_KEYS[l])}` : t(DIFFICULTY_LABEL_KEYS[l]),
          variant: on ? 'primary' : 'secondary',
          fill: on ? FILLS[l] : undefined,
          textColor: on && FILLS[l] !== undefined ? '#ffffff' : undefined,
          width: bw,
          height: 64,
          onClick: () => {
            if (locked || l === this.game_.session.sim.difficulty) return;
            settings.setDifficulty(l); // mémorisé : la prochaine run démarre dans ce niveau
            this.game_.session.setDifficulty(l);
            this.rebuild();
          },
        }).setEnabled(!locked, false), // verrouillé : cliquable pour la bulle d'info, mais pas grisé
      );
      if (locked) {
        // bulle d'info au survol ou au clic d'un niveau verrouillé : quel niveau finir pour le débloquer
        const x = cx + (i - 1) * (bw + gap);
        const prev = t(DIFFICULTY_LABEL_KEYS[DIFFICULTY_LEVELS[i - 1]]);
        const zone = add(this.add.zone(x, rowY, bw, 64).setInteractive());
        zone.on('pointerover', () => tip.show(x, rowY - 32, t('unlockTip', { level: prev })));
        zone.on('pointerout', () => tip.hide());
        zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
          tip.show(x, rowY - 32, t('unlockTip', { level: prev }));
          if (p.wasTouch) tip.hideAfter(2200); // au doigt, pas de survol : la bulle s'efface seule (à la souris elle reste tant que le curseur est dessus)
        });
      }
    });
    // gros bouton « Skins » au milieu à droite : ouvre la boutique (diamants verts des coffres de boss)
    const shopW = Math.min(190, Math.max(110, w * 0.26));
    const shopH = 128;
    const shopX = w - shopW / 2 - 14;
    add(new Button(this, shopX, h / 2, { label: t('skinsBtn'), variant: 'secondary', fill: 0x1f7a4d, textColor: '#ffffff', width: shopW, height: shopH, onClick: () => this.shop() }));
    add(this.add.image(shopX, h / 2 - shopH / 2 + 4, GEM_KEY).setScale(0.7).setDepth(2)); // diamant vert qui dépasse en haut du bouton
    // « Armory » (market) en face, au milieu à gauche : unités à débloquer et upgrades payées en pièces d'or
    const armX = shopW / 2 + 14;
    add(new Button(this, armX, h / 2, { label: t('armoryBtn'), variant: 'secondary', fill: 0x8a5a05, textColor: '#ffffff', width: shopW, height: shopH, onClick: () => this.armory() }));
    add(this.add.image(armX, h / 2 - shopH / 2 + 4, COIN_KEY).setScale(0.7).setDepth(2)); // pièce d'or qui dépasse en haut du bouton
    add(new Button(this, cx, playY, { label: t('play'), width: playW, height: 110, onClick: () => this.play() }));
    // « Back » sous Play : même largeur que lui, collé comme les trois boutons de niveau (18 px d'écart)
    const backH = 56;
    add(new Button(this, cx, playY + 55 + 18 + backH / 2, { label: t('mpBack'), variant: 'secondary', width: playW, height: backH, onClick: () => this.back() }));
  }

  /** Bulle d'info (fond sombre arrondi + texte) posée au-dessus du point donné, tenue dans l'écran. */
  private makeTip(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): { show: (x: number, y: number, text: string) => void; hide: () => void; hideAfter: (ms: number) => void } {
    const g = this.add.graphics();
    const label = this.add.text(0, 0, '', { fontFamily: theme.font, fontSize: '20px', fontStyle: 'bold', color: '#ffffff', align: 'center' }).setOrigin(0.5);
    const box = add(this.add.container(0, 0, [g, label]).setDepth(50).setVisible(false));
    let timer: Phaser.Time.TimerEvent | null = null; // effacement différé en attente (tactile)
    const cancel = (): void => {
      timer?.remove();
      timer = null;
    };
    return {
      show: (x, y, text) => {
        cancel(); // un effacement lancé par un clic précédent ne doit pas masquer une bulle réaffichée
        label.setText(text);
        const bw = label.width + 28;
        const bh = label.height + 18;
        g.clear();
        g.fillStyle(0x0b1a4d, 0.95).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
        g.lineStyle(2, 0x3f6fe0, 0.9).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
        const half = bw / 2 + 8;
        box.setPosition(Math.max(half, Math.min(this.scale.width - half, x)), y - bh / 2 - 8).setVisible(true);
      },
      hide: () => {
        cancel();
        box.setVisible(false);
      },
      hideAfter: (ms) => {
        cancel();
        timer = this.time.delayedCall(ms, () => box.setVisible(false));
      },
    };
  }

  private play(): void {
    this.game_.titleOpen = false;
    this.scene.stop();
  }

  private armory(): void {
    this.scene.stop();
    this.scene.launch(SCENES.armory);
  }

  private shop(): void {
    this.scene.stop();
    this.scene.launch(SCENES.shop);
  }

  private back(): void {
    this.scene.stop();
    this.scene.launch(SCENES.title);
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
