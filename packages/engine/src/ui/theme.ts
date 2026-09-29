/**
 * Thème UI partagé par les composants de l'engine (Button, panneaux…).
 * Chaque jeu appelle `setTheme({...})` au démarrage pour sa DA.
 */
export interface Theme {
  font: string;
  text: string;
  textDim: string;
  panel: number;
  panelBorder: number;
  primary: number;
  primaryText: string;
  /** Poki : les boutons rewarded ne doivent PAS être verts. */
  rewarded: number;
  rewardedText: string;
  secondary: number;
  secondaryText: string;
  radius: number;
}

export const theme: Theme = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  text: '#ffffff',
  textDim: '#b6b0d6',
  panel: 0x241f3a,
  panelBorder: 0x000000,
  primary: 0xffb938,
  primaryText: '#1b1528',
  rewarded: 0x6a5cff,
  rewardedText: '#ffffff',
  secondary: 0x241f3a,
  secondaryText: '#ffffff',
  radius: 12,
};

export function setTheme(partial: Partial<Theme>): void {
  Object.assign(theme, partial);
}
