import type Phaser from 'phaser';

export interface SfxOptions {
  /** Volume de base (0 → 1), multiplié par le volume général des effets (`sfx.setVolume`). */
  volume?: number;
  /** Variation aléatoire de hauteur (cents, ±) : évite l'effet « mitraillette » d'un son toujours identique. */
  detune?: number;
  /** Délai minimal (ms) entre deux lectures de ce son : les demandes trop rapprochées sont ignorées. */
  minGapMs?: number;
}

/**
 * Bruitages courts (tirs, impacts…) : joués en « fire and forget » sur le SoundManager global, limités en cadence par son
 * (`minGapMs`) pour qu'une escouade qui tire en rafale ne sature pas le mixage. Volume général réglable (menu Options).
 * Le SDK Poki coupe déjà le son pendant les pubs. Les sons doivent être chargés (`scene.load.audio`) avant.
 *
 *   sfx.play(scene, 'sfx_blaster', { volume: 0.4, detune: 150, minGapMs: 70 });
 */
let master = 1;
const lastPlayed = new Map<string, number>();

export const sfx = {
  play(scene: Phaser.Scene, key: string, opts: SfxOptions = {}): void {
    if (master <= 0 || !scene.cache.audio.exists(key)) return;
    const now = performance.now();
    if (now - (lastPlayed.get(key) ?? -Infinity) < (opts.minGapMs ?? 0)) return;
    lastPlayed.set(key, now);
    const d = opts.detune ?? 0;
    scene.sound.play(key, { volume: (opts.volume ?? 1) * master, detune: d ? (Math.random() * 2 - 1) * d : 0 });
  },

  /** Volume général des bruitages (0 → 1). */
  setVolume(volume: number): void {
    master = Math.max(0, Math.min(1, volume));
  },
};
