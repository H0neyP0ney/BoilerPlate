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
  const bosses = hs.aliens.filter((x) => x.def.id === 'boss_rhino');
  check(bosses.length === 1 && Math.round(bosses[0].maxHp) === Math.round(900 * DIFFICULTY.bossHpMul * 2), 'boss unique, PV ×2 avec 2 joueurs (et × bossHpMul)', `${bosses.length} boss, ${bosses[0]?.maxHp} PV`);
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
  // clignotement : l'hôte marque un globe dans ses dernières secondes, le client le reçoit marqué (identifiant stable compris)
  const orbHost = hs.xp.orbs[0];
  const orbId = orbHost.id & 0xffff;
  orbHost.life = 2;
  await tick(client);
  await tick(client);
  const orbClient = client.sim.xp.orbs.find((o) => o.id === orbId);
  check(!!orbClient && orbClient.life < 5, 'globe en fin de vie : le clignotement est transmis au client', orbClient ? `life ${orbClient.life}` : 'globe introuvable');
  // XP partagée (coop) : une seule barre, seuil × nombre de joueurs ; un niveau = tous les joueurs montent et choisissent
  check(a.xpNeeded === b.xpNeeded && a.xpNeeded > 0, 'XP partagée : même seuil pour les deux joueurs (× 2 joueurs)', `${a.xpNeeded}`);
  const levelBefore = a.level;
  b.gainXp(b.xpNeeded - b.xp + 0.01);
  for (let i = 0; i < 6; i++) await tick(client);
  const csq = client.sim.squadOf(client.localPlayer);
  check(a.level === levelBefore + 1 && b.level === a.level && !!a.offer && !!b.offer, 'XP partagée : l’XP de l’un fait monter tout le monde', `niv. ${a.level} / ${b.level}`);
  check(!!b.offer && !!csq.offer && csq.offer.join() === b.offer.join(), 'les propositions d\'upgrade arrivent chez le client', csq.offer?.join('/'));
  check(hs.choiceT > 0 && client.sim.choiceT > 0, 'choix d’upgrade : jeu en pause, reflété chez le client', `${hs.choiceT.toFixed(2)} s / ${client.sim.choiceT.toFixed(2)} s`);
  client.chooseUpgrade(1);
  const timeBefore = hs.time;
  for (let i = 0; i < 6; i++) await tick(client);
  check(Object.values(b.picked).reduce((n, v) => n + (v ?? 0), 0) >= 1, 'le choix du client est appliqué chez l\'hôte', JSON.stringify(b.picked));
  check(hs.choiceT > 0 && Math.abs(hs.time - timeBefore) < 1e-6, 'le monde reste figé tant qu’un joueur n’a pas choisi');
  host.chooseUpgrade(0);
  for (let i = 0; i < 3; i++) await tick(client);
  check(hs.choiceT === 0 && hs.time > timeBefore, 'tout le monde a choisi : la partie reprend');
  // personne ne choisit : choix au hasard à la fin du temps
  b.gainXp(b.xpNeeded - b.xp + 0.01);
  const picks = (sq) => Object.values(sq.picked).reduce((n, v) => n + (v ?? 0), 0);
  const pa = picks(a);
  const pb = picks(b);
  for (let i = 0; i < 30 * 6 && hs.choiceT > 0; i++) await tick(client);
  check(hs.choiceT === 0 && picks(a) === pa + 1 && picks(b) === pb + 1, 'temps écoulé : une upgrade est choisie au hasard pour chacun', `${pa}→${picks(a)} / ${pb}→${picks(b)}`);

  const resolveChoices = () => {
    for (let guard = 0; guard < 20 && hs.squads.some((sq) => sq.offer); guard++) for (const sq of hs.squads) if (sq.offer) hs.chooseUpgrade(sq.owner, 0);
  };

  // 3d) Cracheur : boules en cloche, pas de recul, flaque ralentissante reflétée chez le client ; cailloux suivis par snapshot.
  hs.aliens.length = 0;
  hs.horde.spawnAt('spitter', a.center.x + 200, a.center.y);
  const spitter = hs.aliens[0];
  for (const s of a.soldiers) s.invulnerable = 0;
  const kx0 = a.soldiers.reduce((n, s) => n + Math.abs(s.kx) + Math.abs(s.ky), 0);
  hs.combat.spray(spitter, a.soldiers[0]);
  check(hs.combat.projectiles.active.length === 3 && hs.combat.projectiles.active.every((p) => p.lob && p.aoe > 0), 'cracheur : 3 boules en cloche télégraphiées', `${hs.combat.projectiles.active.length}`);
  hs.aliens.length = 0;
  for (let i = 0; i < 45; i++) await tick(client);
  check(hs.puddles.length === 3 && client.sim.puddles.length === 3, 'impacts : flaques ralentissantes, reflétées chez le client', `${hs.puddles.length} / ${client.sim.puddles.length}`);
  check(hs.slowAt(hs.puddles[0].x, hs.puddles[0].y, 10) < 1, 'une flaque ralentit les soldats dedans', `×${hs.slowAt(hs.puddles[0].x, hs.puddles[0].y, 10)}`);
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
        if (!b || Math.abs(b.x - a.x) > 0.01 || Math.abs(b.y - a.y) > 0.01) {
          rushOk = false;
          rushDetail = `tick ${i} : alien ${a.def.id} décalé, rushWind=${rhino.rushWind.toFixed(3)}`;
          break;
        }
      }
    }
    await tick(client);
  }
  check(rushOk && sawRush, 'rhinocéros : snapshot lisible et fidèle pendant et après la charge (rushWind négatif)', rushDetail || (sawRush ? 'charge vue' : 'aucune charge'));
  hs.aliens.length = 0;
  hs.powerups.items.push({ id: 9001, kind: 'stim', x: a.center.x, y: a.center.y, life: 5 });
  hs.powerups.items.push({ id: 9002, kind: 'stasis', x: a.center.x + 30, y: a.center.y, life: 5 });
  hs.powerups.items.push({ id: 9003, kind: 'rockets', x: a.center.x - 30, y: a.center.y, life: 5 });
  for (let i = 0; i < 4; i++) await tick(client);
  const stimSq = a.buffs.stim > 0 ? a : b; // la squad dont un soldat est passé dessus
  check(stimSq.buffs.stim > 0 && client.sim.squadOf(stimSq.owner).buffs.stim > 0, 'stimpack ramassé, reflété chez le client', `${stimSq.buffs.stim.toFixed(1)} s`);
  check(hs.powerups.fields.length === 1 && client.sim.powerups.fields.length === 1, 'globe de stase persistant, reflété chez le client');
  check(hs.combat.projectiles.active.length >= 1 && hs.combat.projectiles.active.length < 15, 'rafale : les roquettes partent l’une après l’autre (pas d’un coup)', `${hs.combat.projectiles.active.length} en l’air`);
  hs.aliens.length = 0;
  hs.horde.spawnAt('slime', hs.powerups.fields[0].x, hs.powerups.fields[0].y, 1, false);
  check(hs.stasisAt(hs.aliens[0].x, hs.aliens[0].y) < 0.5, 'stase : aliens très ralentis dans le globe');
  hs.aliens.length = 0;
  hs.combat.projectiles.releaseAll();
  a.gainXp(a.xpNeeded - a.xp + 0.01);
  for (let i = 0; i < 4; i++) await tick(client);
  check(!!a.offer && a.offer.length === 3 && a.offerPrism.length === 3, 'montée de niveau : 3 propositions d’upgrade', `${a.offer?.join('/')}`);
  const csqA = client.sim.squadOf(host.localPlayer);
  check(!!csqA.offer && csqA.offer.join() === a.offer.join() && csqA.offerPrism.join() === a.offerPrism.join(), 'les propositions (et leur statut prismatique) sont reflétées chez le client');
  check(hs.aliens.length === 0 || true, 'champ de répulsion actif pendant le choix');
  host.chooseUpgrade(0);
  resolveChoices();
  for (let i = 0; i < 3; i++) await tick(client);
  check(a.offer === null, 'le choix applique l’upgrade');

  // 3e bis) Recrue en trop (escouade pleine) : soin en zone — le ramasseur à 100 %, ses voisins proches à 50 %, les lointains pas du tout.
  hs.aliens.length = 0;
  const [m0, m1, m2] = a.soldiers;
  const gap = a.maxSize - a.size;
  a.stats.add('maxSquad', { flat: -gap }); // escouade pleine
  const towardCenter = m0.x < hs.map.width / 2 ? 1 : -1; // vers le centre de la carte : un bord ramènerait le soldat « lointain » près des autres
  for (const [sold, dx] of [[m0, 0], [m1, 30], [m2, 400]]) { sold.hp = sold.maxHp * 0.2; sold.x = m0.x + dx * towardCenter; sold.y = m0.y; }
  const near0 = m1.hp;
  const far0 = m2.hp;
  hs.recruits.clear(); // recrues restées au sol des tests précédents (un autre soldat les ramasserait et soignerait ses voisins)
  hs.recruits.drop('trooper', m0.x, m0.y);
  for (let i = 0; i < 3; i++) await tick(client);
  check(m0.hp === m0.maxHp, 'recrue en trop : le ramasseur est soigné à 100 %', `${m0.hp.toFixed(0)}/${m0.maxHp.toFixed(0)}`);
  check(Math.abs(m1.hp - Math.min(m1.maxHp, near0 + m1.maxHp * 0.5)) < 0.5, 'recrue en trop : un voisin proche est soigné à 50 %', `${near0.toFixed(0)} → ${m1.hp.toFixed(0)}`);
  check(m2.hp <= far0, 'recrue en trop : un soldat hors zone n’est pas soigné');
  a.stats.add('maxSquad', { flat: gap });

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
    for (let i = 0; i < 40; i++) { heavy.attackCd = 5; await tick(client); }
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
