// Calibre la courbe de pression des vagues et mesure le réseau à partir de TES parties (docs/bench/runs/*.json, écrites par
// le jeu en dev via RunRecorder). Usage : npm run sim:calibrate [-- dossier]
// Ne modifie rien : affiche la ligne `model` à coller dans data/waves.ts si elle te convient.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dir = process.argv[2] ?? path.join(root, 'docs', 'bench', 'runs');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
if (files.length === 0) {
  console.log(`Aucune partie dans ${dir} : lance \`npm run dev\`, joue (au moins 10 s) puis meurs ou gagne.`);
  process.exit(0);
}
const runs = files.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })).filter((r) => r.samples?.length >= 10);

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);
const median = (a) => pct(a, 0.5);
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—');
/** Régression linéaire y = a + b·x. */
const fit = (xs, ys) => {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
};

console.log(`${runs.length} partie(s) lue(s) dans ${dir}\n`);
for (const r of runs) console.log(`  ${r.file} : ${r.mode}, ${r.victory ? 'victoire' : 'défaite'}, ${r.duration} s, niveau ${r.level}`);

// ---------- Pression : DPS réellement infligé ----------
// On ne garde que les secondes « saturées » : assez d'aliens vivants pour que la squad tire en continu (PV vivants > 4 s de DPS
// théorique). Sinon le DPS mesuré reflète le manque de cibles (début de partie) et non la force de la squad.
const alive = runs.flatMap((r) => r.samples.filter((s) => s.soldiers > 0).map((s) => ({ ...s, run: r.file })));
const sat = alive.filter((s) => s.theoDps > 0 && s.aliveHp > s.theoDps * 4);
console.log('\n── Pression (DPS réel) ──');
console.log(`${sat.length} seconde(s) saturée(s) sur ${alive.length} avec des soldats vivants.`);
if (sat.length < 20) console.log('Pas assez de secondes saturées : joue des parties plus longues.');
else {
  const ratio = sat.map((s) => s.dealt / s.theoDps);
  const efficiency = median(ratio);
  console.log(`Efficacité (PV infligés / DPS théorique) : médiane ${fmt(efficiency * 100)} % (p25 ${fmt(pct(ratio, 0.25) * 100)} %, p75 ${fmt(pct(ratio, 0.75) * 100)} %)`);
  // Force théorique de la squad dans le temps : intercept = départ, pente rapportée au départ = croissance par minute du modèle.
  const { a, b } = fit(
    alive.map((s) => s.t / 60),
    alive.map((s) => s.theoDps),
  );
  const growth = a > 0 ? b / a : 0;
  console.log(`DPS théorique de la squad : ${fmt(a)} au départ, ${b >= 0 ? '+' : ''}${fmt(b)} par minute (${fmt(growth * 100)} % du départ par minute)`);
  console.log('\nProposition pour data/waves.ts (à valider à la main) :');
  console.log(`  model: { dpsStart: ${fmt(a)}, growthPerMin: ${fmt(growth, 2)}, efficiency: ${fmt(efficiency, 2)}, bossWeight: 0.25 },`);
  console.log('  (le modèle ne représente pas la spirale de mort ci-dessous : il surestime le DPS tardif si la squad se fait décimer)');
}

// ---------- Spirale de mort : DPS par soldat vivant, fenêtres de 30 s ----------
console.log('\n── Évolution par tranche de 30 s ──');
console.log('   t    soldats  DPS/soldat  infligé/s  apparu/s  net(apparu−infligé)  aliens  aliveHp');
for (const r of runs) {
  console.log(`  ${r.file}`);
  for (let i = 0; i < r.samples.length; i += 30) {
    const w = r.samples.slice(i, i + 30);
    const avg = (k) => mean(w.map((s) => s[k]));
    const soldiers = avg('soldiers');
    const dealt = avg('dealt');
    const spawned = avg('spawned');
    console.log(
      `${String(w[0].t).padStart(5)}  ${fmt(soldiers, 1).padStart(6)}  ${fmt(soldiers ? avg('theoDps') / soldiers : 0).padStart(10)}  ${fmt(dealt).padStart(9)}  ${fmt(spawned).padStart(8)}  ${(spawned - dealt >= 0 ? '+' : '') + fmt(spawned - dealt)}`.padEnd(78) +
        `${fmt(avg('aliens')).padStart(6)}  ${fmt(w.at(-1).aliveHp).padStart(7)}`,
    );
  }
}

// ---------- Recrues : le squad regrossit-il ? ----------
console.log('\n── Recrues (par tranche de 60 s) ──');
for (const r of runs) {
  console.log(`  ${r.file}`);
  if (r.samples[0].recDropped === undefined) {
    console.log('  (pas de mesure des recrues : rejoue avec la version actuelle du jeu)');
    continue;
  }
  console.log('     t   kills  soldats  morts  apparues  ramassées  expirées  dont noyées  recrues/100 kills');
  for (let i = 0; i < r.samples.length; i += 60) {
    const w = r.samples.slice(i, i + 60);
    const sum = (k) => w.reduce((n, s) => n + s[k], 0);
    const kills = sum('kills');
    console.log(
      `${String(w[0].t).padStart(6)}  ${String(kills).padStart(6)}  ${fmt(mean(w.map((s) => s.soldiers)), 1).padStart(7)}  ${String(sum('lost')).padStart(5)}  ${String(sum('recDropped')).padStart(8)}  ${String(sum('recPicked')).padStart(9)}  ${String(sum('recExpired')).padStart(8)}  ${String(sum('recSwamped')).padStart(11)}  ${fmt(kills ? (sum('recDropped') / kills) * 100 : 0, 1).padStart(17)}`,
    );
  }
}

