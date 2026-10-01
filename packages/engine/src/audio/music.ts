import Phaser from 'phaser';

/**
 * Musique de fond : une seule piste à la fois, en boucle, portée par le SoundManager global (survit aux changements de scène).
 * Chargée en différé (hors du chargement initial, pour le budget Poki) puis jouée dès que le navigateur autorise le son
 * (premier input). Le SDK Poki coupe déjà le son pendant les pubs (`game.sound.mute`).
 *
 *   music.play(scene, 'music', ['assets/audio/music.ogg', 'assets/audio/music.mp3'], 0.5);
 *   music.setVolume(scene.game, 0.3);
 */
let current: { key: string; volume: number } | null = null;

function soundOf(game: Phaser.Game, key: string): Phaser.Sound.BaseSound | null {
  return game.sound.get(key) ?? null;
}

function applyVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
  (sound as Phaser.Sound.WebAudioSound).setVolume?.(volume);
}

export const music = {
  /**
   * Lance `key` en boucle (chargé depuis `url` si besoin). Sans effet si cette piste joue déjà.
   * `url` peut lister plusieurs formats (ex. ogg puis mp3) : Phaser télécharge le premier que le navigateur sait lire.
   */
  play(scene: Phaser.Scene, key: string, url: string | string[], volume: number): void {
    const game = scene.game;
    if (current && current.key !== key) soundOf(game, current.key)?.stop(); // une seule musique
    current = { key, volume };
    const start = (): void => {
      if (!current || current.key !== key) return;
      let s = soundOf(game, key);
      if (!s) s = game.sound.add(key, { loop: true, volume: current.volume });
      applyVolume(s, current.volume);
      if (s.isPlaying) return;
      if (game.sound.locked) game.sound.once(Phaser.Sound.Events.UNLOCKED, () => s!.isPlaying || s!.play());
      else s.play();
    };
    if (scene.cache.audio.exists(key)) return start();
    scene.load.audio(key, url);
    scene.load.once(`filecomplete-audio-${key}`, start);
    scene.load.start();
  },

  /** Volume de la musique en cours (0 → 1), mémorisé pour la prochaine lecture. */
  setVolume(game: Phaser.Game, volume: number): void {
    if (!current) return;
    current.volume = volume;
    const s = soundOf(game, current.key);
    if (s) applyVolume(s, volume);
  },

  stop(game: Phaser.Game): void {
    if (current) soundOf(game, current.key)?.stop();
    current = null;
  },
};
