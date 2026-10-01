// Mesure la glisse le long du décor sans navigateur : la squad marche vers un rocher (de face, en biais) et on compare
// « hitbox dure seule » (wallMargin 0) et la zone douce : avancée, saccades (variation de vitesse) et temps collé au décor.
// Usage : node scripts/wall-slide-headless.mjs
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { Sim } = await vite.ssrLoadModule('/src/sim/Sim.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { CROWD, CROWD_DEFAULTS } = await vite.ssrLoadModule('/src/config.ts');
  const { START_SQUADS } = await vite.ssrLoadModule('/src/data/classes.ts');
  const dt = 1 / 30;

  function run(overrides, my, rock) {
    Object.assign(CROWD, CROWD_DEFAULTS, overrides);
    const sim = new Sim({ mode: { ...MODES.survival, waves: [] }, seed: 5, players: ['p'] });
    sim.spawnSquads(() => START_SQUADS[0]);
    const sq = sim.squads[0];
    sim.arena.obstacles.length = 0;
    const cx = sq.anchor.x;
    const cy = sq.anchor.y;
    sim.arena.obstacles.push({ x: cx + 320, y: cy, radius: rock });
    const inputs = new Map();
    let jitter = 0;
    let stuck = 0;
    let samples = 0;
    const last = new Map();
    for (let i = 0; i < 8 / dt; i++) {
      inputs.set('p', { mx: 1, my });
      sim.step(dt, inputs);
      for (const s of sq.soldiers) {
        const p = last.get(s);
        if (p) {
          jitter += Math.hypot(s.vx - p.vx, s.vy - p.vy);
          if (Math.hypot(s.vx, s.vy) < 25 && s.x < cx + 320 + rock + 30 && i * dt > 1) stuck++;
          samples++;
        }
        last.set(s, { vx: s.vx, vy: s.vy });
      }
    }
    return { passed: Math.round(sq.center.x - (cx + 320)), jitter: (jitter / samples).toFixed(2), stuck: `${((100 * stuck) / samples).toFixed(1)}%` };
  }

  for (const [name, my] of [['de face', 0], ['en biais', 0.25]]) {
    for (const rock of [60, 110]) {
      console.log(`${name}, rocher r=${rock}`);
      console.log('  dure seule  ', run({ wallMargin: 0 }, my, rock));
      console.log('  zone douce  ', run({}, my, rock));
    }
  }
} finally {
  await vite.close();
}
