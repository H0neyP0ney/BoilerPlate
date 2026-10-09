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
  const { DIFFICULTY, RELOCATE } = await vite.ssrLoadModule('/src/config.ts');

  const fresh = (seed) => {
    const session = new LocalSession({ mode: MODES.survival, seed, bots: 0 });
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
    while (s.frozen > 0 && t < 30 * 30) { step(1); t++; }
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
    check(a0.esc === 1 && sim.escalation === 1, 'escalade : aucun boss tué = ×1');
    sim.horde.spawnAt('boss_gling', 800, 800, 1, false);
    const boss = sim.aliens.find((a) => a.def.boss);
    boss.age = 1; // sorti de son trou d'apparition (invulnérable avant)
    sim.damage(boss, 1e12, 'p1');
    check(sim.bossKills === 1 && Math.abs(sim.escalation - (1 + DIFFICULTY.bossEscalation)) < 1e-9, 'escalade : un boss tué = ×1,1', `bossKills ${sim.bossKills}`);
    sim.horde.spawnAt('slime', 520, 500, 1, false);
    const a1 = sim.aliens[sim.aliens.length - 1];
    check(Math.abs(a1.maxHp / a0.maxHp - 1.1) < 1e-6 && a1.esc === 1.1, 'escalade : un slime apparu après a +10 % de PV', `${(a1.maxHp / a0.maxHp).toFixed(3)}`);
    sim.horde.spawnAt('boss_rhino', 900, 900, 1, false);
    const rhino = sim.aliens.find((a) => a.def.id === 'boss_rhino');
    rhino.age = 1;
    sim.damage(rhino, 1e12, 'p1');
    check(Math.abs(sim.escalation - 1.21) < 1e-9, 'escalade : cumulée (2 boss = ×1,21)', `${sim.escalation.toFixed(3)}`);
    sim.restart();
    check(sim.bossKills === 0 && sim.escalation === 1, 'escalade : remise à zéro à la relance de la partie');
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
    const { sim, step } = fresh(16);
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
    check(Math.abs(1000 - target.hp - S.damage * sc.esc) < 0.01 && sim.stalactites.length === 0, 'Scarab : une stalactite qui tombe sur un soldat lui retire 80 PV', `${(1000 - target.hp).toFixed(0)} dégâts`);
  }

  // ---- Scarab : pendant le verrouillage, la direction du télégraphe est figée mais il suit encore la squad sur cet axe :
  //      filer tout droit ne suffit pas (il ressort dessus), s'écarter sur le côté oui
  for (const [label, after] of [['tout droit', { mx: -1, my: 0 }], ['sur le côté', { mx: 0, my: -1 }]]) {
    const { sim, step } = fresh(16);
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

  // ---- Scarab : quand il marche vers la squad entre deux plongées, une petite pluie de stalactites (une seule, à mi-chemin du compte à rebours)
  {
    const { sim } = fresh(16);
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
    const { WAVE_SCRIPT, DEFAULT_WAVE_SCRIPT } = await vite.ssrLoadModule('/src/data/waves.ts');
    const entry = DEFAULT_WAVE_SCRIPT.timeline.find((e) => e.level === 9 && e.config === 5);
    const cfg = DEFAULT_WAVE_SCRIPT.levels[9][4];
    check(!!entry && entry.at === 450 && cfg.groups.some((g) => g.type === 'boss_rhino_fire') && cfg.groups.some((g) => g.type === 'boss_rhino_ice'), 'rhinos jumeaux : un boss à 7:30 (450 s) avec le rhino de feu et le rhino de glace', `${entry ? entry.at : '—'} s`);
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
      for (let t = 0; t < 30 * 6 && !orbs; t++) {
        step(1);
        if (boss.rushT > 0) charged = true;
        trailPeak = Math.max(trailPeak, kind === 'fire' ? sim.fires.length : sim.puddles.filter((p) => p.frost).length);
        const o = sim.aliens.filter((a) => a.def.projectile);
        if (o.length) { orbs = o.length; for (const a of o) orbDirs.add(`${Math.round(Math.atan2(a.rushDy, a.rushDx) * 4 / Math.PI)}`); }
      }
      check(charged && trailPeak >= 8, `rhino de ${kind === 'fire' ? 'feu' : 'glace'} : sa charge laisse ${kind === 'fire' ? 'des flammes' : 'des nuages de gel'} au sol`, `${trailPeak} ${kind === 'fire' ? 'flammes' : 'nuages'}`);
      const types = new Set(sim.aliens.filter((a) => a.def.projectile).map((a) => a.def.id));
      check(orbs === 8 && orbDirs.size === 8 && types.size === 1 && types.has(kind === 'fire' ? 'fire_orb' : 'ice_orb'), `rhino de ${kind === 'fire' ? 'feu' : 'glace'} : à la fin de la charge, 8 orbes de ${kind === 'fire' ? 'feu' : 'glace'} dans 8 directions`, `${orbs} orbes, ${orbDirs.size} directions`);
      if (kind === 'fire') {
        const orb = sim.aliens.find((a) => a.def.id === 'fire_orb');
        sim.fires.length = 0;
        step(20);
        check(sim.fires.length >= 3 && orb.def.projectile.kind === 'fire' && orb.maxHp === 500, 'orbe de feu : destructible (500 PV) et il laisse une traînée de flammes au sol', `${sim.fires.length} flammes`);
        // au contact d'un soldat : brûlure, pas de gel
        const target = sq.soldiers[0];
        target.invulnerable = 0; target.hp = target.maxHp = 500;
        const o2 = sim.aliens.find((a) => a.def.id === 'fire_orb' && a.alive);
        o2.x = target.x; o2.y = target.y;
        const f0 = sim.fires.length;
        step(2);
        check(target.hp < 500 && target.frozen === 0 && !o2.alive && sim.fires.length > f0, 'orbe de feu : au contact il brûle le soldat (dégâts + flamme), sans le geler', `PV ${target.hp.toFixed(0)}`);
      } else {
        const orb = sim.aliens.find((a) => a.def.id === 'ice_orb' && a.alive);
        const target = sq.soldiers[0];
        for (const o of sq.soldiers) o.invulnerable = 0; // tout le monde est touchable : l'orbe peut toucher n'importe lequel
        orb.x = target.x - 60; orb.y = target.y; orb.rushDx = 1; orb.rushDy = 0; orb.lurkT = 5; // droit sur la squad
        for (let i = 0; i < 20 && orb.alive; i++) { orb.hp = 500; sim.horde.update(1 / 30); }
        check(!orb.alive && sq.soldiers.some((o) => o.frozen > 0), 'orbe de glace des rhinos : comme d’habitude, il gèle le soldat touché', `${sq.soldiers.filter((o) => o.frozen > 0).length} soldat(s) gelé(s)`);
      }
    }
    // deux boss tués = deux coffres, l'autre jumeau est épargné par le clear screen du premier
    const { sim } = fresh(43);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    sim.horde.spawnAt('boss_rhino_fire', sq.center.x + 400, sq.center.y, 1, false);
    sim.horde.spawnAt('boss_rhino_ice', sq.center.x - 400, sq.center.y, 1, false);
    const [f, i] = sim.aliens;
    f.age = i.age = 99;
    sim.damage(f, 1e12, 'p1');
    check(i.alive && sim.chests.items.length === 0 && sim.bossKills === 0, 'rhinos jumeaux : tuer le premier épargne l’autre, ni coffre ni escalade : le boss n’est pas fini', `${sim.chests.items.length} coffre, ${sim.bossKills} boss tués`);
    i.x = sq.center.x - 350; i.y = sq.center.y + 120;
    sim.damage(i, 1e12, 'p1');
    const c = sim.chests.items[0];
    check(sim.chests.items.length === 1 && Math.hypot(c.x - i.x, c.y - i.y) < 40 && sim.bossKills === 1, 'rhinos jumeaux : le coffre apparaît sur le dernier jumeau tué (escalade ×1,1, une seule fois)', `${sim.chests.items.length} coffre, ${sim.bossKills} boss tué`);
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
    check(dist > 1500 && sim.xp.orbs.length === 0 && gotXp && sq.soldiers.length > size0 && sq.buffs.stim > 0, 'aimant : aspire globes, recrues et power-ups de toute la carte', `objets à ${dist.toFixed(0)} px ; restent ${sim.xp.orbs.length} globe(s), ${sim.recruits.items.length} recrue(s), ${sim.powerups.items.length} power-up(s)`);
  }

  // ---- upgrades : aux niveaux 10, 20, 30… les 3 propositions sont prismatiques
  {
    const { sim } = fresh(19);
    const sq = sim.squadOf('p1');
    const allPrismAt = [];
    let mixedAt10 = false;
    let offeredReinforce = false;
    for (let guard = 0; guard < 200 && sq.level < 21; guard++) {
      sq.gainXp(sq.xpNeeded - sq.xp + 0.01); // un niveau
      while (sq.offer) {
        if (sq.offer.includes('reinforce')) offeredReinforce = true;
        const choosing = sq.level; // un seul niveau en attente à la fois ici
        if (sq.offerPrism.length === 3 && sq.offerPrism.every(Boolean)) allPrismAt.push(choosing);
        else if (choosing % 10 === 0) mixedAt10 = true;
        sim.chooseUpgrade('p1', 0);
      }
    }
    check(!offeredReinforce, 'upgrades : le renfort (désactivé) n’est jamais proposé');
    check(allPrismAt.includes(10) && allPrismAt.includes(20) && !mixedAt10, 'upgrades : 3 propositions prismatiques aux niveaux 10 et 20', `tout prismatique aux niveaux ${allPrismAt.join(', ') || 'aucun'}`);
    // relance au niveau 30 : les prismatiques sont retirées au sort (5 % chacune), plus garanties
    while (sq.level < 29) {
      sq.gainXp(sq.xpNeeded - sq.xp + 0.01);
      while (sq.offer) sim.chooseUpgrade('p1', 0);
    }
    sq.rerolls = 50;
    sq.gainXp(sq.xpNeeded - sq.xp + 0.01);
    const before = sq.offerPrism.every(Boolean);
    let allAfter = 0;
    for (let i = 0; i < 20 && sq.offer; i++) {
      sim.rerollUpgrade('p1');
      if (sq.offerPrism.every(Boolean)) allAfter++;
    }
    check(sq.level === 30 && before && allAfter === 0, 'upgrades : une relance au niveau 30 retire les prismatiques au sort', `niveau ${sq.level}, ${allAfter} relance(s) sur 20 encore toutes prismatiques`);
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
    const others = sim.aliens.filter((a) => a !== boss && a !== other);
    check(!boss.alive && others.every((a) => !a.alive), 'boss tué : tous les autres aliens meurent avec lui', `${others.filter((a) => a.alive).length} survivant(s)`);
    check(other.alive, 'boss tué : un autre boss encore en vie est épargné');
    const xp = sim.xp.orbs.reduce((n, o) => n + o.value, 0);
    const expected = 12 * ALIENS.slime.xp + ALIENS.bubble.xp + ALIENS.kamikaze.xp; // + celle du boss ; pas celle du slime d'un rejeu de vague
    check(xp >= expected, 'boss tué : les aliens nettoyés donnent leur XP comme si le joueur les avait tués', `${xp} XP au sol (≥ ${expected} attendus)`);
    check(sim.fuses.length >= 1, 'boss tué : un kamikaze nettoyé explose quand même', `${sim.fuses.length} explosion(s) en attente`);
    check(prisoner.capturedBy === 0 && bubble.captive === null, 'boss tué : la bulle morte avec lui libère son prisonnier');
    check(!sim.powerups.items.some((p) => p.kind === 'magnet'), 'boss tué : plus d’aimant garanti');
    check(sim.chests.items.length === 0, 'boss tué avec un autre boss encore en vie : pas de coffre tant que le combat de boss n’est pas fini', `${sim.chests.items.length} coffre(s)`);
    other.age = 99;
    sim.damage(other, 1e12, 'p1');
    check(sim.chests.items.length === 1 && Math.hypot(sim.chests.items[0].x - other.x, sim.chests.items[0].y - other.y) < 40, 'boss tué (le dernier) : un coffre apparaît sur son cadavre', `${sim.chests.items.length} coffre(s)`);
  }

  // ---- coffre : 2 s à côté pour l'ouvrir, 2 globes d'upgrade PAR JOUEUR, réservés à leur joueur ; globe ramassé = une upgrade au hasard
  {
    const { sim, step: rawStep } = fresh(31);
    const step = (n) => { for (let i = 0; i < n; i++) { sim.aliens.length = 0; sim.xp.clear(); rawStep(1); } }; // aucun alien (les vagues en enverraient) : pas de montée de niveau qui figerait la partie
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    for (const s of sq.soldiers) s.invulnerable = 1e9;
    sim.addPlayer('p2'); // second joueur : sa squad est vivante, il a donc aussi droit à ses globes
    const sq2 = sim.squadOf('p2');
    sq2.recruit('trooper', { x: sq.center.x + 2000, y: sq.center.y });
    const x = sq.center.x + 700;
    const y = sq.center.y;
    sim.chests.drop(x, y);
    const chest = sim.chests.items[0];
    const T = DIFFICULTY.chestTime;
    check(T === 2 && DIFFICULTY.chestOrbs === 2, 'coffre : 2 s pour l’ouvrir, 2 globes par joueur (réglages du panneau Difficulté)');
    step(30 * 5);
    check(chest.progress === 0 && sim.chests.items.length === 1, 'coffre : personne à côté, il reste fermé');
    // les soldats viennent se poster dessus (replacés à chaque tick : sinon la formation les ramène vers le centre de la squad)
    const hold = (dx, ticks) => { for (let i = 0; i < ticks; i++) { for (const s of sq.soldiers) { s.x = x + dx; s.y = y; s.px = s.x; s.py = s.y; } step(1); } };
    const picked0 = Object.values(sq.picked).reduce((n, v) => n + v, 0);
    hold(20, 45);
    check(chest.progress > 1.2 && chest.progress < T && sim.chests.items.length === 1, 'coffre : la progression monte tant qu’un soldat est à côté', `${chest.progress.toFixed(2)} s`);
    hold(900, 30);
    check(chest.progress < 1 && sim.chests.items.length === 1, 'coffre : la progression redescend quand on s’éloigne', `${chest.progress.toFixed(2)} s`);
    let opened = false;
    for (let t = 0; t < 30 * 6 && !opened; t++) {
      hold(20, 1);
      opened = sim.chests.items.length === 0;
    }
    const mine = sim.upgradeOrbs.items.filter((o) => o.owner === 'p1');
    const theirs = sim.upgradeOrbs.items.filter((o) => o.owner === 'p2');
    check(opened && mine.length === 2 && theirs.length === 2, 'coffre : il s’ouvre et libère 2 globes d’upgrade par joueur', `${mine.length} + ${theirs.length} globes`);
    check(sim.upgradeOrbs.items.every((o) => o.hop && o.hop.t > 0), 'coffre : les globes tombent en cloche autour de lui');
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
    check(sim.upgradeOrbs.items.every((o) => !o.hop && Math.hypot(o.x - x, o.y - y) > 30 && Math.hypot(o.x - x, o.y - y) < DIFFICULTY.chestRadius + 30), 'coffre : ils retombent à côté, au sol, dans la zone du coffre');
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
    check(theirs.every((o) => sim.upgradeOrbs.items.includes(o)) && Object.values(sq.picked).reduce((n, v) => n + v, 0) === picked0 + 2 && Object.values(sq2.picked).reduce((n, v) => n + v, 0) === 0, 'coffre : chaque joueur ne ramasse que ses globes (aucun vol possible)', `p1 +${Object.values(sq.picked).reduce((n, v) => n + v, 0) - picked0} upgrades, p2 ${Object.values(sq2.picked).reduce((n, v) => n + v, 0)}`);
    check(sim.upgradeOrbs.items.length === 2 && sim.upgradeOrbs.items.every((o) => o.owner === 'p2'), 'coffre : ses 2 globes ramassés disparaissent, ceux de l’autre joueur restent', `${sim.upgradeOrbs.items.length} globe(s) restant(s)`);
    // pas d'expiration : 3 minutes plus tard, le globe du joueur 2 attend toujours
    step(30 * 180);
    check(sim.upgradeOrbs.items.length === 2, 'coffre : un globe d’upgrade ne disparaît jamais', `${sim.upgradeOrbs.items.length} globe(s) après 3 min`);
    sim.restart();
    check(sim.chests.items.length === 0 && sim.upgradeOrbs.items.length === 0, 'coffre : coffres et globes effacés à la relance');
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
} finally {
  await vite.close();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est OK');
process.exit(failures ? 1 : 0);
