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
  const host = new HostSession({ mode: MODES.coop, seed: 42, transport: hostT, roomCode: code });
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

  // 3) Coop : pas de tir ami (on colle les deux squads, on retire les aliens à chaque tick).
  const a = hs.squadOf(host.localPlayer);
  const b = hs.squadOf(client.localPlayer);
  check(hs.mode.id === 'coop' && hs.mode.pvp === false, 'mode coop, friendly fire désactivé');
  host.setLocalInput(0, 0);
  client.setLocalInput(0, 0);
  for (let i = 0; i < 150 && !(a.alive && b.alive); i++) await tick(client); // les vagues ont pu tuer une squad : pas de réapparition en coop
  if (!(a.alive && b.alive)) hs.restart();
  for (const s of b.soldiers) {
    s.x = a.center.x + 60;
    s.y = a.center.y;
    s.invulnerable = 0;
  }
  b.anchor.x = a.center.x + 60;
  b.anchor.y = a.center.y;
  for (const s of a.soldiers) s.invulnerable = 0;
  const hpSum = () => a.soldiers.reduce((n, x) => n + x.hp, 0) + b.soldiers.reduce((n, x) => n + x.hp, 0);
  const before = hpSum();
  for (let i = 0; i < 90; i++) {
    hs.aliens.length = 0;
    await tick(client);
  }
  check(hpSum() >= before - 0.001, 'coop : les squads ne se blessent pas entre elles', `PV ${before.toFixed(0)} → ${hpSum().toFixed(0)}`);

  if (!(a.alive && b.alive)) hs.restart(); // les deux squads doivent être en vie pour mesurer la difficulté à 2 joueurs
  // 3b) Difficulté : un boss n'apparaît qu'une fois, PV × nombre de squads vivantes.
  hs.aliens.length = 0;
  hs.waves.trigger(9, 1);
  const bosses = hs.aliens.filter((x) => x.def.id === 'rhino_boss');
  check(bosses.length === 1 && Math.round(bosses[0].maxHp) === 900 * 2, 'boss unique, PV ×2 avec 2 joueurs', `${bosses.length} boss, ${bosses[0]?.maxHp} PV`);
  hs.aliens.length = 0;
  const base = 4;
  hs.waves.trigger(1, 3); // « Petit groupe » (slime ×4 × 1,15) : chaque squad vivante reçoit la vague
  check(hs.aliens.length >= 2 * 4, 'vague normale envoyée à chaque squad (×2)', `${hs.aliens.length} aliens`);
  hs.aliens.length = 0;

  // 3c) XP en réseau : globes visibles chez le client, choix d'upgrade envoyé à l'hôte, sans pause.

  check(hs.xpEnabled && client.sim.xpEnabled, 'XP active chez l\'hôte et chez le client');
  hs.horde.spawnNear(a, 'slime', 3, 100);
  for (const x of [...hs.aliens]) hs.damage(x, 9999, a.owner);
  await tick(client);
  await tick(client);
  await tick(client);
  check(hs.xp.orbs.length > 0 && Math.abs(client.sim.xp.orbs.length - hs.xp.orbs.length) <= 1, 'globes d\'XP reflétés chez le client', `${hs.xp.orbs.length} vs ${client.sim.xp.orbs.length}`);
  b.gainXp(b.xpNeeded - b.xp + 0.01);
  for (let i = 0; i < 6; i++) await tick(client);
  const csq = client.sim.squadOf(client.localPlayer);
  check(!!b.offer && !!csq.offer && csq.offer.join() === b.offer.join(), 'les propositions d\'upgrade arrivent chez le client', csq.offer?.join('/'));
  const tickBefore = hs.tick;
  client.chooseUpgrade(1);
  for (let i = 0; i < 6; i++) await tick(client);
  check(Object.values(b.picked).reduce((n, v) => n + (v ?? 0), 0) >= 1, 'le choix du client est appliqué chez l\'hôte', JSON.stringify(b.picked));
  check(hs.tick > tickBefore, 'le jeu ne s\'arrête pas pendant le level up');

  // 4) Mort en coop : pas de réapparition, l'équipier continue ; quand les deux sont morts → fin, puis relance.
  const deathAt = { x: b.center.x, y: b.center.y };
  for (const x of b.soldiers) x.alive = false;
  for (let i = 0; i < 15; i++) await tick(client);
  check(!client.sim.squadOf(client.localPlayer).alive, 'le client voit sa squad anéantie');
  for (let i = 0; i < 120; i++) await tick(client);
  check(!b.alive && a.alive, 'pas de réapparition : le joueur mort reste spectateur pendant que l\'autre joue', `a ${a.size} soldats, b ${b.size}`);
  const timeAtEnd = hs.time;
  for (const x of a.soldiers) x.alive = false;
  clientEvents.length = 0;
  for (let i = 0; i < 10; i++) await tick(client);
  check(clientEvents.some((e) => e.t === 'gameEnd' && e.victory === false), 'fin de partie (défaite) annoncée aux deux joueurs');
  const frozen = hs.time;
  for (let i = 0; i < 30; i++) await tick(client);
  check(Math.abs(hs.time - frozen) < 0.05, 'le monde est figé pendant l\'écran de fin');
  for (let i = 0; i < 9 * 30; i++) await tick(client);
  check(clientEvents.some((e) => e.t === 'restart'), 'relance annoncée aux clients');
  check(a.alive && b.alive && hs.time < timeAtEnd, 'la partie est relancée : les deux squads de retour, horloge remise à zéro', `t=${hs.time.toFixed(1)} s`);
  check(client.sim.squadOf(client.localPlayer).alive, 'le client voit sa squad de retour');
  void deathAt;
  void base;

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
