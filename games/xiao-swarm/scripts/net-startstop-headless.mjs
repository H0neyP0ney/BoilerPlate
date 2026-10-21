// Profil de vitesse du centre de la squad au démarrage et à l'arrêt, côté invité (prédit) comparé à l'hôte jouant la même squad en local : les deux courbes doivent se ressembler.
// Usage : node scripts/net-startstop-headless.mjs [latence en ticks] [aliens] [gigue en ticks]
import { createServer } from 'vite';
const latency = Number(process.argv[2] ?? 3);
const withAliens = process.argv[3] === 'aliens';
const netJitter = Number(process.argv[4] ?? 0);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
(await vite.ssrLoadModule('/src/config.ts')).PLAYTIME_TEST.enabled = false; // la version test playtime (docs/TEST_PLAYTIME.md) ne doit pas fausser les tests : jeu complet
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
    if (!withAliens) host.sim.aliens.length = 0;
    for (const q of host.sim.squads) for (const so of q.soldiers) so.hp = so.maxHp;
    if (netJitter) hub.latency = Math.max(0, latency + Math.round((Math.random() * 2 - 1) * netJitter));
    hub.pump(); await new Promise((r) => setImmediate(r));
  };
  const clientT = hub.createTransport();
  let client = null;
  ClientSession.connect(clientT, code).then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick();
  hub.latency = latency;
  if (process.env.NOLIMIT) client.mirror.constructor.limitOf = () => Infinity; // essai sans la limite de prédiction avant pause
  const me = client.localPlayer;
  const gsq = host.sim.squadOf(me), hsq = host.sim.squadOf(host.localPlayer);
  const NS = Number(process.env.NS ?? 20);
  for (const sq of [gsq, hsq]) while (sq.soldiers.length < NS) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
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
  // course verticale : combien de fois le sens (signe de vx, seuil 15 px/s comme la vue) change-t-il par soldat ?
  {
    client.setLocalInput(0, 1); host.setLocalInput(0, 1);
    const flips = (soldiers) => { const st = new Map(); let f = 0, maxVx = 0; return { feed: () => { for (const x of soldiers()) { if (Math.abs(x.vx) > maxVx) maxVx = Math.abs(x.vx); if (Math.abs(x.vx) > 15) { const d = x.vx > 0 ? 1 : -1; if (st.has(x.id) && st.get(x.id) !== d) f++; st.set(x.id, d); } } }, get: () => `${f} changements de sens, |vx| max ${maxVx.toFixed(0)}` }; };
    const g = flips(() => mine().soldiers), h = flips(() => gsq.soldiers); // référence : la MÊME squad chez l hôte (la vraie simulation)
    let sd = 3; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 240; i++) {
      if (process.env.KICK && i % 12 === 0) for (const so of gsq.soldiers) if (rnd() < 0.15) { const a = rnd() * 6.28; so.kx = Math.cos(a) * 260; so.ky = Math.sin(a) * 260; } // poussées d'aliens simulées
      await tick(client); if (i > 20) { g.feed(); h.feed(); }
    }
    console.log('COURSE VERTICALE — invité :', g.get(), '| hôte :', h.get());
    client.setLocalInput(0, 0); host.setLocalInput(0, 0);
    for (let i = 0; i < 60; i++) await tick(client);
  }
  // pause de choix d'upgrade en pleine course : de combien la squad affichée revient-elle en arrière quand l'hôte se fige ?
  {
    const dirX = gsq.anchor.x < host.sim.map.width / 2 ? 1 : -1;
    client.setLocalInput(dirX, 0);
    for (let i = 0; i < 40; i++) await tick(client);
    gsq.gainXp(gsq.xpNeeded - gsq.xp + 0.01); // niveau gagné : la pause s'ouvre dans LEVEL_UP_DELAY s
    let best = dirX * mine().center.x, back = 0, pausedAt = -1;
    for (let i = 0; i < 90; i++) {
      await tick(client);
      if (pausedAt < 0 && host.sim.choiceT > 0) pausedAt = i;
      const x = dirX * mine().center.x;
      best = Math.max(best, x);
      back = Math.max(back, best - x);
    }
    console.log(`PAUSE DE CHOIX — recul maximal de la squad affichée : ${back.toFixed(1)} px (pause ouverte chez l'hôte au tick ${pausedAt})`);
    client.setLocalInput(0, 0);
    for (let i = 0; i < 60; i++) await tick(client);
    // on referme le choix pour la suite
    host.sim.chooseUpgrade(me, 0);
    for (let i = 0; i < 40; i++) await tick(client);
  }
  // soldat isolé (grab / stun / glaçon) qui revient vers la squad : pas de téléportation ni de va-et-vient à l'écran
  for (const [mx, label] of [[0, "squad à l'arrêt"], [1, 'squad en course']]) {
    client.setLocalInput(mx, 0);
    for (let i = 0; i < 40; i++) await tick(client);
    const victim = gsq.soldiers[3];
    victim.stun = 1.0; victim.x += 130; victim.y -= 90; // éjecté puis étourdi 1 s, ensuite il rejoint la squad en marchant
    let prevPos = null, maxStep = 0, reversals = 0, prevD = null, ticks = 0, arrHost = -1, arrGuest = -1, rest0 = null;
    for (let i = 0; i < 120; i++) {
      await tick(client);
      const c = mine().soldiers.find((q) => q.id === victim.id);
      if (!c) continue;
      if (prevPos && i > 15) { const st = Math.hypot(c.x - prevPos.x, c.y - prevPos.y); maxStep = Math.max(maxStep, st); if (process.env.TRACE) console.log(i, st.toFixed(1), 'stun', c.stun, 'hostStun', victim.stun.toFixed(2), 'host v', Math.hypot(victim.vx, victim.vy).toFixed(0)); }
      // distance au slot de l'hôte (la vérité) : doit décroître sans remontées marquées une fois le retour commencé
      const d = Math.hypot(c.x - victim.x, c.y - victim.y);
      if (i > 45 && prevD !== null && d > prevD + 6) reversals++;
      prevD = d; prevPos = { x: c.x, y: c.y }; ticks++;
      if (i > 35) { const hv = Math.hypot(victim.vx, victim.vy); if (arrHost < 0 && hv < 150) arrHost = i; if (arrHost >= 0 && arrGuest < 0 && d < 6) arrGuest = i; }
    }
    console.log(`  arrivée : hôte au tick ${arrHost}, invité au tick ${arrGuest} (écart ${arrGuest - arrHost} ticks)`);
    console.log(`SOLDAT ISOLÉ (${label}) — pas max ${maxStep.toFixed(1)} px/tick (plafond 10,2 en marche), ${reversals} remontées d'écart avec l'hôte`);
  }
  client.setLocalInput(0, 0);
  for (let i = 0; i < 60; i++) await tick(client);
  await run(1, 0, 24, 'DÉMARRAGE');
  await run(1, 0, 30, 'régime');
  await run(0, 0, 24, 'ARRÊT');
} finally { await vite.close(); }
