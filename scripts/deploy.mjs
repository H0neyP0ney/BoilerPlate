// Déploiement en un clic : build web du jeu puis upload FTP de dist/ dans <REMOTE_DIR>/<version>/.
// Chaque version reste sur le serveur (historique). Identifiants dans .env.deploy (voir .env.deploy.example).
//
//   npm run deploy                 build + upload de la version de games/xiao-swarm/package.json
//   npm run deploy -- --bump       incrémente d'abord la version patch (0.1.0 → 0.1.1)
//   npm run deploy -- --force      écrase la version si elle existe déjà sur le serveur
//   npm run deploy -- --skip-build envoie le dist/ existant sans rebuild
//   npm run deploy -- --game=_starter   autre jeu du monorepo
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'basic-ftp';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const game = (args.find((a) => a.startsWith('--game='))?.slice(7)) ?? 'xiao-swarm';
const gameDir = join('games', game);

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

/** Lit .env.deploy (CLE=valeur, # = commentaire). Les variables d'environnement du shell restent prioritaires. */
function loadEnv() {
  const env = {};
  if (existsSync('.env.deploy')) {
    for (const line of readFileSync('.env.deploy', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
for (const key of ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD', 'REMOTE_DIR']) {
  if (!env[key]) fail(`${key} manquant : copie .env.deploy.example en .env.deploy et remplis-le.`);
}

const run = (cmd) => {
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(`Échec de : ${cmd}`);
};

if (flag('bump')) run(`npm version patch --no-git-tag-version -w ${JSON.parse(readFileSync(join(gameDir, 'package.json'), 'utf8')).name}`);
const { name, version } = JSON.parse(readFileSync(join(gameDir, 'package.json'), 'utf8'));
if (!/^[\w.-]+$/.test(version)) fail(`Version invalide : ${version}`);

if (!flag('skip-build')) run(`npm run build -w ${name}`);
const dist = join(gameDir, 'dist');
if (!existsSync(join(dist, 'index.html'))) fail(`${dist}/index.html introuvable : le build a échoué ?`);

const secure = { true: true, explicit: true, implicit: 'implicit' }[String(env.FTP_SECURE ?? 'false').toLowerCase()] ?? false;
const client = new Client(60000);
try {
  console.log(`\nConnexion à ${env.FTP_HOST}…`);
  await client.access({
    host: env.FTP_HOST,
    port: Number(env.FTP_PORT) || (secure === 'implicit' ? 990 : 21),
    user: env.FTP_USER,
    password: env.FTP_PASSWORD,
    secure,
    secureOptions: { rejectUnauthorized: env.FTP_ALLOW_SELF_SIGNED !== 'true' },
  });

  await client.ensureDir(env.REMOTE_DIR);
  const existing = (await client.list()).some((f) => f.name === version);
  if (existing && !flag('force')) {
    fail(`La version ${version} existe déjà sur le serveur. Utilise --bump (nouvelle version) ou --force (écraser).`);
  }

  console.log(`Envoi de ${dist} vers ${env.REMOTE_DIR}/${version}/ …`);
  await client.ensureDir(version);
  client.trackProgress((p) => process.stdout.write(`\r  ${p.bytesOverall} octets envoyés`));
  await client.uploadFromDir(dist);
  client.trackProgress();
  console.log(`\n\n✔ ${name} ${version} déployé dans ${env.REMOTE_DIR}/${version}/`);
  if (env.PUBLIC_URL) console.log(`  ${env.PUBLIC_URL.replace(/\/$/, '')}/${version}/`);
} catch (e) {
  fail(`Déploiement interrompu : ${e.message}`);
} finally {
  client.close();
}
