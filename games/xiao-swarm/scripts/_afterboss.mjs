// Mesure temporaire : PV d'aliens envoyés et aliens vivants dans les 30 s qui suivent la mort de chaque boss (squad immortelle, boss tué 8 s
// après son apparition).
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { LocalSession } = await vite.ssrLoadModule('/src/net/Session.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  for (const seed of [1, 2, 3]) {
    const session = new LocalSession({ mode: MODES.survival, seed, bots: 0 });
    const { sim } = session;
    const sq = sim.squadOf('p1');
    let ang = 0;
    let bossSeen = null;
    const watch = []; // { name, t0, hp0 }
    const out = [];
    const hist = [];
    while (sim.time < 440) {
      hist.push(sim.metrics.spawnedHp);
      ang += 0.02;
      session.setLocalInput(Math.cos(ang), Math.sin(ang));
      session.advance(1000 / 30, () => {});
      for (const s of sq.soldiers) s.hp = s.maxHp;
      if (sq.offer) sim.chooseUpgrade('p1', 0);
      const boss = sim.aliens.find((a) => a.def.boss && a.alive);
      if (boss && boss !== bossSeen) { bossSeen = boss; boss.t0 = sim.time; boss.before = sim.metrics.spawnedHp - (hist[hist.length - 1 - 900] ?? 0) - boss.maxHp; }
      if (boss && sim.time - boss.t0 > 8) {
        boss.age = 99;
        sim.damage(boss, 1e12, 'p1');
        watch.push({ name: boss.def.id, before: boss.before, t0: sim.time, hp0: sim.metrics.spawnedHp, peak: 0, sum: 0, n: 0 });
      }
      for (const w of watch) {
        if (w.done) continue;
        const alive = sim.aliens.filter((a) => a.alive).length;
        w.peak = Math.max(w.peak, alive);
        w.sum += alive;
        w.n++;
        if (sim.time - w.t0 >= 30) {
          w.done = true;
          out.push(`${w.name.padEnd(11)} 30 s avant le boss ${Math.round(w.before).toString().padStart(6)}   PV envoyés dans les 30 s après ${Math.round(sim.metrics.spawnedHp - w.hp0).toString().padStart(6)}   aliens vivants moy. ${(w.sum / w.n).toFixed(0).padStart(3)} / max ${w.peak}`);
        }
      }
    }
    console.log(`seed ${seed} (fin : temps ${sim.time.toFixed(0)} s, timeline ${sim.waves.cursor.toFixed(0)} s, ${sim.aliens.length} aliens, suspendue ${sim.waves.suspended})\n  ${out.join('\n  ')}`);
  }
} finally {
  await vite.close();
}
