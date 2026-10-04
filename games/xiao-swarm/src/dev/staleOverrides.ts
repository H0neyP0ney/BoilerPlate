/**
 * Réglages de dev mémorisés dans le navigateur (localStorage) et réappliqués par-dessus les valeurs du code : si le code change ensuite,
 * la copie du navigateur les masque en silence (ex. un nouveau boss absent des vagues mémorisées). Chaque copie est donc marquée avec
 * l'empreinte des valeurs du code au moment où elle a été créée ; si l'empreinte a changé au démarrage, la copie périmée est supprimée
 * et signalée dans le jeu (`staleDropped`, affiché par le HUD). Dev seulement.
 */

/** Libellés des copies supprimées pendant ce démarrage. */
export const staleDropped: string[] = [];

function hash(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h);
}

/**
 * À appeler au début du chargement d'une copie mémorisée (`key`), AVANT d'appliquer quoi que ce soit : `defaults` = valeurs du code que la copie
 * remplace. `adoptExisting` : sans empreinte connue (première fois), garder la copie telle quelle en lui attribuant l'empreinte actuelle
 * (réglages déjà faits à la main) ; sinon la supprimer.
 */
export function dropStaleOverride(key: string, label: string, defaults: unknown, adoptExisting = true): void {
  try {
    const h = hash(defaults);
    const known = localStorage.getItem(`${key}-base`);
    if (known === h) return;
    localStorage.setItem(`${key}-base`, h);
    if (known === null && adoptExisting) return;
    if (localStorage.getItem(key) === null) return;
    localStorage.removeItem(key);
    staleDropped.push(label);
    console.warn(`[dev] réglages mémorisés « ${label} » supprimés : les valeurs du code ont changé depuis.`);
  } catch {
    // stockage indisponible : rien à supprimer
  }
}
