// Vérifie dans Node (sans navigateur) quelques règles de combat : gel (état du soldat, 50 PV de gel, 1 PV par coup allié, dégel par ses alliés, attaquable par les aliens,
// coups alliés ignorés 0,5 s au début), mêlée en zone du chargeur, nuage du cracheur, escalade des aliens après la mort d'un boss, repos du chaman après 3 résurrections, plus aucun bouclier de soldat.
// Usage : npm run sim:combat (dans games/xiao-swarm)
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const { LocalSession } = await vite.ssrLoadModule('/src/net/Session.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { ALIENS } = await vite.ssrLoadModule('/src/data/aliens.ts');
  const { DIFFICULTY, RELOCATE, GEM_CHEST, SPECIAL_RECRUIT_CHANCE, KNOCK_HOP, TEST_FLAGS } = await vite.ssrLoadModule('/src/config.ts');
  TEST_FLAGS.allBossAbilities = false; // les capacités de boss par niveau se testent niveau par niveau (le drapeau de test les active toutes en Normal)

  const fresh = (seed, difficulty = 'normal') => {
    const session = new LocalSession({ mode: MODES.survival, seed, bots: 0, difficulty });
    const step = (ticks = 1) => {
      for (let i = 0; i < ticks; i++) session.advance(34, () => {});
    };
    step(2);
    return { session, sim: session.sim, step };
  };
  const clearAliens = (sim) => {
    sim.aliens.length = 0;
  };

  // ---- chargeur : un coup de mêlée touche tous les soldats autour de lui
  {
    const { sim, step } = fresh(21);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    while (sq.soldiers.length < 4) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
    const near = sq.soldiers.slice(0, 3);
    near.forEach((s, i) => { s.x = sq.center.x + (i - 1) * 30; s.y = sq.center.y; s.px = s.x; s.py = s.y; s.invulnerable = 0; });
    const hp0 = near.map((s) => s.hp);
    sim.horde.spawnAt('charger', sq.center.x, sq.center.y + 20, 1, false);
    const c = sim.aliens.find((a) => a.def.id === 'charger');
    c.rushCd = 1e9; c.attackCd = 0; c.hp = c.maxHp = 1e9;
    sim.horde.update(0.001);
    const hit = near.filter((s, i) => s.hp < hp0[i]).length;
    check(hit >= 2, 'chargeur : la mêlée touche plusieurs soldats d’un coup', `${hit} soldats touchés`);
  }

  // ---- cracheur : plus de flaque à l'impact ; nuage ralentissant retiré pour l'instant (08/10)
  {
    const { sim, step } = fresh(22);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 1e9;
    sim.horde.spawnAt('spitter', sq.center.x + 300, sq.center.y, 1, false);
    const sp = sim.aliens.find((a) => a.def.id === 'spitter');
    sp.hp = sp.maxHp = 1e9;
    sp.cloudCd = 1e9;
    step(30 * 4); // il crache sans faire de nuage
    check(sim.puddles.length === 0, 'cracheur : ses boules ne laissent plus de flaque', `${sim.puddles.length} flaque(s)`);
    sp.cloudCd = 0;
    step(30 * 7);
    check(!ALIENS.spitter.cloud && sim.puddles.length === 0, 'cracheur : plus de nuage ralentissant (retiré pour l’instant)', `${sim.puddles.length} nuage(s)`);
  }

  // ---- chaman : 2 petits nuages de glace autour de la squad ; un soldat qui y entre est gelé
  {
    const { sim, step } = fresh(23);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('shaman', sq.center.x + 320, sq.center.y, 1, false);
    const sh = sim.aliens.find((a) => a.def.id === 'shaman');
    sh.hp = sh.maxHp = 1e9;
    sh.cloudCd = 0;
    step(2);
    const frosts = sim.puddles.filter((p) => p.frost);
    check(frosts.length === 2 && frosts.every((p) => p.r === 25.5 && p.ttl > 9.5), 'chaman : 2 petits nuages de glace (10 s)', `${frosts.length} nuage(s)`);
    const gapToSquad = Math.min(...frosts.map((p) => Math.min(...sq.soldiers.map((s) => Math.hypot(p.x - s.x, p.y - s.y) - p.r - s.radius))));
    check(gapToSquad >= 80, 'chaman : nuages autour de la squad, à bonne distance de chaque soldat', `${Math.round(gapToSquad)} px au plus près`);
    check(sim.slowAt(frosts[0].x, frosts[0].y, 10) === 1, 'nuage de glace : ne ralentit pas');
    const s = sq.soldiers[0];
    s.invulnerable = 0;
    s.x = s.px = frosts[0].x;
    s.y = s.py = frosts[0].y;
    sim.aliens = sim.aliens.filter((a) => a === sh); // isole
    step(1);
    check(s.frozen === 50 && !sim.aliens.some((a) => a !== sh), 'nuage de glace : le soldat qui y entre est gelé (50 PV de gel, aucun alien créé)', `${s.frozen}`);
    check(sim.puddles.filter((p) => p.frost).length === 1, 'nuage de glace : consommé par le gel (1 des 2 reste)');
  }

  // ---- aucun bouclier de soldat
  {
    const { sim } = fresh(11);
    check(sim.squads.every((sq) => sq.soldiers.every((s) => s.shield === 0 && s.maxShield === 0)), 'aucun soldat n’a de bouclier au départ');
    check(typeof sim.squads[0].shieldAll !== 'function' && typeof sim.squads[0].shield !== 'function', 'plus de méthode de bouclier sur la squad');
  }

  // ---- gel : état du soldat (50 PV de gel), 1 PV par coup allié, attaquable par les aliens, dégelé par ses alliés
  {
    const { sim, step } = fresh(12);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const s = sq.soldiers[0];
    sim.horde.freezeSoldier(s);
    check(s.frozen === 50 && !sim.aliens.length, 'gel : 50 PV de gel sur le soldat, aucun alien « glaçon »', `${s.frozen}`);
    const hpBefore = s.hp;
    sim.damage(s, 30, 'p1');
    check(s.frozen === 50 && s.iceInvuln > 0, 'gel : les coups alliés ne comptent pas au tout début', `${s.frozen} PV de gel, ${s.iceInvuln.toFixed(2)} s`);
    s.iceInvuln = 0; // la suite mesure les coups
    sim.damage(s, 30, 'p1');
    check(s.frozen === 49 && s.hp === hpBefore, 'gel : un coup allié (30 de dégâts) retire 1 PV de gel, aucun PV au soldat', `${s.frozen} gel, ${s.hp} PV`);
    for (let i = 0; i < 10; i++) sim.damage(s, 500, 'p1');
    check(s.frozen === 39, 'gel : 10 coups = 10 PV de gel, quelle que soit la puissance', `${s.frozen}`);
    const x0 = s.x;
    s.kx = 900;
    step(5);
    check(Math.abs(s.x - x0) < 0.01, 'gel : le soldat ne bouge plus (ni recul)');
    check(!s.target, 'gel : le soldat ne vise ni ne tire');

    // des slimes collés au soldat gelé : ils le frappent directement
    s.frozen = 50;
    for (const o of sq.soldiers) if (o !== s) { o.invulnerable = 1e9; o.x = s.x + 1500; o.y = s.y + 1500; o.px = o.x; o.py = o.y; } // les autres, loin : ils ne dégèlent pas pendant la mesure
    const hp0 = s.hp;
    for (let i = 0; i < 2; i++) sim.horde.spawnAt('slime', s.x + (i - 0.5) * 8, s.y + 8, 1, false);
    for (const a of sim.aliens) a.hp = a.maxHp = 1e9; // ils survivent pendant la mesure
    step(30);
    check(s.alive && s.hp < hp0, 'soldat gelé : les aliens le frappent directement', `${hp0.toFixed(1)} → ${s.hp.toFixed(1)} PV`);
    check(s.frozen === 50, 'soldat gelé : les coups des aliens ne brisent pas la glace', `${s.frozen}`);
    s.invulnerable = 0;
    sim.damageSoldier(s, 1e9);
    check(!s.alive && s.frozen === 0, 'gel : mort dans la glace, plus de gel');
  }
  {
    // 50 coups alliés pour le libérer
    const { sim } = fresh(15);
    clearAliens(sim);
    const s = sim.squadOf('p1').soldiers[0];
    sim.horde.freezeSoldier(s);
    s.iceInvuln = 0;
    for (let i = 0; i < 49; i++) sim.damage(s, 5, 'p1');
    check(s.frozen === 1, 'gel : encore gelé (1 PV) après 49 coups');
    sim.damage(s, 5, 'p1');
    check(s.frozen === 0 && s.invulnerable > 0, 'gel : libéré au 50e coup (brève protection)');
  }
  {
    // en vrai : les alliés visent d'eux-mêmes le soldat gelé et le libèrent, sans le blesser
    const { sim, step } = fresh(16);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    while (sq.soldiers.length < 4) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
    const s = sq.soldiers[0];
    const hp0 = s.hp;
    sim.horde.freezeSoldier(s);
    let t = 0;
    while (s.frozen > 0 && t < 30 * 30) { clearAliens(sim); step(1); t++; } // la timeline envoie des vagues (les 2 premières tout près) : aucun alien ne doit blesser le soldat
    check(s.frozen === 0, 'gel : ses alliés tirent sur la glace et le libèrent', `${(t / 30).toFixed(1)} s`);
    check(s.hp === hp0, 'gel : les tirs alliés ne le blessent pas', `${hp0} → ${s.hp}`);
  }

  // ---- trou d'apparition : un alien qui en sort est invulnérable (ALIEN_SPAWN_HOLD), puis touchable
  {
    const { sim } = fresh(17);
    clearAliens(sim);
    sim.horde.spawnAt('slime', 500, 500, 1, false);
    const a = sim.aliens[0];
    a.hp = a.maxHp = 100;
    sim.damage(a, 30, 'p1');
    check(a.hp === 100 && sim.horde.isEmerging(a), 'trou d’apparition : alien invulnérable tant qu’il en sort', `${a.hp} PV`);
    a.age = 0.8;
    sim.damage(a, 30, 'p1');
    check(a.hp === 70 && !sim.horde.isEmerging(a), 'trou d’apparition : touchable une fois sorti', `${a.hp} PV`);
  }

  // ---- escalade : +10 % par boss tué
  {
    const { sim } = fresh(13);
    clearAliens(sim);
    sim.horde.spawnAt('slime', 500, 500, 1, false);
    const a0 = sim.aliens[0];
    check(a0.escDmg === 1 && a0.escRate === 1 && a0.escSpeed === 1 && sim.escalationHp === 1, 'escalade : aucun boss tué = ×1');
    sim.horde.spawnAt('boss_gling', 800, 800, 1, false);
    const boss = sim.aliens.find((a) => a.def.boss);
    boss.age = 1; // sorti de son trou d'apparition (invulnérable avant)
    sim.damage(boss, 1e12, 'p1');
    check(sim.bossKills === 1 && Math.abs(sim.escalationHp - (1 + DIFFICULTY.bossEscalationHp)) < 1e-9, 'escalade : un boss tué = ×(1 + gain)', `bossKills ${sim.bossKills}`);
    sim.horde.spawnAt('slime', 520, 500, 1, false);
    const a1 = sim.aliens[sim.aliens.length - 1];
    check(Math.abs(a1.maxHp / a0.maxHp - (1 + DIFFICULTY.bossEscalationHp)) < 1e-6 && a1.escDmg === 1 + DIFFICULTY.bossEscalationDamage && a1.escRate === 1 + DIFFICULTY.bossEscalationRate && a1.escSpeed === 1 + DIFFICULTY.bossEscalationSpeed, `escalade : un slime apparu après a +${Math.round(DIFFICULTY.bossEscalationHp * 100)} % de PV, +${Math.round(DIFFICULTY.bossEscalationDamage * 100)} % de dégâts, +${Math.round(DIFFICULTY.bossEscalationRate * 100)} % de cadence, +${Math.round(DIFFICULTY.bossEscalationSpeed * 100)} % de vitesse (réglages séparés)`, `${(a1.maxHp / a0.maxHp).toFixed(3)}`);
    sim.horde.spawnAt('boss_rhino', 900, 900, 1, false);
    const rhino = sim.aliens.find((a) => a.def.id === 'boss_rhino');
    rhino.age = 1;
    sim.damage(rhino, 1e12, 'p1');
    check(Math.abs(sim.escalationHp - (1 + DIFFICULTY.bossEscalationHp) ** 2) < 1e-9 && Math.abs(sim.escalationSpeed - (1 + DIFFICULTY.bossEscalationSpeed) ** 2) < 1e-9, 'escalade : cumulée (2 boss = ×(1 + gain)²)', `PV ${sim.escalationHp.toFixed(3)}, vitesse ${sim.escalationSpeed.toFixed(3)}`);
    sim.restart();
    check(sim.bossKills === 0 && sim.escalationHp === 1 && sim.escalationSpeed === 1, 'escalade : remise à zéro à la relance de la partie');
  }

  // ---- chaman : à sa mort, 5 araignées (invoquées : ni XP ni recrue) ; pas pendant le clear screen d'un boss
  {
    const { sim, step } = fresh(15);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const o of sq.soldiers) o.invulnerable = 1e9;
    check(ALIENS.shaman.deathSpawn?.spawn === 'spider' && ALIENS.shaman.deathSpawn?.count === 5, 'chaman : 5 araignées à sa mort (données)');
    sim.horde.spawnAt('shaman', sq.center.x + 400, sq.center.y, 1, false);
    step(60); // le chaman sort d'abord de terre (intouchable pendant ce temps)
    const sh = sim.aliens.find((a) => a.def.id === 'shaman');
    sim.damage(sh, 1e9, 'p1');
    step(2);
    const spiders = sim.aliens.filter((a) => a.def.id === 'spider' && a.alive);
    check(spiders.length === 5, 'chaman tué : 5 araignées apparaissent autour de son corps', `${spiders.length} araignée(s)`);
    check(spiders.every((a) => a.noXp && a.noRecruit && Math.hypot(a.x - sh.x, a.y - sh.y) < 80), 'araignées du chaman : sans XP ni recrue, près du cadavre');
    check(spiders.every((a) => a.instant && !sim.horde.isEmerging(a) && sim.horde.targetable(a)), 'araignées du chaman : surgissent sur place (pas enterrées, ciblables tout de suite)');
    // clear screen : un boss tué emporte le chaman sans qu'il laisse d'araignées
    clearAliens(sim);
    sim.horde.spawnAt('shaman', sq.center.x + 400, sq.center.y, 1, false);
    sim.horde.spawnAt('boss_gling', sq.center.x - 400, sq.center.y, 1, false);
    step(60);
    const boss = sim.aliens.find((a) => a.def.id === 'boss_gling');
    sim.damage(boss, 1e9, 'p1');
    step(2);
    check(!sim.aliens.some((a) => a.def.id === 'spider' && a.alive), 'boss tué (clear screen) : le chaman ne laisse pas d’araignées');
  }

  // ---- chaman : repos de 30 s après 3 résurrections
  {
    const { sim, step } = fresh(14);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const r = ALIENS.shaman.revive;
    check(r.maxRevives === 3 && r.lockout === 30, 'chaman : 3 résurrections puis 30 s de repos (données)');
    for (const o of sq.soldiers) o.invulnerable = 1e9;
    const relocateAfter = RELOCATE.after;
    RELOCATE.after = Infinity; // le chaman est posé loin de la squad exprès : pas de recyclage des traînards pendant ce test
    sim.horde.spawnAt('shaman', sq.center.x + 3000, sq.center.y + 3000, 1, false);
    const sh = sim.aliens.find((a) => a.def.id === 'shaman');
    sh.hp = sh.maxHp = 1e12;
    let casts = 0;
    let wasCasting = false;
    let lockStart = -1;
    let castedWhileLocked = false;
    let lockEnd = -1;
    for (let t = 0; t < 30 * 140; t++) {
      // des flaques à portée en permanence : il a toujours de quoi ressusciter
      if (sim.corpses.length < 4) sim.corpses.push({ id: sim.ids.get(), x: sh.x + 40, y: sh.y + 30, type: 'slime', ttl: 60, claimed: 0 });
      for (let i = sim.aliens.length - 1; i >= 0; i--) if (sim.aliens[i] !== sh) sim.aliens.splice(i, 1); // les zombies disparaissent : pas d'XP, pas de montée de niveau qui figerait la partie
      step(1);
      const casting = sh.castT > 0;
      if (casting && !wasCasting) {
        casts++;
        if (sh.reviveLock > 0) castedWhileLocked = true;
      }
      wasCasting = casting;
      const now = sim.tick / 30;
      if (sh.reviveLock > 0 && lockStart < 0) lockStart = now;
      if (lockStart >= 0 && sh.reviveLock <= 0 && lockEnd < 0) lockEnd = now;
    }
    check(lockStart >= 0, 'chaman : un repos se déclenche après 3 résurrections', `à ${lockStart.toFixed(1)} s`);
    check(!castedWhileLocked, 'chaman : aucune incantation pendant le repos');
    check(lockEnd > lockStart && Math.abs(lockEnd - lockStart - 30) < 1, 'chaman : le repos dure 30 s', `${(lockEnd - lockStart).toFixed(1)} s`);
    check(casts > 3, 'chaman : il recommence à ressusciter après le repos', `${casts} incantations`);
    RELOCATE.after = relocateAfter;
  }

  // ---- Scarab : sous terre, le télégraphe vise le centre de la squad (sans anticipation), se verrouille `lock` s avant la sortie ;
  //      une squad qui en sort à temps n'est pas touchée
  {
    const { sim, step } = fresh(16, 'expert');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const B = ALIENS.boss_scarab.burrow;
    sim.horde.spawnAt('boss_scarab', sq.center.x + 500, sq.center.y, 1, false);
    const sc = sim.aliens[0];
    sc.age = 99;
    sc.hp = sc.maxHp = 1e12;
    sc.slamCd = 1e9; // pas de slam : on ne teste que la sortie de terre
    sc.leapCd = 0;
    let ticks = 0;
    while (sc.lurkPhase !== 2 && ticks++ < 120) step();
    step(3);
    const aimErr = Math.hypot(sc.leapX - sq.center.x, sc.leapY - sq.center.y);
    check(sc.lurkPhase === 2 && aimErr < 5, 'Scarab : sous terre, le télégraphe vise le centre de la squad (sans anticipation)', `écart ${aimErr.toFixed(1)} px`);
    while (sc.lurkT > B.lock && ticks++ < 400) step();
    const locked = { x: sc.leapX, y: sc.leapY };
    const hp0 = sq.soldiers.reduce((n, s) => n + s.hp, 0);
    // la squad fuit dès le verrouillage : 1,5 s à pleine vitesse, elle sort de la zone (rayon `radius`)
    const input = new Map([['p1', { mx: -1, my: 0 }]]);
    while (sc.lurkPhase === 2 && ticks++ < 400) {
      sim.step(1 / 30, input);
      sim.aliens.splice(1); // le Scarab seul
    }
    const drift = Math.hypot(sc.x - locked.x, sc.y - locked.y);
    const hp1 = sq.soldiers.reduce((n, s) => n + s.hp, 0);
    check(drift < 1 && Math.abs(B.lock - 1.5) < 0.01, 'Scarab : la sortie se verrouille 1,5 s avant et il ressort au point verrouillé', `${drift.toFixed(1)} px du point verrouillé`);
    check(hp1 >= hp0 - 0.01, 'Scarab : une squad qui s’écarte pendant le verrouillage n’est pas touchée', `PV ${hp0.toFixed(0)} → ${hp1.toFixed(0)}`);
    // en ressortant : il vise où sera la squad dans `lead` s (elle fuit vers la gauche) et fonce vers ce point, direction verrouillée
    const lead = { x: sq.center.x + sq.vel.x * B.lead, y: sq.center.y + sq.vel.y * B.lead };
    const aimOk = sc.lurkPhase === 3 && Math.hypot(sc.leapX - lead.x, sc.leapY - lead.y) < 40 && sq.vel.x < -100;
    check(aimOk, 'Scarab : en ressortant, il vise la position anticipée de la squad', `point visé à ${Math.hypot(sc.leapX - lead.x, sc.leapY - lead.y).toFixed(0)} px de l’anticipation`);
    const dir0 = { x: sc.rushDx, y: sc.rushDy };
    const start = { x: sc.x, y: sc.y };
    const up = new Map([['p1', { mx: 0, my: -1 }]]); // la squad change de direction : lui, non
    let turned = false;
    while (sc.lurkPhase !== 4 && ticks++ < 400) {
      sim.step(1 / 30, up);
      sim.aliens.splice(1);
    }
    const S = ALIENS.boss_scarab.stalactites;
    const stalAtExit = sim.stalactites.length;
    for (let i = 0; i < 20 && sc.lurkPhase === 4; i++) {
      sim.step(1 / 30, up);
      sim.aliens.splice(1);
      if (Math.abs(sc.rushDx - dir0.x) > 1e-6 || Math.abs(sc.rushDy - dir0.y) > 1e-6) turned = true;
    }
    const mv = { x: sc.x - start.x, y: sc.y - start.y };
    const along = (mv.x * dir0.x + mv.y * dir0.y) / (Math.hypot(mv.x, mv.y) || 1);
    check(!turned && along > 0.95 && Math.hypot(mv.x, mv.y) > 50, 'Scarab : il fonce tout droit vers ce point sans changer de direction', `${Math.hypot(mv.x, mv.y).toFixed(0)} px parcourus, alignement ${along.toFixed(2)}`);
    // une fois ressorti : pluie de stalactites sur la squad (zones annoncées, puis 80 dégâts à l'impact) ; plus de slam
    check(!ALIENS.boss_scarab.slam && stalAtExit === S.count, 'Scarab : sorti de terre, il annonce une pluie de stalactites (plus de slam)', `${stalAtExit} zones`);
    const target = sq.soldiers.find((s) => s.alive);
    for (const s of sq.soldiers) s.invulnerable = 0;
    target.hp = target.maxHp = 1000;
    sim.stalactites.length = 1;
    Object.assign(sim.stalactites[0], { x: target.x, y: target.y, t: 0.01 });
    sim.step(1 / 30, new Map());
    check(Math.abs(1000 - target.hp - S.damage * sc.escDmg) < 0.01 && sim.stalactites.length === 0, 'Scarab : une stalactite qui tombe sur un soldat lui retire 80 PV', `${(1000 - target.hp).toFixed(0)} dégâts`);
  }

  // ---- Scarab : pendant le verrouillage, la direction du télégraphe est figée mais il suit encore la squad sur cet axe :
  //      filer tout droit ne suffit pas (il ressort dessus), s'écarter sur le côté oui
  for (const [label, after] of [['tout droit', { mx: -1, my: 0 }], ['sur le côté', { mx: 0, my: -1 }]]) {
    const { sim, step } = fresh(16, 'expert');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const B = ALIENS.boss_scarab.burrow;
    sim.horde.spawnAt('boss_scarab', sq.center.x + 500, sq.center.y, 1, false);
    const sc = sim.aliens[0];
    sc.age = 99;
    sc.hp = sc.maxHp = 1e12;
    sc.leapCd = 0;
    const left = new Map([['p1', { mx: -1, my: 0 }]]);
    const turn = new Map([['p1', after]]);
    let ticks = 0;
    while (sc.lurkT > B.lock || sc.lurkPhase !== 2) {
      if (ticks++ > 600) break;
      sim.step(1 / 30, left); // la squad court déjà vers la gauche au moment du verrouillage
      sim.aliens.splice(1);
    }
    const dir = { x: sc.rushDx, y: sc.rushDy };
    while (sc.lurkPhase === 2 && ticks++ < 800) {
      sim.step(1 / 30, turn);
      sim.aliens.splice(1);
    }
    const miss = Math.hypot(sc.x - sq.center.x, sc.y - sq.center.y);
    if (label === 'tout droit')
      check(dir.x < -0.95 && miss < B.radius * 0.5, 'Scarab : verrouillé, le télégraphe suit encore une squad qui file tout droit', `ressort à ${miss.toFixed(0)} px du centre`);
    else check(miss > B.radius, 'Scarab : verrouillé, sa direction ne change plus : une squad qui s’écarte sur le côté l’esquive', `ressort à ${miss.toFixed(0)} px du centre`);
  }

  // ---- Rhino Alpha : toutes les 6 s, une croix de 4 petites rangées de pics sur le centre de la squad ; un soldat sur une rangée est blessé une fois
  {
    const { sim } = fresh(25, 'expert'); // Hard : pas de croix en Normal
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_rhino', sq.center.x + 1400, sq.center.y, 1, false);
    const rh = sim.aliens[0];
    rh.age = 99;
    rh.crossCd = 0.05;
    const C = ALIENS.boss_rhino.spikeCross;
    const s0 = sq.soldiers[0];
    s0.invulnerable = 0;
    const hp0 = s0.hp;
    let seen = 0;
    let lines = 0;
    for (let i = 0; i < 30 * 8; i++) {
      s0.x = sq.center.x + 100; // sur la rangée de droite (à 100 px du centre)
      s0.y = sq.center.y;
      sim.step(1 / 30, new Map());
      sim.aliens.splice(1);
      rh.x = sq.center.x + 1400; rh.y = sq.center.y; rh.hp = rh.maxHp;
      if (sim.crosses.length > seen) lines++;
      seen = sim.crosses.length;
    }
    const norm = fresh(25);
    clearAliens(norm.sim);
    const nq = norm.sim.squadOf('p1');
    norm.sim.horde.spawnAt('boss_rhino', nq.center.x + 1400, nq.center.y, 1, false);
    norm.sim.aliens[0].age = 99;
    norm.sim.aliens[0].crossCd = 0.05;
    let nCross = 0;
    for (let i = 0; i < 30 * 8; i++) {
      norm.sim.step(1 / 30, new Map());
      norm.sim.aliens.splice(1);
      nCross = Math.max(nCross, norm.sim.crosses.length);
    }
    check(nCross === 0, 'Rhino Alpha : pas de croix de pics en Normal', `${nCross} croix`);
    check(lines >= 1 && lines <= 3, 'Rhino Alpha : une croix de pics sur la squad toutes les 6 s (plus vite une fois enragé ; la seconde croix, là où elle va, ne vient que si elle bouge)', `${lines} croix en 8 s`);
    check(hp0 - s0.hp >= C.damage * 0.9 && hp0 - s0.hp <= C.damage * 2.5, 'Rhino Alpha : le soldat sur une rangée de la croix est blessé une fois par croix', `${(hp0 - s0.hp).toFixed(0)} PV perdus`);
  }

  // ---- coffre à diamants : il saute de l'œuf quand l'œuf est ouvert (détruit), pas à la mort du boss
  {
    const { sim } = fresh(27);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const egg = sim.horde.spawnEgg(sq.center.x + 300, sq.center.y);
    const before = sim.gems.chests.length;
    sim.damage(egg, 1e9, 'p1');
    sim.step(1 / 30, new Map());
    check(before === 0 && sim.gems.chests.length === 1 && Math.hypot(sim.gems.chests[0].x - egg.x, sim.gems.chests[0].y - egg.y) < 40, "coffre à diamants : il apparaît à l'ouverture de l'œuf (pas à la mort du boss)", `${before} avant, ${sim.gems.chests.length} après`);
  }

  // ---- diamants des boss : quantité moyenne par boss × multiplicateur du niveau (± 20 %), et 20 % jaillissent de l'œuf à son ouverture
  {
    const qtyOf = (level, boss) => {
      const { sim } = fresh(31, level);
      const out = [];
      for (let i = 0; i < 40; i++) out.push(sim.gems.chestQuantity(boss));
      return out.reduce((a, b) => a + b, 0) / out.length;
    };
    const mulOf = { normal: DIFFICULTY.gemMulNormal, expert: DIFFICULTY.gemMulHard, impossible: DIFFICULTY.gemMulExpert };
    let ok = true;
    let detail = [];
    for (const level of ['normal', 'expert', 'impossible']) {
      for (const boss of ['boss_gling', 'boss_scarab', 'boss_crab']) {
        const want = ALIENS[boss].diamonds * mulOf[level];
        const got = qtyOf(level, boss);
        if (Math.abs(got - want) > want * 0.12 + 1) ok = false;
        detail.push(`${level}/${boss}: ${got.toFixed(1)} (≈${want})`);
      }
    }
    const inc = ALIENS.boss_gling.diamonds < ALIENS.boss_rhino.diamonds && ALIENS.boss_rhino.diamonds < ALIENS.boss_scarab.diamonds && ALIENS.boss_scarab.diamonds < ALIENS.boss_rhino_fire.diamonds && ALIENS.boss_rhino_fire.diamonds < ALIENS.boss_crab.diamonds;
    check(ok && inc, 'diamants des boss : moyenne du boss × multiplicateur du niveau, qui augmente de boss en boss', detail.slice(0, 4).join(' ; '));
    const { sim } = fresh(32, 'expert');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const egg = sim.horde.spawnEgg(sq.center.x + 300, sq.center.y);
    sim.eggBoss.set(egg.id, 'boss_scarab');
    sim.damage(egg, 1e9, 'p1');
    sim.step(1 / 30, new Map());
    const chest = sim.gems.chests[0];
    const free = sim.gems.items.length;
    check(!!chest && free === Math.max(1, Math.round(chest.qty * DIFFICULTY.gemFreeShare)), 'œuf ouvert : 20 % du contenu du coffre jaillit tout de suite', `${free} diamants pour un coffre de ${chest?.qty}`);
  }

  // ---- power-up Orbes électriques : 3 orbes enflammées autour de la squad pendant 8 s, 20 dégâts à chaque collision avec un alien (un même alien ne les subit pas à chaque tick)
  {
    const { ELECTRO } = await vite.ssrLoadModule('/src/config.ts');
    const { PowerUps } = await vite.ssrLoadModule('/src/sim/PowerUps.ts');
    const { sim } = fresh(33);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.powerups.drop('electro', sq.center.x, sq.center.y, true);
    for (let i = 0; i < 6; i++) sim.step(1 / 30, new Map());
    const active = Math.abs(sq.buffs.electro - ELECTRO.time) < 0.5;
    // un alien posé sur la première orbe est touché : 20 dégâts, une seule fois par `rehit`
    const o = PowerUps.orbAt(sq, 0);
    sim.horde.spawnAt('slime', o.x, o.y, 1, false, true);
    const a = sim.aliens[0];
    a.age = 99;
    a.hp = a.maxHp = 5000;
    const hp0 = a.hp;
    sim.step(1 / 30, new Map());
    const first = hp0 - a.hp;
    const near = PowerUps.orbAt(sq, 0);
    a.x = near.x; a.y = near.y; a.vx = a.vy = 0;
    sim.step(1 / 30, new Map());
    const second = hp0 - a.hp - first;
    check(active && first === ELECTRO.damage && second === 0, 'orbes électriques : orbes actives 8 s, une collision inflige ELECTRO.damage (16) dégâts (pas à chaque tick)', `actif ${active}, 1er coup ${first}, 2e tick ${second}`);
    for (let i = 0; i < 30 * 9; i++) { sim.step(1 / 30, new Map()); a.hp = a.maxHp; }
    check(sq.buffs.electro <= 0, 'orbes électriques : les orbes disparaissent après 8 s', `${sq.buffs.electro.toFixed(2)} s restant`);
  }

  // ---- alien doré : rare (un seul par partie, entre 3 et 5 min), fuit quand on l'approche en semant des pièces, s'enterre après 10 s ; tué : beaucoup de pièces et quelques diamants
  {
    const G = ALIENS.golden.golden;
    let allOne = true;
    let inWindow = true;
    for (let seed = 1; seed <= 30; seed++) {
      const { sim } = fresh(100 + seed);
      sim.step(1 / 30, new Map());
      const times = sim.horde.goldTimes;
      if (times.length !== 1) allOne = false;
      else if (times[0] < G.spawnFrom || times[0] > G.spawnTo) inWindow = false;
    }
    check(allOne && inWindow, 'alien doré : une apparition par partie, entre spawnFrom et spawnTo', `${G.spawnFrom}-${G.spawnTo} s, 30 graines`);
    const { sim, step } = fresh(34);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('golden', sq.center.x + 200, sq.center.y, 1, false, true);
    const g = sim.aliens[0];
    g.age = 99;
    g.maxHp = g.hp = ALIENS.golden.hp;
    const d0 = Math.hypot(g.x - sq.center.x, g.y - sq.center.y);
    const coins0 = sim.gems.coins.length;
    for (let i = 0; i < 30 * 3; i++) { sim.step(1 / 30, new Map()); sim.aliens.splice(1); }
    const d1 = Math.hypot(g.x - sq.center.x, g.y - sq.center.y);
    const sown = sim.gems.coins.length - coins0;
    check(g.goldState === 1 && d1 > d0 + 200 && sown >= 3, 'alien doré : engagé, il fuit la squad en semant des pièces', `${d0.toFixed(0)} → ${d1.toFixed(0)} px, ${sown} pièces`);
    // 1re tentative après `burrowAfter` s de fuite : non interrompue = il s'enterre en `burrowTime` s et disparaît (sans butin de mort)
    for (let i = 0; i < 30 * (G.burrowAfter + G.burrowTime + 1.5); i++) { sim.step(1 / 30, new Map()); sim.aliens.splice(1); }
    check(!g.alive && sim.gems.coins.length >= sown, "alien doré : sa 1re tentative d'enfouissage (après 4 s de chase, 2 s d'animation) non interrompue le fait disparaître, sans butin de mort", `vivant ${g.alive}`);
    const mk = (seed) => {
      const f = fresh(seed);
      clearAliens(f.sim);
      const q = f.sim.squadOf('p1');
      f.sim.horde.spawnAt('golden', q.center.x + 200, q.center.y, 1, false, true);
      const gg = f.sim.aliens[0];
      gg.age = 99;
      gg.maxHp = gg.hp = ALIENS.golden.hp;
      return { f, gg };
    };
    // interrompue (-200 PV pendant l'animation) : il repart en fuite, réessaie après 4 NOUVELLES secondes (2e tentative, interruptible aussi) ; interrompue à son tour, la 3e est la finale
    {
      const { f, gg } = mk(45);
      const none = new Map();
      const wait = (target) => { let t = 0; while (gg.goldBury !== target && t < 30 * 8) { f.sim.step(1 / 30, none); f.sim.aliens.splice(1); t++; } return t / 30; };
      const firstAt = wait(1);
      f.sim.damage(gg, G.burrowInterrupt - 1, 'p1'); // 199 PV : pas assez
      f.sim.step(1 / 30, none);
      const notYet = gg.goldBury === 1 && gg.sinkT > 0;
      f.sim.damage(gg, 1, 'p1'); // 200 PV au total : interrompue
      f.sim.step(1 / 30, none);
      const interrupted1 = gg.alive && gg.goldBury === 0 && gg.sinkT === 0 && gg.goldTries === 1;
      const secondAfter = wait(1); // la 2e tentative est encore une tentative interruptible
      f.sim.damage(gg, G.burrowInterrupt, 'p1');
      f.sim.step(1 / 30, none);
      const interrupted2 = gg.alive && gg.goldBury === 0 && gg.sinkT === 0 && gg.goldTries === 2;
      const thirdAfter = wait(2); // la 3e est la finale
      f.sim.damage(gg, G.burrowInterrupt * 3, 'p1'); // même à -600 PV : plus d'interruption
      for (let i = 0; i < 30 * (G.burrowTime + 0.5); i++) { f.sim.step(1 / 30, none); f.sim.aliens.splice(1); }
      check(G.burrowInterrupt === 200 && G.interruptibleTries === 2 && Math.abs(firstAt - G.burrowAfter) < 0.3 && notYet && interrupted1 && Math.abs(secondAfter - G.burrowRetry) < 0.3 && interrupted2 && Math.abs(thirdAfter - G.burrowRetry) < 0.3 && !gg.alive, "alien doré : tentatives à 4 s, interrompues à -200 PV (2 fois) ; la 3e, 4 s plus tard, ne peut plus être interrompue", `1re à ${firstAt.toFixed(1)} s, 199 PV sans effet ${notYet}, interrompue ${interrupted1}, 2e ${secondAfter.toFixed(1)} s après, interrompue ${interrupted2}, 3e ${thirdAfter.toFixed(1)} s après, vivant ${gg.alive}`);
    }
    // mort : grosse quantité de pièces, quelques diamants
    const f2 = fresh(35);
    clearAliens(f2.sim);
    const q2 = f2.sim.squadOf('p1');
    f2.sim.horde.spawnAt('golden', q2.center.x + 600, q2.center.y, 1, false, true);
    const g2 = f2.sim.aliens[0];
    g2.age = 99;
    const c0 = f2.sim.gems.coins.length;
    const i0 = f2.sim.gems.items.length;
    f2.sim.damage(g2, 1e9, 'p1');
    f2.step(1);
    check(f2.sim.gems.coins.length - c0 >= G.deathCoins && f2.sim.gems.items.length - i0 === G.deathGems, 'alien doré tué : grosse quantité de pièces et quelques diamants', `${f2.sim.gems.coins.length - c0} pièces, ${f2.sim.gems.items.length - i0} diamants`);
  }

  // ---- or des boss : un boss ordinaire lâche COINS.bossCoins pièces, le boss final × DIFFICULTY.coinFinalMul
  {
    const { COINS } = await vite.ssrLoadModule('/src/config.ts');
    const coinsOf = (level, id) => {
      const { sim } = fresh(37, level);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt(id, sq.center.x + 900, sq.center.y, 1, false);
      const b = sim.aliens[0];
      b.age = 1;
      b.noXp = false; // `spawnAt` marque l'alien « invoqué » : un boss de vague, lui, laisse son butin
      const c0 = sim.gems.coins.length;
      sim.damage(b, 1e12, 'p1');
      sim.step(1 / 30, new Map());
      return sim.gems.coins.length - c0;
    };
    const mini = coinsOf('normal', 'boss_gling');
    const fin = coinsOf('normal', 'boss_scarab');
    check(mini === DIFFICULTY.coinBossCoins && fin === Math.round(DIFFICULTY.coinBossCoins * DIFFICULTY.coinFinalMul), 'or des boss : le boss final lâche son or × le multiplicateur de boss final', `${mini} pièces (ordinaire), ${fin} (final, ×${DIFFICULTY.coinFinalMul})`);
  }

  // ---- alien doré : il apparaît TOUJOURS en sortant du sol à côté de la squad d'un joueur (260 px), immobile et invulnérable pendant l'animation, puis il s'engage
  {
    const G = ALIENS.golden.golden;
    let near = 0, emerging = 0, still = 0, ok = 0;
    for (let seed = 200; seed < 215; seed++) {
      const { sim } = fresh(seed);
      clearAliens(sim);
      sim.step(1 / 30, new Map());
      sim.horde.goldTimes = [0]; // l'heure tirée est passée : il apparaît au prochain tick
      sim.step(1 / 30, new Map());
      const g = sim.aliens.find((a) => a.def.golden);
      if (!g) continue;
      ok++;
      const q = sim.squadOf('p1');
      const d = Math.hypot(g.x - q.center.x, g.y - q.center.y);
      if (Math.abs(d - G.spawnDist) < 30) near++;
      if (sim.horde.isEmerging(g)) emerging++;
      const x0 = g.x, y0 = g.y;
      for (let i = 0; i < 10; i++) sim.step(1 / 30, new Map()); // 0,33 s : encore en train de sortir
      if (sim.horde.isEmerging(g) && Math.hypot(g.x - x0, g.y - y0) < 2) still++;
    }
    check(G.spawnDist === 260 && ok === 15 && near === ok && emerging === ok && still >= ok - 1, "alien doré : apparaît toujours à côté de la squad (260 px) en sortant du sol, immobile pendant l'animation", `${ok}/15 apparus, ${near} à ~260 px, ${emerging} en train de sortir, ${still} immobiles ensuite`);
  }

  // ---- Jackpot (+25 % d'or et de diamants par prise, 4 prises) : boss, aliens ordinaires, alien doré, coffres de boss
  {
    const { UPGRADES } = await vite.ssrLoadModule('/src/data/progression.ts');
    const def = UPGRADES.goldDigger;
    const withPicks = (k, seed = 41, level = 'normal') => {
      const f = fresh(seed, level);
      const sq = f.sim.squadOf('p1');
      for (let i = 0; i < k; i++) sq.stats.add(def.stat, def.mod);
      return f.sim;
    };
    check(def.maxStacks === 4 && def.mod.pct === 0.25 && def.stat === 'goldGain', 'Jackpot : 4 prises max, +25 % par prise (stat goldGain)', JSON.stringify(def));
    const bossCoins = (k) => {
      const sim = withPicks(k);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt('boss_gling', sq.center.x + 900, sq.center.y, 1, false);
      const b = sim.aliens[0];
      b.age = 1;
      b.noXp = false;
      const c0 = sim.gems.coins.length;
      sim.damage(b, 1e12, 'p1');
      sim.step(1 / 30, new Map());
      return sim.gems.coins.length - c0;
    };
    const c0 = bossCoins(0), c2 = bossCoins(2), c4 = bossCoins(4);
    check(c0 === DIFFICULTY.coinBossCoins && c2 === Math.round(DIFFICULTY.coinBossCoins * 1.5) && c4 === DIFFICULTY.coinBossCoins * 2, "Jackpot : l'or d'un boss grandit de 25 % par prise", `${c0} / ${c2} (2 prises) / ${c4} (4 prises) pièces`);
    const slimeCoins = (k) => {
      const sim = withPicks(k, 43);
      clearAliens(sim);
      let total = 0;
      for (let i = 0; i < 3000; i++) {
        const a = sim.horde.spawnAt('slime', 0, 0, 1, false);
        const al = Array.isArray(a) ? a[0] : sim.aliens.at(-1);
        al.noXp = false;
        sim.gems.coins.length = 0;
        sim.gems.dropCoins(al);
        total += sim.gems.coins.length;
        al.alive = false;
        sim.aliens.length = 0;
      }
      return total;
    };
    const s0 = slimeCoins(0), s2 = slimeCoins(2);
    check(s0 > 0 && s2 / s0 > 1.35 && s2 / s0 < 1.65, 'Jackpot : les aliens ordinaires lâchent ~25 % de pièces en plus par prise (2 prises : ×1,5)', `${s0} contre ${s2} pièces sur 3000 aliens (×${(s2 / s0).toFixed(2)})`);
    const gemsAt = (k) => {
      const sim = withPicks(k, 47);
      const i0 = sim.gems.items.length;
      sim.gems.dropGemsAt(0, 0, 6);
      return sim.gems.items.length - i0;
    };
    check(gemsAt(0) === 6 && gemsAt(2) === 9 && gemsAt(4) === 12, 'Jackpot : les diamants lâchés (alien doré) grandissent de 25 % par prise', `${gemsAt(0)} / ${gemsAt(2)} / ${gemsAt(4)}`);
    const chestAvg = (k) => {
      const sim = withPicks(k, 53);
      let t = 0;
      for (let i = 0; i < 60; i++) t += sim.gems.chestQuantity('boss_scarab', sim.squadOf('p1').stats.get('goldGain'));
      return t / 60;
    };
    const q0 = chestAvg(0), q4 = chestAvg(4);
    check(q4 / q0 > 1.85 && q4 / q0 < 2.15, 'Jackpot : le coffre à diamants des boss contient 25 % de plus par prise (4 prises : ×2)', `${q0.toFixed(1)} contre ${q4.toFixed(1)} diamants en moyenne`);
    // à l'ouverture réelle de l'œuf, le coffre créé porte bien la quantité majorée
    const chestQty = (k) => {
      const sim = withPicks(k, 59);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt('boss_gling', sq.center.x + 900, sq.center.y, 1, false);
      const b = sim.aliens[0];
      b.age = 1;
      b.noXp = false;
      sim.damage(b, 1e12, 'p1');
      sim.step(1 / 30, new Map());
      const egg = sim.aliens.find((x) => x.alive && x.def.egg);
      sim.damage(egg, 1e9, 'p1');
      sim.step(1 / 30, new Map());
      return sim.gems.chests[0]?.qty ?? -1;
    };
    const k0 = chestQty(0), k4 = chestQty(4);
    check(k0 > 0 && k4 > k0 * 1.6, "Jackpot : le coffre créé à l'ouverture de l'œuf porte la quantité majorée", `qty ${k0} sans, ${k4} avec 4 prises`);
  }

  // ---- œuf de boss : PV = DPS de la squad × durée de destruction (2 s) × efficacité ; une squad plus nombreuse a un œuf plus costaud
  {
    const mk = (n) => {
      const { sim } = fresh(38);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      while (sq.soldiers.length < n) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
      const egg = sim.horde.spawnEgg(sq.center.x + 700, sq.center.y);
      return { dps: sim.combat.squadDps(sq), hp: egg.maxHp };
    };
    const small = mk(4);
    const big = mk(12);
    const wantSmall = Math.max(DIFFICULTY.eggMinHp, Math.round(small.dps * DIFFICULTY.eggBreakTime * DIFFICULTY.eggEfficiency));
    check(small.dps > 0 && small.hp === wantSmall && big.hp > small.hp * 2, 'œuf : PV adaptés au DPS de la squad (destruction ~2 s) et à son nombre de soldats', `4 soldats : ${small.dps.toFixed(0)} DPS → ${small.hp} PV ; 12 soldats : ${big.dps.toFixed(0)} DPS → ${big.hp} PV`);
  }

  // ---- shooter : à sa mort, 3 boules rouges en cloche retombent autour de lui (50-130 px, directions au hasard), l'une après l'autre (0,1 s d'écart : 0 / 0,1 / 0,2 s) ; pas pendant un clear screen
  {
    const { sim } = fresh(39);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('shooter', sq.center.x + 900, sq.center.y, 1, false, true);
    const sh = sim.aliens[0];
    sh.age = 99;
    const lobs = () => (sim.combat.projectiles.active ?? sim.combat.projectiles.items ?? []).filter((p) => p.lob && p.team === 'aliens');
    sim.damage(sh, 1e9, 'p1');
    const none = new Map();
    const first = lobs().length; // la première part tout de suite
    for (let i = 0; i < 2; i++) sim.step(1 / 30, none); // ~0,07 s : la deuxième attend encore
    const early = lobs().length;
    for (let i = 0; i < 6; i++) sim.step(1 / 30, none); // ~0,27 s en tout : les trois sont parties
    const blobs = lobs();
    const dists = blobs.map((p) => Math.hypot(p.x + p.vx * p.life - sh.x, p.y + p.vy * p.life - sh.y));
    check(first === 1 && early === 1 && blobs.length === 3 && dists.every((d) => d > 35 && d < 150), "shooter : à sa mort, 3 boules rouges en cloche autour de lui, l'une après l'autre (0,1 s)", `${first} puis ${early} puis ${blobs.length} boule(s), à ${dists.map((d) => d.toFixed(0)).join(' / ')} px`);
  }

  // ---- orbes électriques du power-up : en plus des dégâts, un léger recul vers l'extérieur de la squad (divisé par la masse : un boss bouge presque pas)
  {
    const { ELECTRO } = await vite.ssrLoadModule('/src/config.ts');
    const { PowerUps } = await vite.ssrLoadModule('/src/sim/PowerUps.ts');
    const test = (id) => {
      const { sim } = fresh(67);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sq.buffs.electro = 5;
      const o = PowerUps.orbAt(sq, 0);
      sim.horde.spawnAt(id, o.x, o.y, 1, false);
      const a = sim.aliens[0];
      a.age = 99;
      a.hp = a.maxHp = 1e9; // ne meurt pas
      a.noXp = true;
      const x0 = a.x, y0 = a.y;
      const outX = a.x - sq.center.x, outY = a.y - sq.center.y;
      const n = Math.hypot(outX, outY);
      sim.step(1 / 30, new Map());
      const dk = { x: a.kx, y: a.ky };
      return { hit: a.hp < a.maxHp, along: (dk.x * outX + dk.y * outY) / n, mass: a.mass };
    };
    const small = test('gling'), big = test('boss_rhino');
    check(small.hit && small.along > 0 && Math.abs(small.along - ELECTRO.knock / small.mass) < ELECTRO.knock / small.mass * 0.35 + 5, 'orbes électriques : l alien touché est repoussé vers l extérieur de la squad (ELECTRO.knock / masse)', `recul ${small.along.toFixed(0)} px/s, attendu ~${(ELECTRO.knock / small.mass).toFixed(0)} (masse ${small.mass})`);
    check(big.hit && big.along > 0 && big.along < small.along / 3, 'orbes électriques : un gros alien (boss) est à peine repoussé', `${big.along.toFixed(0)} px/s contre ${small.along.toFixed(0)} pour un gling`);
  }

  // ---- charge enragée : le Rhino Alpha très enragé enchaîne ses charges (cooldown ÷ 10) ; il doit s'arrêter net au début du télégraphe (pas de glissade de 80-100 px dans le sens de la charge précédente)
  // et charger dans l'axe du télégraphe
  {
    const { DIFFICULTY } = await vite.ssrLoadModule('/src/config.ts');
    const { sim } = fresh(61);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const so of sq.soldiers) so.invulnerable = 1e6;
    sim.horde.spawnAt('boss_rhino', sq.center.x + 600, sq.center.y, 1, false);
    const rh = sim.aliens[0];
    rh.hp = rh.maxHp = 1e12;
    rh.age = 5 * DIFFICULTY.bossEnrageEvery + 1; // enragé niveau 5
    const none = new Map();
    let phase = 0, o = null, slide = 0, dev = 0, charges = 0, maxSlide = 0, maxDev = 0, started = null, minTravel = 1e9;
    for (let i = 0; i < 30 * 40 && charges < 4; i++) {
      sim.step(1 / 30, none);
      if (rh.rushWind > 0 && phase === 0) { phase = 1; o = { x: rh.x, y: rh.y, dx: rh.rushDx, dy: rh.rushDy }; dev = 0; }
      if (phase === 1 && rh.rushWind <= 0 && rh.rushT > 0) { phase = 2; slide = Math.hypot(rh.x - o.x, rh.y - o.y); maxSlide = Math.max(maxSlide, slide); }
      if (phase === 2) {
        dev = Math.max(dev, Math.abs((rh.x - o.x) * o.dy - (rh.y - o.y) * o.dx));
        if (rh.rushT <= 0) { const tr = (rh.x - o.x) * o.dx + (rh.y - o.y) * o.dy; if (tr > 570) { maxDev = Math.max(maxDev, dev); minTravel = Math.min(minTravel, tr); } /* une charge freinée par le bord de la carte glisse le long : ignorée */ phase = 0; charges++; }
      }
    }
    check(charges >= 4 && maxSlide < 25 && maxDev < 40 && minTravel > 570 && minTravel < 700, "charge enragée : il s'arrête net pendant le télégraphe et charge dans son axe (4 charges de suite, enragé niveau 5)", `${charges} charges ; dérive max pendant le télégraphe ${maxSlide.toFixed(0)} px ; écart latéral max ${maxDev.toFixed(0)} px`);
  }

  // ---- cracheur (spitter) : à sa mort, une fontaine de 7 à 10 boules vertes en cloche retombe autour de lui (50-130 px), presque d'un coup (0,04 s d'écart) ; mêmes dégâts que son crachat
  {
    const counts = [];
    let radiusOk = true;
    let textureOk = true;
    let damageOk = true;
    let last = '';
    for (let seed = 100; seed < 130; seed++) {
      const { sim } = fresh(seed);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt('spitter', sq.center.x + 900, sq.center.y, 1, false, true);
      const sp = sim.aliens[0];
      sp.age = 99;
      sim.damage(sp, 1e9, 'p1');
      const none = new Map();
      for (let i = 0; i < 12; i++) sim.step(1 / 30, none); // 0,4 s : toutes les boules sont parties, aucune n'est encore retombée (vol de 0,86 s)
      const blobs = (sim.combat.projectiles.active ?? sim.combat.projectiles.items ?? []).filter((p) => p.lob && p.team === 'aliens');
      counts.push(blobs.length);
      for (const p of blobs) {
        const d = Math.hypot(p.x + p.vx * p.life - sp.x, p.y + p.vy * p.life - sp.y);
        if (d < 35 || d > 150) radiusOk = false;
        if (p.texture !== ALIENS.spitter.spray.texture) textureOk = false;
        if (Math.abs(p.damage - ALIENS.spitter.spray.damage * sim.escalationDamage) > 0.01) damageOk = false;
      }
      last = `${blobs.length}`;
    }
    const min = Math.min(...counts), max = Math.max(...counts);
    check(min >= 7 && max <= 10 && min <= 8 && max >= 9 && radiusOk && textureOk && damageOk, "cracheur : à sa mort, 7 à 10 boules vertes en cloche autour de lui (50-130 px), mêmes dégâts que son crachat", `${min} à ${max} boules sur 30 morts (dernière : ${last}) ; rayon ${radiusOk ? 'ok' : 'hors plage'}, texture ${textureOk ? 'ok' : 'différente'}, dégâts ${damageOk ? 'ok' : 'différents'}`);
  }

  // ---- rhinos jumeaux (Expert) : 2 orbes électriques tournent en continu autour de chacun (100 px) ; un soldat touché perd 10 PV (au plus une fois par orbe et par 0,5 s) ; rien en Normal
  {
    const { twinOrbAt } = await vite.ssrLoadModule('/src/data/aliens.ts');
    const O = ALIENS.boss_rhino_fire.impossible.orbs;
    const run = (level) => {
      const { sim } = fresh(40, level);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt('boss_rhino_fire', sq.center.x + 1500, sq.center.y, 1, false);
      const r = sim.aliens[0];
      r.age = 99;
      const s0 = sq.soldiers[0];
      s0.invulnerable = 0;
      const hp0 = s0.hp;
      const none = new Map();
      let moved = 0;
      let prev = twinOrbAt(r.def, r.x, r.y, sim.time, 0);
      for (let i = 0; i < 30; i++) {
        const o = twinOrbAt(r.def, r.x, r.y, sim.time, 0);
        s0.x = s0.px = o.x; s0.y = s0.py = o.y; // le soldat se tient sur la première orbe
        sim.step(1 / 30, none);
        sim.aliens.splice(1);
        r.x = sq.center.x + 1500; r.y = sq.center.y; r.hp = r.maxHp;
        moved = Math.max(moved, Math.hypot(o.x - prev.x, o.y - prev.y));
        prev = o;
      }
      return { lost: hp0 - s0.hp, moved };
    };
    const ex = run('impossible');
    const no = run('normal');
    const dmg = ex.lost / (O.damage * 1.2); // Expert : dégâts × 1,2 (stats de base de niveau)
    check(ex.lost > 0 && ex.moved > 1 && dmg >= 1 && dmg <= 3.5 && no.lost === 0, 'rhinos jumeaux : orbes électriques en Expert (10 dégâts au contact, au plus une fois par 0,5 s), aucune en Normal', `Expert : ${ex.lost.toFixed(1)} PV en 1 s, orbe déplacée de ${ex.moved.toFixed(1)} px par tick ; Normal : ${no.lost} PV`);
  }

  // ---- feu : il enflamme le soldat (brûlure dans le temps = dégâts de la flaque × 2), pas de dégâts directs ; il brûle encore 3 s après avoir quitté les flammes ; la glace l'éteint
  {
    const { FIRE } = await vite.ssrLoadModule('/src/config.ts');
    const { sim } = fresh(41);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const s0 = sq.soldiers[0];
    s0.invulnerable = 0;
    s0.hp = s0.maxHp = 1e6;
    const none = new Map();
    const dps = 30;
    sim.addFire(s0.x, s0.y, 60, 1, dps);
    const hp0 = s0.hp;
    for (let i = 0; i < 8; i++) { s0.x = s0.px = sim.fires[0]?.x ?? s0.x; sim.step(1 / 30, none); }
    const ignited = s0.burn > 0 && s0.burnDps === dps * FIRE.dmgMul;
    // la flaque disparaît (1 s) : il continue de brûler FIRE.burnTime s, puis s'éteint
    for (let i = 0; i < 30; i++) sim.step(1 / 30, none);
    const stillBurning = s0.burn > 0;
    const lost = hp0 - s0.hp;
    for (let i = 0; i < 30 * 4; i++) sim.step(1 / 30, none);
    check(ignited && stillBurning && s0.burn === 0 && lost >= dps * FIRE.dmgMul * (FIRE.tickDmg / FIRE.tick) * 0.9 && lost <= dps * FIRE.dmgMul * (FIRE.tickDmg / FIRE.tick) * 1.3, "feu : le soldat s'enflamme (brûlure dans le temps, débit de la flaque × `dmgMul`, ticks plus fréquents et plus faibles), continue de brûler après les flammes, puis s'éteint", `débit ${s0.burnDps || dps * FIRE.dmgMul} PV/s, ${lost.toFixed(0)} PV perdus pendant la 1re seconde`);
    // la glace éteint le feu
    const f2 = fresh(42);
    clearAliens(f2.sim);
    const t0 = f2.sim.squadOf('p1').soldiers[0];
    f2.sim.ignite(t0, 50);
    f2.sim.horde.freezeSoldier(t0);
    f2.sim.step(1 / 30, none);
    check(t0.burn === 0 && t0.burnDps === 0, "feu : un soldat gelé est éteint (et ne s'enflamme pas)");
    // l'inverse (20/10) : le feu fait fondre la glace d'un soldat gelé et le libère ; pendant la brève protection du début du gel (iceInvuln), il n'y peut rien
    {
      const f3 = fresh(44);
      clearAliens(f3.sim);
      const so = f3.sim.squadOf('p1').soldiers[0];
      f3.sim.horde.freezeSoldier(so);
      const frozen0 = so.frozen;
      f3.sim.ignite(so, 50); // tout de suite : protection du début du gel
      const stillFrozen = so.frozen === frozen0 && so.burn === 0;
      so.iceInvuln = 0; // la protection est passée
      const events = [];
      f3.sim.events.drain(() => {}); // on vide la file avant la mesure
      f3.sim.ignite(so, 50);
      f3.sim.events.drain((e) => events.push(e.t));
      check(stillFrozen && frozen0 > 0 && so.frozen === 0 && so.burn === 0 && events.includes('thaw') && so.invulnerable > 1, "feu : il fait fondre la glace d'un soldat gelé et le libère (pas pendant les 0,5 s de protection du début du gel), sans l'enflammer sur le coup", `gel ${frozen0} → ${so.frozen}, brûle ${so.burn}, événements ${events}, protection ${so.invulnerable.toFixed(1)} s`);
    }
  }

  // ---- fireballer : comme le slime de glace mais il tire des orbes de FEU (500 PV, enflamment au contact) ; l'iceballer reste inchangé
  {
    const run = (type) => {
      const { sim } = fresh(43);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt(type, sq.center.x + 300, sq.center.y, 1, false, true);
      const a = sim.aliens[0];
      a.age = 99;
      a.lobCd = 0.05;
      const target = sq.soldiers[0];
      target.invulnerable = 0;
      let orb = null;
      for (let i = 0; i < 45 && !orb; i++) {
        sim.step(1 / 30, new Map());
        orb = sim.aliens.find((x) => x.alive && x.def.projectile);
      }
      return { sim, orb, target };
    };
    const f = run('fireballer');
    const i = run('iceballer');
    check(f.orb?.def.id === 'fire_orb' && i.orb?.def.id === 'ice_orb', 'fireballer : il tire des orbes de feu (le slime de glace, des orbes de glace)', `${f.orb?.def.id} / ${i.orb?.def.id}`);
    f.orb.x = f.target.x; f.orb.y = f.target.y;
    f.sim.step(1 / 30, new Map());
    check(f.target.burn > 0 && f.target.frozen === 0, 'fireballer : son orbe enflamme le soldat touché (pas de gel)', `brûle ${f.target.burn.toFixed(1)} s`);
  }

  // ---- orbe de feu : ni à l'impact ni en fin de course elle ne laisse de flaque (seulement sa traînée)
  {
    const { sim } = fresh(44);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.launch('fire_orb', sq.center.x + 700, sq.center.y, 1, 0);
    const orb = sim.aliens.find((a) => a.def.id === 'fire_orb');
    orb.lurkT = 0.1; // fin de course imminente
    const T = ALIENS.fire_orb.trail;
    let maxTtl = 0;
    for (let i = 0; i < 6; i++) { sim.step(1 / 30, new Map()); sim.aliens = sim.aliens.filter((a) => a.def.id === 'fire_orb'); maxTtl = Math.max(maxTtl, ...sim.fires.map((f) => f.ttl), 0); }
    check(!orb.alive && maxTtl <= T.ttl + 1e-6, "orbe de feu : en fin de course elle n'ajoute aucune flaque (seulement sa traînée)", `durée max d'une flamme au sol ${maxTtl.toFixed(2)} s (traînée ${T.ttl} s)`);
  }

  // ---- alien doré : après son apparition (sans bricoler son âge) il devient visable et touchable, et le soldat lui tire dessus
  {
    const { sim } = fresh(47);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('golden', sq.center.x + 250, sq.center.y, 1, false); // sans instant : il sort de son trou comme en jeu
    const g = sim.aliens[0];
    const none = new Map();
    let shot = false;
    for (let i = 0; i < 30 * 4 && !shot; i++) {
      sim.step(1 / 30, none);
      sim.aliens.splice(1);
      g.x = sq.center.x + 250; g.y = sq.center.y; g.goldState = 0; // il reste là : on teste seulement le ciblage
      if (sq.soldiers.some((s) => s.target === g)) shot = true;
    }
    check(shot && g.age > 0.5, "alien doré : une fois sorti de son trou, les soldats le visent", `âge ${g.age.toFixed(2)} s, visé ${shot}`);
  }

  // ---- Rhino Alpha (Expert) : toutes les 7 s, 4 nuages de gel autour de la squad ; aucun hors Expert
  {
    const run = (level) => {
      const { sim } = fresh(48, level);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sim.horde.spawnAt('boss_rhino', sq.center.x + 1500, sq.center.y, 1, false);
      const r = sim.aliens[0];
      r.age = 1; // sorti de son trou mais pas enragé (l'enrage accélère ses délais)
      r.frostCd = 0.05;
      for (const s of sq.soldiers) s.invulnerable = 1e9; // le gel n'est pas consommé par le test
      let max = 0;
      let salvos = 0;
      let prev = 0;
      for (let i = 0; i < 30 * 16; i++) {
        sim.step(1 / 30, new Map());
        sim.aliens.splice(1);
        r.x = sq.center.x + 1500; r.y = sq.center.y; r.hp = r.maxHp;
        const n = sim.puddles.filter((p) => p.frost).length;
        if (n - prev >= 4) salvos++;
        prev = n;
        max = Math.max(max, n);
      }
      return { max, salvos };
    };
    const ex = run('impossible');
    const no = run('normal');
    check(ex.salvos === 3 && ex.max >= 4 && no.max === 0, 'Rhino Alpha : 4 nuages de gel autour de la squad toutes les 7 s en Expert (plus vite une fois enragé), aucun en Normal', `Expert : ${ex.salvos} salve(s), ${ex.max} nuages max ; Normal : ${no.max}`);
  }

  // ---- Kamikaze : le soldat touché est soufflé en cloche (seul le recul le déplace pendant KNOCK_HOP.time), puis revient en marchant
  {
    const { sim } = fresh(24);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const s0 = sq.soldiers[0];
    sim.addBlast(s0.x - 40, s0.y, 95, 0, 'aliens', 'aliens', 2200, 'fire', 0, KNOCK_HOP.time);
    sim.step(1 / 30, new Map());
    const flagged = s0.knockT > 0;
    const x0 = s0.x;
    let maxX = x0;
    for (let i = 0; i < Math.round(KNOCK_HOP.time * 30); i++) {
      sim.step(1 / 30, new Map());
      maxX = Math.max(maxX, s0.x);
    }
    const pushed = maxX - x0;
    for (let i = 0; i < 60; i++) sim.step(1 / 30, new Map());
    check(flagged && s0.knockT <= 0 && pushed > 70 && s0.x < maxX - 10, 'kamikaze : le soldat est soufflé pendant la poussée, puis revient en marchant', `poussé de ${pushed.toFixed(0)} px, recul ensuite de ${(maxX - s0.x).toFixed(0)} px`);
  }

  // ---- Scarab : les stalactites n'existent pas en Normal (Hard et Expert seulement)
  {
    const { sim } = fresh(16);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_scarab', sq.center.x + 700, sq.center.y, 1, false);
    const sc = sim.aliens[0];
    sc.age = 99;
    let casts = 0;
    let prev = 0;
    for (let i = 0; i < 30 * 12; i++) {
      sim.step(1 / 30, new Map());
      sim.aliens.splice(1);
      if (sim.stalactites.length > prev) casts++;
      prev = sim.stalactites.length;
    }
    check(casts === 0, 'Scarab : en Normal, aucune stalactite', `${casts} pluie(s) en 12 s`);
  }

  // ---- test d'un alien (dev) : effectif de la squad proportionnel aux PV (2 Troopers contre un slime), plafonné ; duel ×10 PV = 1 soldat contre 1 alien
  {
    const R = await vite.ssrLoadModule('/src/dev/alienTestRules.ts');
    const n = (id) => R.testSoldiers(id, 'ratio');
    const ok = n('slime') === 2 && n('gling') === 1 && n('toad') === 1 && n('spitter') === 4 && n('charger') === 5 && n('bubble') === R.RATIO_MAX_SOLDIERS && n('boss_scarab') === R.RATIO_MAX_SOLDIERS;
    check(ok && R.testSoldiers('boss_crab', 'tank') === 1 && R.testSoldiers('slime', 'tank') === 1 && R.TANK_MUL === 10, "test d'un alien : squad proportionnelle aux PV (2 contre un slime, au plus 40), duel ×10 PV = 1 soldat contre 1 alien", `slime ${n('slime')}, gling ${n('gling')}, spitter ${n('spitter')}, charger ${n('charger')}, bulle ${n('bubble')}, Scarab ${n('boss_scarab')}`);
    // une grande squad de test tient dans la taille maximale de la squad (on relève `maxSquad` au besoin)
    const { sim } = fresh(65);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sq.fastForward(1);
    const big = n('charger');
    const cap = R.squadCapFor(big);
    if (cap > sq.maxSize) sq.stats.add('maxSquad', { flat: cap - sq.maxSize });
    sim.respawnSquad('p1', Array.from({ length: big }, () => 'trooper'), 1);
    check(sq.size === big && sq.maxSize >= big, "test d'un alien : une squad de " + big + " Troopers tient dans la squad (maxSquad relevé)", `${sq.size} soldats, max ${sq.maxSize}`);
  }

  // ---- un rocher de mur qui apparaît SOUS une unité (soldat ou alien, tous les murs) la projette en cloche dans le sens (centre unité − centre rocher) ; un boss lourd à peine
  {
    const { ROCK_POP } = await vite.ssrLoadModule('/src/config.ts');
    // (1) intégration : un mur d'un bloc (comme celui du bâtisseur ou du Scarab) qui surgit sous un soldat
    {
      const { sim } = fresh(63);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      const so = sq.soldiers[0];
      const wx = so.x - 10, wy = so.y; // rocher juste à gauche du soldat : il doit partir vers la droite
      sim.addWall(wx, wy, 0, 0, 0.05, 26, 5);
      let peakT = 0, peakKx = 0;
      for (let i = 0; i < 4; i++) {
        sim.step(1 / 30, new Map());
        peakT = Math.max(peakT, so.knockT);
        peakKx = Math.max(peakKx, so.kx);
      }
      check(peakT > 0 && peakKx > ROCK_POP.knock / Math.max(3, so.mass) * 0.4, "rocher de mur sous un soldat : projeté en cloche vers l'extérieur du rocher (saut + recul)", `knockT ${peakT.toFixed(2)} s, recul x ${peakKx.toFixed(0)} px/s`);
    }
    // (2) la fonction elle-même, sur des unités posées à la main : soldat, alien léger, boss lourd
    {
      const { sim } = fresh(64);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      const so = sq.soldiers[0];
      const x = sq.center.x + 1200, y = sq.center.y; // loin de la squad
      sim.horde.spawnAt('gling', x + 12, y - 20, 1, false, true);
      sim.horde.spawnAt('boss_scarab', x + 600, y + 600, 1, false);
      const [gl, boss] = sim.aliens;
      gl.age = boss.age = 99;
      gl.x = x + 12; gl.y = y - 20;
      boss.x = x; boss.y = y + 4;
      so.x = x + 2; so.y = y - 8; so.kx = so.ky = 0; so.knockT = 0;
      sim.alienHash.clear();
      for (const a of sim.aliens) sim.alienHash.insert(a);
      sim.soldierHash.clear();
      sim.soldierHash.insert(so);
      sim.rockPop(x, y, 26);
      const along = (u) => (u.kx * (u.x - x) + u.ky * (u.y - y)) / (Math.hypot(u.x - x, u.y - y) || 1);
      check(so.knockT > 0 && along(so) > 0, "rocher de mur sous un soldat : saut en cloche (knockT) et recul dans le sens (centre soldat − centre rocher)", `knockT ${so.knockT.toFixed(2)} s, recul ${along(so).toFixed(0)} px/s`);
      check(Math.hypot(gl.kx, gl.ky) > ROCK_POP.knock / Math.max(3, gl.mass) * 0.9 && along(gl) > 0, "rocher de mur sous un alien léger : projeté lui aussi, dans le sens (centre alien − centre rocher)", `recul ${Math.hypot(gl.kx, gl.ky).toFixed(0)} px/s`);
      check(Math.hypot(boss.kx, boss.ky) < Math.hypot(gl.kx, gl.ky) / 3, 'rocher de mur sous un boss lourd : à peine bougé', `${Math.hypot(boss.kx, boss.ky).toFixed(0)} px/s contre ${Math.hypot(gl.kx, gl.ky).toFixed(0)} pour un gling`);
    }
  }

  // ---- Scarab (Expert) : toutes les 3 s, 3 murs d'UN bloc annoncés : sur la squad, là où elle se dirige (240 px plus loin) et entre les deux (20/10)
  {
    const { sim } = fresh(18, 'impossible');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_scarab', sq.center.x + 900, sq.center.y, 1, false);
    const sc = sim.aliens[0];
    sc.age = 99;
    sc.wallsCd = 0.05;
    const seen = new Set();
    const lens = [];
    const move = new Map([['p1', { mx: -1, my: 0 }]]);
    for (let i = 0; i < 30 * 7; i++) {
      sim.step(1 / 30, move);
      sim.aliens.splice(1);
      for (const w of sim.walls) {
        if (!seen.has(w.id)) lens.push(w.length);
        seen.add(w.id);
      }
    }
    check(seen.size >= 7 && lens.every((l) => l === 0), "Scarab (Expert) : 3 murs d'UN seul rocher par salve (sur la squad, devant elle et entre les deux), toutes les 3 s (plus vite une fois enragé)", `${seen.size} murs annoncés en 7 s, longueurs ${[...new Set(lens)]}`);
    // la salve : le 1er mur sur la squad (où elle sera), le dernier à ~240 px devant, le 3e entre les deux
    {
      const g = fresh(18, 'impossible');
      clearAliens(g.sim);
      const q = g.sim.squadOf('p1');
      g.sim.horde.spawnAt('boss_scarab', q.center.x + 900, q.center.y, 1, false);
      const sc2 = g.sim.aliens[0];
      sc2.age = 99;
      sc2.wallsCd = 0.05;
      const mv = new Map([['p1', { mx: -1, my: 0 }]]);
      let first = [];
      for (let i = 0; i < 30 * 2 && first.length < 3; i++) {
        g.sim.step(1 / 30, mv);
        g.sim.aliens.splice(1);
        first = g.sim.walls.filter((w) => w.dur - w.t < 0.2);
      }
      const ordered = [...g.sim.walls].sort((u, v) => u.id - v.id).slice(0, 3);
      const along = ordered.map((w) => Math.hypot(w.x - ordered[0].x, w.y - ordered[0].y));
      check(ordered.length === 3 && along[1] > 60 && along[1] < 190 && along[2] > 200 && along[2] < 280, 'Scarab (Expert) : la salve de 3 blocs : un sur la squad, un à ~120 px (décalé sur le côté) et un à ~240 px devant', `distances au 1er : ${along.map((d) => d.toFixed(0)).join(' / ')} px`);
    }
    const normal = fresh(18);
    clearAliens(normal.sim);
    normal.sim.horde.spawnAt('boss_scarab', normal.sim.squadOf('p1').center.x + 900, normal.sim.squadOf('p1').center.y, 1, false);
    normal.sim.aliens[0].age = 99;
    let n = 0;
    for (let i = 0; i < 30 * 7; i++) {
      normal.sim.step(1 / 30, new Map());
      normal.sim.aliens.splice(1);
      n = Math.max(n, normal.sim.walls.length);
    }
    check(n === 0, 'Scarab : pas de murs hors Expert', `${n} mur(s)`);
  }

  // ---- Gling Mère (Expert) : une toile consommée envoie le soldat vers elle, étourdi à l'arrivée
  {
    const { sim } = fresh(23, 'impossible');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const mx = sq.center.x + 600;
    const my = sq.center.y;
    sim.horde.spawnAt('boss_gling', mx, my, 1, false);
    const mother = sim.aliens[0];
    mother.age = 99;
    const s0 = sq.soldiers[0];
    sim.addPuddle(s0.x, s0.y, 80, 10, 1, false, mother.id);
    let airborne = false;
    for (let i = 0; i < 12; i++) {
      sim.step(1 / 30, new Map());
      sim.aliens.splice(1);
      if (s0.jumpT > 0) {
        airborne = true;
        s0.invulnerable = 5; // la Mère ne l'achève pas pendant le test (l'étourdissement se mesure seul)
      }
    }
    check(airborne && !sim.puddles.some((p) => p.web && Math.hypot(p.x - s0.x, p.y - s0.y) < 5), 'toile : le soldat qui marche dedans la consomme et saute', `en vol ${airborne}`);
    for (let i = 0; i < 60 && s0.jumpT > 0; i++) {
      sim.step(1 / 30, new Map());
      sim.aliens.splice(1);
    }
    const dMother = Math.hypot(s0.x - mother.x, s0.y - mother.y);
    check(s0.jumpT === 0 && s0.stun > 0.5 && Math.abs(dMother - 120) < 40, 'toile : il retombe à ~120 px de la Mère, étourdi', `${dMother.toFixed(0)} px, étourdi ${s0.stun.toFixed(2)} s`);
    for (let i = 0; i < 40; i++) {
      sim.step(1 / 30, new Map());
      sim.aliens.splice(1);
    }
    check(s0.stun <= 0, "toile : l'étourdissement dure 1 s", `${s0.stun.toFixed(2)} s restant`);
  }

  // ---- Scarab : quand il marche vers la squad entre deux plongées, une petite pluie de stalactites (une seule, à mi-chemin du compte à rebours)
  {
    const { sim } = fresh(16, 'expert');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const B = ALIENS.boss_scarab.burrow;
    const W = ALIENS.boss_scarab.stalactites.walk;
    sim.horde.spawnAt('boss_scarab', sq.center.x + 700, sq.center.y, 1, false);
    const sc = sim.aliens[0];
    sc.age = 99;
    sc.hp = sc.maxHp = 1e12;
    sc.leapCd = B.every;
    let most = 0;
    let casts = 0;
    let prev = 0;
    while (sc.lurkPhase === 0 && sc.leapCd > 0.05) {
      sim.step(1 / 30, new Map());
      sim.aliens.splice(1);
      if (sim.stalactites.length > prev) casts++;
      prev = sim.stalactites.length;
      most = Math.max(most, sim.stalactites.length);
    }
    check(casts === 1 && most === W.count, 'Scarab : en marchant vers la squad, il lance une petite pluie de stalactites', `${casts} pluie(s), ${most} zones`);
  }

  // ---- roquettes du power-up sans cible : elles filent loin au lieu d'exploser tout près de la squad
  {
    const { sim, step: rawStep } = fresh(33);
    const step = (n) => { for (let i = 0; i < n; i++) { sim.aliens.length = 0; rawStep(1); } };
    step(1);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 1e9;
    sim.combat.barrage(sq, 6);
    step(8); // les roquettes partent (une toutes les 0,12 s)
    const rockets = sim.combat.projectiles.active.filter((p) => p.texture === 'fx_rocket');
    const R = DIFFICULTY.rocketIdleRange;
    const flights = rockets.map((p) => p.maxLife * 720);
    check(rockets.length >= 2 && flights.every((d) => d >= R * 0.8), 'roquettes sans cible : chacune file droit sur une grande distance avant d’exploser', `${rockets.length} roquettes, portée ${Math.min(...flights).toFixed(0)}–${Math.max(...flights).toFixed(0)} px (réglage ${R})`);
    step(15); // 0,5 s plus tard : elles sont loin de la squad, pas posées à côté
    const far = sim.combat.projectiles.active.filter((p) => p.texture === 'fx_rocket' && Math.hypot(p.x - sq.center.x, p.y - sq.center.y) > 250);
    check(far.length >= 1, 'roquettes sans cible : elles continuent de voler loin de la squad', `${far.length} roquette(s) à plus de 250 px`);
  }

  // ---- rhinos jumeaux (7:30) : charge calquée sur l'Alpha ; le rhino de feu sème des flammes, celui de glace des nuages de gel ; fin de charge = 8 orbes
  {
    const { WAVE_SCRIPT, DEFAULT_WAVE_SCRIPT, BOSS_LEVEL } = await vite.ssrLoadModule('/src/data/waves.ts');
    {
      // chargeur (électrique) : sa charge étourdit 1,5 s les soldats touchés ; les rhinos n'étourdissent pas
      const { sim, step: rawStep } = fresh(40);
      const step = (n) => { for (let i = 0; i < n; i++) { sim.aliens = sim.aliens.filter((a) => a.def.id === 'charger'); rawStep(1); } };
      const sq = sim.squadOf('p1');
      for (const o of sq.soldiers) o.invulnerable = 1e9;
      sim.horde.spawnAt('charger', sq.center.x + 350, sq.center.y, 1, false);
      const ch = sim.aliens.find((a) => a.def.id === 'charger');
      ch.age = 99; ch.hp = ch.maxHp = 1e12; ch.rushCd = 0;
      let stunned = 0;
      for (let t = 0; t < 30 * 8 && !stunned; t++) {
        step(1);
        stunned = Math.max(0, ...sq.soldiers.map((o) => o.stun));
      }
      const R = ALIENS.charger.rush;
      check(R.stun === 1.5 && stunned > R.stun - 0.1 && stunned <= R.stun && ALIENS.charger.electric === true, 'chargeur : sa charge électrique étourdit 1,5 s le soldat touché', `étourdi ${stunned.toFixed(2)} s`);
      check(ALIENS.boss_rhino.rush.stun === 1.5 && !ALIENS.boss_rhino.electric && ALIENS.boss_rhino_fire.rush.stun === 1.5 && ALIENS.boss_rhino_ice.rush.stun === 1.5, "rhinos : leur charge étourdit aussi 1,5 s (toutes les charges encaissées étourdissent)");
      // aura du chargeur : toutes les 2 s, 10 dégâts et un éclair (événement zap) sur chaque soldat à moins de 80 px
      {
        const { sim, step } = fresh(43);
        clearAliens(sim);
        const sq = sim.squadOf('p1');
        const A = ALIENS.charger.aura;
        sim.horde.spawnAt('charger', sq.center.x, sq.center.y + 20, 1, false);
        const c = sim.aliens.find((a) => a.def.id === 'charger');
        c.age = 99; c.rushCd = 1e9; c.attackCd = 1e9; c.hp = c.maxHp = 1e9;
        for (const o of sq.soldiers) { o.invulnerable = 0; o.hp = o.maxHp = 1e6; }
        const near = sq.soldiers[0];
        near.x = c.x + 40; near.y = c.y; near.px = near.x; near.py = near.y;
        const far = sq.soldiers[sq.soldiers.length - 1];
        far.x = c.x + 400; far.y = c.y; far.px = far.x; far.py = far.y;
        const n0 = near.hp, f0 = far.hp;
        let zaps = 0;
        const push0 = sim.events.push.bind(sim.events);
        sim.events.push = (e) => { if (e.t === 'zap') zaps++; return push0(e); };
        for (let i = 0; i < 30 * 4.2; i++) { c.x = near.x - 40; c.y = near.y; step(1);  }
        const lost = n0 - near.hp;
        check(A && A.every === 1 && A.radius === 120 && A.damage === 10 && zaps >= 4 && lost >= zaps * A.damage - 0.5 && far.hp > near.hp, "chargeur : aura électrique, toutes les s un éclair et 10 dégâts aux soldats à moins de 120 px", `${zaps} éclairs, ${lost.toFixed(0)} PV perdus en 4,2 s, soldat lointain moins touché : ${far.hp > near.hp}`);
      }
    }
    const entry = DEFAULT_WAVE_SCRIPT.timeline.find((e) => e.level === BOSS_LEVEL && e.config === 5);
    const cfg = DEFAULT_WAVE_SCRIPT.levels[BOSS_LEVEL][4];
    check(!!entry && entry.at === 420 && cfg.groups.some((g) => g.type === 'boss_rhino_fire') && cfg.groups.some((g) => g.type === 'boss_rhino_ice'), 'rhinos jumeaux : un boss à 7:00 (420 s) avec le rhino de feu et le rhino de glace', `${entry ? entry.at : '—'} s`);
    for (const kind of ['fire', 'ice']) {
      const { sim, step: rawStep } = fresh(kind === 'fire' ? 41 : 42);
      const step = (n) => { for (let i = 0; i < n; i++) { sim.aliens = sim.aliens.filter((a) => a.def.boss || a.def.projectile); rawStep(1); } };
      const sq = sim.squadOf('p1');
      for (const o of sq.soldiers) o.invulnerable = 1e9;
      sim.horde.spawnAt(`boss_rhino_${kind}`, sq.center.x + 450, sq.center.y, 1, false);
      const boss = sim.aliens.find((a) => a.def.boss);
      const R = boss.def.rush;
      check(R.length === ALIENS.boss_rhino.rush.length && R.speed === ALIENS.boss_rhino.rush.speed && R.windup === ALIENS.boss_rhino.rush.windup && R.trail.kind === (kind === 'fire' ? 'fire' : 'frost') && R.burst.count === 8, `rhino de ${kind === 'fire' ? 'feu' : 'glace'} : charge de l'Alpha, traînée ${kind === 'fire' ? 'de flammes' : 'de gel'}, 8 orbes en fin de charge`);
      boss.age = 99; boss.hp = boss.maxHp = 1e12; boss.rushCd = 0; boss.rushDx = 0; boss.rushDy = 0;
      sim.fires.length = 0; sim.puddles.length = 0;
      let trailPeak = 0, orbs = 0, charged = false, orbDirs = new Set();
      // les orbes sont comptés à leur création : un orbe lancé contre un soldat tout proche éclate dès son 1er tick (la charge finit collée à la squad)
      const launched = [];
      const realLaunch = sim.horde.launch.bind(sim.horde);
      sim.horde.launch = (type, x, y, dx, dy) => { launched.push({ type, dir: Math.round(Math.atan2(dy, dx) * 4 / Math.PI) }); return realLaunch(type, x, y, dx, dy); };
      for (let t = 0; t < 30 * 6 && !launched.length; t++) {
        step(1);
        if (boss.rushT > 0) charged = true;
        trailPeak = Math.max(trailPeak, kind === 'fire' ? sim.fires.length : sim.puddles.filter((p) => p.frost).length);
        const o = sim.aliens.filter((a) => a.def.projectile);
        if (o.length) { orbs = o.length; for (const a of o) orbDirs.add(`${Math.round(Math.atan2(a.rushDy, a.rushDx) * 4 / Math.PI)}`); }
      }
      check(charged && trailPeak >= 8, `rhino de ${kind === 'fire' ? 'feu' : 'glace'} : sa charge laisse ${kind === 'fire' ? 'des flammes' : 'des nuages de gel'} au sol`, `${trailPeak} ${kind === 'fire' ? 'flammes' : 'nuages'}`);
      delete sim.horde.launch;
      const types = new Set(launched.map((l) => l.type));
      check(launched.length === 8 && new Set(launched.map((l) => l.dir)).size === 8 && types.size === 1 && types.has(kind === 'fire' ? 'fire_orb' : 'ice_orb'), `rhino de ${kind === 'fire' ? 'feu' : 'glace'} : à la fin de la charge, 8 orbes de ${kind === 'fire' ? 'feu' : 'glace'} dans 8 directions`, `${launched.length} orbes, ${new Set(launched.map((l) => l.dir)).size} directions`);
      if (kind === 'fire') {
        const orb = sim.aliens.find((a) => a.def.id === 'fire_orb');
        sim.fires.length = 0;
        step(20);
        check(sim.fires.length >= 3 && orb.def.projectile.kind === 'fire' && orb.maxHp === ALIENS.fire_orb.hp && ALIENS.fire_orb.hp === 1000, 'orbe de feu : destructible (1000 PV) et il laisse une traînée de flammes au sol', `${sim.fires.length} flammes`);
        // au contact d'un soldat : brûlure, pas de gel
        const target = sq.soldiers[0];
        target.invulnerable = 0; target.hp = target.maxHp = 500;
        const o2 = sim.aliens.find((a) => a.def.id === 'fire_orb' && a.alive);
        o2.x = target.x; o2.y = target.y;
        const f0 = sim.fires.length;
        step(2);
        check(target.burn > 0 && target.frozen === 0 && !o2.alive && !sim.fires.some((f) => f.ttl > ALIENS.fire_orb.trail.ttl + 1e-6), "orbe de feu : au contact il enflamme le soldat (brûlure dans le temps, pas de flaque d'impact), sans le geler", `brûle ${target.burn.toFixed(1)} s à ${target.burnDps.toFixed(1)} PV/s, PV ${target.hp.toFixed(0)}`);
      } else {
        const orb = sim.aliens.find((a) => a.def.id === 'ice_orb' && a.alive);
        const target = sq.soldiers[0];
        for (const o of sq.soldiers) o.invulnerable = 0; // tout le monde est touchable : l'orbe peut toucher n'importe lequel
        orb.x = target.x - 60; orb.y = target.y; orb.rushDx = 1; orb.rushDy = 0; orb.lurkT = 5; // droit sur la squad
        for (let i = 0; i < 20 && orb.alive; i++) { orb.hp = 500; sim.horde.update(1 / 30); }
        check(!orb.alive && sq.soldiers.some((o) => o.frozen > 0), 'orbe de glace des rhinos : comme d’habitude, il gèle le soldat touché', `${sq.soldiers.filter((o) => o.frozen > 0).length} soldat(s) gelé(s)`);
      }
    }
    // deux boss tués : le premier est un alien comme les autres (ni œuf, ni clear screen, ni escalade) ; le dernier laisse l'œuf, clear screen (les autres aliens meurent) et déclenche l'escalade
    const { sim } = fresh(43);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_rhino_fire', sq.center.x + 400, sq.center.y, 1, false);
    sim.horde.spawnAt('boss_rhino_ice', sq.center.x - 400, sq.center.y, 1, false);
    sim.horde.spawnAt('slime', sq.center.x, sq.center.y + 300, 1, false);
    const [f, i, sl] = sim.aliens;
    f.age = i.age = sl.age = 99;
    const eggsOf = () => sim.aliens.filter((a) => a.alive && a.def.egg);
    sim.damage(f, 1e12, 'p1');
    check(i.alive && sl.alive && eggsOf().length === 0 && sim.bossKills === 0, 'rhinos jumeaux : le premier tué est un alien comme les autres : ni œuf, ni clear screen, ni escalade', `${eggsOf().length} œuf, slime ${sl.alive ? 'vivant' : 'mort'}, ${sim.bossKills} boss tué(s)`);
    i.x = sq.center.x - 350; i.y = sq.center.y + 120;
    sim.damage(i, 1e12, 'p1');
    const c = eggsOf().find((e) => Math.hypot(e.x - i.x, e.y - i.y) < 40);
    check(eggsOf().length === 1 && !!c && !sl.alive && sim.bossKills === 1 && c.hp === c.maxHp && c.hp >= DIFFICULTY.eggMinHp, 'rhinos jumeaux : le dernier tué laisse l’œuf (PV adaptés au DPS de la squad), clear screen (les autres aliens meurent), et l’escalade (×1,1) ne compte qu’une fois', `${eggsOf().length} œuf, slime ${sl.alive ? 'vivant' : 'mort'}, ${sim.bossKills} boss tué(s)`);
  }

  // ---- unités enterrées (BURIED) : 100 % pendant les animations, 50 % semi-enterrées (lurker en embuscade), intouchables totalement enterrées (Scarab)
  {
    const { sim } = fresh(17);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('lurker', sq.center.x + 900, sq.center.y, 1, false);
    sim.horde.spawnAt('boss_scarab', sq.center.x - 900, sq.center.y, 1, false);
    const [lu, sc] = sim.aliens;
    for (const a of sim.aliens) { a.age = 99; a.hp = a.maxHp = 1000; a.shield = a.maxShield = 0; }
    const hit = (a, phase) => {
      a.lurkPhase = phase;
      const hp = a.hp;
      sim.damage(a, 100, 'p1');
      const dealt = hp - a.hp;
      a.hp = 1000;
      return dealt;
    };
    check(hit(lu, 1) === 100 && hit(lu, 5) === 100 && hit(sc, 1) === 100 && hit(sc, 3) === 100, 'enterré : 100 % des dégâts pendant les animations (s’enterrer, se déterrer)');
    check(hit(lu, 2) === 50 && hit(lu, 3) === 50 && hit(lu, 4) === 50, 'enterré : lurker semi-enterré, 50 % des dégâts');
    check(hit(sc, 2) === 0 && !sim.horde.targetable(sc) && sim.horde.targetable(lu), 'enterré : Scarab totalement enterré, intouchable et jamais visé');
  }

  // ---- vague en embuscade : sort du sol devant la squad, dans son sens de course
  {
    const run = (chance) => {
      const { sim } = fresh(40);
      if (sim.tutorial) sim.tutorial = null;
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sq.vel.x = 200;
      sq.vel.y = 0; // elle court vers l'est
      const saved = DIFFICULTY.ambushChance;
      const savedRing = DIFFICULTY.ringChance;
      DIFFICULTY.ambushChance = chance;
      DIFFICULTY.ringChance = 0; // le cercle est prioritaire : on l'écarte pour tester l'embuscade seule
      sim.waves.trigger(3);
      DIFFICULTY.ambushChance = saved;
      DIFFICULTY.ringChance = savedRing;
      return { sq, aliens: sim.aliens.filter((a) => a.alive && !a.def.boss) };
    };
    const yes = run(1);
    const ahead = yes.aliens.filter((a) => a.x - yes.sq.center.x > 150 && Math.hypot(a.x - yes.sq.center.x, a.y - yes.sq.center.y) < 520);
    check(yes.aliens.length > 0 && ahead.length === yes.aliens.length && yes.aliens.every((a) => a.age < 0.1), 'embuscade : la vague sort du sol juste devant la squad (dans son sens de course)', `${ahead.length}/${yes.aliens.length} aliens à ≈330 px devant`);
    const no = run(0);
    const far = no.aliens.filter((a) => Math.hypot(a.x - no.sq.center.x, a.y - no.sq.center.y) > 600).length;
    check(no.aliens.length > 0 && far === no.aliens.length, 'embuscade : chance à 0, la vague apparaît hors écran comme avant', `${far}/${no.aliens.length} aliens à plus de 600 px`);
  }

  // ---- vague en cercle : toute la vague sort du sol en cercle autour de la squad d'un joueur
  {
    const { sim } = fresh(40);
    if (sim.tutorial) sim.tutorial = null;
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const saved = [DIFFICULTY.ambushChance, DIFFICULTY.ringChance];
    DIFFICULTY.ambushChance = 0;
    DIFFICULTY.ringChance = 1;
    sim.waves.trigger(3);
    [DIFFICULTY.ambushChance, DIFFICULTY.ringChance] = saved;
    const aliens = sim.aliens.filter((a) => a.alive && !a.def.boss);
    const dists = aliens.map((a) => Math.hypot(a.x - sq.center.x, a.y - sq.center.y));
    const quadrants = new Set(aliens.map((a) => `${a.x > sq.center.x}|${a.y > sq.center.y}`));
    check(aliens.length >= 4 && dists.every((d) => d > 200 && d < 420) && quadrants.size >= 3 && aliens.every((a) => a.age < 0.1), 'cercle : la vague entière sort du sol en cercle autour de la squad', `${aliens.length} aliens à ${Math.min(...dists).toFixed(0)}-${Math.max(...dists).toFixed(0)} px, ${quadrants.size} quadrants`);
  }

  // ---- vague en cercle à plusieurs joueurs (20/10) : chaque squad vivante est entourée de son propre cercle, le total (× 1 + 0,75 × (joueurs − 1)) réparti entre elles ;
  // un joueur à terre n'ajoute plus que la moitié (× 1 + 0,75 × 0,5 à deux), et toute la vague tombe alors sur la squad restante
  {
    const { Sim } = await vite.ssrLoadModule('/src/sim/Sim.ts');
    const { RING } = await vite.ssrLoadModule('/src/config.ts');
    const ringedBy = (players, downed = []) => {
      const sim = new Sim({ mode: MODES.survival, seed: 77, players, xp: true });
      sim.spawnSquads(() => ['trooper', 'trooper', 'trooper', 'trooper']);
      for (let i = 0; i < 3; i++) sim.step(1 / 30, new Map()); // la 1re vague (à 0 s) part : la suivante peut alors être en cercle
      sim.aliens.length = 0;
      const b = sim.arena.bounds;
      sim.squads.forEach((sq, i) => {
        // chaque squad à son propre endroit, au milieu de la carte (le cercle ne doit pas être rogné par le bord), loin des autres
        const tx = (b.minX + b.maxX) / 2 + 900 * (i - (sim.squads.length - 1) / 2), ty = (b.minY + b.maxY) / 2;
        const dx = tx - sq.center.x, dy = ty - sq.center.y;
        sq.anchor.x += dx; sq.anchor.y += dy;
        for (const so of sq.soldiers) { so.x += dx; so.y += dy; so.px = so.x; so.py = so.y; }
        sq.center.x += dx; sq.center.y += dy;
      });
      for (const id of downed) for (const so of sim.squadOf(id).soldiers) so.alive = false; // squad anéantie (à terre)
      for (const sq of sim.squads) if (downed.includes(sq.owner)) sq.soldiers.length = 0;
      const saved = [DIFFICULTY.ambushChance, DIFFICULTY.ringChance, DIFFICULTY.waveGuestChance];
      DIFFICULTY.ambushChance = 0; DIFFICULTY.ringChance = 1; DIFFICULTY.waveGuestChance = 0;
      // niveau 4 réduit à sa configuration 3 (3 toads + 12 glings) : la même à chaque essai, assez d'aliens pour que les arrondis comptent peu ; une configuration FORCÉE (`trigger(niveau, n)`) n'est jamais en cercle, d'où ce détour
      sim.waves.script = { ...sim.waves.script, levels: { ...sim.waves.script.levels, 4: [sim.waves.script.levels[4][2]] } };
      sim.waves.trigger(4);
      [DIFFICULTY.ambushChance, DIFFICULTY.ringChance, DIFFICULTY.waveGuestChance] = saved;
      const aliens = sim.aliens.filter((a) => a.alive && !a.def.boss);
      // aliens autour de chaque squad : ceux dont elle est la squad la plus proche (les obstacles du milieu de la carte peuvent rapprocher un alien du centre de son cercle)
      const near = (a) => sim.squads.reduce((best, sq) => (Math.hypot(a.x - sq.center.x, a.y - sq.center.y) < Math.hypot(a.x - best.center.x, a.y - best.center.y) ? sq : best), sim.squads[0]);
      const per = sim.squads.map((sq) => aliens.filter((a) => near(a) === sq && Math.hypot(a.x - sq.center.x, a.y - sq.center.y) < RING.radius + 90).length);
      return { total: aliens.length, per };
    };
    const solo = ringedBy(['p1']);
    const duo = ringedBy(['p1', 'p2']);
    const trio = ringedBy(['p1', 'p2', 'p3']);
    const ok = duo.per.every((n) => n >= 1) && trio.per.every((n) => n >= 1) && Math.abs(duo.per[0] - duo.per[1]) <= 2 && Math.abs(trio.per[0] - trio.per[2]) <= 2;
    check(ok && Math.abs(duo.total / solo.total - 1.75) < 0.25 && Math.abs(trio.total / solo.total - 2.5) < 0.3, 'cercle à plusieurs joueurs : chaque squad est entourée de son cercle, total ×1,75 à 2 joueurs et ×2,5 à 3, réparti à parts égales', `solo ${solo.total} (${solo.per}) ; 2 joueurs ${duo.total} (${duo.per}) ; 3 joueurs ${trio.total} (${trio.per})`);
    const down = ringedBy(['p1', 'p2'], ['p2']);
    const f = 1 + DIFFICULTY.extraPlayerAliens * DIFFICULTY.extraPlayerDownedShare;
    check(DIFFICULTY.extraPlayerDownedShare === 0.5 && Math.abs(down.total / solo.total - f) < 0.2 && down.per[0] >= down.total - 1, 'un joueur à terre alourdit les vagues 2 fois moins : à 2 joueurs dont un à terre, ×1,375 (et non ×1,75), tout autour de la squad vivante', `solo ${solo.total} ; 2 joueurs dont un à terre ${down.total} (×${(down.total / solo.total).toFixed(2)}, attendu ×${f}) ; autour de la squad vivante ${down.per[0]}`);
  }

  // ---- la toute première vague de la partie n'est jamais en cercle (même avec une chance à 1), la suivante l'est
  {
    const { sim } = fresh(41);
    if (sim.tutorial) sim.tutorial = null;
    const saved = [DIFFICULTY.ambushChance, DIFFICULTY.ringChance];
    DIFFICULTY.ambushChance = 0;
    DIFFICULTY.ringChance = 1;
    sim.waves.reset(); // début de partie : aucune vague partie
    const sq = sim.squadOf('p1');
    const spread = () => {
      const aliens = sim.aliens.filter((a) => a.alive && !a.def.boss);
      return { n: aliens.length, d: aliens.map((a) => Math.hypot(a.x - sq.center.x, a.y - sq.center.y)) };
    };
    clearAliens(sim);
    sim.waves.trigger(1);
    const first = spread();
    clearAliens(sim);
    sim.waves.trigger(1);
    const second = spread();
    [DIFFICULTY.ambushChance, DIFFICULTY.ringChance] = saved;
    check(first.n >= 3 && first.d.every((d) => d > 600), 'première vague : jamais en cercle (chance à 1), elle apparaît hors écran', `${first.n} aliens à plus de ${Math.min(...first.d).toFixed(0)} px`);
    check(second.n >= 3 && second.d.every((d) => d > 200 && d < 420), 'deuxième vague : en cercle autour de la squad', `${second.n} aliens à ${Math.min(...second.d).toFixed(0)}-${Math.max(...second.d).toFixed(0)} px`);
  }

  // ---- vague en cercle rejouée pendant un boss : aussi en cercle, mais sans globe d'XP
  {
    const { sim } = fresh(40);
    if (sim.tutorial) sim.tutorial = null;
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const saved = [DIFFICULTY.ambushChance, DIFFICULTY.ringChance];
    DIFFICULTY.ambushChance = 0;
    DIFFICULTY.ringChance = 1;
    sim.waves._replaying = true;
    sim.waves.trigger(3);
    sim.waves._replaying = false;
    [DIFFICULTY.ambushChance, DIFFICULTY.ringChance] = saved;
    const aliens = sim.aliens.filter((a) => a.alive && !a.def.boss);
    const dists = aliens.map((a) => Math.hypot(a.x - sq.center.x, a.y - sq.center.y));
    check(aliens.length >= 4 && dists.every((d) => d > 200 && d < 420) && aliens.every((a) => a.noXp), 'cercle : un rejeu pendant un boss sort aussi en cercle, sans XP', `${aliens.length} aliens à ${Math.min(...dists).toFixed(0)}-${Math.max(...dists).toFixed(0)} px, tous sans XP`);
  }

  // ---- un alien qui sort du sol ou s'enterre n'est jamais repoussé (onde de choc du level up, explosion, recul des coups)
  {
    const { sim, step } = fresh(40);
    if (sim.tutorial) sim.tutorial = null;
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 1e9;
    const c = sq.center;
    const make = (dy) => {
      sim.horde.spawnAt('slime', c.x + 120, c.y + dy);
      return sim.aliens[sim.aliens.length - 1];
    };
    const emerging = make(-60); // vient d'apparaître : sort de son trou
    const sinking = make(0);
    const free = make(60);
    free.age = 5; // sorti depuis longtemps
    sinking.age = 5;
    sinking.sinkT = 0.6; // s'enfonce avant d'être recyclé
    for (const al of [emerging, sinking, free]) al.px = al.x, al.py = al.y;
    const before = [emerging, sinking, free].map((al) => ({ x: al.x, y: al.y }));
    sim.shockwave(c.x, c.y, 640, 460, 0.5, 0.2); // onde de level up
    sim.addBlast(c.x + 100, c.y, 160, 0, 'soldiers', 'p1', 400); // explosion qui repousse
    step(6);
    const moved = [emerging, sinking, free].map((al, i) => Math.hypot(al.x - before[i].x, al.y - before[i].y));
    check(moved[0] < 1 && moved[1] < 1 && moved[2] > 20, "repoussement : un alien qui sort du sol ou s’enfonce n’est pas repoussé (onde de choc, explosion), un alien libre l’est", `sort ${moved[0].toFixed(1)} px · s'enfonce ${moved[1].toFixed(1)} px · libre ${moved[2].toFixed(1)} px`);
  }

  // ---- aimant (power-up) : aspire globes d'XP, recrues et power-ups de TOUTE la carte
  {
    const { sim, step } = fresh(18);
    clearAliens(sim);
    sim.xp.clear();
    sim.recruits.clear();
    sim.powerups.items.length = 0;
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 1e9;
    const far = { x: sq.center.x > sim.map.width / 2 ? 260 : sim.map.width - 260, y: sq.center.y > sim.map.height / 2 ? 260 : sim.map.height - 260 };
    const xp0 = sq.xp + sq.level * 1e6;
    sim.xp.orbs.push({ id: sim.ids.get(), x: far.x, y: far.y, px: far.x, py: far.y, value: 1, life: 30 });
    sim.recruits.drop('trooper', far.x + 40, far.y, undefined, true);
    sim.powerups.drop('stim', far.x - 40, far.y, true);
    const dist = Math.hypot(far.x - sq.center.x, far.y - sq.center.y);
    const on = sq.soldiers.find((s) => s.alive);
    sim.powerups.drop('magnet', on.x, on.y, true);
    const size0 = sq.soldiers.length;
    step(30 * 6);
    const gotXp = sq.xp + sq.level * 1e6 > xp0;
    const farLeft = sim.xp.orbs.filter((o) => Math.hypot(o.x - far.x, o.y - far.y) < 200).length; // seul le globe lointain compte : les aliens des vagues tués pendant les 6 s en laissent d'autres près de la squad
    check(dist > 1500 && farLeft === 0 && gotXp && sq.soldiers.length > size0 && sq.buffs.stim > 0, 'aimant : aspire globes, recrues et power-ups de toute la carte', `objets à ${dist.toFixed(0)} px ; restent ${farLeft} globe(s) au loin, ${sim.recruits.items.length} recrue(s), ${sim.powerups.items.length} power-up(s)`);
  }

  // ---- niveaux de difficulté : multiplicateur de stats de base (PV, dégâts, cadence, vitesse) et d'escalade (gains par boss tué) ; normal inchangé
  {
    const want = { normal: [1, 1], expert: [DIFFICULTY.expertBaseMul, DIFFICULTY.expertScaleMul], impossible: [DIFFICULTY.impossibleBaseMul, DIFFICULTY.impossibleScaleMul] };
    for (const difficulty of ['normal', 'expert', 'impossible']) {
      const session = new LocalSession({ mode: MODES.survival, seed: 12, bots: 0, difficulty });
      const sim = session.sim;
      for (let i = 0; i < 2; i++) session.advance(34, () => {});
      if (sim.tutorial) sim.tutorial = null;
      sim.aliens.length = 0;
      const sq = sim.squadOf('p1');
      const [base, scale] = want[difficulty];
      const spawn = () => { sim.aliens.length = 0; sim.horde.spawnAt('slime', sq.center.x + 700, sq.center.y, 1, false, true); return sim.aliens[0]; };
      sim.bossKills = 0;
      const a0 = spawn();
      check(Math.abs(a0.maxHp - ALIENS.slime.hp * base) < 1e-6 && Math.abs(a0.escDmg - base) < 1e-9 && Math.abs(a0.escRate - base) < 1e-9 && Math.abs(a0.escSpeed - base) < 1e-9, `${difficulty} : stats de base des aliens ×${base} (PV, dégâts, cadence, vitesse)`, `${a0.maxHp.toFixed(1)} PV pour ${ALIENS.slime.hp} de base`);
      sim.bossKills = 2;
      const a2 = spawn();
      const wantHp = ALIENS.slime.hp * base * (1 + DIFFICULTY.bossEscalationHp * scale) ** 2;
      const wantSpeed = base * (1 + DIFFICULTY.bossEscalationSpeed * scale) ** 2;
      check(Math.abs(a2.maxHp - wantHp) < 1e-6 && Math.abs(a2.escSpeed - wantSpeed) < 1e-9, `${difficulty} : escalade ×${scale} sur chaque gain par boss tué (2 boss)`, `${a2.maxHp.toFixed(1)} PV, vitesse ×${a2.escSpeed.toFixed(3)}`);
      sim.bossKills = 0;
    }
  }

  // ---- Gling Mère par niveau : Hard (expert) = 5 toiles toutes les 5,6 s ; Expert (impossible) = en plus 10 araignées en cercle autour de la squad toutes les 6 s ; rien en Normal
  for (const difficulty of ['normal', 'expert', 'impossible']) {
    const session = new LocalSession({ mode: MODES.survival, seed: 9, bots: 0, difficulty });
    const sim = session.sim;
    for (let i = 0; i < 2; i++) session.advance(34, () => {});
    if (sim.tutorial) sim.tutorial = null;
    sim.aliens.length = 0;
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_gling', sq.center.x + 900, sq.center.y, 1, false, true);
    const boss = sim.aliens[0];
    boss.swarmCd = 1e9; // on isole les nouvelles capacités : pas d'essaim classique
    let seenSpiders = 0, spiderBursts = 0, seenIce = 0, iceBursts = 0, ringErr = 0;
    for (let tick = 0; tick < 30 * 18; tick++) {
      boss.x = sq.center.x + 900; boss.y = sq.center.y; boss.hp = boss.maxHp; // le boss reste en vie, loin
      sq.soldiers.forEach((x) => { x.invulnerable = 5; }); // les toiles ne sont pas consommées par le test
      session.advance(34, () => {});
      const spiders = sim.aliens.filter((a) => a.def.id === 'spider');
      if (spiders.length - seenSpiders >= 5) { spiderBursts++; ringErr = spiders.reduce((m, a) => Math.max(m, Math.abs(Math.hypot(a.x - sq.center.x, a.y - sq.center.y) - 300)), 0); }
      seenSpiders = spiders.length;
      const ice = sim.puddles.filter((p) => p.web).length;
      if (ice - seenIce >= 5) iceBursts++;
      seenIce = ice;
    }
    const wantSpiders = difficulty === 'impossible' ? 3 : 0; // 18 s : surgissements à 6, 12 et 18 s (le dernier peut tomber juste après)
    const wantIce = difficulty === 'normal' ? 0 : 3; // 18 s : 5,6 s, 11,2 s et 16,8 s
    check(spiderBursts >= (wantSpiders ? 2 : 0) && spiderBursts <= wantSpiders, `${difficulty} : Gling Mère, cercle d'araignées ${difficulty === 'impossible' ? 'toutes les 6 s' : 'absent'}`, `${spiderBursts} surgissement(s)`);
    if (wantSpiders) check(ringErr < 120, `${difficulty} : les araignées surgissent en cercle autour de la squad (rayon ~300 px)`, `écart max au rayon ${ringErr.toFixed(0)} px`);
    check(iceBursts === wantIce, `${difficulty} : Gling Mère, toiles ${difficulty === 'normal' ? 'absentes' : 'toutes les 5,6 s (5 à la fois)'}`, `${iceBursts} salve(s)`);
  }

  // ---- bouclier de 5 % sur TOUS les boss en mode impossible seulement (normal et expert : aucun) ; il encaisse avant les PV et passe correctement par le réseau
  {
    const { takeSnapshot, encodeSnapshot, decodeSnapshot } = await vite.ssrLoadModule('/src/net/Protocol.ts');
    const BOSSES = ['boss_rhino', 'boss_gling', 'boss_scarab', 'boss_rhino_fire', 'boss_rhino_ice', 'boss_crab'];
    for (const difficulty of ['normal', 'expert', 'impossible']) {
      const session = new LocalSession({ mode: MODES.survival, seed: 14, bots: 0, difficulty });
      const sim = session.sim;
      for (let i = 0; i < 2; i++) session.advance(34, () => {});
      if (sim.tutorial) sim.tutorial = null;
      const sq = sim.squadOf('p1');
      let ok = true;
      let detail = '';
      for (const id of BOSSES) {
        sim.aliens.length = 0;
        sim.horde.spawnAt(id, sq.center.x + 900, sq.center.y, 1, false, true);
        const boss = sim.aliens[0];
        const want = difficulty === 'impossible' ? boss.maxHp * 0.05 : 0;
        if (Math.abs(boss.maxShield - want) > 1e-6 || Math.abs(boss.shield - want) > 1e-6) { ok = false; detail = `${id} : ${boss.maxShield.toFixed(0)} au lieu de ${want.toFixed(0)}`; break; }
      }
      check(ok, `${difficulty} : bouclier des boss ${difficulty === 'impossible' ? '= 5 % de leurs PV max (les 6 boss)' : 'absent'}`, detail);
      if (difficulty === 'impossible') {
        sim.aliens.length = 0;
        sim.horde.spawnAt('boss_rhino', sq.center.x + 900, sq.center.y, 1, false, true);
        const boss = sim.aliens[0];
        boss.age = 1;
        const before = boss.shield;
        sim.damage(boss, 100, null);
        check(boss.hp === boss.maxHp && Math.abs(boss.shield - (before - 100)) < 1e-6, 'impossible : le bouclier d’un boss encaisse avant ses PV');
        const snap = decodeSnapshot(encodeSnapshot(takeSnapshot(sim)));
        const bs = snap?.aliens.find((x) => x.id === boss.id);
        check(!!bs && Math.abs(bs.shield - boss.shield / boss.maxShield) < 0.01, 'impossible : bouclier du boss lu fidèlement dans le snapshot', `${bs?.shield.toFixed(3)}`);
      }
    }
  }

  // ---- relance : un loot rare lâché par un alien tué (pas un power-up tiré au hasard), environ 5 par partie de 10 minutes
  {
    const { sim } = fresh(33);
    if (sim.tutorial) sim.tutorial = null; // hors onboarding
    const sq = sim.squadOf('p1');
    const seen = new Set();
    let hopped = false;
    let randomReroll = false;
    let neverExpires = true;
    const kill = { x: sq.center.x + 300, y: sq.center.y, noRecruit: false, noXp: false, def: { egg: false, xp: 4 } }; // un alien tué loin de la squad
    for (let i = 0, t = 0; t < 600; t += 0.5, i++) {
      sim.powerups.update(0.5);
      for (let k = 0; k < (i % 2 ? 4 : 3); k++) {
        // ~7 aliens tués par seconde (le loot se joue au nombre d'aliens tués, plus au temps)
        sim.powerups.maybeDropReroll(kill, sq);
        for (const p of sim.powerups.items) {
          if (p.kind !== 'reroll' || seen.has(p.id)) continue;
          seen.add(p.id);
          if (p.hop) hopped = true;
          if (p.life < 1e5) neverExpires = false; // aucune relance n'expire
          if (Math.abs(p.x - kill.x) > 1 || Math.abs(p.y - kill.y) > 1) randomReroll = true; // né ailleurs que sur l'alien : tiré au hasard comme un power-up
        }
        sim.powerups.items.length = 0; // le test ne ramasse rien : on vide pour ne compter que les apparitions
      }
    }
    check(seen.size >= 4 && seen.size <= 6, 'relance (loot) : environ 5 en 10 minutes', `${seen.size} relances`);
    check(hopped && !randomReroll, 'relance (loot) : sort de l\'alien tué et retombe en cloche à l’écart');
    check(neverExpires, 'relance (loot) : n’expire jamais');
  }

  // ---- relance : imprenable la première seconde (comme les globes d'upgrade), puis ramassée
  {
    const { sim } = fresh(35);
    if (sim.tutorial) sim.tutorial = null;
    const sq = sim.squadOf('p1');
    sim.powerups.items.length = 0;
    const before = sq.rerolls;
    sim.powerups.rerollReady = true;
    sim.powerups.maybeDropReroll({ x: sq.center.x + 5, y: sq.center.y, noRecruit: false, noXp: false, def: { egg: false, xp: 4 } }, sq); // pile sur la squad : pas de saut
    for (let i = 0; i < 8; i++) sim.powerups.update(0.1); // 0,8 s
    check(sim.powerups.items.length === 1 && sq.rerolls === before, 'relance : imprenable pendant le délai (0,8 s)', `${sim.powerups.items.length} au sol, ${sq.rerolls - before} ramassée(s)`);
    for (let i = 0; i < 12; i++) sim.powerups.update(0.1); // 2 s au total
    check(sim.powerups.items.length === 0 && sq.rerolls === before + 1, 'relance : ramassée une fois le délai écoulé', `${sim.powerups.items.length} au sol, +${sq.rerolls - before}`);
  }

  // ---- upgrades : plus de niveaux 10, 20, 30… tout prismatiques (seul le booster prismatique garantit un panneau entier)
  {
    const { sim } = fresh(19);
    const sq = sim.squadOf('p1');
    let allPrism = 0;
    for (let guard = 0; guard < 400 && sq.level < 41; guard++) {
      sq.gainXp(sq.xpNeeded - sq.xp + 0.01); // un niveau
      while (sq.offer) {
        if (sq.offerPrism.length === 3 && sq.offerPrism.every(Boolean)) allPrism++;
        sim.chooseUpgrade('p1', 0);
      }
    }
    check(sq.level >= 40 && allPrism === 0, 'upgrades : aucun panneau tout prismatique aux niveaux 10, 20, 30, 40 (sans booster)', `niveau ${sq.level}, ${allPrism} panneau(x) tout prismatique(s)`);
  }

  // ---- objet au sol attrapé (attiré) : il ne disparaît plus et ne clignote plus
  {
    const { sim, step } = fresh(20);
    clearAliens(sim);
    sim.xp.clear();
    sim.powerups.items.length = 0;
    const { PICKUP, ORB_BLINK_TIME } = await vite.ssrLoadModule('/src/config.ts');
    const sq = sim.squadOf('p1');
    const s0 = sq.soldiers.find((s) => s.alive);
    const orb = { id: sim.ids.get(), x: s0.x + 90, y: s0.y, px: s0.x + 90, py: s0.y, value: 1, life: 0.2 };
    sim.xp.orbs.push(orb);
    const pu = sim.powerups.drop('stim', s0.x - 90, s0.y);
    pu.life = 0.2;
    step(1);
    const caughtOk = orb.caught && pu.caught && orb.life >= ORB_BLINK_TIME && pu.life >= 4;
    // on les éloigne à 1500 px : ils ne disparaissent pas, suivent la squad qui les a attrapés et finissent ramassés
    for (const o of [orb, pu]) { o.x = o.px = sq.center.x + 1500; o.y = o.py = sq.center.y; }
    const xp0 = sq.xp + sq.level * 1e6;
    step(30 * 3);
    const picked = !sim.xp.orbs.includes(orb) && sq.xp + sq.level * 1e6 > xp0 && !sim.powerups.items.includes(pu) && sq.buffs.stim > 0;
    check(caughtOk && picked, 'objet attiré : il ne disparaît plus, ne clignote plus et revient vers sa squad', `durée figée à ${PICKUP.caughtLife} s ; ramassés : ${picked}`);
    // une recrue attrapée par une squad très rapide (vitesse × 3) la rattrape quand même (accélération jusqu'à PICKUP.maxSpeed)
    sim.recruits.clear();
    sq.stats.add('speed', { mul: 3 });
    const size0 = sq.soldiers.length;
    const lead = sq.soldiers.find((s) => s.alive);
    sim.recruits.drop('trooper', lead.x + 90, lead.y, undefined, true);
    const run = new Map([['p1', { mx: -1, my: 0 }]]);
    let t = 0;
    while (sq.soldiers.length === size0 && t++ < 90) sim.step(1 / 30, run);
    check(sq.soldiers.length > size0, 'recrue attirée : une squad très rapide ne peut pas la distancer', `ramassée en ${(t / 30).toFixed(2)} s`);
  }

  // ---- slime de glace : orbe de glace = projectile destructible (500 PV, barre de vie), gèle le soldat touché
  {
    const { sim, step } = fresh(21);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 0;
    const target = sq.soldiers.find((s) => s.alive);
    sim.horde.spawnAt('iceballer', target.x + 300, target.y, 1, false);
    const ib = sim.aliens[0];
    ib.age = 99;
    ib.hp = ib.maxHp = 1e9;
    sim.combat.iceShot(ib, target);
    const orb = sim.aliens.find((a) => a.def.id === 'ice_orb');
    check(!!orb && orb.maxHp === 500 && orb.hp === 500 && sim.horde.targetable(orb) && orb.noXp && orb.noRecruit, 'slime de glace : il lance un orbe de glace de 500 PV, visable par la squad', orb ? `${orb.maxHp} PV` : 'aucun orbe');
    // l'orbe touche un soldat : il le gèle et se brise
    for (const s of sq.soldiers) s.frozen = 0;
    let ticks = 0;
    while (orb.alive && ticks++ < 60) {
      orb.hp = 500; // on l'empêche d'être détruit par les tirs ici
      sim.horde.update(1 / 30);
    }
    const frozen = sq.soldiers.filter((s) => s.frozen > 0).length;
    check(!orb.alive && frozen >= 1, 'orbe de glace : au contact, il gèle un soldat puis se brise', `${frozen} soldat(s) gelé(s)`);
    // un second orbe détruit par la squad (dégâts) : il meurt sans XP
    sim.combat.iceShot(ib, target);
    const orb2 = sim.aliens.find((a) => a.def.id === 'ice_orb' && a.alive);
    sim.xp.clear();
    sim.damage(orb2, 499, 'p1');
    const alive499 = orb2.alive;
    sim.damage(orb2, 1, 'p1');
    check(alive499 && !orb2.alive && sim.xp.orbs.length === 0, 'orbe de glace : détruit par la squad après 500 dégâts, sans XP');
  }

  // ---- tir sans priorité (09/10) : la cible la plus proche, alien ou glaçon d'un allié gelé (une bulle qui a avalé un allié n'est pas prioritaire)
  {
    const { sim } = fresh(22);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    while (sq.soldiers.length < 3) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
    const [shooter, iced, eaten] = sq.soldiers;
    for (const s of sq.soldiers) { s.invulnerable = 1e9; s.frozen = 0; s.capturedBy = 0; }
    shooter.x = 1500; shooter.y = 1500;
    iced.x = 1500 + 150; iced.y = 1500; iced.frozen = 30; // gelé, à 150 px
    eaten.x = 1500; eaten.y = 1500 + 220;
    sim.horde.spawnAt('slime', 1500 - 40, 1500, 1, false); // alien tout près (40 px)
    sim.horde.spawnAt('bubble', 1500, 1500 + 220, 1, false); // bulle qui tient un allié, à 220 px
    const [slime, bubble] = sim.aliens;
    for (const a of sim.aliens) { a.age = 99; a.hp = a.maxHp = 1e9; }
    bubble.captive = eaten;
    eaten.capturedBy = bubble.id;
    const aim = () => {
      shooter.retarget = 0;
      shooter.cooldown = 1e9; // il vise sans tirer
      sim.step(1 / 30, new Map());
      sim.aliens.splice(0, sim.aliens.length, slime, bubble);
      shooter.x = 1500; shooter.y = 1500;
      return shooter.target;
    };
    const first = aim(); // slime à 40 px, glaçon à 150, bulle à 220
    iced.x = 1500 + 20; // glaçon plus proche que le slime
    const second = aim();
    check(first === slime && second === iced, 'tir : un soldat vise le plus proche (alien ou glaçon d’un allié), sans priorité', `1re cible ${first?.def?.id ?? first?.kind}, 2e ${second?.kind}${second === iced ? ' (glaçon)' : ''}`);
  }

  // ---- boss tué : « clear screen », tous les autres aliens meurent comme si le joueur les avait tués (XP, explosion des kamikazes…), un autre boss est épargné
  {
    const { sim } = fresh(15);
    clearAliens(sim);
    sim.xp.clear();
    sim.recruits.clear();
    const sq = sim.squadOf('p1');
    const far = (dx, dy) => [sq.center.x + dx, sq.center.y + dy];
    sim.horde.spawnAt('boss_rhino', ...far(600, 0));
    sim.horde.spawnAt('boss_gling', ...far(-600, 0));
    for (let i = 0; i < 12; i++) sim.horde.spawnAt('slime', ...far(300 + i * 20, 300));
    sim.horde.spawnAt('bubble', ...far(0, -300));
    sim.horde.spawnAt('kamikaze', ...far(0, 700));
    sim.horde.spawnAt('slime', ...far(-300, 300));
    for (const a of sim.aliens) a.noXp = a.noRecruit = false; // `spawnAt` les marque invoqués : ici, des aliens de vague ordinaires
    const replayed = sim.aliens[sim.aliens.length - 1];
    replayed.noXp = true; // envoyé par un rejeu de vague pendant le boss : ne donne toujours pas d'XP
    const [boss, other] = sim.aliens;
    const bubble = sim.aliens.find((a) => a.def.id === 'bubble');
    const prisoner = sq.soldiers[0];
    bubble.captive = prisoner;
    prisoner.capturedBy = bubble.id;
    for (const a of sim.aliens) a.age = 99; // sortis de leur trou d'apparition (sinon invulnérables)
    sim.damage(boss, 1e9, 'p1');
    const others = sim.aliens.filter((a) => a !== boss && a !== other && !a.def.egg); // (l'œuf que laisse le boss n'est pas un survivant)
    check(!boss.alive && others.every((a) => !a.alive), 'boss tué : tous les autres aliens meurent avec lui', `${others.filter((a) => a.alive).length} survivant(s)`);
    check(other.alive, 'boss tué : un autre boss encore en vie est épargné');
    const xp = sim.xp.orbs.reduce((n, o) => n + o.value, 0);
    const expected = 12 * ALIENS.slime.xp + ALIENS.bubble.xp + ALIENS.kamikaze.xp; // + celle du boss ; pas celle du slime d'un rejeu de vague
    check(xp >= expected, 'boss tué : les aliens nettoyés donnent leur XP comme si le joueur les avait tués', `${xp} XP au sol (≥ ${expected} attendus)`);
    check(sim.fuses.length >= 1, 'boss tué : un kamikaze nettoyé explose quand même', `${sim.fuses.length} explosion(s) en attente`);
    check(prisoner.capturedBy === 0 && bubble.captive === null, 'boss tué : la bulle morte avec lui libère son prisonnier');
    check(!sim.powerups.items.some((p) => p.kind === 'magnet'), 'boss tué : plus d’aimant garanti');
    const eggs = () => sim.aliens.filter((a) => a.alive && a.def.egg);
    check(eggs().length === 1, 'boss tué avec un autre boss encore en vie : il laisse quand même son œuf', `${eggs().length} œuf(s)`);
    other.age = 99;
    sim.damage(other, 1e12, 'p1');
    check(eggs().length === 2 && eggs().some((e) => Math.hypot(e.x - other.x, e.y - other.y) < 40), 'boss tué (le dernier) : un second œuf apparaît sur son cadavre', `${eggs().length} œuf(s)`);
  }

  // ---- œuf de boss : 1000 PV à détruire, 2 globes d'upgrade PAR JOUEUR, réservés à leur joueur ; globe ramassé = une upgrade au hasard
  {
    const { sim, step: rawStep } = fresh(31);
    const step = (n) => { for (let i = 0; i < n; i++) { sim.aliens = sim.aliens.filter((a) => a.def.egg); sim.xp.clear(); rawStep(1); } }; // aucun alien sauf l'œuf (les vagues en enverraient) : pas de montée de niveau qui figerait la partie
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 1e9;
    sim.addPlayer('p2'); // second joueur : sa squad est vivante, il a donc aussi droit à ses globes
    const sq2 = sim.squadOf('p2');
    sq2.recruit('trooper', { x: sq.center.x + 2000, y: sq.center.y });
    const x = sq.center.x + 700;
    const y = sq.center.y;
    sim.horde.spawnEgg(x, y);
    const egg = sim.aliens.find((a) => a.def.egg);
    const EGG_HP = egg.maxHp; // PV adaptés au DPS des squads (2 s de destruction) : voir le test dédié plus bas
    check(!!egg && egg.hp === EGG_HP && DIFFICULTY.chestOrbs === 2, 'œuf : PV exacts (ni escalade ni multiplicateur), 2 globes par joueur (réglage du panneau Difficulté)', `${egg?.hp} PV`);
    step(30 * 5);
    check(egg.alive && egg.hp === EGG_HP && Math.hypot(egg.x - x, egg.y - y) < 1 && sim.upgradeOrbs.items.length === 0, 'œuf : immobile, inoffensif, rien ne sort tant qu’il n’est pas détruit');
    // onde de choc (level up, revive gratuit mortel) : l'œuf, scellé sur son socle, ne bouge pas et n'est pas détruit
    sim.shockwave(x - 150, y, 640, 460, 0.9, 0.6, 'p1');
    step(30 * 2);
    check(egg.alive && Math.hypot(egg.x - x, egg.y - y) < 1e-6 && egg.hp === EGG_HP, 'œuf : insensible à l’onde de choc (ni poussé ni détruit, même par un revive mortel)', `${Math.hypot(egg.x - x, egg.y - y).toFixed(1)} px de déplacement`);
    // les soldats viennent se poster dessus (replacés à chaque tick : sinon la formation les ramène vers le centre de la squad)
    const hold = (dx, ticks) => { for (let i = 0; i < ticks; i++) { for (const s of sq.soldiers) { s.x = x + dx; s.y = y; s.px = s.x; s.py = s.y; } step(1); } };
    const picked0 = Object.values(sq.picked).reduce((n, v) => n + v, 0);
    const chip = Math.round(EGG_HP * 0.3);
    sim.damage(egg, chip, 'p1');
    step(2);
    check(egg.alive && Math.round(egg.hp) === EGG_HP - chip && sim.upgradeOrbs.items.length === 0, 'œuf : abîmé mais pas détruit, rien ne sort', `${egg.hp} PV`);
    sim.damage(egg, 1e9, 'p1');
    step(1);
    const opened = !sim.aliens.some((a) => a.def.egg);
    const mine = sim.upgradeOrbs.items.filter((o) => o.owner === 'p1');
    const theirs = sim.upgradeOrbs.items.filter((o) => o.owner === 'p2');
    check(opened && mine.length === 2 && theirs.length === 2, 'œuf détruit : il libère 2 globes d’upgrade par joueur', `${mine.length} + ${theirs.length} globes`);
    check(sim.upgradeOrbs.items.every((o) => o.hop && o.hop.t > 0), 'œuf détruit : les globes tombent en cloche autour de lui');
    // imprenable la première seconde : même un soldat posé juste dessus ne le prend pas
    const grace = DIFFICULTY.chestOrbGrace;
    check(grace === 1, 'globe d’upgrade : imprenable la première seconde (réglage du panneau Difficulté)');
    for (let i = 0; i < 24; i++) { // 0,8 s après la sortie
      for (const o of sim.upgradeOrbs.items) if (!o.hop) for (const s of sq.soldiers) { s.x = o.x; s.y = o.y; s.px = s.x; s.py = s.y; }
      if (i >= 17) for (const o of sim.upgradeOrbs.items) if (o.owner === 'p1') { sq.soldiers[0].x = o.x; sq.soldiers[0].y = o.y; }
      step(1);
    }
    check(mine.every((o) => sim.upgradeOrbs.items.includes(o)) && Object.values(sq.picked).reduce((n, v) => n + v, 0) === picked0, 'globe d’upgrade : un soldat posé dessus ne le prend pas avant la fin de la première seconde', `${sim.upgradeOrbs.items.length} globes encore au sol`);
    hold(20, 30);
    check(sim.upgradeOrbs.items.every((o) => !o.hop && Math.hypot(o.x - x, o.y - y) > 30 && Math.hypot(o.x - x, o.y - y) < 130), 'œuf détruit : ils retombent à côté, au sol');
    // jamais prismatique : même avec 100 % de chance de prismatique
    const chance = DIFFICULTY.prismChance;
    const keep = { ...sq.picked };
    DIFFICULTY.prismChance = 1;
    const seen = [];
    for (let i = 0; i < 6; i++) {
      sim.events.drain(() => {});
      sq.grantUpgrade('damage', 0, 0);
      sim.events.drain((e) => e.t === 'upgradePicked' && seen.push(e.prism));
    }
    DIFFICULTY.prismChance = chance;
    for (const k of Object.keys(sq.picked)) delete sq.picked[k];
    Object.assign(sq.picked, keep); // ces upgrades de test ne comptent pas pour la suite
    check(seen.length >= 1 && seen.every((p) => p === false), 'globe d’upgrade : jamais prismatique (même avec 100 % de chance de prismatique)', `${seen.length} upgrades, prismatiques : ${seen.filter(Boolean).length}`);
    // offre de montée de niveau déjà tirée : un globe qui porte une de ses upgrades au maximum la remplace (sinon 6 prises sur 5 possibles)
    {
      const keepPicked = { ...sq.picked };
      sq.picked.range = 4;
      sq.offer = ['range', 'damage', 'hp'];
      sq.grantUpgrade('range', 0, 0); // 5e prise : range est au maximum
      check(sq.picked.range === 5 && !sq.offer.includes('range') && new Set(sq.offer).size === 3 && sq.offer.every((id) => (sq.picked[id] ?? 0) < 99), 'globe d’upgrade : une proposition de niveau déjà tirée perd l’upgrade devenue maximale', `offre ${sq.offer.join(', ')}`);
      sq.offer = null;
      for (const k of Object.keys(sq.picked)) delete sq.picked[k];
      Object.assign(sq.picked, keepPicked);
    }
    // les globes du joueur 2 ne sont pas attirés par le joueur 1, même collés à lui
    for (const o of theirs) { o.x = sq.soldiers[0].x; o.y = sq.soldiers[0].y; o.px = o.x; o.py = o.y; }
    hold(20, 30 * 3);
    check(theirs.every((o) => sim.upgradeOrbs.items.includes(o)) && Object.values(sq.picked).reduce((n, v) => n + v, 0) === picked0 + 2 && Object.values(sq2.picked).reduce((n, v) => n + v, 0) === 0, 'globes d’upgrade : chaque joueur ne ramasse que ses globes (aucun vol possible)', `p1 +${Object.values(sq.picked).reduce((n, v) => n + v, 0) - picked0} upgrades, p2 ${Object.values(sq2.picked).reduce((n, v) => n + v, 0)}`);
    check(sim.upgradeOrbs.items.length === 2 && sim.upgradeOrbs.items.every((o) => o.owner === 'p2'), 'globes d’upgrade : ses 2 globes ramassés disparaissent, ceux de l’autre joueur restent', `${sim.upgradeOrbs.items.length} globe(s) restant(s)`);
    // pas d'expiration : 3 minutes plus tard, le globe du joueur 2 attend toujours
    step(30 * 180);
    check(sim.upgradeOrbs.items.length === 2, 'coffre : un globe d’upgrade ne disparaît jamais', `${sim.upgradeOrbs.items.length} globe(s) après 3 min`);
    sim.restart();
    check(sim.upgradeOrbs.items.length === 0, 'globes d’upgrade effacés à la relance');
  }

  // ---- recrues attirées devenues inutiles : elles ne restent plus figées en l'air (avant : `caught` les bloquait sans fin)
  {
    const { sim, step: rawStep } = fresh(32);
    const step = (n) => { for (let i = 0; i < n; i++) { sim.aliens.length = 0; sim.xp.clear(); rawStep(1); } }; // aucun alien (les vagues en enverraient) : pas de montée de niveau qui figerait la partie
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) { s.invulnerable = 1e9; s.hp = s.maxHp; }
    while (sq.size < sq.maxSize) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y }); // squad pleine et intacte
    sim.recruits.clear();
    const r = sim.recruits.drop('trooper', sq.center.x + 900, sq.center.y, undefined);
    r.hop = undefined;
    r.pulled = 'p1'; // aspirée par l'aimant, comme les recrues d'un clear screen
    r.caught = true;
    r.life = 8;
    step(2);
    check(!r.caught && !r.pulled && r.life > 15, 'recrue aspirée devenue inutile (squad pleine et intacte) : elle se pose et redevient normale', `caught ${r.caught}, vie ${r.life.toFixed(1)} s`);
    step(30 * 25);
    check(!sim.recruits.items.includes(r), 'recrue devenue inutile : elle finit par disparaître au lieu de rester en l’air', `${sim.recruits.items.length} recrue(s) restante(s)`);
    // et si une place se libère pendant qu'elle est posée, elle est de nouveau attirée
    const r2 = sim.recruits.drop('trooper', sq.center.x + 80, sq.center.y, undefined);
    r2.hop = undefined;
    sq.soldiers[0].hp = 1; // un blessé : elle redevient utile (soin)
    step(30 * 2);
    check(!sim.recruits.items.includes(r2), 'recrue posée : elle est ramassée dès qu’elle redevient utile (soldat blessé)');
  }

  // ---- la charge du rhinocéros fracasse les rochers de mur (débris envoyés dans le sens de la charge)
  {
    const { sim, step } = fresh(9);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const cx = sq.center.x, cy = sq.center.y;
    sim.arena.rocks.length = 0;
    for (let i = -3; i <= 3; i++) sim.addRock(cx + 250, cy + i * 40, 22, 30);
    sim.horde.spawnAt('charger', cx + 700, cy, 1, false, true);
    const a = sim.aliens[sim.aliens.length - 1];
    a.rushCd = 0;
    a.target = sq.soldiers[0];
    for (let i = 0; i < 30 * 6; i++) {
      sim.choiceT = 0;
      step(1);
    }
    check(sim.arena.rocks.length < 7, 'la charge du rhinocéros fracasse les rochers du mur', `${sim.arena.rocks.length} / 7 rochers restants`);
  }

  // ---- booster prismatique : le prochain level-up propose 3 cartes prismatiques, une relance retombe sur les chances normales
  {
    const { sim, step } = fresh(77);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const p = sim.powerups.drop('prism', sq.center.x + 20, sq.center.y, true);
    p.hop = undefined;
    p.age = undefined;
    step(40);
    check(sq.prismBoost === true, 'booster prismatique ramassé : le prochain tirage est marqué prismatique', `prismBoost ${sq.prismBoost}`);
    sq.gainXp(sq.xpNeeded - sq.xp + 0.01);
    step(60);
    check(!!sq.offer && sq.offerPrism.length === 3 && sq.offerPrism.every(Boolean), 'le level-up suivant propose 3 cartes prismatiques', sq.offerPrism.join('/'));
    check(sq.prismBoost === false, 'le booster est consommé par ce tirage');
    sq.rerolls = 5;
    let normal = 0;
    for (let i = 0; i < 12; i++) { sq.rerollOffer(); if (!sq.offerPrism.every(Boolean)) normal++; }
    check(normal >= 11, 'après une relance : retour aux chances normales de prismatique', `${normal} / 12 tirages non entièrement prismatiques`);
  }

  // ---- recrues : le facteur de drop descend jusqu'au plancher à la taille MAX de la squad (pas à 17 soldats pour tout le monde)
  {
    const drops = (maxSquadBonus, size) => {
      const { sim } = fresh(5);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      sq.stats.add('maxSquad', { flat: maxSquadBonus });
      while (sq.soldiers.length < size) sq.recruit('trooper', { x: sq.center.x, y: sq.center.y });
      sim.horde.spawnAt('slime', sq.center.x + 900, sq.center.y, 1, false, true);
      const a = sim.aliens[sim.aliens.length - 1];
      let n = 0;
      for (let k = 0; k < 20000; k++) {
        const before = sim.recruits.items.length;
        sim.recruits.maybeDrop(a, sq);
        if (sim.recruits.items.length > before) n++;
        sim.recruits.items.length = 0;
      }
      return n;
    };
    const base = drops(0, 22); // max 12, 22 soldats (déjà plus que le max : plancher)
    const big = drops(28, 22); // max 40, 22 soldats
    const small = drops(0, 12); // max 12, 12 soldats : pente d'origine inchangée
    check(big > base * 3 && small > base * 2, 'recrues : à 22 soldats, un max de 40 recrute ~4 fois plus qu’un max de 12 (plancher) ; 12/12 inchangé', `22/12 → ${base}, 22/40 → ${big}, 12/12 → ${small} (sur 20000 morts)`);
  }

  // ---- chaman : ses nuages de glace ne tombent jamais hors de la carte (squad collée au coin)
  {
    const { sim, step } = fresh(12);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const b = sim.arena.bounds;
    const dx = b.minX + 60 - sq.center.x, dy = b.minY + 60 - sq.center.y; // squad dans le coin haut gauche, collée au bord
    for (const s of sq.soldiers) { s.x += dx; s.y += dy; s.px = s.x; s.py = s.y; }
    sq.center.x += dx; sq.center.y += dy;
    let out = 0, total = 0;
    for (let k = 0; k < 12; k++) {
      sim.horde.spawnAt('shaman', sq.center.x + 250, sq.center.y + 250, 1, false, true);
      const sh = sim.aliens[sim.aliens.length - 1];
      sh.cloudCd = 0;
      sh.target = sq.soldiers[0];
      for (let i = 0; i < 6; i++) {
        sim.choiceT = 0;
        step(1);
        for (const p of sim.puddles) { total++; if (p.x - p.r < b.minX - 0.5 || p.y - p.r < b.minY - 0.5 || p.x + p.r > b.maxX + 0.5 || p.y + p.r > b.maxY + 0.5) out++; }
      }
      sim.aliens.length = 0;
    }
    check(total > 0 && out === 0, 'chaman : ses nuages de glace restent dans la carte, même squad collée au coin', `${out} hors carte sur ${total} mesures`);
  }

  // ---- pics du lurker / du Giant Crab : la ligne s'arrête au bord de la carte
  {
    const { sim } = fresh(3);
    const b = sim.arena.bounds;
    const cx = b.minX + 100, cy = (b.minY + b.maxY) / 2;
    const toEdge = sim.arena.rayLength(cx, cy, -1, 0, 760); // vers le bord gauche, à 100 px
    const inward = sim.arena.rayLength(cx, cy, 1, 0, 760); // vers l'intérieur : longueur complète
    const diag = sim.arena.rayLength(b.minX + 50, b.minY + 50, -Math.SQRT1_2, -Math.SQRT1_2, 760); // coin : ~71 px
    check(Math.abs(toEdge - 100) < 0.01 && inward === 760 && diag < 80, 'pics : la ligne est coupée au bord de la carte', `vers le bord ${toEdge.toFixed(0)} px, vers l’intérieur ${inward}, coin ${diag.toFixed(0)}`);
  }

  // ---- les roquettes du power-up peuvent faire un critique (dégâts × CRIT_MUL, chance de la squad, plafonnée à CRIT_MAX)
  {
    const { CRIT_MUL } = await vite.ssrLoadModule('/src/config.ts');
    const { sim, step } = fresh(14);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sq.stats.add('crit', { flat: 40 }); // 40 % de chance
    const dmgs = [];
    for (let k = 0; k < 8; k++) sim.combat.barrage(sq, 30);
    for (let i = 0; i < 400; i++) {
      step(1);
      for (const p of sim.combat.projectiles.active) if (p.aoe > 0 && p.texture === 'fx_rocket' && p.life > p.maxLife - 0.034) dmgs.push(p.damage); // tout juste tirée (les projectiles sont recyclés : on les compte à leur naissance)
    }
    const base = Math.min(...dmgs);
    const crits = dmgs.filter((d) => d > base * (CRIT_MUL - 0.01)).length;
    check(dmgs.length > 100 && crits > 0 && Math.abs(crits / dmgs.length - 0.4) < 0.12, 'roquettes : critiques à la chance de la squad, dégâts × CRIT_MUL', `${crits} critiques sur ${dmgs.length} roquettes (${Math.round((100 * crits) / dmgs.length)} % pour 40 % de chance)`);
  }

  // ---- fin du jeu (boss final tombé) : plus aucun bonus ni loot au sol
  {
    const { sim, step } = fresh(15);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.recruits.drop('trooper', sq.center.x + 80, sq.center.y, undefined, true);
    sim.powerups.drop('heal', sq.center.x + 90, sq.center.y, true);
    sim.powerups.drop('reroll', sq.center.x - 90, sq.center.y, true);
    sim.upgradeOrbs.drop('p1', 'damage', sq.center.x, sq.center.y + 80, 0);
    sim.xp.orbs.push({ id: sim.ids.get(), x: sq.center.x + 40, y: sq.center.y, xp: 5, vx: 0, vy: 0 });
    sim.horde.spawnEgg(sq.center.x + 200, sq.center.y);
    sq.buffs.stim = 5;
    const before = sim.recruits.items.length + sim.powerups.items.length + sim.upgradeOrbs.items.length + sim.xp.orbs.length;
    sim.beginEnding();
    step(30);
    const after = sim.recruits.items.length + sim.powerups.items.length + sim.powerups.fields.length + sim.upgradeOrbs.items.length + sim.xp.orbs.length;
    check(before >= 5 && after === 0 && sq.buffs.stim === 0 && !sim.aliens.some((a) => a.alive && a.def.egg), 'fin du jeu : recrues, power-ups, loots, globes d\'upgrade et d\'XP, œufs et bonus actifs effacés', `${before} avant, ${after} après`);
  }

  // ---- boss final par niveau : Normal = Scarab, Hard = rhinos jumeaux (les deux), Expert = Giant Crab ; les autres boss laissent un œuf
  {
    const kill = (level, ids) => {
      const { sim, step } = fresh(29, level);
      clearAliens(sim);
      const sq = sim.squadOf('p1');
      ids.forEach((id, i) => sim.horde.spawnAt(id, sq.center.x + 900 + i * 150, sq.center.y, 1, false));
      for (const b of sim.aliens.filter((a) => a.alive && a.def.boss)) b.age = 1;
      return { sim, step };
    };
    const ended = (sim) => sim.finalBossDead;
    // Normal : le Scarab clôt la run, le Giant Crab n'est qu'un boss ordinaire
    let { sim, step } = kill('normal', ['boss_scarab']);
    sim.damage(sim.aliens.find((a) => a.def.id === 'boss_scarab'), 1e12, 'p1');
    step(1);
    const normalOk = ended(sim) && !sim.aliens.some((a) => a.alive && a.def.egg);
    ({ sim, step } = kill('normal', ['boss_crab']));
    sim.damage(sim.aliens.find((a) => a.def.id === 'boss_crab'), 1e12, 'p1');
    step(1);
    check(normalOk && !ended(sim) && sim.aliens.some((a) => a.alive && a.def.egg), "Normal : la run finit après le Scarab (pas d'œuf) ; le Giant Crab laisse un œuf et ne finit rien", `Scarab final ${normalOk}, crabe final ${ended(sim)}`);
    // Hard : les jumeaux, seulement quand les deux sont tombés ; le Scarab laisse un œuf
    ({ sim, step } = kill('expert', ['boss_scarab']));
    sim.damage(sim.aliens.find((a) => a.def.id === 'boss_scarab'), 1e12, 'p1');
    step(1);
    const hardScarab = ended(sim);
    ({ sim, step } = kill('expert', ['boss_rhino_fire', 'boss_rhino_ice']));
    sim.damage(sim.aliens.find((a) => a.def.id === 'boss_rhino_fire'), 1e12, 'p1');
    step(1);
    const afterFirst = ended(sim);
    sim.damage(sim.aliens.find((a) => a.alive && a.def.id === 'boss_rhino_ice'), 1e12, 'p1');
    step(1);
    check(!hardScarab && !afterFirst && ended(sim), 'Hard : la run finit quand les DEUX rhinos jumeaux sont tombés (pas au Scarab, pas au premier)', `Scarab ${hardScarab}, premier jumeau ${afterFirst}, les deux ${ended(sim)}`);
    // Expert : le Giant Crab
    ({ sim, step } = kill('impossible', ['boss_rhino_fire', 'boss_rhino_ice']));
    for (const t of sim.aliens.filter((a) => a.alive && a.def.boss)) sim.damage(t, 1e12, 'p1');
    step(1);
    const expTwins = ended(sim);
    ({ sim, step } = kill('impossible', ['boss_crab']));
    sim.damage(sim.aliens.find((a) => a.def.id === 'boss_crab'), 1e12, 'p1');
    step(1);
    check(!expTwins && ended(sim), 'Expert : la run finit au Giant Crab (pas aux rhinos jumeaux)', `jumeaux ${expTwins}, crabe ${ended(sim)}`);
  }

  // ---- boss final : l'équivalent d'un coffre à diamants explose, la séquence de fin attend que les diamants soient ramassés (ou disparus après 10 s)
  {
    // a) rien ramassé : les diamants disparaissent au bout de 10 s, alors seulement la fin peut démarrer
    const { sim, step } = fresh(17, 'impossible');
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_crab', sq.center.x + 900, sq.center.y, 1, false);
    const boss = sim.aliens.find((a) => a.alive && a.def.boss);
    boss.age = 1; // sorti de son trou d'apparition (invulnérable avant)
    sim.damage(boss, 1e12, 'p1');
    step(1);
    const n = sim.gems.items.length;
    const wantMid = ALIENS.boss_crab.diamonds * DIFFICULTY.gemMulExpert * DIFFICULTY.gemFinalShare; // quantité modérée : une part du coffre
    check(sim.finalBossDead && n >= Math.floor(wantMid * 0.79) && n <= Math.ceil(wantMid * 1.21) && sim.gems.finalPending && !sim.gems.endingReady, 'boss final tué : ses diamants (moyenne du boss × multiplicateur Expert, ± 20 %) au sol, la fin attend', `${n} diamants (moyenne ${wantMid})`);
    const waves0 = sim.waves.time;
    step(60); // ~2 s
    check(sim.waves.time === waves0, 'boss final tué : les vagues sont suspendues le temps de ramasser');
    check(!sim.gems.endingReady, 'boss final tué : on peut encore jouer, la fin attend (2 s écoulées)');
    step(30 * 4); // ~6 s : le délai de base (5 s) est écoulé, la squad est restée loin des diamants
    check(sim.gems.items.length > 0 && sim.gems.endingReady, "boss final tué : sans diamant ramassé, la fin démarre après 5 s même s'il en reste au sol");
    // chaque diamant ramassé retarde la fin de 2 s
    const f3 = fresh(36, 'impossible');
    clearAliens(f3.sim);
    const q3 = f3.sim.squadOf('p1');
    f3.sim.horde.spawnAt('boss_crab', q3.center.x + 900, q3.center.y, 1, false);
    const b3 = f3.sim.aliens.find((x) => x.alive && x.def.boss);
    b3.age = 1;
    f3.sim.damage(b3, 1e12, 'p1');
    f3.step(1);
    const t0 = f3.sim.gems.finalT;
    const g0 = f3.sim.gems.items[0];
    for (const so of q3.soldiers) { so.x = so.px = g0.x; so.y = so.py = g0.y; }
    q3.anchor.x = g0.x; q3.anchor.y = g0.y;
    let picked = 0;
    const afterPick = [];
    for (let i = 0; i < 90; i++) {
      const before = picked;
      f3.session.advance(34, (e) => { if (e.t === 'gemPicked') picked++; });
      if (picked > before) afterPick.push(f3.sim.gems.finalT);
    }
    check(afterPick.length > 0 && afterPick.every((v) => v <= 2 + 1e-9 && v > 1.5) && t0 > 4.5, 'boss final : chaque diamant ramassé remet le compte à rebours à 2 s (pas cumulatif)', `${picked} ramassé(s), après chaque ramassage : ${afterPick.slice(0, 3).map((v) => v.toFixed(2)).join(' / ')} s (départ ${t0.toFixed(1)} s)`);
  }
  {
    // b) tout ramassé : la fin démarre dès que le dernier est pris (sans attendre les 10 s)
    const { sim, step } = fresh(18);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sq.stats.add('magnet', { flat: 20 });
    sim.horde.spawnAt('boss_crab', sq.center.x + 60, sq.center.y, 1, false);
    const boss = sim.aliens.find((a) => a.alive && a.def.boss);
    boss.age = 1; // sorti de son trou d'apparition (invulnérable avant)
    sim.damage(boss, 1e12, 'p1');
    let ticks = 0;
    for (; ticks < 30 * 9 && !sim.gems.endingReady; ticks++) {
      step(1);
    }
    check(sim.gems.endingReady && sim.gems.items.length === 0 && ticks < 30 * 9, 'tous les diamants ramassés : la fin peut démarrer avant les 10 s', `${(ticks / 30).toFixed(1)} s`);
  }

  // ---- armurerie : unités débloquées dans le tirage des recrues, pièces d'or lâchées puis ramassées
  {
    const { session, sim, step } = fresh(19);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const only = new Set();
    for (let i = 0; i < 200; i++) only.add(sim.recruits.chooseClass(sq));
    check(only.size === 1 && only.has('trooper'), 'armurerie : sans achat, seul le Trooper est recruté', [...only].join(','));
    session.setLoadout({ units: ['trooper', 'medic', 'sniper'], perks: ['critGlasses'] });
    const counts = { trooper: 0, medic: 0, sniper: 0 };
    for (let i = 0; i < 2000; i++) counts[sim.recruits.chooseClass(sq)]++;
    const special = (counts.medic + counts.sniper) / 2000;
    // recrues spéciales désactivées (SPECIAL_RECRUIT_CHANCE = 0) : aucune spéciale ; sinon 20 % à égalité parmi les unités débloquées
    const wanted = SPECIAL_RECRUIT_CHANCE;
    const spread = wanted === 0 ? counts.medic + counts.sniper === 0 : counts.medic > 0 && counts.sniper > 0 && Math.abs(counts.medic - counts.sniper) < 120;
    check(Math.abs(special - wanted) < 0.04 && spread && sq.perks.has('critGlasses'), `armurerie : ${wanted * 100} % des bonus recrue sont spéciaux (désactivé si 0), à égalité parmi les unités débloquées ; l'upgrade est posée`, `spéciales ${(special * 100).toFixed(1)} % (medic ${counts.medic}, sniper ${counts.sniper})`);
    // pièces d'or : ~15 % des aliens en lâchent, un boss une poignée, jamais un alien sans XP
    for (let i = 0; i < 400; i++) {
      sim.horde.spawnAt('slime', sq.center.x + 60, sq.center.y, 1, false);
    }
    const slimes = sim.aliens.filter((a) => a.alive);
    for (const a of slimes) { a.age = 1; a.noXp = false; } // `spawnAt` (invocation) marque ses aliens sans XP : on les rend normaux
    const noXp = slimes.slice(0, 50);
    for (const a of noXp) a.noXp = true;
    for (const a of slimes) sim.damage(a, 1e9, 'p1');
    const coins = sim.gems.coins.length;
    check(coins > 5 && coins < 40, 'pièces d\'or : environ 15 % des aliens tués en lâchent (hors aliens sans XP)', `${coins} pièces pour ${slimes.length - noXp.length} aliens`);
    // ramassage
    sq.stats.add('magnet', { flat: 30 });
    let picked = 0;
    for (let i = 0; i < 60; i++) session.advance(34, (e) => { if (e.t === 'coinPicked') picked += e.n; });
    check(picked === coins && sim.gems.coins.length === 0, 'pièces d\'or : toutes ramassées par l\'aimant (événement coinPicked)', `${picked}/${coins}`);
    // expiration
    {
      const f = fresh(20); // sim neuve : la montée de niveau des kills ci-dessus met le monde en pause (choix d'upgrade)
      clearAliens(f.sim);
      f.sim.gems.coins.push({ id: 999999, x: f.sim.squadOf('p1').center.x + 3000, y: f.sim.squadOf('p1').center.y, px: 0, py: 0, life: 14, age: 5 });
      for (let i = 0; i < 30 * 15; i++) { clearAliens(f.sim); f.session.advance(34, () => {}); } // aucun alien : pas de montée de niveau qui mettrait le monde en pause
      check(!f.sim.gems.coins.some((c) => c.id === 999999), "pièces d'or : une pièce non ramassée disparaît après 14 s", JSON.stringify(f.sim.gems.coins.map((c) => [c.life, c.caught, c.x])) + ' tick ' + f.sim.tick + ' ending ' + f.sim.ending);
    }
  }

  // ---- boss tué : diamants autour de l'œuf, puis le coffre descend en parachute (jauge seulement une fois posé) ; power-ups à nu avec un saut en cloche sur place
  {
    const { session, sim } = fresh(23);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const bx = sq.center.x + 700;
    const by = sq.center.y + 100;
    sim.gems.spawnChest(bx, by);
    const chest = sim.gems.chests[0];
    check(!!chest && sim.gems.items.length >= 1 && sim.gems.items.length <= 5 && sim.gems.items.every((g) => Math.hypot(g.x - bx, g.y - by) < 10), 'boss tué : 1 à 5 diamants jaillissent autour de l\'œuf', `${sim.gems.items.length} diamants`);
    // le coffre saute de l'œuf vers le sommet d'un triangle équilatéral : place d'arrivée = départ + vitesse × durée
    const tx = chest.x + chest.hop.vx * chest.hop.t;
    const ty = chest.y + chest.hop.vy * chest.hop.t;
    // les deux globes d'upgrade forment la base (même centre : l'œuf)
    sim.upgradeOrbs.burst(bx, by);
    const orbs = sim.upgradeOrbs.items.filter((o) => o.owner === 'p1').map((o) => ({ x: o.x + o.hop.vx * o.hop.t, y: o.y + o.hop.vy * o.hop.t }));
    const L = GEM_CHEST.triangle;
    const d = (u, v) => Math.hypot(u.x - v.x, u.y - v.y);
    const top = { x: tx, y: ty };
    const [oa, ob] = orbs.sort((u, v) => u.x - v.x);
    check(orbs.length === 2 && ty < by && oa.y > by && ob.y > by && oa.x < bx && ob.x > bx, 'œuf détruit : coffre au-dessus, globes d\'upgrade en bas à gauche et en bas à droite', `coffre y ${Math.round(ty - by)}, globes (${Math.round(oa.x - bx)}, ${Math.round(oa.y - by)}) / (${Math.round(ob.x - bx)}, ${Math.round(ob.y - by)})`);
    const sides = [d(top, oa), d(top, ob), d(oa, ob)];
    check(sides.every((s) => s > L * 0.87 && s < L * 1.13), 'coffre et globes forment un triangle équilatéral (± 10 % par branche)', sides.map((s) => `${Math.round((s / L) * 100)} %`).join(' / '));
    // soldats posés contre le coffre : la jauge ne se charge pas tant qu'il est en l'air
    for (const s of sq.soldiers) { s.x = s.px = tx; s.y = s.py = ty; }
    sq.anchor.x = tx;
    sq.anchor.y = ty;
    for (let i = 0; i < 30 * 0.3; i++) session.advance(34, () => {});
    check(!!chest.hop && chest.charge === 0, 'coffre à diamants : en l\'air (saut), la jauge ne se charge pas', `âge ${chest.age.toFixed(2)} s, charge ${chest.charge}`);
    let ready = false;
    for (let i = 0; i < 30 * 4 && !ready; i++) session.advance(34, (e) => { if (e.t === 'gemChestReady') ready = true; });
    check(ready, 'coffre à diamants : posé, rester autour remplit la jauge (vidéo demandée)');
    // un coffre que personne n'ouvre disparaît au bout de 10 s
    {
      const f2 = fresh(26);
      clearAliens(f2.sim);
      const q = f2.sim.squadOf('p1');
      f2.sim.gems.spawnChest(q.center.x + 1200, q.center.y);
      for (let i = 0; i < 30 * 9; i++) f2.session.advance(34, () => {});
      const still = f2.sim.gems.chests.length;
      for (let i = 0; i < 30 * 2; i++) f2.session.advance(34, () => {});
      check(still === 1 && f2.sim.gems.chests.length === 0, 'coffre à diamants : disparaît au bout de 10 s s\'il n\'est pas pris', `${still} à 9 s, ${f2.sim.gems.chests.length} à 11 s`);
    }
    // pendant qu'on l'ouvre (jauge qui se remplit), le coffre ne disparaît pas même passé les 10 s ; une fois qu'on s'éloigne, la jauge retombe puis il disparaît
    {
      const f3 = fresh(27);
      clearAliens(f3.sim);
      const q = f3.sim.squadOf('p1');
      f3.sim.gems.spawnChest(q.center.x + 100, q.center.y);
      const c = f3.sim.gems.chests[0];
      c.hop = undefined;
      c.x = c.px = q.center.x + 100;
      c.y = c.py = q.center.y;
      c.age = DIFFICULTY.gemChestLife - 0.4; // presque à bout de vie
      for (const so of q.soldiers) { so.x = so.px = c.x; so.y = so.py = c.y; }
      q.anchor.x = c.x;
      q.anchor.y = c.y;
      const none = new Map();
      let charged = 0;
      for (let i = 0; i < 30 * 1; i++) {
        for (const so of q.soldiers) { so.x = so.px = c.x; so.y = so.py = c.y; }
        f3.sim.step(1 / 30, none);
        charged = Math.max(charged, c.charge);
      }
      const alive1 = f3.sim.gems.chests.includes(c) && c.age > DIFFICULTY.gemChestLife;
      for (const so of q.soldiers) { so.x = so.px = c.x + 3000; so.y = so.py = c.y; }
      q.anchor.x = c.x + 3000;
      for (let i = 0; i < 30 * 6; i++) f3.sim.step(1 / 30, none);
      check(charged > 0 && alive1 && !f3.sim.gems.chests.includes(c), "coffre à diamants : ne disparaît pas pendant qu'on l'ouvre (jauge > 0), même après 10 s ; il disparaît une fois la jauge retombée", `charge max ${charged.toFixed(2)}, vivant à ${(c.age).toFixed(1)} s : ${alive1}, plus là après : ${!f3.sim.gems.chests.includes(c)}`);
    }
    // les power-ups apparaissent à nu (pas de boîte), sans saut : la vue joue un petit scale
    const f = fresh(25);
    clearAliens(f.sim);
    f.sim.powerups.items.length = 0;
    let seen = 0;
    let hopped = false;
    for (let i = 0; i < 30 * 150; i++) {
      f.session.advance(34, () => {});
      if (f.sim.choiceT > 0) f.sim.choiceT = 0;
      for (const p of f.sim.powerups.items) { seen = Math.max(seen, 1); if (p.hop) hopped = true; }
    }
    check(seen === 1 && !hopped, "les power-ups apparaissent à nu, sans saut (petit scale à l'affichage)");
  }

  // ---- grand rayon d'aimant : un globe d'XP ou une recrue lâchés dans le rayon de ramassage ne sont pas avalés au tick de leur création
  {
    const { sim, step } = fresh(16);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sq.stats.add('magnet', { flat: 4 }); // aimant énorme : le rayon de ramassage couvre toute la squad
    const before = sim.xp.orbs.length;
    sim.horde.spawnAt('slime', sq.center.x, sq.center.y, 1, false);
    const alien = sim.aliens.find((a) => a.alive);
    sim.xp.drop(alien, 6, sq);
    const orbs = sim.xp.orbs.length - before;
    const rec = sim.recruits.drop('trooper', sq.center.x + 10, sq.center.y, sq.center);
    step(6); // 0,2 s
    const stillOrbs = sim.xp.orbs.length - before;
    check(orbs > 0 && stillOrbs === orbs, 'aimant énorme : les globes d\'XP lâchés dans le rayon sont encore là 0,2 s après (ils sortent avant d\'être ramassés)', `${stillOrbs}/${orbs} globe(s)`);
    check(!!rec.hop && sim.recruits.items.includes(rec), 'aimant énorme : une recrue lâchée à moins de 40 px de la squad saute au lieu d\'être ramassée sur place');
  }
} finally {
  await vite.close();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est OK');
process.exit(failures ? 1 : 0);
