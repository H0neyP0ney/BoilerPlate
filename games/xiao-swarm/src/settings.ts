import { clamp, storage } from '@xiao/engine';

/** Réglages joueur (menu « Réglages »), mémorisés dans le navigateur. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;

export const settings = {
  /** Multiplicateur du zoom total de la caméra (1 = zoom d'origine). */
  zoom: clamp(storage.get('settings.zoom', 1), ZOOM_MIN, ZOOM_MAX),

  setZoom(value: number): void {
    // arrondi au pas pour éviter la dérive des flottants (0.7000000001)
    this.zoom = clamp(Math.round(value / ZOOM_STEP) * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
    storage.set('settings.zoom', this.zoom);
  },
};
