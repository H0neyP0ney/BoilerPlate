/**
 * « Save » des vues de dev : envoie des valeurs au serveur de dev (plugin `dev-save.ts`), qui les réécrit comme valeurs
 * PAR DÉFAUT dans le code source. Renvoie le message à afficher. Dev uniquement (le plugin n'existe pas en build).
 *
 * Convention pour toutes les vues : **Save** = enregistrer les valeurs actuelles dans le code (elles deviennent les
 * valeurs par défaut) ; **Reset** = revenir à la dernière sauvegarde (les valeurs par défaut du code).
 */
export type SaveTarget = 'crowd' | 'visual' | 'fx' | 'waves' | 'obstacle' | 'sprite';

export async function saveToCode(target: SaveTarget, data: unknown): Promise<string> {
  if (!import.meta.env.DEV) return 'Save : disponible en dev uniquement';
  try {
    const res = await fetch('/__dev/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, data }) });
    const out = (await res.json()) as { ok: boolean; message: string };
    return out.ok ? `✔ ${out.message}` : `✖ ${out.message}`;
  } catch {
    return '✖ Save impossible : serveur de dev injoignable';
  }
}
