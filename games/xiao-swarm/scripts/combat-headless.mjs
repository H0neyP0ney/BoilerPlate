// Vérifie dans Node (sans navigateur) quelques règles de combat : soldat gelé attaquable directement par les aliens, glaçon à 50 PV qui perd 1 PV par coup,
// escalade des aliens après la mort d'un boss, repos du chaman après 3 résurrections, plus aucun bouclier de soldat.
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

  // ---- aucun bouclier de soldat
  {
    const { sim } = fresh(11);
    check(sim.squads.every((sq) => sq.soldiers.every((s) => s.shield === 0 && s.maxShield === 0)), 'aucun soldat n’a de bouclier au départ');
    check(typeof sim.squads[0].shieldAll !== 'function' && typeof sim.squads[0].shield !== 'function', 'plus de méthode de bouclier sur la squad');
  }

  // ---- glaçon : 50 PV, 1 PV par coup, et le soldat gelé reste attaquable DIRECTEMENT
  {
    const { sim, step } = fresh(12);
    clearAliens(sim);
    const sq = sim.squadOf('p1');
    const s = sq.soldiers[0];
    sim.horde.freezeSoldier(s);
    const block = sim.aliens.find((a) => a.def.iceBlock);
    check(!!block && block.maxHp === 50 && block.hp === 50 && ALIENS.iceballer.ice.blockHp === 50, 'glaçon : 50 PV fixes', `${block?.hp}/${block?.maxHp}`);
    sim.damage(block, 30, 'p1');
    check(block.hp === 49, 'glaçon : un coup de soldat (30 de dégâts) ne retire que 1 PV', `${block.hp} PV`);
    for (let i = 0; i < 10; i++) sim.damage(block, 500, 'p1');
    check(block.hp === 39, 'glaçon : 10 coups = 10 PV, quelle que soit la puissance', `${block.hp} PV`);

    // des slimes collés au soldat gelé : ils le frappent LUI (jamais le glaçon)
    block.hp = 50;
    for (const o of sq.soldiers) if (o !== s) { o.invulnerable = 1e9; o.x = s.x + 1500; o.y = s.y + 1500; o.px = o.x; o.py = o.y; } // les autres, loin : leurs balles ne touchent ni les slimes ni le glaçon, on isole les attaques des aliens
    const hp0 = s.hp;
    for (let i = 0; i < 2; i++) sim.horde.spawnAt('slime', s.x + (i - 0.5) * 8, s.y + 8, 1, false);
    const attackers = sim.aliens.filter((a) => !a.def.iceBlock);
    for (const a of attackers) a.hp = a.maxHp = 1e9; // ils survivent pendant la mesure
    step(30);
    check(s.alive && s.hp < hp0, 'soldat gelé : les aliens le frappent directement', `${hp0.toFixed(1)} → ${s.hp.toFixed(1)} PV`);
    check(block.hp === 50 && block.alive, 'soldat gelé : ils ne s’en prennent jamais au glaçon', `${block.hp} PV`);
    check(attackers.every((a) => !a.target || a.target.kind === 'soldier'), 'les aliens ne ciblent que des soldats (jamais le glaçon)');
    // si le soldat gelé meurt, le glaçon se brise (aucun prisonnier à retenir)
    s.invulnerable = 0;
    sim.damageSoldier(s, 1e9);
    step(3);
    check(!block.alive, 'glaçon : se brise quand le soldat gelé meurt');
  }
  {
    // 50 coups pour le détruire
    const { sim } = fresh(15);
    clearAliens(sim);
    const s = sim.squadOf('p1').soldiers[0];
    sim.horde.freezeSoldier(s);
    const block = sim.aliens.find((a) => a.def.iceBlock);
    for (let i = 0; i < 49; i++) sim.damage(block, 5, 'p1');
    check(block.alive && block.hp === 1, 'glaçon : encore là à 1 PV après 49 coups');
    sim.damage(block, 5, 'p1');
    check(!block.alive, 'glaçon : détruit au 50e coup');
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
    sim.damage(boss, 1e12, 'p1');
    check(sim.bossKills === 1 && Math.abs(sim.escalation - (1 + BOSS_ESCALATION)) < 1e-9, 'escalade : un boss tué = ×1,1', `bossKills ${sim.bossKills}`);
    sim.horde.spawnAt('slime', 520, 500, 1, false);
    const a1 = sim.aliens[sim.aliens.length - 1];
    check(Math.abs(a1.maxHp / a0.maxHp - 1.1) < 1e-6 && a1.esc === 1.1, 'escalade : un slime apparu après a +10 % de PV', `${(a1.maxHp / a0.maxHp).toFixed(3)}`);
    sim.horde.spawnAt('boss_rhino', 900, 900, 1, false);
    sim.damage(sim.aliens.find((a) => a.def.id === 'boss_rhino'), 1e12, 'p1');
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
