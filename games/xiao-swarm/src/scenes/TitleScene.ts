import Phaser from 'phaser';
import { Button, recolorTexture } from '@xiao/engine';
import { BLUES } from '../art/playerHue';
import { PLAYER_HUE_SHIFT, SCENES } from '../config';
import { hudOnTop } from './hudOnTop';
import { t } from '../i18n';

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
    const h = 126;
    const y = height * 0.8; // à 20 % du bas de l'écran
    const solo = new Button(this, width / 2 - w / 2 - gap / 2, y, { label: t('solo'), width: w, height: h, onClick: () => this.go(SCENES.solo) });
    const multi = new Button(this, width / 2 + w / 2 + gap / 2, y, { label: t('multiplayer'), variant: 'secondary', width: w, height: h, onClick: () => this.go(SCENES.multiplayer) });
    this.addHeads(solo, 1, w); // Solo : une tête de recrue
    this.addHeads(multi, 4, w); // Multiplayer : quatre têtes, une par couleur de joueur
    this.objects.push(solo, multi);
  }

  /**
   * Pose `count` têtes de recrue (une par couleur de joueur : bleu, puis les teintes de `PLAYER_HUE_SHIFT`) au-dessus du texte du bouton, et descend le texte
   * pour que l'ensemble tête + texte reste centré. Sans la texture de la tête (paquet 1 pas arrivé), le bouton reste inchangé.
   */
  private addHeads(button: Button, count: number, buttonWidth: number): void {
    const src = 'recruit_part_gunner';
    if (!this.textures.exists(src)) return;
    const label = button.list[1] as Phaser.GameObjects.Text;
    label.setY(24).setScale(label.scale * 0.9); // texte 10 % plus petit
    const spacing = Math.min(62, (buttonWidth - 40) / count);
    for (let i = 0; i < count; i++) {
      let key = src;
      if (i > 0) {
        key = `title_head#s${i}`;
        if (!recolorTexture(this, src, key, { ...BLUES, shift: PLAYER_HUE_SHIFT[i] })) key = src;
      }
      const head = this.add.image((i - (count - 1) / 2) * spacing, -26, key);
      head.setScale((count > 1 ? 52 * 0.85 : 52) * 0.9 / head.height); // têtes du multi 15 % plus petites que celle du solo, toutes 10 % plus petites
      button.add(head);
    }
  }

  private go(key: string): void {
    this.scene.stop();
    this.scene.launch(key);
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
