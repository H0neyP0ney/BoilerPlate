// Mesure dans Node (sans navigateur) la fuite en rond : une squad (PV infinis) tourne autour du centre de la carte pendant 60 s, suivie par
// une horde d'aliens immortels (pas de vagues). Compare sans / avec le recyclage des traînards (`RELOCATE` de config.ts, méthode Vampire
// Survivors) : entassement des aliens au centre du cercle, distance à la squad, dégâts subis, aliens replacés.
// Usage : npm run sim:chase (dans games/xiao-swarm) [-- rayon secondes '{"far":1000}']  (3e argument : réglages RELOCATE essayés)
import { createServer } from 'vite';

const R = Number(process.argv[2] ?? 900);
const SECONDS = Number(process.argv[3] ?? 60);
const TRY = process.argv[4] ? JSON.parse(process.argv[4]) : null;
const HORDE = [['slime', 30], ['gling', 30], ['charger', 8], ['burner', 8], ['toad', 6]];
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { LocalSession } = await vite.ssrLoadModule('/src/net/Session.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { RELOCATE } = await vite.ssrLoadModule('/src/config.ts');
  const defaults = { ...RELOCATE };
  const mode = { ...MODES.survival, waves: { ...MODES.survival.waves, timeline: [] } };

  const run = (seed) => {
    const session = new LocalSession({ mode, seed, bots: 0 });
    const { sim } = session;
    const sq = sim.squadOf('p1');
    const cx = sim.map.width / 2;
    const cy = sim.map.height / 2;
    // squad posée sur le cercle, aliens tout autour d'elle
    sim.aliens.length = 0;
    sq.anchor.x = cx + R;
    sq.anchor.y = cy;
    for (const s of sq.soldiers) { s.x = s.px = cx + R; s.y = s.py = cy; }
    session.advance(34, () => {});
    for (const [type, n] of HORDE) sim.horde.spawnNear(sq, type, n, 500);
    const BIG = 1e7;
    for (const a of sim.aliens) a.hp = a.maxHp = BIG;
    let damage = 0;
    let samples = 0;
    let inner = 0;
    let dist = 0;
    let near = 0;
    let moved = 0;
    let flankers = 0;
    let ids = new Set(sim.aliens.map((a) => a.id));
    const ticks = Math.round(SECONDS * 30);
    for (let i = 0; i < ticks; i++) {
      // pilote : tangente au cercle (sens trigonométrique) + rappel vers le rayon R
      const dx = sq.center.x - cx;
      const dy = sq.center.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = (R - d) / 200;
      session.setLocalInput(-dy / d + (dx / d) * k, dx / d + (dy / d) * k);
      session.advance(34, () => {});
      sim.xp.clear();
      sim.recruits.clear();
      sim.powerups.clear();
      for (const s of sq.soldiers) {
        if (s.maxHp < BIG) s.hp = s.maxHp = BIG;
        damage += BIG - s.hp;
        s.hp = BIG;
        s.frozen = 0;
      }
      for (const a of sim.aliens) if (!ids.has(a.id)) moved++;
      ids = new Set(sim.aliens.map((a) => a.id));
      if (i < ticks / 3) continue; // régime établi : on mesure les deux derniers tiers
      for (const a of sim.aliens) {
        if (!a.alive) continue;
        samples++;
        const ad = Math.hypot(a.x - cx, a.y - cy);
        if (ad < R * 0.5) inner++;
        const sd = Math.hypot(a.x - sq.center.x, a.y - sq.center.y);
        dist += sd;
        if (sd < 250) near++;
        if (a.flank !== 0) flankers++;
      }
    }
    return { inner: inner / samples, dist: dist / samples, near: near / samples, dps: damage / (SECONDS * (2 / 3)), moved: moved / SECONDS * 60, flank: flankers / samples, alive: sim.aliens.length };
  };

  const measure = (label) => {
    const rs = [11, 12, 13].map(run);
    const avg = (k) => rs.reduce((s, r) => s + r[k], 0) / rs.length;
    console.log(
      `${label.padEnd(22)} au centre (< R/2) ${(avg('inner') * 100).toFixed(0).padStart(3)} %   à < 250 px de la squad ${(avg('near') * 100).toFixed(0).padStart(3)} %   ` +
        `distance moyenne ${avg('dist').toFixed(0).padStart(4)} px   dégâts subis ${avg('dps').toFixed(0).padStart(4)} PV/s   replacés ${avg('moved').toFixed(0).padStart(4)} /min   en contournement ${(avg('flank') * 100).toFixed(0).padStart(3)} %`,
    );
  };

  console.log(`Squad en rond (rayon ${R} px, ${SECONDS} s), ${HORDE.reduce((s, [, n]) => s + n, 0)} aliens immortels, 3 seeds :`);
  Object.assign(RELOCATE, { after: Infinity });
  measure('sans recyclage');
  Object.assign(RELOCATE, defaults);
  measure('recyclage');
  if (TRY) {
    Object.assign(RELOCATE, TRY);
    measure(JSON.stringify(TRY));
  }
} finally {
  await vite.close();
}
