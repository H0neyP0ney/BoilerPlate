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

  /** Avant de relancer une partie (retry / rejouer). */
  async restart(): Promise<void> {
    await poki.commercialBreak();
    this._state = 'ready';
  }
}
