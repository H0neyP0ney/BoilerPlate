import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { DIFFICULTY_LABEL_KEYS, DIFFICULTY_LEVELS, type DifficultyLevel } from '../data/difficultyLevels';
import { t } from '../i18n';
import { chestButton, chestWidth } from './chestButtons';
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
    // Wardrobe (vestiaire) au milieu à droite : ouvre la boutique (diamants verts des coffres de boss) ; Armory (arsenal) en face, au milieu à gauche : unités à débloquer et upgrades payées en pièces d'or
    add(chestButton(this, w - chestWidth(w) / 2 - 14, 'skins', w, h, () => this.shop()));
    add(chestButton(this, chestWidth(w) / 2 + 14, 'armory', w, h, () => this.armory()));
    add(new Button(this, cx, playY, { label: t('play'), width: playW, height: 110, pulse: true, onClick: () => this.play() }));
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
    this.registry.set('menuFrom', 'solo');
    this.scene.stop();
    this.scene.launch(SCENES.armory);
  }

  private shop(): void {
    this.registry.set('menuFrom', 'solo');
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
