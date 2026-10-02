// Fait jouer des coéquipiers IA (CoopBot) en coop, sans navigateur, et compare les deux niveaux (standard / expert).
// L'hôte est lui aussi piloté par un bot du même niveau. Usage : node scripts/bot-headless.mjs [secondes=300] [bots=2] [seed=7]
import { createServer } from 'vite';

const seconds = Number(process.argv[2] ?? 300);
const extraBots = Number(process.argv[3] ?? 2);
const seed = Number(process.argv[4] ?? 7);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const { HostSession } = await vite.ssrLoadModule('/src/net/HostSession.ts');
  const { LoopbackHub } = await vite.ssrLoadModule('/src/net/LoopbackTransport.ts');
  const { CoopBot } = await vite.ssrLoadModule('/src/sim/CoopBot.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');

  /** Une partie coop : l'hôte (piloté par un bot) + `extraBots` coéquipiers IA, tous du même niveau. */
  async function play(level, runSeed) {
    const hub = new LoopbackHub();
    const transport = hub.createTransport();
    const roomCode = await transport.host();
    const host = new HostSession({ mode: MODES.coop, seed: runSeed, transport, roomCode, bots: extraBots, botLevel: level });
    const me = new CoopBot(host.localPlayer, runSeed + 7, level);
    const events = { gameEnd: 0, victory: 0, alienDied: 0, soldierDied: 0, levelUp: 0, firstEnd: 0 };
    const runs = []; // durée (s de jeu) de chaque partie
    let maxLevel = 1;
    let ticks = 0;
    let maxTick = 0;
    const t0 = performance.now();
    for (let i = 0; i < seconds * 30; i++) {
      const input = me.think(host.sim, 1 / 30);
      host.setLocalInput(input.mx, input.my);
      const pick = me.pickUpgrade(host.sim);
      if (pick >= 0) host.chooseUpgrade(pick);
      const a = performance.now();
      host.advance(1000 / 30, (e) => {
        if (e.t === 'gameEnd') {
          events.gameEnd++;
          if (e.victory) events.victory++;
          if (!events.firstEnd) events.firstEnd = host.sim.time;
          runs.push(host.sim.time); // le temps de jeu repart de 0 à la relance

        } else if (e.t in events) events[e.t]++;
      });
      maxTick = Math.max(maxTick, performance.now() - a);
      for (const q of host.sim.squads) maxLevel = Math.max(maxLevel, q.level);
      ticks++;
    }
    const ms = performance.now() - t0;
    const sim = host.sim;
    return {
      level,
      time: sim.time,
      firstEnd: events.firstEnd || null,
      ends: events.gameEnd,
      victories: events.victory,
      kills: events.alienDied,
      soldiersLost: events.soldierDied,
      levels: maxLevel,
      meanRun: runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : sim.time,
      squads: sim.squads.length,
      alive: sim.aliveSquads.length,
      msPerTick: ms / ticks,
      maxTick,
      sig: sim.squads.map((s) => `${s.owner}:${s.size}:${Math.round(s.center.x)},${Math.round(s.center.y)}`).join(' ') + ` k${events.alienDied} t${sim.tick}`,
    };
  }

  const results = {};
  for (const level of ['standard', 'expert']) {
    results[level] = await play(level, seed);
    const r = results[level];
    console.log(
      `\n[${level}] ${seconds}s simulées, ${r.squads} squads (${r.alive} vivantes) : kills ${r.kills}, soldats perdus ${r.soldiersLost}, niveau max ${r.levels}, ` +
        `fins de partie ${r.ends} (victoires ${r.victories}, durée moyenne ${r.meanRun.toFixed(0)}s), ${r.msPerTick.toFixed(2)} ms/tick (max ${r.maxTick.toFixed(1)})`,
    );
  }

  const std = results.standard;
  const exp = results.expert;
  check(std.squads === 1 + extraBots && exp.squads === 1 + extraBots, `${1 + extraBots} squads (hôte + ${extraBots} bots)`);
  check(std.kills > 0 && exp.kills > 0, 'les bots tuent des aliens', `standard ${std.kills}, expert ${exp.kills}`);
  check(std.levels > 1 && exp.levels > 1, 'les bots choisissent leurs upgrades (niveaux atteints)', `standard ${std.levels}, expert ${exp.levels}`);
  const score = (r) => r.meanRun;
  check(score(exp) >= score(std), 'expert fait au moins aussi bien que standard', `durée moyenne expert ${score(exp).toFixed(0)}s vs standard ${score(std).toFixed(0)}s`);
  check(exp.msPerTick < 15, 'coût raisonnable', `${exp.msPerTick.toFixed(2)} ms/tick`);

  const again = await play('expert', seed);
  check(again.sig === exp.sig, 'déterminisme (même seed → même partie)', again.sig === exp.sig ? '' : `${again.sig} ≠ ${exp.sig}`);
} finally {
  await vite.close();
}
if (failures > 0) {
  console.log(`\n${failures} échec(s)`);
  process.exit(1);
}
console.log('\nOK');
