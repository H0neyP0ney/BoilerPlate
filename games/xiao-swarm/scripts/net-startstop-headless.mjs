// Profil de vitesse du centre de la squad au démarrage et à l'arrêt, côté invité (prédit) comparé à l'hôte jouant la même squad en local : les deux courbes doivent se ressembler.
// Usage : node scripts/net-startstop-headless.mjs [latence en ticks]
import { createServer } from 'vite';
const latency = Number(process.argv[2] ?? 3);
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
    host.advance(1000 / 30, () => {}); client?.advance(1000 / 30, () => {});
    host.sim.aliens.length = 0;
    hub.pump(); await new Promise((r) => setImmediate(r));
  };
  const clientT = hub.createTransport();
  let client = null;
  ClientSession.connect(clientT, code).then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick();
  hub.latency = latency;
  const me = client.localPlayer;
  const gsq = host.sim.squadOf(me), hsq = host.sim.squadOf(host.localPlayer);
  for (const sq of [gsq, hsq]) while (sq.soldiers.length < 20) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
  for (let i = 0; i < 90; i++) await tick(client);
  const mine = () => client.sim.squadOf(me);
  const run = async (mx, my, n, label) => {
    client.setLocalInput(mx, my); host.setLocalInput(mx, my);
    let pc = { ...mine().center }, ph = { ...hsq.center };
    const g = [], h = [];
    for (let i = 0; i < n; i++) {
      await tick(client);
      const c = mine().center, hc = hsq.center;
      g.push(Math.hypot(c.x - pc.x, c.y - pc.y)); h.push(Math.hypot(hc.x - ph.x, hc.y - ph.y));
      pc = { ...c }; ph = { ...hc };
    }
    console.log(label, 'vitesse centre px/tick');
    console.log(' invité', g.map((v) => v.toFixed(1)).join(' '));
    console.log(' hôte  ', h.map((v) => v.toFixed(1)).join(' '));
  };
  await run(1, 0, 24, 'DÉMARRAGE');
  await run(1, 0, 30, 'régime');
  await run(0, 0, 24, 'ARRÊT');
} finally { await vite.close(); }
