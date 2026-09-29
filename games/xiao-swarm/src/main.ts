import { bootPokiGame, poki, setTheme, storage } from '@xiao/engine';
import { PALETTE, SAFE_SIZE } from './config';
import { i18n } from './i18n';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HudScene } from './scenes/HudScene';
import { PauseScene } from './scenes/PauseScene';

void bootPokiGame({
  safeSize: SAFE_SIZE,
  backgroundColor: PALETTE.bgDark,
  scenes: [BootScene, GameScene, HudScene, PauseScene, GameOverScene],
  beforeCreate: () => {
    storage.setNamespace('xiao-swarm');
    i18n.init(poki.getURLParam('lang'));
    setTheme({
      font: '"Trebuchet MS", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      panel: PALETTE.panel,
      panelBorder: 0x0a1422,
      primary: PALETTE.primary,
      primaryText: '#2a1d2e',
      rewarded: PALETTE.rewarded,
      secondary: PALETTE.panel,
    });
  },
});
