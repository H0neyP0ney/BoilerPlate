// Teste la prédiction de la squad locale d'un client avec de la latence : hôte + client reliés par un transport en
// mémoire retardé (les mêmes HostSession / ClientSession que dans le jeu). Usage : node scripts/net-predict-headless.mjs [latence en ticks]
import { createServer } from 'vite';

const latency = Number(process.argv[2] ?? 4); // par sens : 4 ticks ≈ 133 ms, soit ≈ 270 ms d'aller-retour
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
  const tick = async (client) => {
    host.advance(1000 / 30, () => {});
    client?.advance(1000 / 30, () => {});
    host.sim.aliens.length = 0; // on teste le mouvement, pas la survie
    hub.pump();
    await new Promise((r) => setImmediate(r));
  };

  const clientT = hub.createTransport();
  let client = null;
  ClientSession.connect(clientT, code).then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick();
  check(!!client, 'le client rejoint');
  hub.latency = latency;

  const hs = host.sim;
  const me = client.localPlayer;
  const hostSquad = hs.squadOf(me);
  const mine = () => client.sim.squadOf(me);
  const centerX = () => mine().soldiers.reduce((n, s) => n + s.x, 0) / mine().soldiers.length;
  const dir = hostSquad.anchor.x < hs.map.width / 2 ? 1 : -1; // vers le centre de la carte

  // Anchor prédite à chaque tick client, indexée par numéro d'input : comparée à l'ancre de l'hôte quand il a pris cet input en compte.
  const predicted = new Map();
  const remote = () => host.remotes.get(me);
  const errors = [];
  const record = () => {
    const p = client.mirror.predictor;
    if (p.active) predicted.set(client.ticks, { x: p.anchor.x, y: p.anchor.y });
  };
  const compare = () => {
    const r = remote();
    const p = predicted.get(r.seq - 1); // l'hôte a appliqué jusqu'à r.seq - 1 à la fin de son dernier pas
    if (p) errors.push(Math.hypot(p.x - hostSquad.anchor.x, p.y - hostSquad.anchor.y));
  };

  // 1) Au repos : la prédiction est calée sur l'ancre de l'hôte.
  for (let i = 0; i < 90; i++) await tick(client);
  check(client.mirror.predictor.active, 'la prédiction est active chez le client');
  check(Math.hypot(client.mirror.predictor.anchor.x - hostSquad.anchor.x, client.mirror.predictor.anchor.y - hostSquad.anchor.y) < 1, 'au repos : ancre prédite = ancre de l\'hôte');

  // 2) Réactivité : le joystick agit tout de suite, sans attendre l'aller-retour.
  const x0 = centerX();
  client.setLocalInput(dir, 0);
  for (let i = 0; i < 3; i++) await tick(client);
  const moved = Math.abs(centerX() - x0);
  const hostMoved = Math.abs(hostSquad.center.x - x0);
  check(moved > 8, `réactivité : la squad locale a déjà bougé 3 ticks (100 ms) après l'input, malgré ${latency * 2} ticks d'aller-retour`, `${moved.toFixed(1)} px (l'hôte : ${hostMoved.toFixed(1)} px)`);

  // 3) Mouvement continu avec virages : erreur de prédiction face à l'hôte.
  const turns = [[dir, 0], [dir, 0.7], [0, 1], [-dir, 0.4], [0, -1], [dir, -0.6]];
  for (const [mx, my] of turns) {
    client.setLocalInput(mx, my);
    for (let i = 0; i < 24; i++) {
      await tick(client);
      record();
      compare();
    }
  }
  errors.sort((a, b) => a - b);
  const mean = errors.reduce((n, e) => n + e, 0) / errors.length;
  const p95 = errors[Math.floor(errors.length * 0.95)];
  check(errors.length > 100 && mean < 10, 'mouvement continu : ancre prédite ≈ ancre de l\'hôte (moyenne)', `${mean.toFixed(2)} px sur ${errors.length} mesures`);
  check(p95 < 30, 'mouvement continu : pas de gros écart (95e centile)', `${p95.toFixed(2)} px`);

  // 4) À l'arrêt : le client converge exactement vers l'hôte, sans dérive.
  client.setLocalInput(0, 0);
  for (let i = 0; i < 90; i++) await tick(client);
  let maxErr = 0;
  for (const s of hostSquad.soldiers) {
    const c = mine().soldiers.find((x) => x.id === s.id);
    if (c) maxErr = Math.max(maxErr, Math.hypot(c.x - s.x, c.y - s.y));
  }
  check(maxErr < 3, 'à l\'arrêt : les soldats du client sont à la position de l\'hôte', `${maxErr.toFixed(2)} px`);

  // 5) Réapparition (téléportation de l'ancre chez l'hôte) : le client suit sans resté de décalage.
  const to = { x: hs.map.width / 2, y: hs.map.height / 2 };
  const dx = to.x - hostSquad.anchor.x;
  const dy = to.y - hostSquad.anchor.y;
  hostSquad.anchor.x += dx;
  hostSquad.anchor.y += dy;
  for (const s of hostSquad.soldiers) {
    s.x += dx;
    s.y += dy;
    s.px = s.x;
    s.py = s.y;
  }
  for (let i = 0; i < 60; i++) await tick(client);
  const p = client.mirror.predictor;
  check(Math.hypot(p.anchor.x - hostSquad.anchor.x, p.anchor.y - hostSquad.anchor.y) < 1, 'téléportation chez l\'hôte : la prédiction se recale', `${Math.hypot(p.anchor.x - hostSquad.anchor.x, p.anchor.y - hostSquad.anchor.y).toFixed(2)} px`);

  // 6) Pause de choix d'upgrade : le monde est figé chez l'hôte, la prédiction ne doit pas faire avancer le joueur.
  const sq = hs.squadOf(me);
  sq.gainXp(sq.xpNeeded - sq.xp + 0.01);
  for (let i = 0; i < 20; i++) await tick(client);
  check(hs.choiceT > 0 && client.sim.choiceT > 0, 'choix d\'upgrade ouvert (monde en pause)');
  const ax = p.anchor.x;
  client.setLocalInput(dir, 0);
  for (let i = 0; i < 20; i++) await tick(client);
  check(Math.abs(p.anchor.x - ax) < 1, 'pause : l\'ancre prédite reste immobile comme celle de l\'hôte', `${Math.abs(p.anchor.x - ax).toFixed(2)} px`);

  // 7) Protocole : ancre, vitesse et ack passent par l'encodage binaire.
  const acks = new Map([[me, 1234]]);
  const back = decodeSnapshot(encodeSnapshot(takeSnapshot(hs, acks)));
  const bsq = back?.squads.find((q) => q.owner === me);
  check(!!bsq && bsq.ack === 1234 && Math.abs(bsq.anchorX - sq.anchor.x) < 0.01 && bsq.speed === Math.round(sq.moveSpeed), 'snapshot : ancre, vitesse et ack encodés / décodés', `ack ${bsq?.ack}, vitesse ${bsq?.speed}`);
} finally {
  await vite.close();
}
console.log(failures === 0 ? '\nTout est OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
