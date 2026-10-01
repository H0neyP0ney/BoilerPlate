import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Plugin Vite (dev uniquement) : « Save » des vues de dev. Les visionneuses / panneaux (foule, particules, unités,
 * obstacles, vagues…) envoient leurs valeurs à `POST /__dev/save` ; ce plugin les réécrit comme VALEURS PAR DÉFAUT dans
 * le code source du jeu (config.ts, fxParams.ts, assets/manifest.ts, data/obstacles.ts, data/waves.ts), en ne touchant
 * qu'aux nombres concernés. Absent du build Poki (`apply: 'serve'`).
 */
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');

interface Result {
  ok: boolean;
  message: string;
}

// ---------- Outils de lecture de code ----------

/** Index du `}` qui ferme l'accolade ouverte en `open` (ignore chaînes et commentaires). */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i < 0) return -1;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i <= 0) return -1;
    } else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Bloc `{ ... }` qui suit `marker` : [indexOuvrante, indexFermante]. */
function blockAfter(text: string, marker: RegExp, from = 0): [number, number] | null {
  const slice = text.slice(from);
  const m = marker.exec(slice);
  if (!m) return null;
  const open = from + m.index + m[0].length - 1; // le marqueur se termine par `{`
  const close = matchingBrace(text, open);
  return close < 0 ? null : [open, close];
}

const fmtNumber = (v: number): string => String(Math.round(v * 10000) / 10000);
const isColorKey = (k: string): boolean => k.toLowerCase().includes('color');
const hex = (v: number): string => `0x${Math.round(v).toString(16).padStart(6, '0')}`;

