// Teste l'horloge de la timeline des vagues (`WaveRunner`) sans navigateur : la timeline avance sans pause (boss vivant ou non).
// Usage : node scripts/waves-headless.mjs
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const { WaveRunner } = await vite.ssrLoadModule('/src/sim/WaveRunner.ts');
  const { DEFAULT_WAVE_SCRIPT } = await vite.ssrLoadModule('/src/data/waves.ts');
  const { Rng } = await vite.ssrLoadModule('@xiao/engine/sim');
  const DT = 1 / 30;
  const make = () => {
    const log = [];
    const runner = new WaveRunner(DEFAULT_WAVE_SCRIPT, (type, count) => log.push({ type, count, at: runner.cursor }), new Rng(7));
    return { runner, log };
  };
  const run = (runner, secs, ctx) => {
    for (let i = 0; i < secs / DT; i++) runner.update(DT, typeof ctx === 'function' ? ctx() : ctx);
  };

  // 1) sans boss ni suspension : les deux horloges avancent ensemble
  {
    const { runner } = make();
    run(runner, 60);
    check(Math.abs(runner.cursor - runner.time) < 1e-6 && runner.time > 59.9, 'sans cas particulier : curseur = durée de la partie', `${runner.cursor.toFixed(2)} / ${runner.time.toFixed(2)}`);
  }

  // 2) un boss vivant ne ralentit pas la timeline : les vagues suivantes arrivent à l'heure
  {
    const { runner, log } = make();
    run(runner, 130);
    check(log.some((e) => e.type === 'boss_rhino') && Math.abs(runner.cursor - runner.time) < 1e-6, 'boss : la timeline continue sans pause (curseur = durée de la partie)', `${runner.cursor.toFixed(1)} s`);
  }
} finally {
  await vite.close();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est OK');
process.exit(failures ? 1 : 0);