// ---------- Boss ----------
console.log('\n── Boss apparus ──');
for (const r of runs) console.log(`  ${r.file} : ${(r.bosses ?? []).map((b) => `${b.alien} (${b.kind}) à ${b.t} s`).join(', ') || 'aucun enregistré'}`);

// ---------- Contrôle : le modèle prédit-il les PV d'aliens vivants ? ----------
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { simulatePressure, DEFAULT_WAVE_MODEL } = await vite.ssrLoadModule('/src/data/waveModel.ts');
  const { DEFAULT_WAVE_SCRIPT } = await vite.ssrLoadModule('/src/data/waves.ts');
  const model = DEFAULT_WAVE_SCRIPT.model ?? DEFAULT_WAVE_MODEL;
  const pred = simulatePressure(DEFAULT_WAVE_SCRIPT, model);
  console.log('\n── Le modèle actuel contre la réalité (PV d\'aliens vivants) ──');
  for (const r of runs) {
    const diffs = r.samples.map((s) => ({ obs: s.aliveHp, mod: pred.hp[Math.min(pred.hp.length - 1, Math.round(s.t / pred.dt))] ?? 0 }));
    const err = mean(diffs.map((d) => Math.abs(d.obs - d.mod)));
    const bias = mean(diffs.map((d) => d.obs - d.mod));
    console.log(`  ${r.file} : écart moyen ${fmt(err)} PV, biais ${bias >= 0 ? '+' : ''}${fmt(bias)} PV (positif : le jeu est plus dur que le modèle), pic réel ${fmt(Math.max(...diffs.map((d) => d.obs)))} contre ${fmt(Math.max(...diffs.map((d) => d.mod)))}`);
  }
} finally {
  await vite.close();
}

// ---------- Pression subie ----------
console.log('\n── Pression subie (par niveau de joueur) ──');
const byLevel = new Map();
for (const r of runs) for (const s of r.samples) (byLevel.get(s.level) ?? byLevel.set(s.level, []).get(s.level)).push(s);
for (const [level, ss] of [...byLevel].sort((x, y) => x[0] - y[0])) {
  const secs = ss.length;
  console.log(`  niveau ${level} : ${fmt((ss.reduce((n, s) => n + s.taken, 0) / secs) * 60)} PV perdus/min, ${fmt((ss.reduce((n, s) => n + s.lost, 0) / secs) * 60, 1)} soldats morts/min, ${fmt(mean(ss.map((s) => s.aliens)))} aliens en moyenne (${secs} s)`);
}

// ---------- Réseau ----------
const net = runs.flatMap((r) => r.samples.filter((s) => s.snapBytes > 0));
console.log('\n── Réseau (taille d\'un snapshot, 15 par seconde) ──');
if (net.length < 10) console.log('Pas de mesure de snapshot dans ces parties.');
else {
  const bytes = net.map((s) => s.snapBytes);
  const kbps = (b) => (b * 15) / 1000;
  console.log(`Moyenne ${fmt(mean(bytes))} o (${fmt(kbps(mean(bytes)))} Ko/s) · p95 ${fmt(pct(bytes, 0.95))} o (${fmt(kbps(pct(bytes, 0.95)))} Ko/s) · max ${fmt(Math.max(...bytes))} o (${fmt(kbps(Math.max(...bytes)))} Ko/s)`);
  const { a, b } = fit(
    net.map((s) => s.aliens),
    bytes,
  );
  console.log(`Régression : octets ≈ ${fmt(a)} + ${fmt(b, 1)} × aliens (coût d'un alien : ${fmt(b, 1)} o). Chaque joueur de plus en ligne ajoute ~350 o.`);
  console.log(`Avec 300 aliens : ≈ ${fmt(a + b * 300)} o, soit ${fmt(kbps(a + b * 300))} Ko/s par client (× nombre de clients pour l'envoi de l'hôte).`);
  // Ventilation par catégorie : somme sur les secondes dont le snapshot est dans le top 5 % (les plus lourds), et sur toutes.
  const withSizes = net.filter((s) => s.snapSizes);
  if (withSizes.length) {
    const limit = pct(withSizes.map((s) => s.snapBytes), 0.95);
    const heavy = withSizes.filter((s) => s.snapBytes >= limit);
    const cats = [...new Set(withSizes.flatMap((s) => Object.keys(s.snapSizes)))];
    const total = (list, c) => mean(list.map((s) => s.snapSizes[c] ?? 0));
    console.log(`\nVentilation par catégorie (octets par snapshot) : moyenne sur ${withSizes.length} s / top 5 % (${heavy.length} s)`);
    const avgTotal = mean(withSizes.map((s) => s.snapBytes));
    const heavyTotal = mean(heavy.map((s) => s.snapBytes));
    for (const c of cats.sort((x, y) => total(heavy, y) - total(heavy, x))) {
      console.log(`  ${c.padEnd(12)} ${fmt(total(withSizes, c)).padStart(6)} o (${fmt((total(withSizes, c) / avgTotal) * 100).padStart(2)} %)   ${fmt(total(heavy, c)).padStart(6)} o (${fmt((total(heavy, c) / heavyTotal) * 100).padStart(2)} %)`);
    }
  } else console.log('\n(pas de ventilation par catégorie dans ces parties : rejoue avec la version actuelle du jeu)');
}
