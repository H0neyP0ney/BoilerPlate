import { bootPokiGame, poki, setTheme, storage, DEV_TOOLS } from '@xiao/engine';
import { PALETTE, SAFE_SIZE } from './config';
import { i18n } from './i18n';
import { settings } from './settings';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HudScene } from './scenes/HudScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { PauseScene } from './scenes/PauseScene';
import { OptionsScene } from './scenes/OptionsScene';
import { BonusViewerScene } from './scenes/BonusViewerScene';
import { UpgradeViewerScene } from './scenes/UpgradeViewerScene';
import { MiscViewerScene } from './scenes/MiscViewerScene';
import { MapEditorScene } from './scenes/MapEditorScene';
import { ObstacleEditorScene } from './scenes/ObstacleEditorScene';
import { ParticleViewerScene } from './scenes/ParticleViewerScene';
import { WaveEditorScene } from './scenes/WaveEditorScene';
import { UnitViewerScene } from './scenes/UnitViewerScene';

void bootPokiGame({
  safeSize: SAFE_SIZE,
  backgroundColor: PALETTE.bgDark,
  scenes: [BootScene, GameScene, HudScene, PauseScene, OptionsScene, LevelUpScene, GameOverScene, ...(DEV_TOOLS ? [UnitViewerScene, ParticleViewerScene, ObstacleEditorScene, MiscViewerScene, BonusViewerScene, UpgradeViewerScene, WaveEditorScene, MapEditorScene] : [])],
  beforeCreate: () => {
    storage.setNamespace('xiao-swarm');
    i18n.init(settings.lang ?? (poki.getURLParam('lang') || 'en')); // anglais par défaut (pas la langue du navigateur)
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
