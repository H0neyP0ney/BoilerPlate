import { createI18n } from '@xiao/engine';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const i18n = createI18n({ en, fr });
export const t = i18n.t;
