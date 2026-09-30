/**
 * Rangement des menus de dev (menu Réglages, panneaux Foule et Triche) : ils s'ouvrent toujours à gauche de l'écran,
 * sous les boutons du HUD. Plusieurs ouverts en même temps se rangent côte à côte, dans l'ordre d'ouverture ; quand
 * l'un se ferme, les autres se recollent à gauche.
 */
const TOP = 64;
const LEFT = 8;
const GAP = 8;
const docked: HTMLElement[] = [];

function layout(): void {
  let x = LEFT;
  for (const el of docked) {
    el.style.top = `${TOP}px`;
    el.style.right = 'auto';
    el.style.left = `${x}px`;
    x += el.getBoundingClientRect().width + GAP;
  }
}

/** Ouvre (`open` = true) ou ferme un menu rangé. À appeler après avoir affiché / masqué l'élément. */
export function setDocked(el: HTMLElement, open: boolean): void {
  const i = docked.indexOf(el);
  if (i >= 0) docked.splice(i, 1);
  if (open) docked.push(el);
  layout();
}
