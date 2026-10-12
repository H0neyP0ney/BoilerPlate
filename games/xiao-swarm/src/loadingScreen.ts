/**
 * Écran de chargement HTML (`#boot` de index.html : fond bleu dégradé, logo XIAO Games, barre) : visible dès le téléchargement de la page, il couvre le canvas
 * jusqu'au lancement de la partie. Piloté par `BootScene` (progression des fichiers, état de la connexion en ligne). Sans cet élément (page de test…), tout est sans effet.
 */
const el = (id: string): HTMLElement | null => document.getElementById(id);

/** Progression du chargement des fichiers (0 → 1). */
export function setLoadProgress(p: number): void {
  const fill = el('boot-fill');
  if (fill) fill.style.width = `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;
}

/** Texte sous la barre (ex. « Connecting… ») ; vide pour l'effacer. */
export function setLoadStatus(text: string): void {
  const s = el('boot-status');
  if (s) s.textContent = text;
}

/** Retire l'écran de chargement (fondu) : la partie (ou une visionneuse) prend la place. */
export function hideLoadingScreen(): void {
  const boot = el('boot');
  if (!boot) return;
  boot.classList.add('done');
  window.setTimeout(() => boot.remove(), 450);
}
