// Netcode sous un réseau dégradé (perte, gigue avec réordonnancement, doublons, rafales, latence asymétrique) : scénarios de l'audit (docs/AUDIT_NETCODE.md).
// Usage : node scripts/net-loss-headless.mjs [scénario…]   (sans argument : tous) — scénarios : recon, resume, dup, events, upgrade, shots, hidden, tele, big
//   recon  : corrections de l'ancre prédite et à-coups de la squad d'un invité, sous 5 profils de réseau, + file d'inputs de l'hôte
//   resume : reprise après la pause de choix d'upgrade (saut en avant de la squad affichée de l'invité)
//   dup    : snapshots dupliqués / réordonnés : les aliens affichés chez le client s'arrêtent-ils ?
//   events : événements structurants (gameEnd / restart) avec 30 % de perte : combien en reçoit le client ?
//   shots  : balles de ma squad pendant une course (écart visuel balle / tireur, invité contre hôte)
//   tele   : stalactites, croix de pics, boules en cloche, kamikazes, Giant Crab, sortie du Scarab, charges sur la squad d'un invité : l'impact s'affiche-t-il chez lui au moment où l'hôte le calcule ?
//   big    : 4 joueurs (hôte + 3 invités), 40 soldats chacun, ~600 aliens et 2 boss, un invité rejoint en plein combat : taille et débit des snapshots,
//            corrections, écart réel et pas de l'ancre prédite de cet invité dans la horde (BIGTICKS=300 : plus long ; NOLEASHBIT=1 : laisse ignorée, comme en v77)
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
        host.advance(1000 / 30, (e) => w.onHostEvent?.(e));
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
      if (process.env.NOLEASHBIT) args[9] = undefined; // essai : l'invité ignore la laisse annoncée par l'hôte (comportement d'avant la v78)
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

  // ---------- shots ----------
  if (want('shots')) {
    console.log('\n=== shots : balles de ma squad pendant une course (invité, 20 soldats, aliens devant, latence 3 ticks par sens) ===');
    const w = await setup({ latency: 3, seed: 23 });
    const client = w.clients[0];
    const me = client.localPlayer;
    const hs = w.host.sim;
    const gsq = hs.squadOf(me);
    while (gsq.soldiers.length < 20) gsq.recruit('trooper', { x: gsq.center.x, y: gsq.center.y });
    for (let i = 0; i < 60; i++) await w.tick();
    const born = new Map(); // id (mod 65536) d'une balle de ma squad → tick de création chez l'hôte
    const seen = new Set();
    const gap = [], delay = [], rel = [];
    let tick = 0;
    // tireur de chaque balle : l'événement `shot` du même tick chez l'hôte, au plus près de la balle ; puis, à chaque tick hôte, position de la balle RELATIVE à son tireur
    let shotsNow = [];
    w.onHostEvent = (e) => { if (e.t === 'shot') shotsNow.push(e); };
    const shooter = new Map(); // id de balle → id du soldat tireur
    const hostRel = new Map(); // `${tick hôte}:${id}` → balle − tireur chez l'hôte
    for (const [mx, my] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      client.setLocalInput(mx, my);
      for (let i = 0; i < 75; i++) {
        tick++;
        if (i % 25 === 0) for (let k = 0; k < 6; k++) hs.horde.spawnAt('slime', gsq.center.x + mx * 260 + (k - 2.5) * 40 * (my !== 0 ? 1 : 0), gsq.center.y + my * 260 + (k - 2.5) * 40 * (mx !== 0 ? 1 : 0), 1, false, true);
        for (const q of hs.squads) for (const s of q.soldiers) s.hp = s.maxHp;
        shotsNow = [];
        await w.tick();
        for (const p of hs.combat.projectiles.active) {
          if (p.owner !== me || p.lob) continue;
          const id = p.id & 0xffff;
          if (!born.has(id)) {
            born.set(id, tick);
            let best = null, bd = 40;
            for (const e of shotsNow) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
            if (best) shooter.set(id, best.id);
          }
          const sid = shooter.get(id);
          const s = sid !== undefined ? gsq.soldiers.find((q) => q.id === sid) : null;
          if (s) hostRel.set(`${hs.tick}:${id}`, { x: p.x - s.x, y: p.y - s.y });
        }
        const mine = client.sim.squadOf(me)?.soldiers ?? [];
        for (const p of client.sim.combat.projectiles.active) {
          if (seen.has(p.id) || !born.has(p.id) || p.lob) continue;
          seen.add(p.id);
          let best = Infinity;
          for (const s of mine) best = Math.min(best, Math.hypot(s.x - p.x, s.y - p.y));
          gap.push(best);
          delay.push(tick - born.get(p.id));
          // écart visuel : balle par rapport à son tireur, chez l'invité (à l'écran) contre chez l'hôte (au tick du snapshot lu)
          const s = mine.find((q) => q.id === shooter.get(p.id));
          const h = hostRel.get(`${client.mirror.localTick}:${p.id}`);
          if (s && h) rel.push(Math.hypot(p.x - s.x - h.x, p.y - s.y - h.y));
        }
      }
    }
    console.log(`  SHOTS — ${gap.length} balles : distance au soldat affiché le plus proche à leur apparition (px) ${fmt(stat(gap))}`);
    console.log(`          retard d'apparition par rapport à l'hôte (ticks) ${fmt(stat(delay))}`);
    console.log(`          ÉCART VISUEL balle / tireur (invité contre hôte, px) ${fmt(stat(rel))} sur ${rel.length} balles`);
  }

  // ---------- hidden ----------
  if (want('hidden')) {
    console.log('\n=== hidden : onglet de l\'invité en arrière-plan 60 s (il reçoit mais n\'avance plus), en plein combat ===');
    const w = await setup({ latency: 2, seed: 17 });
    const client = w.clients[0];
    const hs = w.host.sim;
    const a = hs.squadOf(w.host.localPlayer);
    let maxBuf = 0;
    for (let i = 0; i < 1800; i++) {
      if (i % 30 === 0) for (let k = 0; k < 20; k++) hs.horde.spawnAt('slime', a.center.x + 300 * Math.cos(k), a.center.y + 300 * Math.sin(k), 1, false, true);
      for (const q of hs.squads) for (const s of q.soldiers) s.hp = s.maxHp;
      w.host.advance(1000 / 30, () => {}); // le client ne fait plus que recevoir (rAF suspendu)
      w.hub.pump();
      maxBuf = Math.max(maxBuf, client.eventBuffer.length);
    }
    console.log(`  HIDDEN — file d'événements en attente : ${client.eventBuffer.length} paquets (max ${maxBuf}), snapshots en attente ${client.buffer.length}`);
    for (let i = 0; i < 60; i++) await w.tick();
    check(client.eventBuffer.length < 10 && client.buffer.length < 10, 'au retour, les files se vident', `${client.eventBuffer.length} / ${client.buffer.length}`);
    check(Math.abs(client.sim.aliens.length - hs.aliens.length) <= 25, 'au retour, l\'invité voit les aliens de l\'hôte', `${client.sim.aliens.length} contre ${hs.aliens.length}`);
  }

  // ---------- tele ----------
  // Télégraphes au sol (stalactites, croix de pics, boules en cloche) posés sur la squad d'un invité qui bouge : à quel input de l'invité l'impact s'affiche-t-il
  // chez lui, comparé à l'input que l'hôte a joué au tick où il calcule les dégâts ? 0 = la fin du télégraphe tombe pile quand sa squad affichée est là où
  // l'hôte la juge ; > 0 = il voit l'impact trop tard (il croit être sorti à temps et prend les dégâts).
  if (want('tele')) {
    console.log('\n=== tele : fin des télégraphes chez l\'invité contre impact chez l\'hôte (en ticks d\'input de l\'invité) ===');
    const profiles = [
      ['latence 3 / 3', { latency: 3, cond: {} }],
      ['latence 5 / 3 + gigue 0-2, 3 % de perte', { latency: 3, cond: { loss: 0.03, jitter: 2, reorder: true }, slowDown: 5 }],
    ];
    for (const [label, prof] of profiles) {
      const w = await setup({ latency: prof.latency, seed: 3, aliens: false });
      const client = w.clients[0];
      if (process.env.NOTELE) client.mirror.measureTeleLead = () => { client.mirror.teleLead = 0; }; // essai : télégraphes non avancés (comportement d'avant)
      if (prof.slowDown) w.hub.latencyTo.set(client.localPlayer, prof.slowDown);
      const hs = w.host.sim;
      const gsq = hs.squadOf(client.localPlayer);
      const C = { aim: 0.6, sweep: 0.5, length: 150, width: 44, damage: 0 };
      const hostAt = new Map(); // clé → ack de l'invité au tick d'impact chez l'hôte
      const shownAt = new Map(); // clé → input de l'invité quand l'impact s'affiche chez lui
      const hostPrev = { st: new Map(), cr: new Map(), lob: new Map(), fu: new Map() };
      const cliPrev = { st: new Map(), cr: new Map(), lob: new Map(), fu: new Map() };
      // impact = un télégraphe vu actif (t > 0) qui passe à t ≤ 0 ou disparaît
      const scan = (prev, list, key, active, n, out) => {
        const now = new Map();
        for (const o of list) now.set(key(o), active(o));
        for (const [k, was] of prev) if (was && !now.get(k) && !out.has(k)) out.set(k, n);
        prev.clear();
        for (const [k, v] of now) prev.set(k, v);
      };
      const lobs = (sim) => sim.combat.projectiles.active.filter((p) => p.lob && p.team === 'aliens');
      for (let i = 0; i < 420; i++) {
        client.setLocalInput(Math.cos(i / 25), Math.sin(i / 25));
        if (i > 30 && i % 20 === 0) hs.addStalactite(gsq.center.x, gsq.center.y, 60, 0.8, 0, 0);
        if (i > 30 && i % 45 === 5) hs.addCross(gsq.center.x, gsq.center.y, C, 1);
        if (i > 30 && i % 25 === 15) hs.fuses.push({ id: hs.ids.get(), x: gsq.center.x + 40, y: gsq.center.y, t: 1, dur: 1, r: 95, dmg: 0, knock: 0, alien: 'kamikaze' });
        if (i > 30 && i % 30 === 10) hs.combat.launchLob(gsq.center.x + 200, gsq.center.y, gsq.center.x, gsq.center.y, 1, 0, 60, 'fx_blob_red', 'aliens', 'aliens');
        await w.tick();
        const ack = w.host.acks.get(client.localPlayer) ?? 0;
        scan(hostPrev.st, hs.stalactites, (o) => 's' + o.id, (o) => o.t > 0, ack, hostAt);
        scan(hostPrev.cr, hs.crosses, (o) => 'c' + o.id, (o) => o.t > 0, ack, hostAt);
        scan(hostPrev.lob, lobs(hs), (o) => 'l' + (o.id & 0xffff), (o) => o.life > 0, ack, hostAt);
        scan(hostPrev.fu, hs.fuses, (o) => 'f' + (o.id & 0xffff), (o) => o.t > 0, ack, hostAt);
        const cs = client.mirror.sim;
        scan(cliPrev.st, cs.stalactites, (o) => 's' + o.id, (o) => o.t > 1e-6, client.ticks, shownAt);
        scan(cliPrev.cr, cs.crosses, (o) => 'c' + o.id, (o) => o.t > 1e-6, client.ticks, shownAt);
        scan(cliPrev.lob, lobs(cs), (o) => 'l' + o.id, (o) => o.life > 1e-6, client.ticks, shownAt);
        scan(cliPrev.fu, cs.fuses, (o) => 'f' + o.id, (o) => o.t > 1e-6, client.ticks, shownAt);
      }
      const byKind = { s: [], c: [], l: [], f: [] };
      for (const [k, n] of shownAt) if (hostAt.has(k)) byKind[k[0]].push(n - hostAt.get(k));
      const sfmt = (a) => (a.length ? `moy ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}, de ${Math.min(...a)} à ${Math.max(...a)} (${a.length})` : '-');
      console.log(`- ${label}`);
      console.log(`    stalactites : ${sfmt(byKind.s)} ; croix (début des pics) : ${sfmt(byKind.c)} ; boules en cloche : ${sfmt(byKind.l)} ; kamikazes : ${sfmt(byKind.f)}`);
    }
    // Giant Crab : atterrissage du saut (impact) et départ de la couronne de pics, même mesure
    {
      const w = await setup({ latency: 3, seed: 3 });
      const client = w.clients[0];
      if (process.env.NOTELE) client.mirror.measureTeleLead = () => { client.mirror.teleLead = 0; };
      w.hub.latencyTo.set(client.localPlayer, 5);
      Object.assign(w.hub.conditions, { loss: 0.03, jitter: 2, reorder: true });
      const hs = w.host.sim;
      const gsq = hs.squadOf(client.localPlayer);
      const hostAt = new Map(), shownAt = new Map();
      let jumps = 0;
      w.onHostEvent = (e) => { if (e.t === 'slam') hostAt.set('j' + jumps++, w.host.acks.get(client.localPlayer) ?? 0); };
      let cjumps = 0;
      let crab = null;
      const ringH = new Map(), ringC = new Map();
      for (let i = 0; i < 600; i++) {
        if (!crab || !crab.alive) {
          hs.aliens.length = 0;
          hs.horde.spawnAt('boss_crab', gsq.center.x + 300, gsq.center.y, 1, false, true);
          crab = hs.aliens.find((a) => a.def.id === 'boss_crab');
        }
        for (let k = hs.aliens.length - 1; k >= 0; k--) if (hs.aliens[k] !== crab) hs.aliens.splice(k, 1);
        crab.hp = crab.maxHp;
        if (crab.leapT <= 0 && crab.lurkPhase === 0) crab.leapCd = Math.min(crab.leapCd, 0.3);
        for (const s of gsq.soldiers) s.hp = s.maxHp;
        client.setLocalInput(Math.cos(i / 25), Math.sin(i / 25));
        await w.tick();
        const ack = w.host.acks.get(client.localPlayer) ?? 0;
        const hp = crab.lurkPhase;
        if (hp === 4 && ringH.get('p') === 3) hostAt.set('r' + (ringH.get('n') ?? 0), ack), ringH.set('n', (ringH.get('n') ?? 0) + 1);
        ringH.set('p', hp);
        for (const e of w.events.get(client).splice(0)) if (e.t === 'slam') shownAt.set('j' + cjumps++, client.ticks);
        const cc = client.mirror.sim.aliens.find((a) => a.def.id === 'boss_crab');
        const cp = cc ? cc.lurkPhase : 0;
        if (cp === 4 && ringC.get('p') === 3) shownAt.set('r' + (ringC.get('n') ?? 0), client.ticks), ringC.set('n', (ringC.get('n') ?? 0) + 1);
        ringC.set('p', cp);
      }
      const j = [], r = [];
      for (const [k, n] of shownAt) if (hostAt.has(k)) (k[0] === 'j' ? j : r).push(n - hostAt.get(k));
      const sfmt = (a) => (a.length ? `moy ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}, de ${Math.min(...a)} à ${Math.max(...a)} (${a.length})` : '-');
      console.log('- Giant Crab, latence 5 / 3 + gigue 0-2, 3 % de perte');
      console.log(`    atterrissage du saut : ${sfmt(j)} ; départ de la couronne de pics : ${sfmt(r)}`);
    }
    // Scarab : sortie de terre (onde de choc) sur la squad de l'invité ; quand (ticks) et où (px) l'invité la voit, contre l'hôte
    {
      const w = await setup({ latency: 3, seed: 3 });
      const client = w.clients[0];
      w.hub.latencyTo.set(client.localPlayer, 5);
      Object.assign(w.hub.conditions, { loss: 0.03, jitter: 2, reorder: true });
      if (process.env.NOTELE) client.mirror.measureTeleLead = () => { client.mirror.teleLead = 0; };
      const hs = w.host.sim;
      const gsq = hs.squadOf(client.localPlayer);
      const hostSlams = [], cliSlams = [];
      w.onHostEvent = (e) => { if (e.t === 'slam') hostSlams.push({ n: w.host.acks.get(client.localPlayer) ?? 0, x: e.x, y: e.y }); };
      let sc = null;
      for (let i = 0; i < 900; i++) {
        if (!sc || !sc.alive) {
          hs.aliens.length = 0;
          hs.horde.spawnAt('boss_scarab', gsq.center.x + 300, gsq.center.y, 1, false, true);
          sc = hs.aliens.find((a) => a.def.id === 'boss_scarab');
        }
        for (let k = hs.aliens.length - 1; k >= 0; k--) if (hs.aliens[k] !== sc) hs.aliens.splice(k, 1);
        hs.stalactites.length = 0;
        sc.hp = sc.maxHp;
        if (sc.lurkPhase === 0) sc.leapCd = Math.min(sc.leapCd, 0.3);
        for (const s of gsq.soldiers) s.hp = s.maxHp;
        // course en zigzag : le verrouillage de l'axe et la poursuite sur l'axe comptent
        client.setLocalInput(Math.cos(i / 18), Math.sin(i / 31));
        await w.tick();
        for (const e of w.events.get(client).splice(0)) if (e.t === 'slam') cliSlams.push({ n: client.ticks, x: e.x, y: e.y });
      }
      // appariement : la sortie vue par l'invité la plus proche (moment ± 60 ticks, position à moins de 250 px) ; une sortie jamais vue compte à part
      const dn = [], dp = [];
      let missed = 0;
      const used = new Set();
      for (const h of hostSlams) {
        let best = -1;
        for (let i = 0; i < cliSlams.length; i++) {
          const c = cliSlams[i];
          if (used.has(i) || Math.abs(c.n - h.n) > 60 || Math.hypot(c.x - h.x, c.y - h.y) > 250) continue;
          if (best < 0 || Math.abs(c.n - h.n) < Math.abs(cliSlams[best].n - h.n)) best = i;
        }
        if (best < 0) { missed++; continue; }
        used.add(best);
        dn.push(cliSlams[best].n - h.n);
        dp.push(Math.hypot(cliSlams[best].x - h.x, cliSlams[best].y - h.y));
        if (process.env.TRACE) console.log(`    sortie hôte ${h.x.toFixed(0)},${h.y.toFixed(0)} (input ${h.n}) invité ${cliSlams[best].x.toFixed(0)},${cliSlams[best].y.toFixed(0)} (input ${cliSlams[best].n})`);
      }
      const sfmt = (a, f = 0) => (a.length ? `moy ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}, de ${Math.min(...a).toFixed(f)} à ${Math.max(...a).toFixed(f)} (${a.length})` : '-');
      console.log('- Scarab, latence 5 / 3 + gigue 0-2, 3 % de perte');
      console.log(`    sortie de terre : moment ${sfmt(dn)} ; écart de position ${sfmt(dp)} px ; jamais vues ${missed} / ${hostSlams.length}`);
    }
    // Charges (chargeur, Rhino Alpha) sur la squad de l'invité : position de l'alien affichée chez l'invité à son input n, contre celle de l'hôte après
    // avoir joué ce même input (ce que l'invité doit esquiver), pendant les charges ; et instant de l'arrêt contre un obstacle
    for (const kind of ['charger', 'boss_rhino']) {
      const w = await setup({ latency: 3, seed: 3 });
      const client = w.clients[0];
      w.hub.latencyTo.set(client.localPlayer, 5);
      Object.assign(w.hub.conditions, { loss: 0.03, jitter: 2, reorder: true });
      if (process.env.NOTELE) client.mirror.measureTeleLead = () => { client.mirror.teleLead = 0; };
      const hs = w.host.sim;
      const gsq = hs.squadOf(client.localPlayer);
      const hostAt = new Map(); // input → position hôte de l'alien (pendant une charge)
      const shown = new Map(); // input → position affichée chez l'invité
      let al = null;
      let charges = 0;
      for (let i = 0; i < 600; i++) {
        if (!al || !al.alive) {
          hs.aliens.length = 0;
          hs.horde.spawnAt(kind, gsq.center.x + 450, gsq.center.y + 60, 1, false, true);
          al = hs.aliens.find((a) => a.def.id === kind);
        }
        for (let k = hs.aliens.length - 1; k >= 0; k--) if (hs.aliens[k] !== al) hs.aliens.splice(k, 1);
        al.hp = al.maxHp;
        if (al.rushWind <= 0 && al.rushT <= 0) al.rushCd = Math.min(al.rushCd, 0.2);
        for (const s of gsq.soldiers) s.hp = s.maxHp;
        client.setLocalInput(Math.cos(i / 22), Math.sin(i / 35));
        const was = al.rushT > 0;
        await w.tick();
        if (!was && al.rushT > 0) charges++;
        const ack = w.host.acks.get(client.localPlayer) ?? 0;
        if (al.rushT > 0 && !hostAt.has(ack)) hostAt.set(ack, { x: al.x, y: al.y });
        const ca = client.mirror.sim.aliens.find((a) => a.def.id === kind);
        if (ca) shown.set(client.ticks, { x: ca.x, y: ca.y });

      }
      const err = [];
      for (const [n, h] of hostAt) { const c = shown.get(n); if (c) { err.push(Math.hypot(c.x - h.x, c.y - h.y)); if (process.env.TRACE && err[err.length - 1] > 120) console.log(`    input ${n} hôte ${h.x.toFixed(0)},${h.y.toFixed(0)} affiché ${c.x.toFixed(0)},${c.y.toFixed(0)}`); } }
      console.log(`- ${kind === 'charger' ? 'chargeur' : 'Rhino Alpha'}, latence 5 / 3 + gigue 0-2, 3 % de perte : ${charges} charges`);
      console.log(`    position affichée / hôte au même input, pendant les charges (px) : ${fmt(stat(err))}`);
      if (process.env.TRACE) { const along = []; for (const [n, h] of hostAt) { const c = shown.get(n); const p = hostAt.get(n - 1); if (c && p) { const dx = h.x - p.x, dy = h.y - p.y, l = Math.hypot(dx, dy) || 1; along.push(((c.x - h.x) * dx + (c.y - h.y) * dy) / l); } } console.log('    écart le long de la charge (+ = affiché en avance) : ' + fmt(stat(along)) + ' ; moy signée ' + (along.reduce((x, y) => x + y, 0) / along.length).toFixed(1)); }
    }
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
    // écart réel : ancre prédite par l'invité après son input n contre ancre de l'hôte après avoir joué ce même input (ce que l'invité voit de faux)
    const predicted = new Map(), played = new Map(), moves = [];
    const pr = late.mirror.predictor;
    const origStep = pr.step.bind(pr);
    let px = null, py = null;
    pr.step = (arena, n, ...rest) => {
      const held = origStep(arena, n, ...rest);
      if (px !== null) moves.push(Math.hypot(pr.anchor.x - px, pr.anchor.y - py)); // pas affiché de l'ancre prédite (rejeu du snapshot compris)
      px = pr.anchor.x;
      py = pr.anchor.y;
      if (pr.active && !held) predicted.set(n, { x: pr.anchor.x, y: pr.anchor.y });
      return held;
    };
    const ticks = Number(process.env.BIGTICKS ?? 150);
    for (let i = 0; i < ticks; i++) {
      fill();
      for (let c = 0; c < w.clients.length; c++) w.clients[c].setLocalInput(Math.cos(i / 20 + c), Math.sin(i / 20 + c));
      const n0 = corr.length;
      await w.tick();
      const ack = w.host.acks.get(late.localPlayer);
      if (ack !== undefined && !played.has(ack)) played.set(ack, { x: lsq.anchor.x, y: lsq.anchor.y });
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
    const gaps = [...played].filter(([n]) => predicted.has(n)).slice(10).map(([n, h]) => Math.hypot(predicted.get(n).x - h.x, predicted.get(n).y - h.y));
    console.log(`  écart réel ancre prédite / ancre hôte au même input (px) : ${fmt(stat(gaps))} (${gaps.length} inputs, ${ticks} ticks)`);
    console.log(`  pas de l'ancre prédite par tick (px, croisière ≈ 7,6) : ${fmt(stat(moves.slice(10)))}`);
  }
} finally {
  await vite.close();
}
console.log(failures === 0 ? '\nTout est OK' : `\n${failures} échec(s)`);
