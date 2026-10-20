/** Ajoute `n` à la clé `key` d'un compteur de mesure (`Sim.tally`, lu par `RunRecorder`). */
export function tallyAdd(bag: Record<string, number>, key: string, n: number): void {
  bag[key] = (bag[key] ?? 0) + n;
}
