// Zippe dist/ (index.html à la racine) pour l'upload sur Poki for Developers / Poki Inspector,
// et affiche la taille totale pour vérifier les budgets Poki (< 5 Mo initial, < 8 Mo total).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const DIST = 'dist';
const OUT = 'poki-build.zip';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = {};
let raw = 0;
for (const file of walk(DIST)) {
  const data = readFileSync(file);
  raw += data.length;
  files[relative(DIST, file).replaceAll('\\', '/')] = data;
}

const zip = zipSync(files, { level: 9 });
writeFileSync(OUT, zip);

const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' Mo';
console.log(`\n${OUT} : ${Object.keys(files).length} fichiers, ${mb(raw)} brut, ${mb(zip.length)} zippé`);
if (raw > 8 * 1024 * 1024) console.warn('⚠  Plus de 8 Mo au total : au-dessus de la recommandation Poki.');
else if (raw > 5 * 1024 * 1024) console.warn('⚠  Plus de 5 Mo : vérifie que le téléchargement initial reste sous 5 Mo (chargement progressif).');
