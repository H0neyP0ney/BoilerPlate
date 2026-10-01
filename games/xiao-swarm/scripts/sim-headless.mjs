// Fait tourner la simulation dans Node, sans navigateur ni Phaser : c'est ce que
// ferait un serveur de jeu autoritaire. Usage : node scripts/sim-headless.mjs [royale|survival] [bots] [secondes]
import { createServer } from 'vite';

const [mode = 'royale', bots = '9', seconds = '300'] = process.argv.slice(2);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalSession } = await vite.ssrLoadModule('/src/net/Session.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const session = new LocalSession({ mode: MODES[mode], seed: 1234, bots: Number(bots) });
  const sim = session.sim;
  const counts = {};
  const t0 = performance.now();
  let ticks = 0;
  let maxAliens = 0;
  while (sim.time < Number(seconds) && sim.aliveSquads.length > (mode === 'royale' ? 1 : 0)) {
    session.advance(1000 / 30, (e) => (counts[e.t] = (counts[e.t] ?? 0) + 1));
    // personne ne joue le joueur local : il choisit ses upgrades au hasard (en solo, la pause de choix n'a pas de limite de temps)
    const offer = sim.squadOf(session.localPlayer)?.offer;
    if (offer) session.chooseUpgrade(Math.floor(Math.random() * offer.length));
    ticks++;
    maxAliens = Math.max(maxAliens, sim.aliens.length);
  }
  const ms = performance.now() - t0;
  console.log(`mode=${mode} joueurs=${sim.squads.length} temps simulé=${sim.time.toFixed(0)}s ticks=${ticks}`);
  console.log(`coût moyen : ${(ms / ticks).toFixed(3)} ms/tick (budget 33 ms à 30 Hz)`);
  console.log(`aliens max simultanés : ${maxAliens}`);
  console.log('squads :', sim.squads.map((s) => `${s.owner}:${s.size} soldats/${s.kills} kills`).join('  '));
  console.log('événements :', counts);
} finally {
  await vite.close();
}
