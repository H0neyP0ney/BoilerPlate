// Netcode sous un réseau dégradé (perte, gigue avec réordonnancement, doublons, rafales, latence asymétrique) : scénarios de l'audit (docs/AUDIT_NETCODE.md).
// Usage : node scripts/net-loss-headless.mjs [scénario…]   (sans argument : tous) — scénarios : recon, resume, dup, events, big
//   recon  : corrections de l'ancre prédite et à-coups de la squad d'un invité, sous 5 profils de réseau, + file d'inputs de l'hôte
//   resume : reprise après la pause de choix d'upgrade (saut en avant de la squad affichée de l'invité)
//   dup    : snapshots dupliqués / réordonnés : les aliens affichés chez le client s'arrêtent-ils ?
//   events : événements structurants (gameEnd / restart) avec 30 % de perte : combien en reçoit le client ?
//   big    : 4 joueurs (hôte + 3 invités), 40 soldats chacun, ~600 aliens et 2 boss, un invité rejoint en plein combat : taille et débit des snapshots
// Tout l'aléatoire (réseau, inputs) est seedé : deux lancements donnent les mêmes chiffres.
import { createServer } from 'vite';

const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const stat = (a) => {
  if (a.length === 0) return { mean: '-', p95: '-', max: '-' };
  const s = [...a].sort((x, y) => x - y);
  return { mean: (a.reduce((n, e) => n + e, 0) / a.length).toFixed(2), p95: s[Math.floor(s.length * 0.95)].toFixed(2), max: s[s.length - 1].toFixed(2) };
};
const fmt = (o) => `moy ${o.mean} | p95 ${o.p95} | max ${o.max}`;

