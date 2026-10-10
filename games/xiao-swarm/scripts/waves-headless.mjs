// Teste l'horloge de la timeline des vagues (`WaveRunner`) sans navigateur : timeline normale, suspension pendant un boss (rejeu des
// 5 dernières vagues, sans XP) et pause quand il y a trop d'aliens.
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
  const { DIFFICULTY } = await vite.ssrLoadModule('/src/config.ts');
  const WAVE_CAP = { pauseAbove: DIFFICULTY.wavePauseAbove, resumeAt: DIFFICULTY.waveResumeAt };
  const { ALIENS } = await vite.ssrLoadModule('/src/data/aliens.ts');
  const { Rng } = await vite.ssrLoadModule('@xiao/engine/sim');
  const DT = 1 / 30;
  /** Un runner dont l'état (boss vivant, nombre d'aliens) est piloté par le test. */
  const make = () => {
    const state = { boss: false, aliens: 0 };
    const log = [];
    const runner = new WaveRunner(
      DEFAULT_WAVE_SCRIPT,
      (type, count) => log.push({ type, count, at: runner.cursor, time: runner.time, replaying: runner.replaying, boss: !!ALIENS[type].boss }),
      new Rng(7),
      { bossAlive: () => state.boss, aliveCount: () => state.aliens, bossId: () => 'boss_gling' },
    );
    return { runner, log, state };
  };
  const run = (runner, secs) => {
    for (let i = 0; i < secs / DT; i++) runner.update(DT);
  };
  /** Avance jusqu'à ce que le boss soit apparu (le test déclare ensuite le boss vivant). */
  const runUntilBoss = (runner, log) => {
    for (let i = 0; i < 100 / DT && !log.some((e) => e.boss); i++) runner.update(DT);
  };

  // 1) sans boss ni plafond : les deux horloges avancent ensemble
  {
    const { runner } = make();
    run(runner, 55);
    check(Math.abs(runner.cursor - runner.time) < 1e-6 && runner.time > 54.9, 'sans cas particulier : curseur = durée de la partie', `${runner.cursor.toFixed(2)} / ${runner.time.toFixed(2)}`);
  }

  // 2) combat de boss : la timeline est figée, les derniers envois d'avant le boss sont rejoués en boucle (marqués « sans XP »)
  {
    const { runner, log, state } = make();
    runUntilBoss(runner, log);
    const bossEntry = log.find((e) => e.boss);
    state.boss = true;
    const cursorAtBoss = runner.cursor;
    const before = log.length;
    run(runner, 40);
    const replayed = log.slice(before);
    check(!!bossEntry && Math.abs(runner.cursor - cursorAtBoss) < DT * 2, 'boss vivant : la timeline est figée (curseur à l\'arrivée du boss)', `${runner.cursor.toFixed(1)} s`);
    check(runner.time > cursorAtBoss + 39, 'boss vivant : la durée de la partie continue', `${runner.time.toFixed(1)} s`);
    check(replayed.length > 0 && replayed.every((e) => e.replaying && !e.boss), 'boss vivant : des vagues sont renvoyées en continu, marquées « rejeu » (sans XP), jamais un boss', `${replayed.length} envois en 40 s`);
    // la boucle compte BOSS_REPLAY.count envois différents (un par entrée), répétée
    const levels = [...new Set(replayed.map((e) => e.at))];
    check(levels.length === 1, 'le rejeu ne fait pas avancer le curseur', `${levels.length} valeur(s)`);
    state.boss = false;
    const cursorBefore = runner.cursor;
    run(runner, 5);
    check(runner.cursor > cursorBefore + 4.5 && !runner.replaying, 'boss tué : la timeline reprend', `${cursorBefore.toFixed(1)} → ${runner.cursor.toFixed(1)} s`);
  }

  // 2 bis) vagues rejouées pendant un boss : effectif × DIFFICULTY.bossReplayMulGling (réglage du boss ; même graine, facteur 1 puis réglage du code)
  {
    const replayTotal = (mul) => {
      const saved = DIFFICULTY.bossReplayMulGling;
      DIFFICULTY.bossReplayMulGling = mul;
      const { runner, log, state } = make();
      runUntilBoss(runner, log);
      state.boss = true;
      const before = log.length;
      run(runner, 40);
      DIFFICULTY.bossReplayMulGling = saved;
      return log.slice(before).reduce((n, e) => n + e.count, 0);
    };
    const full = replayTotal(1);
    const reduced = replayTotal(DIFFICULTY.bossReplayMulGling);
    const ratio = reduced / full;
    check(DIFFICULTY.bossReplayMulGling === 0.8 && ratio < 0.95 && ratio > 0.7, 'rejeu pendant un boss : effectif × 0,8 (panneau Difficulté ; arrondi, au moins 1 par groupe)', `${full} → ${reduced} aliens en 40 s (×${ratio.toFixed(2)})`);
  }

  // 3) trop d'aliens : plus aucun envoi, curseur figé, reprise sous le seuil bas (hystérésis)
  {
    const { runner, log, state } = make();
    run(runner, 20);
    state.aliens = WAVE_CAP.pauseAbove + 10;
    run(runner, 0.1);
    const cursorPaused = runner.cursor;
    const sent = log.length;
    run(runner, 15);
    check(runner.suspended && Math.abs(runner.cursor - cursorPaused) < 1e-6 && log.length === sent, `plus de ${WAVE_CAP.pauseAbove} aliens : le gestionnaire est en pause (aucun envoi, curseur figé)`, `${log.length - sent} envois`);
    state.aliens = WAVE_CAP.resumeAt + 20; // redescendu, mais pas encore sous le seuil bas
    run(runner, 3);
    check(runner.suspended && Math.abs(runner.cursor - cursorPaused) < 1e-6, `entre ${WAVE_CAP.resumeAt} et ${WAVE_CAP.pauseAbove} aliens : toujours en pause (hystérésis)`);
    state.aliens = WAVE_CAP.resumeAt;
    run(runner, 3);
    check(!runner.suspended && runner.cursor > cursorPaused + 2.5, `retombé à ${WAVE_CAP.resumeAt} aliens : la timeline reprend`, `${cursorPaused.toFixed(1)} → ${runner.cursor.toFixed(1)} s`);
  }

  // 4) combat de boss avec trop d'aliens : le rejeu aussi est en pause
  {
    const { runner, log, state } = make();
    runUntilBoss(runner, log);
    state.boss = true;
    run(runner, 1);
    state.aliens = WAVE_CAP.pauseAbove + 1;
    const sent = log.length;
    run(runner, 20);
    check(log.length === sent, 'boss vivant et trop d\'aliens : le rejeu s\'arrête aussi', `${log.length - sent} envois`);
  }

  check(Number.isInteger(DIFFICULTY.bossReplayCount) && DIFFICULTY.bossReplayCount >= 1, `le rejeu porte sur les ${DIFFICULTY.bossReplayCount} dernières vagues avant le boss (réglage du panneau Difficulté)`);
} finally {
  await vite.close();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est OK');
process.exit(failures ? 1 : 0);
