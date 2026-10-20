// Rapport visuel des parties enregistrées en dev (docs/bench/runs/*.json, écrites par RunRecorder) : une page HTML autonome, sans dépendance,
// avec courbes, tableaux et conclusions (modèle : scripts/report/report.html). Usage : npm run sim:report [-- dossier] [--out fichier] [--no-open]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') ?? path.join(root, 'docs', 'bench', 'runs');
const out = opt('out') ?? path.join(root, 'docs', 'bench', 'report.html');

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
if (files.length === 0) {
  console.log(`Aucune partie dans ${dir} : lance \`npm run dev\`, joue (au moins 10 s) puis meurs ou gagne.`);
  process.exit(0);
}

/** Champs numériques d'un échantillon, stockés en colonnes (un tableau par champ) pour une page légère. */
const NUM = ['t', 'level', 'soldiers', 'aliens', 'aliveHp', 'nearAliens', 'nearHp', 'dealt', 'taken', 'spawned', 'kills', 'lost', 'recDropped', 'recPicked', 'recExpired', 'recSwamped', 'theoDps', 'squadHp', 'squadMaxHp', 'frozen', 'stunned', 'captured', 'airborne', 'burning', 'speed', 'rerolls', 'bosses', 'fps', 'worstFrameMs', 'snapBytes'];
/** Compteurs par clé (objets creux : `null` quand vide). */
const BAGS = ['killTypes', 'spawnTypes', 'lostTypes', 'coins', 'gems', 'takenBy', 'deathsBy', 'healBy', 'xp'];

const runs = [];
for (const f of files) {
  let r;
  try {
    r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch {
    console.warn(`Ignoré (JSON illisible) : ${f}`);
    continue;
  }
  if (!Array.isArray(r.samples) || r.samples.length < 10) continue;
  const s = {};
  for (const k of NUM) {
    if (!r.samples.some((x) => typeof x[k] === 'number')) continue; // champ absent de ce format : pas de colonne
    s[k] = r.samples.map((x) => (typeof x[k] === 'number' ? x[k] : null));
  }
  s.suspended = r.samples.map((x) => (x.suspended ? 1 : 0));
  const bags = {};
  for (const k of BAGS) if (r.samples.some((x) => x[k])) bags[k] = r.samples.map((x) => x[k] ?? null);
  runs.push({
    id: f.replace(/\.json$/, ''),
    date: `${f.slice(0, 10)} ${f.slice(11, 13)}:${f.slice(14, 16)}`,
    format: r.version ?? 1,
    build: r.build ?? null,
    mode: r.mode,
    difficulty: r.difficulty ?? (r.version >= 2 ? 'normal' : 'inconnu'),
    victory: !!r.victory,
    duration: r.duration,
    level: r.level,
    tutorial: !!r.tutorial,
    online: !!r.online,
    players: r.players ?? 1,
    cheats: r.cheats ?? [],
    overrides: r.overrides ?? [],
    jump: r.jump ?? null,
    deathCause: r.deathCause ?? '',
    picked: r.picked ?? {},
    prismPicked: r.prismPicked ?? {},
    bosses: r.bosses ?? [],
    waves: r.waves ?? [],
    events: r.events ?? [],
    s,
    bags,
  });
}

// Courbe du modèle de pression actuel (`data/waveModel.ts`) : PV d'aliens vivants prévus, seconde par seconde, pour la comparer au jeu.
let model = null;
const vite = await createServer({ root: path.join(here, '..'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { simulatePressure, DEFAULT_WAVE_MODEL } = await vite.ssrLoadModule('/src/data/waveModel.ts');
  const { DEFAULT_WAVE_SCRIPT } = await vite.ssrLoadModule('/src/data/waves.ts');
  const params = DEFAULT_WAVE_SCRIPT.model ?? DEFAULT_WAVE_MODEL;
  const pred = simulatePressure(DEFAULT_WAVE_SCRIPT, params, 900, 1);
  model = { params, hp: pred.hp.map((v) => Math.round(v)), dps: pred.dps.map((v) => Math.round(v)) };
} catch (e) {
  console.warn('Modèle de pression indisponible :', e.message);
} finally {
  await vite.close();
}

const data = { generated: new Date().toISOString(), source: path.relative(root, dir) || dir, model, runs };
const template = fs.readFileSync(path.join(here, 'report', 'report.html'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c'); // jamais de « </script> » dans les données
const html = template.replace('/*__DATA__*/null', json);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${runs.length} partie(s) → ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} Ko)`);

if (!flag('no-open')) {
  // ouvre le rapport dans le navigateur par défaut
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', out]] : process.platform === 'darwin' ? ['open', [out]] : ['xdg-open', [out]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
}