/** Remplace la valeur numérique de chaque `clé: nombre` trouvée dans `block`. Renvoie les clés introuvables. */
function patchNumbers(block: string, values: Record<string, number>): { text: string; missing: string[] } {
  const missing: string[] = [];
  let text = block;
  for (const [key, v] of Object.entries(values)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const re = new RegExp(`(\\b${key}\\s*:\\s*)(-?0x[0-9a-fA-F]+|-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)`);
    if (!re.test(text)) {
      missing.push(key);
      continue;
    }
    text = text.replace(re, (_, head: string) => head + (isColorKey(key) ? hex(v) : fmtNumber(v)));
  }
  return { text, missing };
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

/** Écrit en conservant les fins de ligne du fichier d'origine. */
function writeSrc(rel: string, original: string, updated: string): void {
  const crlf = original.includes('\r\n');
  const out = crlf ? updated.replace(/\r?\n/g, '\r\n') : updated;
  fs.writeFileSync(path.join(SRC, rel), out);
  written.set(path.join(SRC, rel).replace(/\\/g, '/'), Date.now());
}

const written = new Map<string, number>();

// ---------- Cibles ----------

function saveNumbers(rel: string, marker: RegExp, values: Record<string, number>, label: string): Result {
  const src = readSrc(rel);
  const b = blockAfter(src, marker);
  if (!b) return { ok: false, message: `${label} introuvable dans ${rel}` };
  const { text, missing } = patchNumbers(src.slice(b[0], b[1] + 1), values);
  writeSrc(rel, src, src.slice(0, b[0]) + text + src.slice(b[1] + 1));
  return { ok: true, message: `${label} enregistré dans ${rel}${missing.length ? ` (clés absentes du code : ${missing.join(', ')})` : ''}` };
}

function saveFx(fx: Record<string, Record<string, number>>): Result {
  const rel = 'fxParams.ts';
  let src = readSrc(rel);
  const top = blockAfter(src, /export const FX_DEFAULTS = \{/);
  if (!top) return { ok: false, message: `FX_DEFAULTS introuvable dans ${rel}` };
  let inner = src.slice(top[0], top[1] + 1);
  const missing: string[] = [];
  for (const [name, values] of Object.entries(fx)) {
    const b = blockAfter(inner, new RegExp(`\\n\\s{2}${name}:\\s*\\{`));
    if (!b) {
      missing.push(name);
      continue;
    }
    const patched = patchNumbers(inner.slice(b[0], b[1] + 1), values);
    inner = inner.slice(0, b[0]) + patched.text + inner.slice(b[1] + 1);
  }
  writeSrc(rel, src, src.slice(0, top[0]) + inner + src.slice(top[1] + 1));
  src = '';
  return { ok: true, message: `Effets enregistrés dans ${rel}${missing.length ? ` (effets absents : ${missing.join(', ')})` : ''}` };
}

/** Noms des unités (visionneuse d'unités) : clés écrites dans locales/<langue>.json (ajoutées à la fin si absentes). */
function saveNames(data: Record<string, Record<string, string>>): Result {
  let count = 0;
  for (const [lang, values] of Object.entries(data)) {
    if (!/^[a-z]{2}$/.test(lang)) continue;
    const rel = `locales/${lang}.json`;
    const src = readSrc(rel);
    const json = JSON.parse(src) as Record<string, string>;
    for (const [key, v] of Object.entries(values)) {
      if (typeof v !== 'string' || !/^(class|alien)_[a-z0-9_]+$/.test(key)) continue;
      json[key] = v;
      count++;
    }
    writeSrc(rel, src, JSON.stringify(json, null, 2) + '\n');
  }
  return { ok: true, message: count ? `${count} nom(s) enregistré(s) dans locales/fr.json et en.json` : 'Aucun nom modifié à enregistrer' };
}

/** Remplace le bloc `marker ... };` (toute la déclaration) par `code`. */
function replaceDeclaration(rel: string, marker: RegExp, code: string, label: string): Result {
  const src = readSrc(rel);
  const b = blockAfter(src, marker);
  if (!b) return { ok: false, message: `${label} introuvable dans ${rel}` };
  const start = src.slice(0, b[0]).lastIndexOf('export const ');
  const end = src.indexOf('\n', src.indexOf(';', b[1])) + 1 || src.length;
  writeSrc(rel, src, src.slice(0, start) + code.trimEnd() + '\n' + src.slice(end).replace(/^\r?\n/, '\n'));
  return { ok: true, message: `${label} enregistré dans ${rel}` };
}

function saveObstacle(id: string, code: string): Result {
  const rel = 'data/obstacles.ts';
  const src = readSrc(rel);
  const m = new RegExp(`^([ \\t]*)${id}:\\s*\\{`, 'm').exec(src);
  if (!m) return { ok: false, message: `${id} introuvable dans ${rel}` };
  const open = m.index + m[0].length - 1;
  const close = matchingBrace(src, open);
  if (close < 0) return { ok: false, message: `${id} : accolade non fermée dans ${rel}` };
  let end = close + 1;
  if (src[end] === ',') end++;
  const indent = m[1];
  const replacement = code
    .trimEnd()
    .split('\n')
    .map((l) => indent + l)
    .join('\n');
  writeSrc(rel, src, src.slice(0, m.index) + replacement + src.slice(end));
  return { ok: true, message: `${id} enregistré dans ${rel}` };
}

// --- planches de sprites (assets/manifest.ts)

const MANAGED = ['originX', 'originY', 'scale', 'shadow', 'muzzle', 'anchors', 'muzzles'];
const pt = (p: [number, number]): string => `[${fmtNumber(p[0])}, ${fmtNumber(p[1])}]`;

interface SpriteProps {
  originX?: number;
  originY?: number;
  scale?: number;
  shadow?: number;
  muzzle?: [number, number];
  anchors?: Record<string, [number, number]>;
  muzzles?: Record<string, ([number, number] | null)[]>;
}

function spriteLines(p: SpriteProps): string[] {
  const out: string[] = [];
  if (p.originX !== undefined) out.push(`originX: ${fmtNumber(p.originX)},`);
  if (p.originY !== undefined) out.push(`originY: ${fmtNumber(p.originY)},`);
  if (p.scale !== undefined) out.push(`scale: ${fmtNumber(p.scale)},`);
  if (p.shadow !== undefined && p.shadow !== 1) out.push(`shadow: ${fmtNumber(p.shadow)},`);
  if (p.muzzle) out.push(`muzzle: ${pt(p.muzzle)},`);
  const anchors = Object.entries(p.anchors ?? {});
  if (anchors.length) out.push(`anchors: { ${anchors.map(([k, v]) => `'${k}': ${pt(v)}`).join(', ')} },`);
  const muzzles = Object.entries(p.muzzles ?? {});
  if (muzzles.length) {
    out.push('muzzles: {');
    for (const [k, list] of muzzles) out.push(`  ${/^[A-Za-z_]\w*$/.test(k) ? k : `'${k}'`}: [${list.map((q) => (q ? pt(q) : 'null')).join(', ')}],`);
    out.push('},');
  }
  return out;
}

/** Découpe le contenu d'un objet en propriétés de premier niveau (séparées par des virgules hors accolades / crochets). */
function topLevelProps(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '/' && inner[i + 1] === '/') {
      const nl = inner.indexOf('\n', i);
      i = nl < 0 ? inner.length : nl - 1;
    } else if (c === '/' && inner[i + 1] === '*') i = inner.indexOf('*/', i + 2) + 1;
    else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < inner.length && inner[i] !== c; i++) if (inner[i] === '\\') i++;
    } else if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (inner.slice(start).trim()) parts.push(inner.slice(start));
  return parts;
}

