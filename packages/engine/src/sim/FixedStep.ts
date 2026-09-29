/**
 * Boucle à pas fixe : la simulation avance toujours du même dt (ex. 30 Hz),
 * quel que soit le framerate. Indispensable pour le réseau (même tick partout)
 * et pour une physique stable. L'affichage interpole avec `alpha`.
 *
 *   const loop = new FixedStep(30);
 *   update(_, delta) {
 *     loop.advance(delta, (dt) => sim.step(dt, inputs));
 *     view.render(loop.alpha);
 *   }
 */
export class FixedStep {
  private acc = 0;
  /** Fraction [0,1) entre le dernier tick et le suivant, pour interpoler. */
  alpha = 0;

  constructor(
    readonly hz = 30,
    private readonly maxStepsPerFrame = 5,
  ) {}

  get dt(): number {
    return 1 / this.hz;
  }

  /** Retourne le nombre de ticks exécutés. */
  advance(deltaMs: number, step: (dt: number) => void): number {
    this.acc += deltaMs / 1000;
    const dt = this.dt;
    let n = 0;
    while (this.acc >= dt && n < this.maxStepsPerFrame) {
      step(dt);
      this.acc -= dt;
      n++;
    }
    // Onglet gelé / gros lag : on abandonne le retard plutôt que de "rattraper" en rafale.
    if (n === this.maxStepsPerFrame) this.acc = 0;
    this.alpha = this.acc / dt;
    return n;
  }

  reset(): void {
    this.acc = 0;
    this.alpha = 0;
  }
}
