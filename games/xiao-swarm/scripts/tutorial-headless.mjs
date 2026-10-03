// Joue l'onboarding scripté dans Node (sans navigateur) avec un joueur automatique qui suit les cibles du tutoriel, et vérifie le déroulé :
// points verts, vagues, recrue à distance, aucun level-up avant la vague 3, offre imposée, fin et relai du gestionnaire de vagues normal.
// Usage : node scripts/tutorial-headless.mjs
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const { LocalSession } = await vite.ssrLoadModule('/src/net/Session.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { TUTORIAL } = await vite.ssrLoadModule('/src/data/tutorial.ts');
  const session = new LocalSession({ mode: MODES.survival, seed: 4242, bots: 0, tutorial: true });
  const sim = session.sim;
  const sq = sim.squadOf('p1');
  const phases = [];
  let levelAtWave3 = 1;
  let offerSeen = null;
  let recruitDist = null;
  let maxLevelBeforeWave3 = 1;
  let guard = 0;

  while (sim.tutorial.active && guard++ < 30 * 400) {
    // le joueur automatique va vers la cible la plus utile : recrue, power-up, point vert, sinon l'alien ou le globe le plus proche
    const targets = sim.tutorial.targets();
    const t = targets.find((x) => x.kind === 'recruit') ?? targets.find((x) => x.kind === 'powerup') ?? targets.find((x) => x.kind === 'marker');
    const orb = sim.xp.orbs[0];
    const goal = t ?? (orb ? { x: orb.x, y: orb.y } : sim.aliens[0] ? { x: sim.aliens[0].x, y: sim.aliens[0].y } : null);
    let mx = 0;
    let my = 0;
    if (goal) {
      const dx = goal.x - sq.center.x;
      const dy = goal.y - sq.center.y;
      const d = Math.hypot(dx, dy);
      if (d > 20) {
        mx = dx / d;
        my = dy / d;
      }
    }
    session.setLocalInput(mx, my);
    const before = sim.tutorial.phase;
    session.advance(1000 / 30, (e) => {
      if (e.t === 'tutorial') phases.push(e.phase);
    });
    if (sim.tutorial.phase !== before && sim.tutorial.phase === 'wave3') levelAtWave3 = sq.level;
    if (sim.tutorial.phase === 'wave1' || sim.tutorial.phase === 'move2' || sim.tutorial.phase === 'wave2') maxLevelBeforeWave3 = Math.max(maxLevelBeforeWave3, sq.level);
    const rec = sim.recruits.items.find((r) => r.forced);
    if (rec && recruitDist === null) recruitDist = Math.hypot(rec.x - sq.center.x, rec.y - sq.center.y);
    if (sq.offer && !offerSeen) offerSeen = { offer: [...sq.offer], prism: [...sq.offerPrism], rerolled: sq.rerollOffer() };
    if (sq.offer) session.chooseUpgrade(1); // le joueur ne suit pas la suggestion (il choisit ce qu'il veut)
  }

  check(!sim.tutorial.active && guard < 30 * 400, 'le tutoriel se termine', `${(guard / 30).toFixed(0)} s de jeu`);
  check(sim.tutorial.targets().length === 0, 'plus aucune cible (point vert, flèche) à la fin');
  check(phases.join('>') === 'move1>wave1>move2>wave2>wave3>wave4>done', 'enchaînement des étapes', phases.join(' > '));
  check(maxLevelBeforeWave3 === 1 && levelAtWave3 === 1, 'aucun level-up avant la vague 3 (vagues 1 et 2 : pas assez d\'XP)');
  check(sq.level === 2, 'un seul level-up pendant le tutoriel', `niveau ${sq.level}`);
  check(!!offerSeen && offerSeen.offer.join() === TUTORIAL.offer.join() && offerSeen.prism.every((p) => !p) && offerSeen.rerolled === false, 'offre imposée (damage / speed / fireRate), sans relance ni prismatique', offerSeen?.offer.join('/'));
  check(recruitDist !== null && recruitDist > 150, 'la recrue du slime tombe à distance de la squad', `${recruitDist?.toFixed(0)} px`);
  check(sq.picked.speed === 1 && !sq.picked.damage, 'le joueur peut choisir une autre carte que celle suggérée', JSON.stringify(sq.picked));
  check(sq.size >= 6, 'les deux recrues ont été ramassées (4 de départ + 2)', `${sq.size} soldats`);
  check(sim.time === 0, 'la timeline normale n\'a pas démarré pendant le tutoriel', `${sim.time.toFixed(2)} s`);
  for (let i = 0; i < 30 * 5; i++) session.advance(1000 / 30, () => {});
  check(sim.time > 4.5, 'après le tutoriel, le gestionnaire de vagues normal prend le relai', `${sim.time.toFixed(1)} s`);
  check(sim.aliens.length > 0, 'des aliens des vagues normales sont apparus');
  check(sq.alive, 'la squad n\'est jamais morte pendant le tutoriel');
} finally {
  await vite.close();
}
if (failures > 0) {
  console.log(`\n${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log('\nTout est OK');
