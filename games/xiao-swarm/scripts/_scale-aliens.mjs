// Applique −10 % aux stats de base des aliens EXACTEMENT comme les boutons −5 % ×2 du panneau Difficulté puis Save (PV, vitesse, dégâts, cadence), via le plugin de sauvegarde du serveur de dev.
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
(await vite.ssrLoadModule('/src/config.ts')).PLAYTIME_TEST.enabled = false; // la version test playtime (docs/TEST_PLAYTIME.md) ne doit pas fausser les tests : jeu complet
const { ALIENS } = await vite.ssrLoadModule('/src/data/aliens.ts');
const PART = -0.1; // −10 % (comme part = −0,1 dans shiftAllStat : PV, vitesse, dégâts × 0,9 ; délai de tir × 1,1)
const SKIP = new Set(['golden']); // PV exacts demandés (2000) et comportement propre : non touché
const GROUPS = [
  { name: 'hp', match: (p) => p === 'hp', sign: 1, skip: (d) => !!d.projectile || !!d.egg },
  { name: 'speed', match: (p) => p === 'speed', sign: 1, skip: (d) => !!d.projectile },
  { name: 'damage', match: (p) => p === 'damage' || p.endsWith('.damage') || p.endsWith('.dps'), sign: 1, skip: (d) => !!d.egg },
  { name: 'cadence', match: (p) => p === 'attackCooldown', sign: -1, skip: (d) => !!d.projectile },
];
const collect = (obj, prefix, out, depth = 0) => {
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'color' || k === 'goo' || k === 'id') continue;
    if (typeof v === 'number' && Number.isFinite(v)) out.push([prefix + k, v]);
    else if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) collect(v, `${prefix}${k}.`, out, depth + 1);
  }
};
let total = 0;
const report = [];
for (const [id, def] of Object.entries(ALIENS)) {
  if (SKIP.has(id)) continue;
  const stats = [];
  collect(def, '', stats);
  const values = {};
  for (const g of GROUPS) {
    if (g.skip(def)) continue;
    for (const [path, base] of stats) {
      if (!g.match(path) || base <= 0) continue;
      values[path] = Number((base + g.sign * base * PART).toPrecision(5));
    }
  }
  if (!Object.keys(values).length) continue;
  const r = await fetch('http://localhost:5173/__dev/save', { method: 'POST', body: JSON.stringify({ target: 'stats', data: { kind: 'alien', id, values } }) }).then((x) => x.json());
  report.push(`${r.ok ? 'ok ' : 'ERR'} ${id}: ${Object.keys(values).length} valeurs ${r.message.includes('introuvables') ? r.message.slice(r.message.indexOf('(')) : ''}`);
  total += Object.keys(values).length;
}
console.log(report.join('\n'));
console.log(`${total} valeurs écrites`);
await vite.close();
