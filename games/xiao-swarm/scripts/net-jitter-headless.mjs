// Mesure les corrections de réconciliation d'un client invité avec gigue réseau (grosse squad, aliens présents, petits inputs dans tous les sens).
// Usage : node scripts/net-jitter-headless.mjs [latence en ticks] [soldats] [aliens|no] [gigue en ticks]   (ex. : 2 30 aliens 2)
// « correction d'ancre » = de combien chaque snapshot déplace l'ancre prédite : doit rester ≈ 0 même avec de la gigue.
import { createServer } from 'vite';
const latency = Number(process.argv[2] ?? 2);
const size = Number(process.argv[3] ?? 4);
const aliens = process.argv[4] === 'aliens';
const netJitter = Number(process.argv[5] ?? 0);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { HostSession } = await vite.ssrLoadModule('/src/net/HostSession.ts');
  const { ClientSession } = await vite.ssrLoadModule('/src/net/ClientSession.ts');
  const { LoopbackHub } = await vite.ssrLoadModule('/src/net/LoopbackTransport.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const hub = new LoopbackHub();
  const hostT = hub.createTransport();
  const code = await hostT.host();
  const host = new HostSession({ mode: MODES.survival, seed: 42, transport: hostT, roomCode: code });
  const tick = async (client) => {
    host.advance(1000 / 30, () => {});
    client?.advance(1000 / 30, () => {});
    if (!aliens) host.sim.aliens.length = 0;
    for (const sq of host.sim.squads) for (const s of sq.soldiers) { s.hp = s.maxHp; }
    if (netJitter) hub.latency = Math.max(0, latency + Math.round((Math.random() * 2 - 1) * netJitter));
    hub.pump();
    await new Promise((r) => setImmediate(r));
  };
  const clientT = hub.createTransport();
  let client = null;
  ClientSession.connect(clientT, code).then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick();
  hub.latency = latency;
  const me = client.localPlayer;
  const hsq = host.sim.squadOf(me);
  while (hsq.soldiers.length < size) hsq.recruit('trooper', { x: hsq.center.x, y: hsq.center.y });
  for (let i = 0; i < 60; i++) await tick(client);
  // sonde sur reconcile
  const p = client.mirror.predictor;
  const corr = [];
  const orig = p.reconcile.bind(p);
  p.reconcile = (arena, hx, hy, speed, ack, dt, alive, frozen) => {
    const bx = p.anchor.x, by = p.anchor.y;
    orig(arena, hx, hy, speed, ack, dt, alive, frozen);
    corr.push(Math.hypot(p.anchor.x - bx, p.anchor.y - by));
  };
  const mine = () => client.sim.squadOf(me);
  const prev = { x: mine().center.x, y: mine().center.y };
  let back = 0, steps = 0, reversal = 0, sumStep = 0;
  let lastDir = [0, 0];
  const jit = [];
  const hjit = [];
  const hprev = { x: hsq.center.x, y: hsq.center.y };
  let hprevStep = null;
  let opp = 0;
  let prevStep = null;
  // petits inputs dans tous les sens : 6 ticks par direction, directions aléatoires déterministes
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    client.setLocalInput(dx, dy);
    for (let i = 0; i < 6; i++) {
      await tick(client);
      const c = mine().center;
      const sx = c.x - prev.x, sy = c.y - prev.y;
      prev.x = c.x; prev.y = c.y;
      steps++;
      sumStep += Math.hypot(sx, sy);
      // à-coup = variation brusque de la vitesse du centre affiché d'un tick à l'autre
      if (prevStep) jit.push(Math.hypot(sx - prevStep.x, sy - prevStep.y));
      prevStep = { x: sx, y: sy };
      if (sx * dx + sy * dy < -0.5) opp++;
      const hc = hsq.center;
      const hx = hc.x - hprev.x, hy = hc.y - hprev.y;
      hprev.x = hc.x; hprev.y = hc.y;
      if (hprevStep) hjit.push(Math.hypot(hx - hprevStep.x, hy - hprevStep.y));
      hprevStep = { x: hx, y: hy };
    }
  }
  const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { mean: (a.reduce((n, e) => n + e, 0) / a.length).toFixed(2), p95: s[Math.floor(s.length * 0.95)].toFixed(2), max: s[s.length - 1].toFixed(2) }; };
  console.log(`latence ${latency}, soldats ${hsq.soldiers.length}, aliens ${host.sim.aliens.length}`);
  console.log('correction d\'ancre par snapshot (px)', JSON.stringify(stat(corr)), corr.length);
  console.log('à-coup du centre CLIENT (px/tick)', JSON.stringify(stat(jit)), 'ticks à contre-sens', opp, '/', steps);
  console.log('à-coup du centre HÔTE  (px/tick)', JSON.stringify(stat(hjit)));
} finally { await vite.close(); }