const keyOf = (segment: string): string | null => {
  const noComments = segment.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const m = /^\s*['"]?([A-Za-z_]\w*)['"]?\s*:/.exec(noComments);
  return m ? m[1] : null;
};

function saveSprite(id: string, props: SpriteProps): Result {
  const rel = 'assets/manifest.ts';
  const src = readSrc(rel);
  const m = new RegExp(`^([ \\t]*)${id}:\\s*\\{`, 'm').exec(src);
  if (!m) return { ok: false, message: `${id} n'a pas d'entrée de planche dans ${rel} (visuel procédural : rien à enregistrer)` };
  const open = m.index + m[0].length - 1;
  const close = matchingBrace(src, open);
  if (close < 0) return { ok: false, message: `${id} : accolade non fermée dans ${rel}` };
  const indent = m[1] + '  ';
  const kept = topLevelProps(src.slice(open + 1, close))
    .filter((seg) => !MANAGED.includes(keyOf(seg) ?? ''))
    .map((seg) => seg.replace(/^\s*\n/, '').replace(/^\s+/, '').trimEnd());
  const lines = [...spriteLines(props).map((l) => indent + l)];
  for (const seg of kept) {
    if (!seg.trim()) continue;
    const isComment = keyOf(seg) === null && !seg.includes(':');
    lines.push(indent + seg + (isComment ? '' : ','));
  }
  const body = `{\n${lines.join('\n')}\n${m[1]}}`;
  writeSrc(rel, src, src.slice(0, open) + body + src.slice(close + 1));
  return { ok: true, message: `${id} enregistré dans ${rel}` };
}

// ---------- Routage ----------

function handle(target: string, data: any): Result {
  switch (target) {
    case 'crowd':
      return saveNumbers('config.ts', /export const CROWD_DEFAULTS = \{/, data, 'Mouvement de foule');
    case 'visual':
      return saveNumbers('config.ts', /export const VISUAL_DEFAULTS = \{/, data, 'Réglages visuels');
    case 'fx':
      return saveFx(data);
    case 'names':
      return saveNames(data as Record<string, Record<string, string>>);
    case 'waves':
      return replaceDeclaration('data/waves.ts', /export const DEFAULT_WAVE_SCRIPT: WaveScript = \{/, String(data.code), 'Script de vagues');
    case 'obstacle':
      return saveObstacle(String(data.id), String(data.code));
    case 'sprite':
      return saveSprite(String(data.id), data.props as SpriteProps);
    default:
      return { ok: false, message: `Cible inconnue : ${target}` };
  }
}

export function devSave(): Plugin {
  return {
    name: 'xiao-dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let out: Result;
          try {
            const { target, data } = JSON.parse(body) as { target: string; data: unknown };
            out = handle(target, data);
          } catch (e) {
            out = { ok: false, message: `Erreur : ${(e as Error).message}` };
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        });
      });
    },
    // Le fichier qu'on vient d'écrire contient déjà ce que la page affiche : pas de rechargement (on garde la vue ouverte).
    handleHotUpdate({ file }) {
      const t = written.get(file.replace(/\\/g, '/'));
      if (t !== undefined && Date.now() - t < 4000) return [];
    },
  };
}
