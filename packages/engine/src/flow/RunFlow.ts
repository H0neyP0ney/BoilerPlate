import { poki } from '../poki/poki';

export type RunState = 'ready' | 'playing' | 'interrupted' | 'dead' | 'ended';

/**
 * Cycle de vie d'une partie + events Poki associés. Ne touche pas aux scènes :
 * le jeu décide quoi afficher, RunFlow garantit la bonne séquence SDK.
 *
 *   ready ──begin()──▶ playing ──interrupt()──▶ interrupted ──resume()──▶ playing
 *                         │                     (pause, level-up, menu)
 *                         ├──fail()──▶ dead ──revive()──▶ playing   (rewarded)
 *                         │              └──restart()──▶ ready      (commercialBreak)
 *                         └──win()───▶ ended ──restart()──▶ ready
 */
export class RunFlow {
  private _state: RunState = 'ready';

  /** @param runId identifiant pour poki.measure('run', runId, …) */
  constructor(private readonly runId: string = 'main') {}

  get state(): RunState {
    return this._state;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  /** Premier input du joueur (jamais au chargement). */
  begin(): void {
    if (this._state !== 'ready') return;
    this._state = 'playing';
    poki.resetOnce(); // une partie = un jeu de paliers neuf (le revive ne repasse pas par ici : pas de doublon)
    poki.gameplayStart();
    poki.measure('run', this.runId, 'start');
  }

  /** Pause, écran de level-up, menu : le gameplay s'arrête. */
  interrupt(): boolean {
    if (this._state !== 'playing' || poki.isAdPlaying) return false;
    this._state = 'interrupted';
    poki.gameplayStop();
    return true;
  }

  /**
   * Retour en jeu après interrupt(). `ad: true` pour une sortie de pause
   * (commercialBreak), `false` pour un écran de choix in-game (level-up).
   */
  async resume({ ad = false }: { ad?: boolean } = {}): Promise<void> {
    if (this._state !== 'interrupted') return;
    if (ad) await poki.commercialBreak();
    this._state = 'playing';
    poki.gameplayStart();
  }

  fail(): void {
    if (this._state !== 'playing') return;
    this._state = 'dead';
    poki.gameplayStop();
    poki.measure('run', this.runId, 'fail');
  }

  win(): void {
    if (this._state !== 'playing') return;
    this._state = 'ended';
    poki.gameplayStop();
    poki.measure('run', this.runId, 'complete');
  }

  /** Revive via pub récompensée. true = le joueur a vu la pub, on reprend. */
  async revive(): Promise<boolean> {
    if (this._state !== 'dead') return false;
    poki.measure('reward', 'revive', 'interact');
    const ok = await poki.rewardedBreak();
    if (!ok) return false;
    this._state = 'playing';
    poki.gameplayStart();
    poki.measure('reward', 'revive', 'complete');
    return true;
  }

  /** Revive offert (sans pub : aide à la première partie). Reprend le jeu comme `revive`. */
  reviveFree(): boolean {
    if (this._state !== 'dead') return false;
    poki.measure('reward', 'free_revive', 'interact');
    this._state = 'playing';
    poki.gameplayStart();
    poki.measure('reward', 'free_revive', 'complete');
    return true;
  }

  /**
   * Avant de relancer une partie (retry / rejouer, relance coop). Depuis n'importe quel état : le gameplay est arrêté d'abord
   * (jamais deux `gameplayStop` de suite : `poki` les filtre), l'état repasse tout de suite à `ready`, la pub passe ensuite.
   * `ad: false` : pas de pub interstitielle (le jeu en décide, ex. pas pour les premières parties).
   */
  async restart({ ad = true }: { ad?: boolean } = {}): Promise<void> {
    this._state = 'ready';
    poki.gameplayStop();
    if (ad) await poki.commercialBreak();
  }
}
