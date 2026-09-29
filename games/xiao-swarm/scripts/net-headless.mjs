// Teste le réseau sans navigateur : un hôte et un client relié par un transport en mémoire
// (les mêmes HostSession / ClientSession que dans le jeu). Usage : node scripts/net-headless.mjs [secondes]
import { createServer } from 'vite';

const seconds = Number(process.argv[2] ?? 40);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const { HostSession } = await vite.ssrLoadModule('/src/net/HostSession.ts');
  const { ClientSession } = await vite.ssrLoadModule('/src/net/ClientSession.ts');
  const { LoopbackHub } = await vite.ssrLoadModule('/src/net/LoopbackTransport.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { takeSnapshot, encodeSnapshot, decodeSnapshot } = await vite.ssrLoadModule('/src/net/Protocol.ts');

  const hub = new LoopbackHub();
  const hostT = hub.createTransport();
  const code = await hostT.host();
  const host = new HostSession({ mode: MODES.versus, seed: 42, transport: hostT, roomCode: code });
  const hostEvents = [];
  const clientEvents = [];
  const tick = async (client) => {
    host.advance(1000 / 30, (e) => hostEvents.push(e));
    client?.advance(1000 / 30, (e) => clientEvents.push(e));
    hub.pump();
    await new Promise((r) => setImmediate(r));
  };

  // 1) L'hôte joue seul 5 s, puis un client rejoint EN COURS de partie.
  host.setLocalInput(1, 0);
  for (let i = 0; i < 150; i++) await tick();
  check(host.sim.squads.length === 1, 'hôte seul au départ');

  const clientT = hub.createTransport();
  const pending = ClientSession.connect(clientT, code);
  let client = null;
  pending.then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick();
  check(!!client, 'le client rejoint en cours de partie (welcome + 1er snapshot)');
  check(host.sim.squads.length === 2, 'l\'hôte a une 2e squad', host.sim.squads.map((s) => `${s.owner}:${s.size}`).join(' '));
  check(client.localPlayer === clientT.localId, 'le client connaît son id');
  check(client.sim.squadOf(client.localPlayer)?.alive === true, 'le client voit sa squad');

  // 2) Régime établi : comparaison hôte / client.
  client.setLocalInput(-1, 0);
  for (let i = 0; i < seconds * 30; i++) await tick(client);
  const hs = host.sim;
  const cs = client.sim;
  const sizes = (s) => s.squads.map((q) => `${q.owner}:${q.size}`).join(' ');
  check(sizes(hs) === sizes(cs), 'mêmes squads et tailles', `hôte [${sizes(hs)}] client [${sizes(cs)}]`);
  check(Math.abs(hs.aliens.length - cs.aliens.length) <= 3, 'même nombre d\'aliens (±3)', `${hs.aliens.length} vs ${cs.aliens.length}`);
  check(Math.abs(hs.time - cs.time) < 0.2, 'même horloge de jeu', `${hs.time.toFixed(2)} vs ${cs.time.toFixed(2)}`);
  let maxErr = 0;
  for (const q of hs.squads) {
    const m = cs.squadOf(q.owner);
    for (const s of q.soldiers) {
      const c = m?.soldiers.find((x) => x.id === s.id);
      if (c) maxErr = Math.max(maxErr, Math.hypot(c.x - s.x, c.y - s.y));
    }
  }
  check(maxErr < 60, 'positions des soldats proches (erreur max)', `${maxErr.toFixed(1)} px`);
  const kinds = {};
  for (const e of clientEvents) kinds[e.t] = (kinds[e.t] ?? 0) + 1;
  check((kinds.hit ?? 0) > 0 && (kinds.alienDied ?? 0) > 0, 'le client reçoit les événements', JSON.stringify(kinds));

  const snap = encodeSnapshot(takeSnapshot(hs));
  const back = decodeSnapshot(snap);
  check(back && back.aliens.length === hs.aliens.length, 'snapshot encode/décode', `${snap.byteLength} octets pour ${hs.aliens.length} aliens`);

  // 3) PvP : on colle la squad du client sur celle de l'hôte, les deux doivent se tirer dessus.
  const a = hs.squadOf(host.localPlayer);
  const b = hs.squadOf(client.localPlayer);
  host.setLocalInput(0, 0);
  client.setLocalInput(0, 0);
  for (const s of b.soldiers) {
    s.x = a.center.x + 90;
    s.y = a.center.y;
    s.invulnerable = 0;
  }
  b.anchor.x = a.center.x + 90;
  b.anchor.y = a.center.y;
  for (const s of a.soldiers) s.invulnerable = 0;
  const before = a.soldiers.reduce((n, s) => n + s.hp, 0) + b.soldiers.reduce((n, s) => n + s.hp, 0);
  for (let i = 0; i < 90; i++) await tick(client);
  const after = a.soldiers.reduce((n, s) => n + s.hp, 0) + b.soldiers.reduce((n, s) => n + s.hp, 0);
  check(after < before || a.kills + b.kills > 0, 'PvP : les deux squads se blessent', `PV ${before.toFixed(0)} → ${after.toFixed(0)}`);

  // 4) Mort : réapparition automatique (après ~2,5 s), à un autre endroit, avec une escouade de départ.
  const deathAt = { x: b.center.x, y: b.center.y };
  for (const s of b.soldiers) s.alive = false;
  for (let i = 0; i < 15; i++) await tick(client);
  check(!client.sim.squadOf(client.localPlayer).alive, 'le client voit sa squad anéantie');
  for (let i = 0; i < 90; i++) await tick(client);
  const revived = client.sim.squadOf(client.localPlayer);
  check(revived.alive && revived.size >= 4, 'réapparition automatique avec une escouade de départ', `${revived.size} soldats`);
  check(Math.hypot(revived.center.x - deathAt.x, revived.center.y - deathAt.y) > 150, 'réapparition ailleurs sur la carte', `à ${Math.round(Math.hypot(revived.center.x - deathAt.x, revived.center.y - deathAt.y))} px`);

  // 5) Départ du client.
  clientT.close();
  for (let i = 0; i < 5; i++) await tick();
  check(host.sim.squads.length === 1, 'départ du client : sa squad est retirée');
  for (let i = 0; i < 60; i++) await tick();
  check(host.sim.squads.length === 1 && host.sim.squadOf(host.localPlayer).alive, 'l\'hôte continue seul');
} finally {
  await vite.close();
}
console.log(failures === 0 ? '\nTout est OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
