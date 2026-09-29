/**
 * i18n minimaliste. Chaque jeu fournit ses dictionnaires (un JSON par langue) :
 *
 *   import en from './locales/en.json'; import fr from './locales/fr.json';
 *   export const i18n = createI18n({ en, fr });
 *   i18n.init(poki.getURLParam('lang'));   // détecte la langue du navigateur
 *   i18n.t('score', { value: 12 });
 *
 * Priorité Poki conseillée : EN, FR, IT, DE, ES, TR, puis zh/ja/ko, puis pt-BR/ru.
 */
export type Vars = Record<string, string | number>;

export interface I18n<K extends string> {
  init(override?: string): void;
  setLang(lang: string): void;
  readonly lang: string;
  t(key: K, vars?: Vars): string;
}

export function createI18n<D extends Record<string, string>>(
  locales: { en: D } & Record<string, Partial<D>>,
): I18n<Extract<keyof D, string>> {
  const fallback = locales.en;
  let current: Partial<D> = fallback;
  let currentLang = 'en';

  const pick = (candidates: readonly string[]): string => {
    for (const raw of candidates) {
      const lang = raw.toLowerCase();
      if (locales[lang]) return lang;
      const base = lang.split('-')[0];
      if (locales[base]) return base;
    }
    return 'en';
  };

  const api: I18n<Extract<keyof D, string>> = {
    init(override) {
      const candidates = [override, ...(navigator.languages ?? []), navigator.language].filter(
        (l): l is string => !!l,
      );
      api.setLang(pick(candidates));
    },
    setLang(lang) {
      currentLang = locales[lang] ? lang : 'en';
      current = locales[currentLang];
      document.documentElement.lang = currentLang;
    },
    get lang() {
      return currentLang;
    },
    t(key, vars) {
      let text: string = current[key] ?? fallback[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      return text;
    },
  };
  return api;
}
