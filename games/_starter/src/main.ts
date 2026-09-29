import { bootPokiGame, poki, setTheme, storage } from '@xiao/engine';
import { COLORS, SAFE_SIZE } from './config';
import { i18n } from './i18n';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';
import { PauseScene } from './scenes/PauseScene';
import { GameOverScene } from './scenes/GameOverScene';

void bootPokiGame({
  safeSize: SAFE_SIZE,
  backgroundColor: COLORS.bg,
  scenes: [BootScene, PreloadScene, GameScene, PauseScene, GameOverScene],
  config: { physics: { default: 'arcade', arcade: { debug: false } } },
  beforeCreate: () => {
    storage.setNamespace('starter');
    i18n.init(poki.getURLParam('lang'));
    setTheme({ primary: COLORS.primary, rewarded: COLORS.rewarded, panel: COLORS.panel, secondary: COLORS.panel });
  },
});
