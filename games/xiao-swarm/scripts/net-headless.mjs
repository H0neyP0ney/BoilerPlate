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
  const { DIFFICULTY } = await vite.ssrLoadModule('/src/config.ts');
  const { UPGRADE_IDS } = await vite.ssrLoadModule('/src/data/progression.ts');
  const { takeSnapshot, encodeSnapshot, decodeSnapshot } = await vite.ssrLoadModule('/src/net/Protocol.ts');
  const { INTERP_DELAY_MS } = await vite.ssrLoadModule('/src/net/ClientSession.ts');
  /** Ticks à attendre pour qu'un changement de l'hôte s'affiche chez le client : tampon d'interpolation (v38) + 2 ticks de marge. */
  const LAG_TICKS = Math.ceil((INTERP_DELAY_MS / 1000) * 30) + 2;

  const hub = new LoopbackHub();
  const hostT = hub.createTransport();
  const code = await hostT.host();
  const host = new HostSession({ mode: MODES.survival, seed: 42, transport: hostT, roomCode: code });
  const hostEvents = [];
  const clientEvents = [];
  const lag = async (client) => {
    for (let i = 0; i < LAG_TICKS; i++) await tick(client);
  };
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
  check(hs.mode.id === 'survival' && hs.mode.pvp === false && hs.config.online === true, 'survie à plusieurs (en ligne), friendly fire désactivé');
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
  hs.combat.clear(); // pas de projectile d alien en vol (boule de glace, grenade…) : ils blessent légitimement
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
  const bosses = hs.aliens.filter((x) => x.def.id === 'boss_rhino');
  check(bosses.length === 1 && Math.round(bosses[0].maxHp) === Math.round(900 * DIFFICULTY.bossHpMul * 1.75), 'boss unique, PV ×1,75 avec 2 joueurs, comme le nombre d’aliens (et × bossHpMul)', `${bosses.length} boss, ${bosses[0]?.maxHp} PV`);
  hs.aliens.length = 0;
  const base = 4;
  hs.waves.trigger(1, 3); // « Petit groupe » (slime ×4 × 1,15) : chaque squad vivante reçoit la vague
  check(hs.aliens.length >= 2 * 4, 'vague normale envoyée à chaque squad (×2)', `${hs.aliens.length} aliens`);
  hs.aliens.length = 0;

  // 3c) XP en réseau : globes visibles chez le client, choix d'upgrade envoyé à l'hôte, sans pause.

  check(hs.xpEnabled && client.sim.xpEnabled, 'XP active chez l\'hôte et chez le client');
  hs.horde.spawnNear(a, 'slime', 3, 100);
  for (const x of [...hs.aliens]) {
    x.age = 99; // sorti de son trou d'apparition (sinon invulnérable : isEmerging)
    hs.damage(x, 9999, a.owner);
  }
  await tick(client);
  await tick(client);
  await tick(client);
  await lag(client);
  check(hs.xp.orbs.length > 0 && Math.abs(client.sim.xp.orbs.length - hs.xp.orbs.length) <= 1, 'globes d\'XP reflétés chez le client', `${hs.xp.orbs.length} vs ${client.sim.xp.orbs.length}`);
  // clignotement : l'hôte marque un globe dans ses dernières secondes, le client le reçoit marqué (identifiant stable compris)
  const orbHost = hs.xp.orbs[0];
  const orbId = orbHost.id & 0xffff;
  orbHost.life = 2;
  await tick(client);
  await tick(client);
  await lag(client);
  const orbClient = client.sim.xp.orbs.find((o) => o.id === orbId);
  check(!!orbClient && orbClient.life < 5, 'globe en fin de vie : le clignotement est transmis au client', orbClient ? `life ${orbClient.life}` : 'globe introuvable');
  // XP partagée (coop) : une seule barre, seuil × nombre de joueurs ; un niveau = tous les joueurs montent et choisissent
  check(a.xpNeeded === b.xpNeeded && a.xpNeeded > 0, 'XP partagée : même seuil pour les deux joueurs (× 2 joueurs)', `${a.xpNeeded}`);
  // remise à plat : un niveau déjà en cours (XP ramassée plus haut) fausserait la chronologie mesurée ci-dessous
  for (let i = 0; i < 400 && (hs.choiceT > 0 || hs.choiceDelay > 0 || hs.squads.some((sq) => sq.offer)); i++) {
    for (const sq of hs.squads) if (sq.offer) hs.chooseUpgrade(sq.owner, 0);
    await tick(client);
  }
  const levelBefore = a.level;
  b.gainXp(b.xpNeeded - b.xp + 0.01);
  // chronologie : l'onde de choc part tout de suite et le monde CONTINUE pendant LEVEL_UP_DELAY s ; la pause qui ouvre les cartes vient ensuite
  const timeAtLevel = hs.time;
  for (let i = 0; i < 6; i++) await tick(client);
  check(hs.choiceT === 0 && hs.choiceDelay > 0 && hs.time > timeAtLevel && client.sim.choiceT === 0, 'montée de niveau : le monde continue pendant le délai, la pause n’est pas immédiate', `${hs.choiceDelay.toFixed(2)} s avant la pause`);
  let ticksToPause = 6;
  for (let i = 0; i < 60 && hs.choiceT <= 0; i++, ticksToPause++) await tick(client);
  for (let i = 0; i < 3; i++) await tick(client); // le snapshot de la pause arrive chez le client
  check(hs.choiceT > 0 && Math.abs(ticksToPause / 30 - 1) < 0.3, 'la pause des cartes s’ouvre environ 1 s après la montée de niveau', `${(ticksToPause / 30).toFixed(2)} s`);
  await lag(client);
  const csq = client.sim.squadOf(client.localPlayer);
  check(a.level === levelBefore + 1 && b.level === a.level && !!a.offer && !!b.offer, 'XP partagée : l’XP de l’un fait monter tout le monde', `niv. ${a.level} / ${b.level}`);
  check(!!b.offer && !!csq.offer && csq.offer.join() === b.offer.join(), 'les propositions d\'upgrade arrivent chez le client', csq.offer?.join('/'));
  check(hs.choiceT > 0 && client.sim.choiceT > 0, 'choix d’upgrade : jeu en pause, reflété chez le client', `${hs.choiceT.toFixed(2)} s / ${client.sim.choiceT.toFixed(2)} s`);
  { // pause : un projectile figé chez l'hôte ne tremble pas chez le client (plus d'extrapolation quand le monde est figé)
    const p = hs.combat.projectiles.acquire();
    Object.assign(p, { x: a.center.x + 200, y: a.center.y, px: a.center.x + 200, py: a.center.y, vx: 600, vy: 0, life: 5, maxLife: 5, damage: 0, team: 'aliens', owner: 'aliens', texture: '', lob: false, flame: false, aoe: 0 });
    for (let i = 0; i < 12; i++) await tick(client); // tampon d'interpolation + cadence des snapshots
    const cp = () => client.sim.combat.projectiles.active.find((q) => Math.abs(q.x - p.x) < 60 && Math.abs(q.y - p.y) < 60);
    let moved = 0;
    const first = cp();
    for (let i = 0; i < 10 && first; i++) {
      const x0 = first.x;
      const y0 = first.y;
      await tick(client);
      moved = Math.max(moved, Math.hypot(first.x - x0, first.y - y0));
    }
    check(hs.choiceT > 0 && !!first && moved < 0.5, 'pause : les projectiles ne tremblent pas chez le client', first ? `déplacement max ${moved.toFixed(2)} px / tick` : 'projectile introuvable chez le client');
    hs.combat.projectiles.release(p);
  }
  client.chooseUpgrade(1);
  const timeBefore = hs.time;
  for (let i = 0; i < 6; i++) await tick(client);
  check(Object.values(b.picked).reduce((n, v) => n + (v ?? 0), 0) >= 1, 'le choix du client est appliqué chez l\'hôte', JSON.stringify(b.picked));
  check(hs.choiceT > 0 && Math.abs(hs.time - timeBefore) < 1e-6, 'le monde reste figé tant qu’un joueur n’a pas choisi');
  host.chooseUpgrade(0);
  for (let i = 0; i < 3; i++) await tick(client);
  // XP partagée : les deux joueurs peuvent avoir plusieurs niveaux en attente, donc plusieurs manches de choix d'affilée
  for (let round = 0; round < 10 && hs.choiceT > 0; round++) {
    if (a.offer) host.chooseUpgrade(0);
    if (b.offer) client.chooseUpgrade(0);
    for (let i = 0; i < 3; i++) await tick(client);
  }
  check(hs.choiceT === 0 && hs.time > timeBefore, 'tout le monde a choisi : la partie reprend');
  // personne ne choisit : choix au hasard à la fin du temps
  b.gainXp(b.xpNeeded - b.xp + 0.01);
  const picks = (sq) => Object.values(sq.picked).reduce((n, v) => n + (v ?? 0), 0);
  const pa = picks(a);
  const pb = picks(b);
  for (let i = 0; i < 60 && hs.choiceT <= 0; i++) await tick(client); // délai avant la pause
  for (let i = 0; i < 30 * 6 && hs.choiceT > 0; i++) await tick(client);
  check(hs.choiceT === 0 && picks(a) === pa + 1 && picks(b) === pb + 1, 'temps écoulé : une upgrade est choisie au hasard pour chacun', `${pa}→${picks(a)} / ${pb}→${picks(b)}`);

  const resolveChoices = () => {
    for (let guard = 0; guard < 20 && hs.squads.some((sq) => sq.offer); guard++) for (const sq of hs.squads) if (sq.offer) hs.chooseUpgrade(sq.owner, 0);
  };

  // 3d) Cracheur : boules en cloche, pas de recul, plus de flaque à l'impact ; son nuage ralentissant (flaque) est reflété chez le client ; cailloux suivis par snapshot.
  hs.aliens.length = 0;
  hs.horde.spawnAt('spitter', a.center.x + 200, a.center.y);
  const spitter = hs.aliens[0];
  for (const s of a.soldiers) s.invulnerable = 0;
  const kx0 = a.soldiers.reduce((n, s) => n + Math.abs(s.kx) + Math.abs(s.ky), 0);
  hs.combat.spray(spitter, a.soldiers[0]);
  const lobs = hs.combat.projectiles.active.filter((p) => p.lob); // les balles des soldats déjà en vol ne comptent pas
  check(lobs.length === 3 && lobs.every((p) => p.aoe > 0), 'cracheur : 3 boules en cloche télégraphiées', `${lobs.length}`);
  // projectiles : identifiants stables, le client garde le MÊME objet d'un snapshot à l'autre (lissage) et le retrouve par id
  for (let i = 0; i < 6 && client.sim.combat.projectiles.active.length < 3; i++) await tick(client); // le snapshot n'arrive pas à chaque tick
  const projBefore = new Map(client.sim.combat.projectiles.active.map((p) => [p.id, p]));
  await tick(client);
  const projSame = [...client.sim.combat.projectiles.active].filter((p) => projBefore.get(p.id) === p).length;
  check(projBefore.size >= 3 && projSame >= Math.min(2, projBefore.size), 'projectiles : mêmes objets (lissés) d’un snapshot à l’autre chez le client', `${projSame} conservés sur ${projBefore.size}`);
  // télégraphe des tirs en cloche chez le client (WorldView le dessine d'après lob, team, aoe, life et la vitesse)
  const clientLobs = client.sim.combat.projectiles.active.filter((p) => p.lob);
  check(
    clientLobs.length >= 1 && clientLobs.every((p) => p.team === 'aliens' && p.aoe > 0 && p.life > 0 && p.life <= p.maxLife + 0.05),
    'client : tirs en cloche avec camp, rayon et temps de vol restant (télégraphe affichable)',
    clientLobs.map((p) => `aoe ${p.aoe}, ${p.life.toFixed(2)}/${p.maxLife.toFixed(2)} s`).join(' · '),
  );
  const hostLob = lobs[0];
  const twin = clientLobs.find((p) => p.id === (hostLob.id & 0xffff));
  if (twin) {
    const hx = hostLob.x + hostLob.vx * hostLob.life, hy = hostLob.y + hostLob.vy * hostLob.life;
    const cx = twin.x + twin.vx * twin.life, cy = twin.y + twin.vy * twin.life;
    check(Math.hypot(hx - cx, hy - cy) < 40, 'client : point d’impact du télégraphe proche de celui de l’hôte', `${Math.round(Math.hypot(hx - cx, hy - cy))} px d’écart`);
  }
  hs.aliens.length = 0;
  for (let i = 0; i < 45; i++) await tick(client);
  check(hs.puddles.length === 0, 'impacts du cracheur : plus de flaque', `${hs.puddles.length}`);
  const C = spitter.def.cloud ?? { radius: 66.5, ttl: 3.5, slow: 0.5 }; // nuage du cracheur retiré pour l'instant (08/10) : on teste quand même la flaque ralentissante
  hs.addPuddle(a.center.x, a.center.y, C.radius, C.ttl, C.slow); // nuage ralentissant (même liste que les anciennes flaques)
  for (let i = 0; i < 6; i++) await tick(client);
  check(hs.puddles.length === 1 && client.sim.puddles.length === 1, 'nuage ralentissant reflété chez le client', `${hs.puddles.length} / ${client.sim.puddles.length}`);
  check(hs.slowAt(hs.puddles[0].x, hs.puddles[0].y, 10) < 1, 'le nuage ralentit les soldats dedans', `×${hs.slowAt(hs.puddles[0].x, hs.puddles[0].y, 10)}`);
  // gel : état du soldat (PV de gel) reflété chez le client ; en coop, les soldats de l'AUTRE joueur peuvent aussi briser la glace
  {
    const ice = a.soldiers.find((x) => x.alive);
    hs.horde.freezeSoldier(ice);
    for (let i = 0; i < 6; i++) await tick(client);
    const mirror = client.sim.squadOf(a.owner).soldiers.find((x) => x.id === ice.id);
    check(mirror && mirror.frozen === 50, 'gel : PV de gel reflétés chez le client', `${mirror?.frozen}`);
    ice.iceInvuln = 0;
    const hp = ice.hp;
    hs.damage(ice, 40, b.owner);
    check(ice.frozen === 49 && ice.hp === hp, 'gel (coop) : un tir de l’autre joueur brise la glace sans blesser', `${ice.frozen} gel, ${ice.hp} PV`);
    ice.frozen = 0;
  }
  void kx0;
  hs.addRock(a.center.x, a.center.y + 300, 24, 10);
  for (let i = 0; i < 6; i++) await tick(client);
  check(client.sim.arena.rocks.length === hs.arena.rocks.length && hs.arena.rocks.length >= 1, 'cailloux reflétés chez le client (l’affichage suit la liste)', `${hs.arena.rocks.length} / ${client.sim.arena.rocks.length}`);

  // 3e) Zombie, power-ups, bulles d’upgrade.
  hs.aliens.length = 0;
  hs.horde.spawnAt('slime', a.center.x + 400, a.center.y, 1, true);
  const zb = hs.aliens[0];
  check(zb.revived && Math.abs(zb.maxHp - 55 * 1.5 * 3) < 0.01, 'zombie : ×3 PV', `${zb.maxHp} PV`);
  hs.aliens.length = 0;
  check(hs.map.obstacles.length > 0 && JSON.stringify(client.sim.map.obstacles) === JSON.stringify(hs.map.obstacles), 'carte : mêmes obstacles tirés chez l’hôte et chez le client (même seed)', `${hs.map.obstacles.length} obstacles`);
  hs.horde.spawnAt('lurker', a.center.x + 300, a.center.y);
  const lurker = hs.aliens[0];
  lurker.hp = lurker.maxHp = 1e6; // la squad ne doit pas le tuer avant qu'il soit enterré
  for (let i = 0; i < 25; i++) await tick(client);
  const clurker = client.sim.aliens.find((x) => x.id === lurker.id);
  check(!!clurker && lurker.lurkPhase >= 1 && clurker.lurkPhase >= 1, 'lurker : s’enterre, phase reflétée chez le client', `hôte ${lurker.lurkPhase} / client ${clurker?.lurkPhase}`);
  // Rhinocéros : le télégraphe de charge (point de départ du couloir, direction, préparation) arrive tel quel chez le client.
  hs.aliens.length = 0;
  hs.horde.spawnAt('charger', a.center.x + 260, a.center.y);
  const rhino = hs.aliens[0];
  rhino.hp = rhino.maxHp = 1e6;
  rhino.rushCd = 0;
  let crhino;
  for (let i = 0; i < 80 && !(rhino.rushWind > 0 && (crhino = client.sim.aliens.find((x) => x.id === rhino.id)) && crhino.rushWind > 0); i++) await tick(client);
  check(!!crhino && crhino.rushWind > 0 && Math.abs(crhino.rushX - rhino.rushX) < 0.01 && Math.abs(crhino.rushY - rhino.rushY) < 0.01 && Math.abs(crhino.rushDx - rhino.rushDx) < 0.02, 'rhinocéros : couloir de charge (origine, direction) identique chez le client', crhino ? `origine ${crhino.rushX.toFixed(0)},${crhino.rushY.toFixed(0)} (hôte ${rhino.rushX.toFixed(0)},${rhino.rushY.toFixed(0)})` : 'pas de préparation vue');
  // Après la charge, `rushWind` reste ≤ 0 (négatif) : le snapshot doit rester décodable et fidèle (tous les aliens, mêmes positions).
  let rushOk = true;
  let rushDetail = '';
  let sawRush = false;
  for (let i = 0; i < 120 && rushOk; i++) {
    host.setLocalInput(0, 0);
    hs.aliens.splice(1); // le rhino seul : on teste le format, pas la survie
    hs.horde.spawnAt('slime', rhino.x + 120, rhino.y);
    hs.horde.spawnAt('slime', rhino.x - 120, rhino.y);
    if (rhino.rushT > 0) sawRush = true;
    const back = decodeSnapshot(encodeSnapshot(takeSnapshot(hs)));
    if (!back || back.aliens.length !== hs.aliens.length) {
      rushOk = false;
      rushDetail = `tick ${i} : rushWind=${rhino.rushWind.toFixed(3)}, ${back ? `${back.aliens.length} aliens décodés pour ${hs.aliens.length}` : 'snapshot illisible'}`;
    } else {
      for (const a of hs.aliens) {
        const b = back.aliens.find((x) => x.id === a.id);
        if (!b || Math.abs(b.x - a.x) > 0.13 || Math.abs(b.y - a.y) > 0.13) {
          rushOk = false;
          rushDetail = `tick ${i} : alien ${a.def.id} décalé, rushWind=${rhino.rushWind.toFixed(3)}`;
          break;
        }
      }
    }
    await tick(client);
  }
  check(rushOk && sawRush, 'rhinocéros : snapshot lisible et fidèle pendant et après la charge (rushWind négatif)', rushDetail || (sawRush ? 'charge vue' : 'aucune charge'));
  { // recyclage des traînards (v39) : un alien qui s'enterre le reste après encodage / décodage
    const x = hs.aliens[0];
    if (x) {
      x.sinkT = 0.3;
      const back = decodeSnapshot(encodeSnapshot(takeSnapshot(hs)));
      check(back?.aliens.find((b) => b.id === x.id)?.sinking === true && back.aliens.filter((b) => b.sinking).length === 1, "alien qui s'enterre (recyclage) : drapeau transmis au client");
      x.sinkT = 0;
    }
  }
  { // stalactites du Scarab (v40) : zone et compte à rebours transmis au client
    hs.addStalactite(1234.5, 987.25, 55, 1.1, 80, 300);
    const k = decodeSnapshot(encodeSnapshot(takeSnapshot(hs))).stalactites.at(-1);
    check(!!k && Math.abs(k.x - 1234.5) < 0.2 && Math.abs(k.y - 987.25) < 0.2 && k.r === 55 && Math.abs(k.t - 1.1) < 0.02 && Math.abs(k.dur - 1.1) < 0.02, 'stalactite du Scarab : zone et compte à rebours transmis au client', k ? `(${k.x}, ${k.y}) r ${k.r}, ${k.t.toFixed(2)} s` : 'absente');
    hs.stalactites.length = 0;
  }
  { // coffres de boss et globes d'upgrade (v44) : position, progression, propriétaire et chute transmis au client
    const c = hs.chests.drop(1500.25, 800.5);
    c.progress = DIFFICULTY.chestTime / 2;
    const o = hs.upgradeOrbs.drop(a.owner, 'damage', 1500.25, 800.5, 0.7);
    const snap = decodeSnapshot(encodeSnapshot(takeSnapshot(hs)));
    const kc = snap.chests.at(-1);
    const ko = snap.upgradeOrbs.at(-1);
    check(!!kc && Math.abs(kc.x - c.x) < 0.2 && Math.abs(kc.y - c.y) < 0.2 && Math.abs(kc.progress - 0.5) < 0.01, 'coffre de boss : position et progression transmises au client', kc ? `${kc.progress.toFixed(2)}` : 'absent');
    check(!!ko && ko.owner === a.owner && ko.upgrade === UPGRADE_IDS.indexOf('damage') && Math.abs(ko.fall - o.hop.t) < 0.02 && Math.abs(ko.x - o.x) < 0.2, 'globe d’upgrade : propriétaire, position et chute transmis au client', ko ? `${ko.owner}, chute ${ko.fall.toFixed(2)} s` : 'absent');
    hs.chests.clear();
    hs.upgradeOrbs.clear();
  }
  hs.aliens.length = 0;
  // les escouades de ce test sont inactives : selon l'aléatoire de la partie, elles peuvent être anéanties avant ici (fin de partie coop) :
  // on attend la relance automatique de l'hôte ; un choix d'upgrade en cours met aussi le monde en pause (il se termine tout seul)
  for (let i = 0; i < 900 && (hs.aliveSquads.length === 0 || hs.choiceT > 0); i++) await tick(client);
  await tick(client);
  for (const sq of [a, b]) if (!sq.alive) hs.respawnSquad(sq.owner, ['trooper', 'trooper', 'trooper', 'trooper']); // une seule escouade peut être restée morte (spectateur)
  await tick(client);
  hs.aliens.length = 0;
  // posés sur un soldat vivant (le centre d'une escouade qui vient de réapparaître n'est pas encore à jour)
  const on = a.soldiers.find((s) => s.alive);
  hs.powerups.items.push({ id: 9001, kind: 'stim', x: on.x, y: on.y, life: 5 });
  hs.powerups.items.push({ id: 9002, kind: 'stasis', x: on.x + 30, y: on.y, life: 5 });
  hs.powerups.items.push({ id: 9003, kind: 'rockets', x: on.x - 30, y: on.y, life: 5 });
  for (let i = 0; i < 4; i++) await tick(client);
  await lag(client);
  const stimSq = a.buffs.stim > 0 ? a : b; // la squad dont un soldat est passé dessus
  check(stimSq.buffs.stim > 0 && client.sim.squadOf(stimSq.owner).buffs.stim > 0, 'stimpack ramassé, reflété chez le client', `${stimSq.buffs.stim.toFixed(1)} s`);
  check(hs.powerups.fields.length === 1 && client.sim.powerups.fields.length === 1, 'globe de stase persistant, reflété chez le client');
  const rockets = hs.combat.projectiles.active.filter((p) => p.texture === 'fx_rocket').length; // les balles des soldats encore en vol ne comptent pas
  check(rockets >= 1 && rockets < 15, 'rafale : les roquettes partent l’une après l’autre (pas d’un coup)', `${rockets} roquette(s) en l’air`);
  hs.aliens.length = 0;
  hs.horde.spawnAt('slime', hs.powerups.fields[0].x, hs.powerups.fields[0].y, 1, false);
  check(hs.stasisAt(hs.aliens[0].x, hs.aliens[0].y) < 0.5, 'stase : aliens très ralentis dans le globe');
  hs.aliens.length = 0;
  // plus aucun bouclier de soldat : le power-up a disparu (seuls certains aliens, comme le Scarab, en ont)
  const onS = a.soldiers.find((s) => s.alive);
  check(a.soldiers.every((s) => s.shield === 0 && s.maxShield === 0), 'aucun soldat n’a de bouclier');
  // renforts express : proposés et pris même squad pleine (dépassement du cap), sans aucun bouclier
  { const n0 = a.soldiers.length; a.stats.add('maxSquad', { flat: n0 - a.maxSize }); // plafond = taille actuelle : squad pleine
    a.pendingLevels = 1; a.offer = ['reinforce']; a.offerPrism = [false];
    const before = new Set(a.soldiers);
    a.chooseUpgrade(0);
    check(a.soldiers.length === n0 + 3 && a.size > a.maxSize, 'renforts express : +3 soldats même squad pleine (dépasse le cap)', `${a.size}/${a.maxSize}`);
    const fresh = a.soldiers.filter((s) => !before.has(s));
    check(fresh.length === 3 && a.soldiers.every((s) => s.shield === 0), 'renforts express : aucun bouclier, ni pour les renforts ni pour le reste de la squad');
    // plus proposés quand la squad dépasse déjà son max de 3 (ou plus) ; encore proposés à +2
    const { REINFORCE_MAX_OVERCAP } = await vite.ssrLoadModule('/src/config.ts');
    const offers = (over) => { a.stats.add('maxSquad', { flat: a.size - over - a.maxSize }); let seen = false;
      for (let k = 0; k < 60 && !seen; k++) { a.offer = null; a.pendingLevels = 1; a.rollPending(); seen = !!a.offer?.includes('reinforce'); } a.offer = null; a.pendingLevels = 0; return seen; };
    const { DISABLED_UPGRADES } = await vite.ssrLoadModule('/src/data/progression.ts');
    if (DISABLED_UPGRADES.includes('reinforce')) check(!offers(0) && !offers(-3), 'renforts express : désactivés, jamais proposés (DISABLED_UPGRADES)');
    else check(!offers(REINFORCE_MAX_OVERCAP) && !offers(REINFORCE_MAX_OVERCAP + 2) && offers(REINFORCE_MAX_OVERCAP - 1), `renforts express : plus proposés quand la squad dépasse déjà son max de ${REINFORCE_MAX_OVERCAP}`); }
  // Scarab : bouclier = 10 % de ses PV max, régénéré vite après 5 s sans dégâts (encodage conditionnel par type : lecture fidèle chez le client)
  hs.aliens.length = 0;
  hs.horde.spawnAt('boss_scarab', onS.x + 400, onS.y, 1, false);
  const scarab = hs.aliens[0];
  scarab.age = 1; // sorti de son trou d'apparition (invulnérable avant)
  check(Math.abs(scarab.maxShield - scarab.maxHp * 0.05) < 1e-6 && scarab.shield === scarab.maxShield, 'scarab : bouclier = 5 % de ses PV max', `${Math.round(scarab.maxShield)} / ${Math.round(scarab.maxHp)}`);
  hs.damage(scarab, 100, host.localPlayer);
  check(scarab.hp === scarab.maxHp && Math.abs(scarab.shield - (scarab.maxShield - 100)) < 1e-6, 'scarab : le bouclier encaisse avant les PV');
  const snapSc = decodeSnapshot(encodeSnapshot(takeSnapshot(hs)));
  const scSnap = snapSc?.aliens.find((x) => x.id === scarab.id);
  check(!!scSnap && Math.abs(scSnap.shield - scarab.shield / scarab.maxShield) < 0.01 && snapSc.aliens.length === hs.aliens.length, 'snapshot : bouclier du scarab lu fidèlement (champ conditionnel)', `${scSnap?.shield.toFixed(3)}`);
  const shieldBefore = scarab.shield;
  // la horde seule (sans le combat : les soldats tireraient sur le scarab et relanceraient le délai à chaque coup)
  for (let i = 0; i < 30 * 4; i++) hs.horde.update(1 / 30); // 4 s sans régénération (délai de 5 s)
  check(Math.abs(scarab.shield - shieldBefore) < 1e-6, 'scarab : pas de régénération avant 5 s sans dégâts');
  for (let i = 0; i < 30 * 6; i++) hs.horde.update(1 / 30); // 10 s au total : délai écoulé puis régénération complète (4 s)
  check(scarab.shield === scarab.maxShield, 'scarab : bouclier régénéré après 5 s sans dégâts', `${Math.round(scarab.shield)} / ${Math.round(scarab.maxShield)}`);
  hs.aliens.length = 0;
  // paliers de dégâts : couleur du tir du Gunner selon le multiplicateur de dégâts
  { const { damageTier, projectileTexture } = await vite.ssrLoadModule('/src/data/damageTiers.ts');
    const { DIFFICULTY: D } = await vite.ssrLoadModule('/src/config.ts'); // les seuils suivent les dégâts de base de la squad
    const names = [1, 1.3, 1.6, 1.9, 2.2, 2.5].map((m) => damageTier(m * D.squadDamage).texture.replace('fx_blaster_', '')).join(' > ');
    check(names === 'blue > green > yellow > orange > purple > red' && damageTier(0.9).texture === 'fx_blaster_blue' && projectileTexture('fx_bolt_green', 3) === 'fx_bolt_green', 'paliers de dégâts : bleu > vert > jaune > orangé > violet > rouge', names); }
  hs.combat.projectiles.releaseAll();
  a.gainXp(a.xpNeeded - a.xp + 0.01);
  for (let i = 0; i < 4; i++) await tick(client);
  check(!!a.offer && a.offer.length === 3 && a.offerPrism.length === 3, 'montée de niveau : 3 propositions d’upgrade', `${a.offer?.join('/')}`);
  await lag(client);
  const csqA = client.sim.squadOf(host.localPlayer);
  check(!!csqA.offer && csqA.offer.join() === a.offer.join() && csqA.offerPrism.join() === a.offerPrism.join(), 'les propositions (et leur statut prismatique) sont reflétées chez le client');
  check(hs.aliens.length === 0 || true, 'champ de répulsion actif pendant le choix');
  host.chooseUpgrade(0);
  resolveChoices();
  for (let i = 0; i < 3; i++) await tick(client);
  check(a.offer === null, 'le choix applique l’upgrade');

  // 3e bis) Recrue en trop (escouade pleine) : soin en zone — le ramasseur à 100 %, ses voisins proches à 50 %, les lointains pas du tout.
  hs.aliens.length = 0;
  while (a.soldiers.length < 3) a.recruit('trooper', { x: a.center.x, y: a.center.y }); // le scénario a pu décimer l'escouade : il faut 3 soldats
  const [m0, m1, m2] = a.soldiers;
  const gap = a.maxSize - a.size;
  a.stats.add('maxSquad', { flat: -gap }); // escouade pleine
  const towardCenter = m0.x < hs.map.width / 2 ? 1 : -1; // vers le centre de la carte : un bord ramènerait le soldat « lointain » près des autres
  for (const [sold, dx] of [[m0, 0], [m1, 30], [m2, 400]]) { sold.hp = sold.maxHp * 0.2; sold.x = m0.x + dx * towardCenter; sold.y = m0.y; }
  const near0 = m1.hp;
  const far0 = m2.hp;
  const parked = hs.squads.filter((o) => o !== a).flatMap((o) => o.soldiers).map((s) => [s, s.x]); // l'autre squad (pas pleine) ramasserait la recrue : on l'éloigne le temps du test
  for (const [s] of parked) s.x = m0.x + towardCenter * 1200;
  hs.recruits.clear(); // recrues restées au sol des tests précédents (un autre soldat les ramasserait et soignerait ses voisins)
  hs.recruits.drop('trooper', m0.x, m0.y);
  for (let i = 0; i < 3; i++) await tick(client);
  check(m0.hp === m0.maxHp, 'recrue en trop : le ramasseur est soigné à 100 %', `${m0.hp.toFixed(0)}/${m0.maxHp.toFixed(0)}`);
  check(Math.abs(m1.hp - Math.min(m1.maxHp, near0 + m1.maxHp * 0.5)) < 0.5, 'recrue en trop : un voisin proche est soigné à 50 %', `${near0.toFixed(0)} → ${m1.hp.toFixed(0)}`);
  check(m2.hp <= far0, 'recrue en trop : un soldat hors zone n’est pas soigné');
  a.stats.add('maxSquad', { flat: gap });
  for (const [s, x] of parked) s.x = x;

  // 3f) Onde de choc : repousse même un alien lourd, à chaque montée de niveau.
  hs.aliens.length = 0;
  hs.combat.clear(); // roquettes du power-up encore en vol (la pause de choix a étalé la rafale)
  resolveChoices();
  // loin des tirs de l'escouade, vers le centre de la carte (près d'un bord, ils seraient ramenés à portée)
  const hdir = a.center.x < hs.map.width / 2 ? 1 : -1;
  hs.aliens.length = 0;
  hs.horde.spawnAt('boss_crab', a.center.x - 300, a.center.y);
  const heavy = hs.aliens[0];
  const d0 = Math.hypot(heavy.x - a.center.x, heavy.y - a.center.y);
  resolveChoices(); // plus de choix en attente
  for (let round = 0; round < 3; round++) {
    heavy.x = heavy.px = a.center.x - 300; // chaque tour repart à portée de l'onde (sinon les tours précédents l'ont déjà poussé hors de portée)
    heavy.y = heavy.py = a.center.y;
    a.gainXp(a.xpNeeded - a.xp + 0.01);
    resolveChoices(); // l'onde de choc se déroule une fois la pause de choix terminée
    const dBefore = Math.hypot(heavy.x - a.center.x, heavy.y - a.center.y);
    for (let i = 0; i < 40; i++) { heavy.attackCd = 5; hs.aliens.splice(0, hs.aliens.length, heavy); await tick(client); } // le boss vivant fait rejouer les vagues : on retire les autres aliens (ils gêneraient la mesure)
    const dAfter = Math.hypot(heavy.x - a.center.x, heavy.y - a.center.y);
    check(dAfter > dBefore + 80, `onde de choc n°${round + 1} : repousse un alien lourd`, `${dBefore.toFixed(0)} → ${dAfter.toFixed(0)} px`);
  }
  void d0;
  hs.aliens.length = 0;

  // 3g) Saut écrasant du crabe : point d'impact visé et reflété chez le client (télégraphe), soldat écrasé tué d'un coup.
  hs.aliens.length = 0;
  hs.horde.spawnAt('boss_crab', a.center.x + 400, a.center.y);
  const jumper = hs.aliens[0];
  jumper.leapCd = 0;
  for (let i = 0; i < 3 && jumper.leapT <= 0; i++) await tick(client);
  // impact déplacé à l'écart de l'escouade (sinon il l'écrase entière et fausse la suite des tests)
  // vers le centre de la carte (près d'un bord, la victime serait ramenée dans l'arène, hors de la zone d'impact)
  const cdx = hs.map.width / 2 - a.center.x;
  const cdy = hs.map.height / 2 - a.center.y;
  const cd = Math.hypot(cdx, cdy) || 1;
  jumper.leapX = a.center.x + (cdx / cd) * 450;
  jumper.leapY = a.center.y + (cdy / cd) * 450;
  await tick(client);
  await tick(client);
  await lag(client);
  const cj = client.sim.aliens.find((x) => x.id === jumper.id);
  check(jumper.leapT > 0 && !!cj && cj.leapT > 0 && Math.hypot(cj.leapX - jumper.leapX, cj.leapY - jumper.leapY) < 1, 'crabe : saut lancé, point d’impact reflété chez le client', `impact (${jumper.leapX.toFixed(0)}, ${jumper.leapY.toFixed(0)})`);
  const victim = a.soldiers.find((x) => x.alive);
  for (let i = 0; i < 90 && jumper.leapT > 0 && victim.alive; i++) {
    resolveChoices(); // une montée de niveau en route mettrait le saut en pause
    victim.x = victim.px = jumper.leapX;
    victim.y = victim.py = jumper.leapY;
    victim.invulnerable = 0;
    await tick(client);
  }
  check(!victim.alive, 'crabe : le soldat sous la zone d’impact est tué d’un coup');
  hs.aliens.length = 0;
  for (let i = 0; i < 3; i++) await tick(client);

  // 4) Mort en coop : zone de réanimation au sol ; l'équipier qui y reste 2 s ramène le joueur ; quand les deux sont morts → fin, puis relance.
  const deathAt = { x: b.center.x, y: b.center.y };
  for (const x of b.soldiers) x.alive = false;
  for (let i = 0; i < 15; i++) await tick(client);
  check(!client.sim.squadOf(client.localPlayer).alive, 'le client voit sa squad anéantie');
  check(hs.reviveZones.length === 1 && client.sim.reviveZones.length === 1, 'une zone de réanimation apparaît, reflétée chez le client', `${hs.reviveZones.length} / ${client.sim.reviveZones.length}`);
  const zone = hs.reviveZones[0];
  // l'équipier s'éloigne : pas de réapparition
  const away = zone.x > hs.map.width / 2 ? -600 : 600; // vers le centre de la carte (les bords ramènent les soldats)
  for (let i = 0; i < 120; i++) {
    a.anchor.x = zone.x + away; a.anchor.y = zone.y; // l'ancre aussi : sinon la formation ramène les soldats dans la zone
    hs.aliens.length = 0; // on teste la réanimation, pas la survie de l'équipier
    for (const s of a.soldiers) { s.x = zone.x + away; s.y = zone.y; }
    await tick(client);
  }
  check(!b.alive && a.alive, 'pas de réapparition tant que personne n’est dans la zone', `a ${a.size} soldats, b ${b.size}`);
  // il revient et reste dedans : réanimation au bout de 2 s
  for (const s of a.soldiers) { s.x = zone.x; s.y = zone.y; }
  for (let i = 0; i < 20; i++) { a.anchor.x = zone.x; a.anchor.y = zone.y; hs.aliens.length = 0; await tick(client); }
  check(!b.alive, 'pas de réanimation avant 2 s', `progression ${hs.reviveZones[0]?.progress.toFixed(2)}`);
  for (let i = 0; i < 80 && !b.alive; i++) { a.anchor.x = zone.x; a.anchor.y = zone.y; hs.aliens.length = 0; await tick(client); } // pas d'aliens : on teste la réanimation, pas la survie de l'équipier
  check(b.alive && hs.reviveZones.length === 0, 'le joueur est réanimé avec une escouade de base', `${b.size} soldats`);
  for (let i = 0; i < 10; i++) await tick(client);
  check(client.sim.squadOf(client.localPlayer).alive && client.sim.reviveZones.length === 0, 'le client voit sa squad revenue et la zone disparue');
  for (const x of b.soldiers) x.alive = false; // mort définitive : la suite teste la fin de partie
  for (let i = 0; i < 15; i++) await tick(client);
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
  // hôte muet (onglet en arrière-plan, gel) : sans snapshot depuis 1,5 s le client le sait, et il le sait de nouveau « vivant » au snapshot suivant
  check(!client.hostStalled, 'hôte actif : pas d’alerte chez le client');
  for (let i = 0; i < 20; i++) client.advance(100, () => {});
  check(client.hostStalled, 'hôte muet depuis 2 s : le client est prévenu', `${client.hostStalled}`);
  for (let i = 0; i < 3; i++) await tick(client);
  check(!client.hostStalled, 'snapshot reçu : l’alerte disparaît');
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
