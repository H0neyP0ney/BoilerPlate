import { DEV_TOOLS } from '../core/devTools';

/**
 * Console de log en jeu (outils de dev seulement : dev ou `?debug=1`) : panneau à droite de l'écran, les derniers messages avec l'heure
 * (secondes depuis le chargement de la page). Sert à voir si un freeze coïncide avec un chargement d'asset, une fabrication de textures…
 * Les images trop longues (> `FREEZE_MS` entre deux images) y sont notées en rouge. Fermée au départ ; la touche ² (en même temps que le menu Réglages), F4 ou le bouton du HUD (`toggleDevLog`) l'affiche / la masque.
 *
 *   devLog('paquet 2 : début');
 *   devLog('rattrapage : 12 textures', 'warn');
 */
const MAX_LINES = 500;
const FREEZE_MS = 80;

type Level = 'info' | 'warn';
interface Line {
  t: number;
  text: string;
  level: Level;
}

const lines: Line[] = [];
let panel: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;
let visible = false; // fermée au départ : touche ² (comme le menu Réglages), F4 ou bouton du HUD pour l'ouvrir
let dirty = false;

const COLORS: Record<Level, string> = { info: '#cfe3ff', warn: '#ff8a7a' };

function ensurePanel(): void {
  if (panel || typeof document === 'undefined' || !document.body) return;
  panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;right:0;top:12%;bottom:12%;width:300px;z-index:99999;pointer-events:auto;background:rgba(5,16,28,0.72);color:#cfe3ff;' +
    'font:11px/1.3 monospace;padding:4px 6px;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;';
  body = document.createElement('div');
  panel.appendChild(body);
  document.body.appendChild(panel);
  panel.style.display = visible ? 'block' : 'none';
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F4' && e.code !== 'Backquote') return; // F4, ou ² (Backquote : la touche du menu Réglages)
    e.preventDefault();
    toggleDevLog();
  });
}

function render(): void {
  dirty = false;
  ensurePanel();
  if (!body || !panel) return;
  const stick = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 8; // déjà en bas : on suit les nouveaux messages ; sinon on garde la position
  body.replaceChildren(
    ...lines.map((l) => {
      const row = document.createElement('div');
      row.style.cssText = `color:${COLORS[l.level]};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
      row.textContent = `${(l.t / 1000).toFixed(2)} ${l.text}`;
      return row;
    }),
  );
  if (stick) panel.scrollTop = panel.scrollHeight;
}

/** Masque / affiche la console de log (bouton du HUD en debug, touche ² ou F4). Sans effet hors outils de dev. */
export function toggleDevLog(): void {
  if (!DEV_TOOLS) return;
  visible = !visible;
  ensurePanel();
  if (panel) panel.style.display = visible ? 'block' : 'none';
}

let started = false;
function startWatcher(): void {
  if (started) return;
  started = true;
  let last = performance.now();
  const frame = (now: number): void => {
    const gap = now - last;
    last = now;
    // onglet masqué : requestAnimationFrame s'arrête, ce n'est pas un freeze
    if (gap > FREEZE_MS && gap < 5000 && !document.hidden) devLog(`FREEZE ${Math.round(gap)} ms`, 'warn');
    if (dirty) render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Ajoute un message à la console de log en jeu. Sans effet hors outils de dev. */
export function devLog(text: string, level: Level = 'info'): void {
  if (!DEV_TOOLS) return;
  lines.push({ t: performance.now(), text, level });
  if (lines.length > MAX_LINES) lines.shift();
  dirty = true;
  startWatcher();
}