try {
  const { HostSession } = await vite.ssrLoadModule('/src/net/HostSession.ts');
  const { ClientSession } = await vite.ssrLoadModule('/src/net/ClientSession.ts');
  const { LoopbackHub } = await vite.ssrLoadModule('/src/net/LoopbackTransport.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { takeSnapshot, encodeSnapshot } = await vite.ssrLoadModule('/src/net/Protocol.ts');
  if (process.env.NOLEASH) (await vite.ssrLoadModule('/src/config.ts')).CROWD.leash = 1e6; // essai : laisse de l'ancre désactivée chez l'hôte (part des corrections qui vient d'elle)

  /** Un hôte et `clients` invités reliés par un hub en mémoire. `cond` : conditions réseau (après la connexion). */
  const setup = async ({ clients = 1, latency = 3, cond = {}, seed = 1, aliens = true } = {}) => {
    const hub = new LoopbackHub();
    hub.seed(seed);
    const hostT = hub.createTransport();
    const code = await hostT.host();
    const host = new HostSession({ mode: MODES.survival, seed: 42, transport: hostT, roomCode: code });
    const list = [];
    const events = new Map();
    const w = {
      hub, host, hostT, clients: list, events, aliens,
      async tick() {
        host.advance(1000 / 30, () => {});
        for (const c of list) c.advance(1000 / 30, (e) => events.get(c).push(e));
        if (!w.aliens) host.sim.aliens.length = 0;
        hub.pump();
        await new Promise((r) => setImmediate(r));
      },
      async join() {
        const t = hub.createTransport();
        let c = null;
        ClientSession.connect(t, code).then((x) => (c = x));
        for (let i = 0; i < 60 && !c; i++) await w.tick();
        if (!c) throw new Error('connexion impossible');
        list.push(c);
        events.set(c, []);
        return c;
      },
    };
    for (let i = 0; i < clients; i++) await w.join();
    hub.latency = latency;
    Object.assign(hub.conditions, cond);
    return w;
  };
  /** Sonde de la file d'inputs de l'hôte : ticks sans input en attente (on rejoue le précédent) et inputs sautés (file trop longue ou raccourcie). */
  const probeQueue = (host) => {
    const q = { starved: 0, skipped: 0, caught: 0, ticks: 0, depth: 0, maxDepth: 0, deepTicks: 0 };
    const orig = host.consumeInput.bind(host);
    host.consumeInput = (id, r) => {
      const before = r.applied;
      const empty = r.queue.length === 0;
      orig(id, r);
      q.ticks++;
      q.depth += r.queue.length; // inputs encore en attente après celui joué = ticks de retard de l'invité chez l'hôte, en plus de la latence
      q.maxDepth = Math.max(q.maxDepth, r.queue.length);
      if (r.queue.length >= 3) q.deepTicks++;
      if (empty) q.starved++;
      else if (before > 0 && r.applied > before + 1) q.skipped += r.applied - before - 1 - (r.input.catchUp ? 1 : 0);
      if (!empty && r.input.catchUp) q.caught++;
    };
    return q;
  };
  /** Sonde de la réconciliation : de combien chaque snapshot déplace l'ancre prédite. */
  const probeRecon = (client) => {
    const p = client.mirror.predictor;
    const corr = [];
    const orig = p.reconcile.bind(p);
    p.reconcile = (...args) => {
      const bx = p.anchor.x, by = p.anchor.y;
      orig(...args);
      corr.push(Math.hypot(p.anchor.x - bx, p.anchor.y - by));
    };
    return corr;
  };

  // ---------- recon ----------
  if (want('recon')) {
    console.log('\n=== recon : réconciliation de la squad d\'un invité (30 soldats, aliens, petits inputs dans tous les sens, 12 s) ===');
    const profiles = [
      ['parfait (3 ticks)', { latency: 3, cond: {} }],
      ['perte 5 % + gigue 0-2, réordonné', { latency: 3, cond: { loss: 0.05, jitter: 2, reorder: true } }],
      ['perte 10 % + doublons 5 % + gigue 0-3', { latency: 3, cond: { loss: 0.1, duplicate: 0.05, jitter: 3, reorder: true } }],
      ['rafales (1 %/tick, 8 ticks coupés)', { latency: 3, cond: { burstChance: 0.01, burstLength: 8 } }],
      ['asymétrique (hôte→invité 2, invité→hôte 6) + gigue 0-2', { latency: 3, cond: { jitter: 2, reorder: true }, asym: true }],
    ];
    for (const [label, prof] of profiles) {
      const w = await setup({ latency: prof.latency, seed: 7 });
      const client = w.clients[0];
      if (prof.asym) {
        w.hub.latencyTo.set(client.localPlayer, 2);
        w.hub.latencyTo.set(w.host.localPlayer, 6);
      }
      const me = client.localPlayer;
      const hsq = w.host.sim.squadOf(me);
      while (hsq.soldiers.length < 30) hsq.recruit('trooper', { x: hsq.center.x, y: hsq.center.y });
      for (let i = 0; i < 60; i++) {
        for (const s of hsq.soldiers) s.hp = s.maxHp;
        await w.tick();
      }
      Object.assign(w.hub.conditions, prof.cond);
      const q = probeQueue(w.host);
      const corr = probeRecon(client);
      const mine = () => client.sim.squadOf(me);
      let prev = { ...mine().center }, prevStep = null, snaps = 0;
      const jit = [];
      let sd = 11;
      const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let k = 0; k < 60; k++) {
        const a = rnd() * Math.PI * 2;
        client.setLocalInput(Math.cos(a), Math.sin(a));
        for (let i = 0; i < 6; i++) {
          for (const s of hsq.soldiers) s.hp = s.maxHp;
          await w.tick();
          const c = mine().center;
          const st = { x: c.x - prev.x, y: c.y - prev.y };
          prev = { ...c };
          if (prevStep) jit.push(Math.hypot(st.x - prevStep.x, st.y - prevStep.y));
          prevStep = st;
        }
      }
      snaps = corr.filter((c) => c > 40).length;
      console.log(`- ${label}`);
      console.log(`    correction d'ancre / snapshot (px) : ${fmt(stat(corr))} (${corr.length} snapshots, ${snaps} recalages > 40 px)`);
      console.log(`    à-coup du centre affiché (px/tick) : ${fmt(stat(jit))}`);
      console.log(`    file d'inputs de l'hôte : ${q.starved} ticks sans input / ${q.ticks}, ${q.skipped} inputs sautés, ${q.caught} rattrapages (2 inputs en 1 tick), retard ajouté moyen ${(q.depth / q.ticks).toFixed(2)} ticks (max ${q.maxDepth}, ≥ 3 ticks pendant ${q.deepTicks} ticks) ; réseau : ${w.hub.stats.lost} perdus, ${w.hub.stats.duplicated} doublés / ${w.hub.stats.sent}`);
    }
  }

  // ---------- resume ----------
  if (want('resume')) {
    console.log('\n=== resume : reprise après la pause de choix d\'upgrade (20 soldats, sans aliens, latence 3 ticks par sens) ===');
    const w = await setup({ latency: 3, aliens: false, seed: 3 });
    const client = w.clients[0];
    const me = client.localPlayer;
    const gsq = w.host.sim.squadOf(me);
    while (gsq.soldiers.length < 20) gsq.recruit('trooper', { x: gsq.center.x, y: gsq.center.y });
    for (let i = 0; i < 60; i++) await w.tick();
    const dirX = gsq.anchor.x < w.host.sim.map.width / 2 ? 1 : -1;
    client.setLocalInput(dirX, 0);
    for (let i = 0; i < 30; i++) await w.tick();
    gsq.gainXp(gsq.xpNeeded - gsq.xp + 0.01);
    for (let i = 0; i < 120 && w.host.sim.choiceT <= 0; i++) await w.tick();
    check(w.host.sim.choiceT > 0, 'pause de choix ouverte chez l\'hôte');
    for (let i = 0; i < 20; i++) await w.tick(); // le joueur garde le joystick enfoncé pendant la pause
    w.host.chooseUpgrade(0);
    client.chooseUpgrade(0);
    const mine = () => client.sim.squadOf(me);
    let pc = { ...mine().center }, hc = { ...gsq.center };
    const g = [], h = [], solMax = [];
    const prevSol = new Map(mine().soldiers.map((s) => [s.id, { x: s.x, y: s.y }]));
    let resumed = -1;
    for (let i = 0; i < 45; i++) {
      await w.tick();
      if (resumed < 0 && w.host.sim.choiceT <= 0) resumed = i;
      const c = mine().center;
      g.push(Math.hypot(c.x - pc.x, c.y - pc.y));
      h.push(Math.hypot(gsq.center.x - hc.x, gsq.center.y - hc.y));
      pc = { ...c };
      hc = { ...gsq.center };
      let m = 0;
      for (const s of mine().soldiers) {
        const p = prevSol.get(s.id);
        if (p) m = Math.max(m, Math.hypot(s.x - p.x, s.y - p.y));
        prevSol.set(s.id, { x: s.x, y: s.y });
      }
      solMax.push(m);
    }
    console.log(`  reprise chez l'hôte au tick ${resumed}`);
    console.log('  centre affiché (invité) px/tick', g.map((v) => v.toFixed(1)).join(' '));
    console.log('  centre chez l\'hôte       px/tick', h.map((v) => v.toFixed(1)).join(' '));
    console.log('  plus grand pas d\'un soldat affiché', solMax.map((v) => v.toFixed(1)).join(' '));
    const cruise = Math.max(...h);
    console.log(`  RESUME — pas max du centre affiché ${Math.max(...g).toFixed(1)} px/tick (croisière ${cruise.toFixed(1)}), pas max d'un soldat ${Math.max(...solMax).toFixed(1)} px/tick`);
  }

  // ---------- dup ----------
  if (want('dup')) {
    console.log('\n=== dup : snapshots doublés et réordonnés (40 slimes qui marchent vers la squad, 10 s) ===');
    for (const [label, cond] of [['sans doublon', {}], ['doublons 20 % + gigue 0-2 réordonnée', { duplicate: 0.2, jitter: 2, reorder: true }]]) {
      const w = await setup({ latency: 2, seed: 5 });
      const client = w.clients[0];
      const hs = w.host.sim;
      const a = hs.squadOf(w.host.localPlayer);
      Object.assign(w.hub.conditions, cond);
      let twice = 0, lastSeq = -1;
      const origApply = client.mirror.apply.bind(client.mirror);
      client.mirror.apply = (snap, next) => {
        if (snap.seq === lastSeq) twice++;
        lastSeq = snap.seq;
        origApply(snap, next);
      };
      let stalls = 0, samples = 0;
      const prevPos = new Map();
      for (let i = 0; i < 300; i++) {
        if (i % 60 === 0) {
          hs.aliens.length = 0;
          for (let k = 0; k < 40; k++) hs.horde.spawnAt('slime', a.center.x + 500 * Math.cos(k), a.center.y + 500 * Math.sin(k), 1, false, true);
        }
        for (const q of hs.squads) for (const s of q.soldiers) { s.hp = s.maxHp; s.cooldown = 99; } // personne ne tire : les aliens marchent
        await w.tick();
        if (i % 60 < 25) continue; // les aliens viennent d'apparaître (sortie de terre)
        for (const al of client.sim.aliens) {
          const p = prevPos.get(al.id);
          prevPos.set(al.id, { x: al.x, y: al.y });
          const ha = hs.aliens.find((x) => x.id === al.id);
          if (!p || !ha || Math.hypot(ha.vx, ha.vy) < 20) continue;
          samples++;
          if (Math.hypot(al.x - p.x, al.y - p.y) < 0.05) stalls++;
        }
      }
      console.log(`  ${label} : ${stalls} arrêts d'alien affiché sur ${samples} (${((100 * stalls) / Math.max(1, samples)).toFixed(2)} %) ; snapshots appliqués deux fois : ${twice} ; réseau ${w.hub.stats.duplicated} doublés / ${w.hub.stats.sent}`);
    }
  }

  // ---------- events ----------
  if (want('events')) {
    console.log('\n=== events : 12 fins de partie avec 30 % de perte sur le canal non fiable ===');
    const w = await setup({ latency: 2, seed: 9, aliens: false });
    const client = w.clients[0];
    const evs = w.events.get(client);
    Object.assign(w.hub.conditions, { loss: 0.3 });
    let ends = 0, restarts = 0;
    const N = 12;
    for (let k = 0; k < N; k++) {
      evs.length = 0;
      for (const sq of w.host.sim.squads) for (const s of sq.soldiers) s.alive = false;
      for (let i = 0; i < 140; i++) await w.tick(); // écran de fin (3 s) puis retour à la salle d'attente
      w.host.startGame();
      for (let i = 0; i < 20; i++) await w.tick();
      if (evs.some((e) => e.t === 'gameEnd')) ends++;
      if (evs.some((e) => e.t === 'restart')) restarts++;
    }
    console.log(`  EVENTS — gameEnd reçu ${ends}/${N}, restart reçu ${restarts}/${N}`);
    const p = client.mirror.predictor;
    const hq = w.host.sim.squadOf(client.localPlayer);
    check(Math.hypot(p.anchor.x - hq.anchor.x, p.anchor.y - hq.anchor.y) < 1, 'après les relances, l\'ancre prédite est recalée sur l\'hôte');
  }

  // ---------- upgrade ----------
  if (want('upgrade')) {
    console.log('\n=== upgrade : deux niveaux d\'avance, l\'invité clique dans les 100 dernières ms des 5 s (latence 3) ===');
    const w = await setup({ latency: 3, seed: 21, aliens: false });
    const client = w.clients[0];
    const me = client.localPlayer;
    let wrong = 0, rejected = 0;
    const N = 8;
    // le clic de l'invité arrive chez l'hôte par `sim.chooseUpgrade` (le choix au hasard de fin du temps, lui, passe par la squad directement)
    let armed = false, clickOffer = null;
    const origChoose = w.host.sim.chooseUpgrade.bind(w.host.sim);
    w.host.sim.chooseUpgrade = (owner, idx) => {
      if (owner === me && armed) clickOffer = [...(w.host.sim.squadOf(me).offer ?? [])];
      return origChoose(owner, idx);
    };
    for (let k = 0; k < N; k++) {
      const gsq = w.host.sim.squadOf(me);
      gsq.gainXp(gsq.xpNeeded - gsq.xp + 0.01);
      gsq.gainXp(gsq.xpNeeded - gsq.xp + 0.01); // deux niveaux : à la fin du temps, l'hôte choisit au hasard puis ouvre le suivant
      for (let i = 0; i < 120 && !(w.host.sim.choiceT > 0 && client.sim.squadOf(me)?.offer); i++) await w.tick();
      w.host.chooseUpgrade(0);
      while (client.sim.choiceT > 0.1 + (100 + 3 * 33) / 1000) await w.tick(); // l'invité voit la jauge avec ~200 ms de retard
      const seen = [...client.sim.squadOf(me).offer]; // les cartes à l'écran de l'invité
      armed = true;
      clickOffer = null;
      client.chooseUpgrade(0); // clic sur la 1re carte VUE, juste avant la fin du temps (à l'écran)
      for (let i = 0; i < 12; i++) await w.tick();
      armed = false;
      if (!clickOffer) rejected++;
      else if (clickOffer.join() !== seen.join()) wrong++;
      for (let g = 0; g < 4 && gsq.offer; g++) origChoose(me, 0); // on referme pour la manche suivante
      for (let i = 0; i < 30; i++) await w.tick();
    }
    console.log(`  UPGRADE — sur ${N} clics : ${wrong} appliqués à une carte jamais vue, ${rejected} refusés (proposition périmée), ${N - wrong - rejected} conformes`);
  }

  // ---------- big ----------
  if (want('big')) {
    console.log('\n=== big : 4 joueurs, 40 soldats chacun, ~600 aliens + 2 boss, un invité rejoint en plein combat ===');
    const w = await setup({ clients: 2, latency: 3, seed: 13 });
    const hs = w.host.sim;
    const fill = () => {
      for (const sq of hs.squads) {
        while (sq.soldiers.length < 40) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
        for (const s of sq.soldiers) s.hp = s.maxHp;
      }
      for (const a of hs.aliens) a.hp = a.maxHp; // la horde reste entière : on mesure le pire cas (tout le monde tire, rien ne meurt)
    };
    const evTypes = new Map();
    const origEv = w.host.broadcast.bind(w.host);
    w.host.broadcast = () => {
      for (const e of w.host.outbound) evTypes.set(e.t, (evTypes.get(e.t) ?? 0) + JSON.stringify(e).length);
      origEv();
    };
    fill();
    let bytes = 0, msgs = 0, biggest = 0, evBytes = 0;
    const origB = w.hostT.broadcast.bind(w.hostT);
    w.hostT.broadcast = (ch, data) => {
      const n = typeof data === 'string' ? data.length : data.byteLength;
      if (typeof data === 'string') evBytes += n;
      else { bytes += n; msgs++; biggest = Math.max(biggest, n); }
      origB(ch, data);
    };
    const spawnHorde = (count) => {
      for (let k = 0; k < count; k++) {
        const sq = hs.squads[k % hs.squads.length];
        const ang = (k * 2.399) % (Math.PI * 2);
        hs.horde.spawnAt(k % 3 === 0 ? 'gling' : 'slime', sq.center.x + Math.cos(ang) * (350 + (k % 7) * 30), sq.center.y + Math.sin(ang) * (350 + (k % 7) * 30), 1, false, true);
      }
    };
    spawnHorde(450);
    hs.horde.spawnAt('boss_rhino', hs.squads[0].center.x + 500, hs.squads[0].center.y, 1, false, true);
    hs.horde.spawnAt('boss_crab', hs.squads[1].center.x - 500, hs.squads[1].center.y, 1, false, true);
    for (let i = 0; i < 60; i++) { fill(); await w.tick(); }
    const late = await w.join(); // 4e joueur, en plein combat
    spawnHorde(150);
    w.hub.latencyTo.set(late.localPlayer, 5);
    Object.assign(w.hub.conditions, { loss: 0.03, jitter: 2, reorder: true });
    bytes = msgs = biggest = evBytes = 0;
    evTypes.clear();
    const corr = probeRecon(late);
    const lsq = hs.squadOf(late.localPlayer);
    for (let i = 0; i < 150; i++) {
      fill();
      for (let c = 0; c < w.clients.length; c++) w.clients[c].setLocalInput(Math.cos(i / 20 + c), Math.sin(i / 20 + c));
      const n0 = corr.length;
      await w.tick();
      if (process.env.TRACE && corr.length > n0 && corr[corr.length - 1] > 10) {
        const mine = late.sim.squadOf(late.localPlayer);
        console.log(`  tick ${i} correction ${corr[corr.length - 1].toFixed(1)} | hôte : ancre ${lsq.anchor.x.toFixed(0)},${lsq.anchor.y.toFixed(0)} centre ${lsq.center.x.toFixed(0)},${lsq.center.y.toFixed(0)} soldats ${lsq.soldiers.length} | invité : ancre ${mine.anchor.x.toFixed(0)},${mine.anchor.y.toFixed(0)} centre ${mine.center.x.toFixed(0)},${mine.center.y.toFixed(0)} soldats ${mine.soldiers.length}`);
      }
    }
    const sizes = {};
    encodeSnapshot(takeSnapshot(hs), sizes);
    const sendsPerSec = 15;
    const perClient = (bytes / msgs) * sendsPerSec;
    const frag = Math.ceil(biggest / 1150);
    console.log(`  joueurs ${hs.squads.length}, soldats ${hs.squads.map((s) => s.soldiers.length).join('/')}, aliens ${hs.aliens.length}, projectiles ${hs.combat.projectiles.active.length}, globes ${hs.xp.orbs.length}`);
    console.log(`  snapshot moyen ${(bytes / msgs / 1024).toFixed(1)} Ko, plus gros ${(biggest / 1024).toFixed(1)} Ko ; détail ${Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)}`).join(', ')} Ko`);
    console.log(`  débit snapshots ≈ ${(perClient / 1024).toFixed(0)} Ko/s par invité, ${((perClient * w.clients.length) / 1024).toFixed(0)} Ko/s en sortie chez l'hôte (+ événements JSON ${((evBytes / 5) / 1024).toFixed(1)} Ko/s par invité)`);
    console.log(`  événements JSON par type (Ko/s par invité) : ${[...evTypes].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / 5 / 1024).toFixed(1)}`).join(', ')}`);
    console.log(`  le plus gros snapshot ≈ ${frag} paquets de 1150 o : avec 2 % de perte par paquet, ${(100 * (1 - 0.98 ** frag)).toFixed(0)} % de ces snapshots seraient perdus`);
    const seen = late.sim.aliens.length;
    check(Math.abs(seen - hs.aliens.length) <= hs.aliens.length * 0.1 + 10, 'le joueur arrivé en plein combat voit les aliens de l\'hôte', `${seen} contre ${hs.aliens.length}`);
    console.log(`  correction d'ancre de l'invité arrivé en dernier (latence 5 / 3, 3 % de perte) : ${fmt(stat(corr.slice(5)))}`);
  }
} finally {
  await vite.close();
}
console.log(failures === 0 ? '\nTout est OK' : `\n${failures} échec(s)`);
