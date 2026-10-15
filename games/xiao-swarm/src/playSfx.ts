import type Phaser from 'phaser';
import { sfx } from '@xiao/engine';
import { SFX, type SfxId } from './settings';

/** Joue un bruitage du catalogue `SFX` (réglages de volume, hauteur, cadence et voix dans `settings.ts`). Ignoré s'il n'est pas encore chargé. */
export function playSfx(scene: Phaser.Scene, id: SfxId): void {
  const d = SFX[id];
  sfx.play(scene, d.key, d);
}

const POWERUP_SFX: Record<string, SfxId> = { stim: 'pu_stim', magnet: 'pu_magnet', heal: 'pu_heal', stasis: 'pu_stasis', rockets: 'pu_rockets', reroll: 'pu_reroll', prism: 'pu_prism' };

/** Son d'un power-up ou loot ramassé. */
export function playPowerUpSfx(scene: Phaser.Scene, kind: string): void {
  const id = POWERUP_SFX[kind];
  if (id) playSfx(scene, id);
}
