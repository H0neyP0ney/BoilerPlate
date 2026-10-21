// Joue l'onboarding scripté dans Node (sans navigateur) avec un joueur automatique qui suit les cibles du tutoriel, et vérifie le déroulé :
// points verts, vagues, recrue à distance, aucun level-up avant la vague 3, offre imposée, fin et relai du gestionnaire de vagues normal.
// Usage : node scripts/tutorial-headless.mjs
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
(await vite.ssrLoadModule('/src/config.ts')).PLAYTIME_TEST.enabled = false; // la version test playtime (docs/TEST_PLAYTIME.md) ne doit pas fausser les tests : jeu complet
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  const { LocalSession } = await vite.ssrLoadModule('/src/net/Session.ts');
  const { MODES } = await vite.ssrLoadModule('/src/data/modes.ts');
  const { TUTORIAL_LEVELUPS, TUTORIAL_REWARD } = await vite.ssrLoadModule('/src/data/tutorial.ts');
  const { UPGRADES } = await vite.ssrLoadModule('/src/data/progression.ts');
  const session = new LocalSession({ mode: MODES.survival, seed: 4242, bots: 0, tutorial: true });
  const sim = session.sim;
  const sq = sim.squadOf('p1');
  const phases = [];
  let levelAtWave3 = 1;
  let offerSeen = null;
  let recruitDist = null;
  let recruitStart = null;
  let maxLevelBeforeWave3 = 1;
  let guard = 0;
  let minOrbLife = Infinity; // vie la plus basse d'un globe d'XP du tutoriel (éternel : ne baisse jamais)
  let maxOrbLife = 0;
  const waveY = {}; // écart vertical (px) entre le centre de la squad et les aliens de chaque vague au moment où elle apparaît

  while (sim.tutorial.active && guard++ < 30 * 400) {
    // le joueur automatique va vers la cible la plus utile : recrue, power-up, point vert, sinon l'alien ou le globe le plus proche
    const targets = sim.tutorial.targets();
    const rec0 = sim.recruits.items.find((r) => r.forced);
    const t = (rec0 ? { x: rec0.x, y: rec0.y } : undefined) ?? targets.find((x) => x.kind === 'powerup') ?? targets.find((x) => x.kind === 'marker');
    const orb = sim.xp.orbs[0];
    const goal = t ?? (orb ? { x: orb.x, y: orb.y } : sim.aliens.find((a) => a.alive) ? { x: sim.aliens.find((a) => a.alive).x, y: sim.aliens.find((a) => a.alive).y } : null);
    let mx = 0;
    let my = 0;
    if (goal) {
      const dx = goal.x - sq.center.x;
      const dy = goal.y - sq.center.y;
      const d = Math.hypot(dx, dy);
      if (d <= 20 && !t && !orb) {
        mx = Math.cos(guard / 10); // ennemis collés à la squad : le joueur automatique bouge pour que les soldats les prennent pour cible
        my = Math.sin(guard / 10);
      } else if (d > 20) {
        mx = dx / d;
        my = dy / d;
      }
    }
    session.setLocalInput(mx, my);
    const before = sim.tutorial.phase;
    session.advance(1000 / 30, (e) => {
      if (e.t === 'tutorial') phases.push(e.phase);
    });
    if (sim.tutorial.phase !== before && (sim.tutorial.phase === 'wave1' || sim.tutorial.phase === 'wave2')) {
      const al = sim.aliens.filter((a) => a.alive);
      waveY[sim.tutorial.phase] = { dy: Math.abs(al.reduce((n, a) => n + a.y, 0) / al.length - sq.center.y), dx: al.reduce((n, a) => n + a.x, 0) / al.length - sq.center.x };
    }
    if (sim.tutorial.phase !== before && sim.tutorial.phase === 'wave2') levelAtWave3 = sq.level;
    if (sim.tutorial.phase === 'wave1') maxLevelBeforeWave3 = Math.max(maxLevelBeforeWave3, sq.level);
    for (const o of sim.xp.orbs) {
      minOrbLife = Math.min(minOrbLife, o.life);
      maxOrbLife = Math.max(maxOrbLife, o.life);
    }
    const rec = sim.recruits.items.find((r) => r.forced);
    if (rec && !recruitStart) recruitStart = { x: rec.x, y: rec.y, hopped: !!rec.hop };
    if (rec && !rec.hop && recruitStart && recruitDist === null) recruitDist = Math.hypot(rec.x - recruitStart.x, rec.y - recruitStart.y); // distance parcourue par le saut
    if (sq.offer && !offerSeen) offerSeen = { offer: [...sq.offer], prism: [...sq.offerPrism], rerolled: sq.rerollOffer(), orbsLeft: sim.xp.orbs.length };
    if (sq.offer) session.chooseUpgrade(0); // le joueur ne suit pas la suggestion (il choisit ce qu'il veut)
  }

  check(!sim.tutorial.active && guard < 30 * 400, 'le tutoriel se termine', `${(guard / 30).toFixed(0)} s de jeu`);
  check(sim.tutorial.targets().length === 0, 'plus aucune cible (point vert, flèche) à la fin');
  check(phases.join('>') === 'move1>wave1>wave2>wave3>done', 'enchaînement des étapes', phases.join(' > '));
  check(maxLevelBeforeWave3 === 1 && levelAtWave3 === 1, 'aucun level-up avant la vague 3 (vagues 1 et 2 : pas assez d\'XP)');
  check(sq.level === 2, 'un seul level-up pendant le tutoriel', `niveau ${sq.level}`);
  check(maxOrbLife > 0 && minOrbLife === maxOrbLife, "les globes d'XP du tutoriel ne disparaissent jamais (leur durée de vie ne baisse pas)", `vie ${minOrbLife} à ${maxOrbLife} s`);
  check(offerSeen?.orbsLeft === 0, "le level-up n'arrive qu'avec le dernier globe d'XP ramassé (aucun globe au sol)", `${offerSeen?.orbsLeft} globe(s) au sol à l'ouverture`);
  check(!!offerSeen && offerSeen.offer.join() === TUTORIAL_LEVELUPS[1].offer.join() && offerSeen.prism.every((p) => !p) && offerSeen.rerolled === false, 'level up n°1 scripté (speed / damage / fireRate), sans relance ni prismatique', offerSeen?.offer.join('/'));
  check(recruitStart?.hopped === true && recruitDist !== null && recruitDist < 5, 'la recrue du slime saute en cloche sur place (imprenable en l air)', `${recruitDist?.toFixed(0)} px de déplacement`);
  check(sq.picked.speed === 1 && !sq.picked.damage, 'la simulation accepte une autre carte que celle imposée (le blocage est dans la fenêtre de choix)', JSON.stringify(sq.picked));
  check(waveY.wave1?.dy < 80 && waveY.wave1?.dx > 400 && waveY.wave2?.dy < 80 && waveY.wave2?.dx > 400, 'les vagues 1 et 2 arrivent par la droite, à la même hauteur (y) que la squad', `vague 1 : écart y ${waveY.wave1?.dy.toFixed(0)} px, vague 2 : ${waveY.wave2?.dy.toFixed(0)} px`);
  const expect = (id) => 1 + (TUTORIAL_REWARD[id] ?? 0) * UPGRADES[id].mod.pct; // bonus caché = prises × gain de l'upgrade (valeurs des données : réglables)
  check(Math.abs(sq.stats.get('damage') - expect('damage')) < 0.01 && Math.abs(sq.stats.get('range') - expect('range')) < 0.01 && Math.abs(sq.stats.get('recruit') - expect('recruit')) < 0.01, 'bonus caché de fin de tutoriel (dégâts ×1, cadence ×1, portée ×2, recrue ×3, PV max ×2…)', `dégâts ${sq.stats.get('damage').toFixed(2)}, portée ${sq.stats.get('range').toFixed(2)}, recrue ${sq.stats.get('recruit').toFixed(2)}`);
  check(!sq.picked.damage && !sq.picked.range && !sq.picked.recruit, 'le bonus caché ne figure pas dans les upgrades prises');
  check(sq.size >= 6, 'les deux recrues ont été ramassées (4 de départ + 2)', `${sq.size} soldats`);
  check(sim.time === 0, 'la timeline normale n\'a pas démarré pendant le tutoriel', `${sim.time.toFixed(2)} s`);
  let seenAliens = 0; // la squad (renforcée par le cadeau caché) peut les tuer avant la mesure : on compte le maximum vu
  for (let i = 0; i < 30 * 5; i++) {
    session.advance(1000 / 30, () => {});
    seenAliens = Math.max(seenAliens, sim.aliens.length);
  }
  check(sim.time > 4.5, 'après le tutoriel, le gestionnaire de vagues normal prend le relai', `${sim.time.toFixed(1)} s`);
  check(seenAliens > 0, 'des aliens des vagues normales sont apparus', `${seenAliens} au plus`);
  check(sq.alive, 'la squad n\'est jamais morte pendant le tutoriel');
  // power-ups scriptés : les premiers de la vraie partie suivent TUTORIAL_POWERUPS (stim, roquettes, aimant, électrique, stase), puis le tirage redevient aléatoire ; l'un laissé au sol (expiré) revient
  const { TUTORIAL_POWERUPS } = await vite.ssrLoadModule('/src/data/tutorial.ts');
  const picked = [];
  const spawned = [];
  const seen = new Set();
  const skipped = new Set();
  for (let i = 0; i < 30 * 240 && picked.length < TUTORIAL_POWERUPS.length + 2; i++) {
    for (const so of sq.soldiers) {
      so.hp = so.maxHp;
      so.invulnerable = 9999; // la squad doit survivre le temps du test (immobile au milieu des vagues normales)
    }
    sim.xp.orbs.length = 0; // pas de level-up pendant ce test (il laisserait la partie en pause, et décalerait les level up scriptés vérifiés après)
    for (const it of sim.powerups.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      spawned.push(it.kind);
      if ((it.kind === 'rockets' || it.kind === 'electro') && !skipped.has(it.kind)) {
        skipped.add(it.kind); // la 1re apparition de ces deux-là est laissée à l'abandon (elle expire) : le script doit la refaire apparaître
        continue;
      }
      it.x = sq.center.x; // posé sur la squad : ramassé tout de suite
      it.y = sq.center.y;
    }
    session.advance(1000 / 30, (e) => {
      if (e.t === 'powerup') picked.push(e.kind);
    });
  }
  check(picked.slice(0, TUTORIAL_POWERUPS.length).join() === TUTORIAL_POWERUPS.join(), 'les premiers power-ups de la vraie partie suivent le script (stim, rockets, magnet, electro, stasis), même si certains expirent', `ramassés : ${picked.join(' > ')} ; apparus : ${spawned.join(' > ')}`);

  // level up suivants de la partie (scriptés : 2e = portée / vitesse / vie en choix libre ; 3e = vitesse / recrues prismatique / portée, recrues imposée)
  const next = [];
  for (let n = 0; n < 2; n++) {
    sq.gainXp(sq.xpNeeded - sq.xp + 0.01);
    if (sq.offer) next.push({ offer: [...sq.offer], prism: [...sq.offerPrism], scripted: sq.scripted, rerolled: sq.rerollOffer() });
    if (sq.offer) session.chooseUpgrade(0);
    session.advance(1000 / 30, () => {});
  }
  const [l2, l3] = next;
  check(next.length === 2 && l2.offer.join() === TUTORIAL_LEVELUPS[2].offer.join() && l2.offer.join() === 'range,speed,hp' && l2.prism.every((p) => !p) && !l2.scripted?.suggest && l2.rerolled === false, 'level up n°2 : portée à gauche, vitesse au centre, vie à droite, sans prismatique, choix libre, sans relance', JSON.stringify(l2));
  check(next.length === 2 && l3.offer.join() === 'speed,recruit,range' && l3.prism.join() === 'false,true,false' && l3.scripted?.suggest === 'recruit' && !!l3.scripted?.tip && l3.rerolled === false, 'level up n°3 : vitesse à gauche, recrues PRISMATIQUE au centre (imposée, avec un texte), portée à droite, sans relance', JSON.stringify(l3));
  // le 4e level up redevient un tirage normal
  sq.gainXp(sq.xpNeeded - sq.xp + 0.01);
  check(!!sq.offer && !sq.scripted, 'level up n°4 : tirage normal (rien de scripté)', JSON.stringify(sq.offer));
} finally {
  await vite.close();
}
if (failures > 0) {
  console.log(`\n${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log('\nTout est OK');
