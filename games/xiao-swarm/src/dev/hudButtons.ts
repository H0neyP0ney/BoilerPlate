import Phaser from 'phaser';
import { PALETTE, SCENES } from '../config';

/**
 * Boutons carrés de dev du HUD, en haut à gauche du jeu (icônes dessinées en Graphics).
 */
type Icon = (g: Phaser.GameObjects.Graphics) => void;

/** Foule : un groupe de points (la formation). */
export const iconCrowd: Icon = (g) => {
  g.fillStyle(0x7dd3ff, 1);
  [[0, 0], [-9, -6], [9, -6], [-7, 8], [7, 8], [0, -12]].forEach(([x, y]) => g.fillCircle(x, y, 4));
};

/** Triche : un éclair. */
export const iconCheat: Icon = (g) => {
  g.fillStyle(0xffd166, 1).fillTriangle(4, -14, -7, 3, 1, 3).fillTriangle(-4, 14, 7, -3, -1, -3).fillRect(-3, -3, 6, 6);
};

/** Unités : un petit soldat (tête, casque, corps). */
export const iconUnit: Icon = (g) => {
  g.fillStyle(0xf5c9a0, 1).fillCircle(0, -4, 7);
  g.fillStyle(0x3d7fe0, 1).fillRoundedRect(-8, -13, 16, 8, 4);
  g.fillStyle(0x4b6fb8, 1).fillRoundedRect(-9, 4, 18, 10, 4);
};

/** Particules : des points qui jaillissent. */
export const iconParticles: Icon = (g) => {
  g.fillStyle(0xffb040, 1).fillCircle(0, 2, 5);
  [[-10, -8, 3], [9, -10, 2.5], [12, 4, 2], [-12, 8, 2.5], [2, -14, 2], [-4, 14, 2]].forEach(([x, y, r]) => g.fillStyle(0xffe08a, 1).fillCircle(x, y, r));
};

/** Obstacles : deux cercles qui se chevauchent (hitbox). */
export const iconObstacle: Icon = (g) => {
  g.lineStyle(2.5, 0xff6a6a, 1).strokeCircle(-6, 2, 9).strokeCircle(6, -2, 9);
};

/** Divers : une grille de quatre carrés. */
export const iconMisc: Icon = (g) => {
  g.fillStyle(0x7dd3ff, 1).fillRoundedRect(-12, -12, 10, 10, 2).fillRoundedRect(2, -12, 10, 10, 2).fillRoundedRect(-12, 2, 10, 10, 2);
  g.fillStyle(0xffd166, 1).fillRoundedRect(2, 2, 10, 10, 2);
};

/** Vagues : une timeline avec des barres de hauteurs différentes. */
export const iconWaves: Icon = (g) => {
  g.fillStyle(0x6fdc6f, 1).fillRect(-12, 4, 5, 8);
  g.fillStyle(0xffd166, 1).fillRect(-5, -2, 5, 14);
  g.fillStyle(0xff8a4a, 1).fillRect(2, -8, 5, 20);
  g.fillStyle(0xff4a4a, 1).fillRect(9, -13, 5, 25);
};

/** Carte : un plan avec une zone en pointillés. */
export const iconMap: Icon = (g) => {
  g.lineStyle(2.5, 0x7dd3ff, 1).strokeRoundedRect(-13, -13, 26, 26, 3);
  g.fillStyle(0xffd166, 0.55).fillRect(-8, -8, 12, 9);
  g.lineStyle(2, 0xffd166, 1).strokeRect(-8, -8, 12, 9);
  g.fillStyle(0xff8a4a, 1).fillCircle(6, 6, 3.5);
};

/** Les visionneuses, dans l'ordre d'affichage des boutons du HUD. */
export const VIEWER_BUTTONS: { scene: string; icon: Icon; label: string }[] = [
  { scene: SCENES.viewer, icon: iconUnit, label: 'Unités' },
  { scene: SCENES.particles, icon: iconParticles, label: 'Particules' },
  { scene: SCENES.obstacles, icon: iconObstacle, label: 'Obstacles' },
  { scene: SCENES.misc, icon: iconMisc, label: 'Divers' },
  { scene: SCENES.waves, icon: iconWaves, label: 'Vagues' },
  { scene: SCENES.mapEditor, icon: iconMap, label: 'Carte' },
];

/** Bouton carré de 44 px centré sur (0, 0). */
export function makeSquareButton(scene: Phaser.Scene, icon: Icon, onClick: () => void): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.panel, 0.92).fillRoundedRect(-22, -22, 44, 44, 10);
  g.lineStyle(2.5, PALETTE.panelBorder, 1).strokeRoundedRect(-22, -22, 44, 44, 10);
  icon(g);
  const hit = scene.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
  hit.on('pointerup', onClick);
  c.add([g, hit]);
  return c;
}
