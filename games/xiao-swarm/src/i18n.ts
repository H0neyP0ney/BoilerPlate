import { createI18n } from '@xiao/engine';
import en from './locales/en.json';

export const i18n = createI18n({ en }) // jeu en anglais uniquement;
export const t = i18n.t;
