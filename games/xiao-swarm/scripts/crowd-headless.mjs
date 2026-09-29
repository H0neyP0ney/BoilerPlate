// Mesure la réactivité du mouvement de foule sans navigateur : démarrage, étirement en marche, reformation à l'arrêt.
// Usage : node scripts/crowd-headless.mjs            (compare quelques jeux de réglages)
//         node scripts/crowd-headless.mjs '{"gainMin":8}'   (défauts + surcharge JSON)
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { Sim } = await vite.ssrLoadModule('/src/sim/Sim.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { CROWD, CROWD_DEFAULTS } = await vite.ssrLoadModule('/src/config.ts');
  const { START_SQUADS } = await vite.ssrLoadModule('/src/data/classes.ts');

  const dt = 1 / 30;
  function measure(overrides) {
    Object.assign(CROWD, CROWD_DEFAULTS, overrides);
    const sim = new Sim({ mode: { ...MODES.survival, waves: [] }, seed: 5, players: ['p'] });
    sim.spawnSquads(() => START_SQUADS[0]);
    sim.arena.obstacles.length = 0; // on mesure le mouvement seul, sans rochers sur le chemin
    const sq = sim.squads[0];
    const inputs = new Map();
    const settle = (secs) => {
      for (let i = 0; i < secs / dt; i++) sim.step(dt, inputs);
    };
    inputs.set('p', { mx: 0, my: 0 });
    settle(2);

    // Démarrage : temps pour que le coeur de la squad atteigne 90 % de la vitesse max.
    inputs.set('p', { mx: 1, my: 0 });
    let prev = sq.center.x;
    let t90 = null;
    let stretch = 0;
    const speedMax = CROWD.speed;
    for (let i = 0; i < 4 / dt; i++) {
      sim.step(dt, inputs);
      const v = (sq.center.x - prev) / dt;
      prev = sq.center.x;
      if (t90 === null && v >= 0.9 * speedMax) t90 = (i + 1) * dt;
      if (i * dt > 1.5) {
        for (const s of sq.soldiers) stretch = Math.max(stretch, Math.hypot(s.x - (sq.anchor.x + s.slotX), s.y - (sq.anchor.y + s.slotY)));
      }
    }

    // Arrêt : temps pour que tout le monde soit à moins de 6 px de son slot et immobile.
    inputs.set('p', { mx: 0, my: 0 });
    let tStop = null;
    for (let i = 0; i < 4 / dt && tStop === null; i++) {
      sim.step(dt, inputs);
      const worst = Math.max(...sq.soldiers.map((s) => Math.hypot(s.x - (sq.anchor.x + s.slotX), s.y - (sq.anchor.y + s.slotY))));
      const fast = Math.max(...sq.soldiers.map((s) => Math.hypot(s.vx, s.vy)));
      if (worst < 6 && fast < 12) tStop = (i + 1) * dt;
    }
    return { t90, tStop, stretch: Math.round(stretch) };
  }

  const override = process.argv[2] ? JSON.parse(process.argv[2]) : null;
  const sets = override
    ? { 'défauts + surcharge': override }
    : {
        'actuels (ancien)': { gainMin: 4, gainSpread: 2, velDamp: 10, maxSpeedMul: 1.6, leash: 70 },
        'plus réactifs': { gainMin: 8, gainSpread: 3, velDamp: 18, maxSpeedMul: 1.8, leash: 70 },
        'très réactifs': { gainMin: 12, gainSpread: 4, velDamp: 26, maxSpeedMul: 2.2, leash: 70 },
      };
  console.log('démarrage t90 = délai pour atteindre 90 % de la vitesse ; reformation = temps pour se replacer après l\'arrêt ; étirement = écart max slot↔soldat en marche');
  for (const [name, o] of Object.entries(sets)) {
    const r = measure(o);
    console.log(`${name.padEnd(20)} t90 ${r.t90?.toFixed(2) ?? '—'} s · reformation ${r.tStop?.toFixed(2) ?? '> 4'} s · étirement ${r.stretch} px`);
  }
} finally {
  await vite.close();
}
