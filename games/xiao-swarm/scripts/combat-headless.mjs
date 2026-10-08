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
  const { BOSS_ESCALATION } = await vite.ssrLoadModule('/src/config.ts');

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

  // ---- cracheur : plus de flaque à l'impact, mais un nuage ralentissant sur la squad toutes les 6 s
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
    step(3);
    const cl = sim.puddles[0];
    check(!!cl && Math.hypot(cl.x - sq.center.x, cl.y - sq.center.y) < 120 && cl.slow < 1, 'cracheur : nuage ralentissant posé sur la squad', cl ? `rayon ${cl.r}, ×${cl.slow}` : 'aucun');
    check(sp.cloudCd > 5, 'cracheur : prochain nuage dans ~6 s', `${sp.cloudCd.toFixed(1)} s`);
  }

  // ---- chaman : 3 petits nuages de glace autour de la squad ; un soldat qui y entre est gelé
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
    check(frosts.length === 3 && frosts.every((p) => p.r === 30 && p.ttl > 9.5), 'chaman : 3 petits nuages de glace (10 s)', `${frosts.length} nuage(s)`);
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
    check(sim.puddles.filter((p) => p.frost).length === 2, 'nuage de glace : consommé par le gel');
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
    check(sim.bossKills === 1 && Math.abs(sim.escalation - (1 + BOSS_ESCALATION)) < 1e-9, 'escalade : un boss tué = ×1,1', `bossKills ${sim.bossKills}`);
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

  // ---- chaman : repos de 30 s après 3 résurrections
  {
    const { sim, step } = fresh(14);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const r = ALIENS.shaman.revive;
    check(r.maxRevives === 3 && r.lockout === 30, 'chaman : 3 résurrections puis 30 s de repos (données)');
    for (const o of sq.soldiers) o.invulnerable = 1e9;
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
  }
} finally {
  await vite.close();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTout est OK');
process.exit(failures ? 1 : 0);
