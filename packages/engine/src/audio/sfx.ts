import type Phaser from 'phaser';

export interface SfxOptions {
  /** Volume de base (0 → 1), multiplié par le volume général des effets (`sfx.setVolume`). */
  volume?: number;
  /** Variation aléatoire de hauteur (cents, ±) : évite l'effet « mitraillette » d'un son toujours identique. */
  detune?: number;
  /** Hauteur de base (cents, signé : − = plus grave, + = plus aigu), ajoutée à la variation aléatoire. */
  pitch?: number;
  /** Vitesse de lecture (1 = normale ; 2 = deux fois plus vite et une octave plus haut). */
  rate?: number;
  /** Délai minimal (ms) entre deux lectures de ce son : les demandes trop rapprochées sont ignorées. */
  minGapMs?: number;
  /**
   * Nombre maximal d'instances de ce son qui jouent en même temps. En dessous on peut en superposer quelques-unes, mais plus il y en a déjà,
   * moins la nouvelle a de chances d'être jouée (probabilité `1 − (actives / max)²`) et plus elle est discrète ; au plafond, elle est ignorée.
   * Évite que plusieurs unités qui tirent en même temps ne saturent les canaux audio. Sans valeur : pas de limite.
   */
  maxVoices?: number;
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
/** Fin prévue (performance.now, ms) de chaque instance en cours, par son : sert à compter les voix actives. */
const voices = new Map<string, number[]>();
/** Part de volume retirée à une nouvelle instance par voix déjà active (elles se superposent sans s'additionner). */
const DUCK_PER_VOICE = 0.12;

/** Compteurs par son (outils de dev : page `?sounds`) : lectures effectives, et demandes ignorées par la limite de cadence ou de voix. */
const counters = new Map<string, { played: number; limited: number }>();
const counter = (key: string): { played: number; limited: number } => {
  let c = counters.get(key);
  if (!c) counters.set(key, (c = { played: 0, limited: 0 }));
  return c;
};

export const sfx = {
  play(scene: Phaser.Scene, key: string, opts: SfxOptions = {}): void {
    if (master <= 0 || (opts.volume ?? 1) <= 0 || !scene.cache.audio.exists(key)) return; // volume général ou volume de CE son à 0 : coupé (rien n'est créé, aucune voix ni cadence consommée)
    const now = performance.now();
    if (now - (lastPlayed.get(key) ?? -Infinity) < (opts.minGapMs ?? 0)) {
      counter(key).limited++;
      return;
    }
    // voix encore actives (les terminées sont retirées)
    const active = (voices.get(key) ?? []).filter((end) => end > now);
    voices.set(key, active);
    const max = opts.maxVoices ?? Infinity;
    let duck = 1;
    if (Number.isFinite(max)) {
      if (active.length >= max || Math.random() > 1 - (active.length / max) ** 2) {
        counter(key).limited++; // plus ça joue déjà, moins on en ajoute
        return;
      }
      duck = Math.max(0.3, 1 - DUCK_PER_VOICE * active.length);
    }
    lastPlayed.set(key, now);
    const d = opts.detune ?? 0;
    const sound = scene.sound.add(key, { volume: (opts.volume ?? 1) * master * duck, detune: (opts.pitch ?? 0) + (d ? (Math.random() * 2 - 1) * d : 0), rate: opts.rate ?? 1 });
    sound.once('complete', () => sound.destroy()); // le son temporaire se libère tout seul
    sound.play();
    counter(key).played++;
    active.push(now + ((sound.duration || 0.3) / (opts.rate ?? 1)) * 1000);
  },

  /** Compteurs de lecture par son depuis le lancement (ou le dernier `resetStats`). */
  stats(): ReadonlyMap<string, { played: number; limited: number }> {
    return counters;
  },

  resetStats(): void {
    counters.clear();
  },

  /** Volume général des bruitages (0 → 1). */
  setVolume(volume: number): void {
    master = Math.max(0, Math.min(1, volume));
  },
};
