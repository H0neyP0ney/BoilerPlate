/**
 * localStorage sûr : en navigation privée ou si le stockage est bloqué,
 * on bascule sur un fallback en mémoire pour que le jeu reste jouable.
 *
 * Les comptes Poki synchronisent localStorage dans le cloud (limite 1 Mo gzip).
 * Préfixer une clé par `poki_ignore` l'exclut de la synchro (caches, etc.).
 */
let PREFIX = 'game:';
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* stockage indisponible : mémoire uniquement */
  }
}

export const storage = {
  /** À appeler au démarrage avec l'id du jeu (évite les collisions sur un même domaine). */
  setNamespace(ns: string): void {
    PREFIX = ns + ':';
  },

  get<T>(key: string, fallback: T): T {
    const raw = read(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): void {
    write(key, JSON.stringify(value));
  },

  remove(key: string): void {
    memory.delete(key);
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },

  /** true si la progression sera réellement conservée (à afficher au joueur sinon). */
  isPersistent(): boolean {
    try {
      const k = PREFIX + '__test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
};
