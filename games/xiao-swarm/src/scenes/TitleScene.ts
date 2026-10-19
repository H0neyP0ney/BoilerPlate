import Phaser from 'phaser';
import { Button, recolorTexture } from '@xiao/engine';
import { BLUES } from '../art/playerHue';
import { PLAYER_HUE_SHIFT, SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { t } from '../i18n';
import { chestButton, chestWidth, TITLE_ROW, type ChestKind } from './chestButtons';

/**
 * Écran titre (`TitleScreen`) : deux gros boutons côte à côte, Solo à gauche et Multiplayer à droite. Overlay de `GameScene`
 * (`titleOpen`) : sans indice des commandes, la squad ne bouge pas. Pas d'écran titre pendant l'onboarding (FTUE : direct dans la partie).
 * Solo → `SoloScene` (difficulté + Play) ; Multiplayer → `MultiplayerScene` (menu multijoueur).
 */
export class TitleScene extends Phaser.Scene {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SCENES.title);
  }

  create(): void {
    hudOnTop(this); // boutons debug et son / musique du HUD au-dessus du calque sombre de cet écran
    this.rebuild();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild, this);
      this.clear();
    });
  }

  private rebuild(): void {
    this.clear();
    const { width, height } = this.scale;
    const gap = Math.min(40, width * 0.03);
    const w = Math.min(280, (width - 3 * gap) / 2); // 30 % plus petits qu'à l'origine (400 × 180)
    const h = TITLE_ROW.h; // 126 + 20 %
    const y = height * TITLE_ROW.y; // à 20 % du bas de l'écran
    const solo = new Button(this, width / 2 - w / 2 - gap / 2, y, { label: t('solo'), image: 'ui_menu_yellow', width: w, height: h, pulse: true, onClick: () => this.go(SCENES.solo) });
    const multi = new Button(this, width / 2 + w / 2 + gap / 2, y, { label: t('multiplayer'), variant: 'secondary', image: 'ui_menu_blue', width: w, height: h, onClick: () => this.go(SCENES.multiplayer) });
    this.addHeads(solo, 1, w); // Solo : une tête de recrue
    this.addHeads(multi, 4, w); // Multiplayer : quatre têtes, une par couleur de joueur
    // même taille de police pour Solo et Multiplayer : celle du plus long libellé (réduite par `Button` pour tenir dans le bouton), calée sur l'image cible (×0,6, +15 % = ×0,69)
    const labelOf = (b: Button): Phaser.GameObjects.Text => b.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text;
    const fontScale = Math.min(labelOf(solo).scale, labelOf(multi).scale) * 0.69;
    labelOf(solo).setScale(fontScale);
    labelOf(multi).setScale(fontScale);
    this.objects.push(solo, multi);
    // Armory (arsenal) à gauche et Wardrobe (vestiaire) à droite, à 100 px au-dessus de Solo / Multiplayer (bas du coffre → haut du bouton)
    const side = (x: number, kind: ChestKind, scene: string): void => {
      this.objects.push(chestButton(this, x, kind, width, height, () => this.go(scene, true)));
    };
    side(chestWidth(width) / 2 + 14, 'armory', SCENES.armory);
    side(width - chestWidth(width) / 2 - 14, 'skins', SCENES.shop);
  }

  /**
   * Pose `count` têtes de recrue (une par couleur de joueur : bleu, puis les teintes de `PLAYER_HUE_SHIFT`) au-dessus du texte du bouton, et descend le texte
   * pour que l'ensemble tête + texte reste centré. Sans la texture de la tête (paquet 1 pas arrivé), le bouton reste inchangé.
   */
  private addHeads(button: Button, count: number, buttonWidth: number): void {
    const src = 'recruit_part_gunner';
    if (!this.textures.exists(src)) return;
    const label = button.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text; // pas d'index fixe : le pulse ajoute un objet en tête de liste
    label.setY(22); // l'échelle du texte est posée par `rebuild` (la même pour les deux boutons)
    const spacing = Math.min(62, (buttonWidth - 40) / count) * (count > 1 ? 0.65 : 1); // têtes du multi resserrées (0,8 puis 0,65)
    for (let i = 0; i < count; i++) {
      let key = src;
      if (i > 0) {
        key = `title_head#s${i}`;
        if (!recolorTexture(this, src, key, { ...BLUES, shift: PLAYER_HUE_SHIFT[i] })) key = src;
      }
      const head = this.add.image((i - (count - 1) / 2) * spacing, -16, key);
      head.setScale((count > 1 ? 52 * 0.85 : 52) * 0.75 / head.height); // têtes du multi 15 % plus petites que celle du solo ; taille calée sur l'image cible
      // ombre foncée de la même forme que la tête : copie noire décalée vers le bas
      const shadow = this.add.image(head.x, head.y + 3, key).setScale(head.scale).setTint(0x000000).setTintMode(Phaser.TintModes.FILL).setAlpha(0.384);
      button.add(shadow);
      button.add(head);
    }
  }

  private go(key: string, menu = false): void {
    if (menu) this.registry.set('menuFrom', 'title');
    this.scene.stop();
    this.scene.launch(key);
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
