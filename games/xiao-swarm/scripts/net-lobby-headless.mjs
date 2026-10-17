// Teste la salle d'attente et la visibilité des salles sans navigateur (transport en mémoire).
// Usage : node scripts/net-lobby-headless.mjs
import { createServer } from 'vite';

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

  const hub = new LoopbackHub();
  const tick = async (host, client) => {
    host.advance(1000 / 30, () => {});
    client?.advance(1000 / 30, () => {});
    hub.pump();
    await new Promise((r) => setImmediate(r));
  };

  // Salles : publique listée, privée invisible, pleine retirée de la liste.
  const pubT = hub.createTransport();
  const pubCode = await pubT.host({ public: true });
  const privT = hub.createTransport();
  const privCode = await privT.host({ public: false });
  const listed = await hub.createTransport().listRooms();
  check(listed.some((r) => r.code === pubCode), 'la salle publique est listée');
  check(!listed.some((r) => r.code === privCode), 'la salle privée n\'est pas listée');

  // Salle d'attente : le monde reste figé jusqu'à Start.
  const hostT = hub.createTransport();
  const code = await hostT.host({ public: false });
  const host = new HostSession({ mode: MODES.survival, seed: 7, transport: hostT, roomCode: code, lobby: true, public: false });
  // visibilité changée dans la salle d'attente : privée → publique → privée
  await host.setPublic(true);
  check(host.lobby.public === true && (await hub.createTransport().listRooms()).some((r) => r.code === code), "salle d'attente : passée en publique, elle est listée");
  await host.setPublic(false);
  check(host.lobby.public === false && !(await hub.createTransport().listRooms()).some((r) => r.code === code), "salle d'attente : repassée en privée, elle n'est plus listée");
  host.setLocalInput(1, 0);
  for (let i = 0; i < 90; i++) await tick(host);
  check(host.sim.tick === 0, 'monde figé dans la salle d\'attente', `tick ${host.sim.tick}`);
  check(host.lobby?.started === false && host.lobby.humans === 1, 'salle d\'attente : 1 joueur');

  const clientT = hub.createTransport();
  let client = null;
  ClientSession.connect(clientT, code).then((c) => (client = c));
  for (let i = 0; i < 30 && !client; i++) await tick(host);
  check(!!client, 'le client rejoint la salle d\'attente');
  for (let i = 0; i < 6; i++) await tick(host, client);
  check(client?.lobby?.started === false && client.lobby.humans === 2, 'le client voit 2 joueurs', JSON.stringify(client?.lobby));

  host.addBot();
  for (let i = 0; i < 6; i++) await tick(host, client);
  check(client.lobby.bots === 1 && host.lobby.bots === 1, 'un bot ajouté est annoncé au client');

  client.startGame();
  for (let i = 0; i < 6; i++) await tick(host, client);
  check(host.lobby.started === false, 'un client ne peut pas lancer la partie');

  host.startGame();
  for (let i = 0; i < 60; i++) await tick(host, client);
  check(host.lobby.started && client.lobby.started, 'Start : la partie est lancée chez les deux');
  check(host.sim.tick > 0, 'le monde tourne après Start', `tick ${host.sim.tick}`);

  // Fin de partie : retour à la salle d'attente pour tous, monde figé, puis Start relance.
  host.endTicks = 3; // comme après un `gameEnd` (écran de fin qui s'achève)
  for (let i = 0; i < 12; i++) await tick(host, client);
  check(host.lobby.started === false && client.lobby.started === false, 'fin de partie : retour à la salle d\'attente chez les deux');
  const frozenAt = host.sim.tick;
  for (let i = 0; i < 30; i++) await tick(host, client);
  check(host.sim.tick === frozenAt, 'le monde reste figé dans la salle d\'attente');
  host.startGame();
  for (let i = 0; i < 30; i++) await tick(host, client);
  check(client.lobby.started && host.sim.tick > frozenAt, 'Start relance une nouvelle partie');
} finally {
  await vite.close();
}

console.log(failures === 0 ? '\nTout est OK' : `\n${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
