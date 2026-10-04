import { createI18n } from '@xiao/engine';
import en from './locales/en.json';
import fr from './locales/fr.json';

/** Langues proposées dans le menu Options (anglais par défaut ; `settings.lang` mémorise le choix du joueur). */
export const LANGS = ['en', 'fr'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { en: 'English', fr: 'Français' };

export const i18n = createI18n({ en, fr });
export const t = i18n.t;
