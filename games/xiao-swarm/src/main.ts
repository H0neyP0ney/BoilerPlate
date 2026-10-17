import { bootPokiGame, Button, poki, setTheme, storage, DEV_TOOLS } from '@xiao/engine';
import { playSfx } from './playSfx';
import { PALETTE, SAFE_SIZE } from './config';
import { i18n } from './i18n';
import { settings } from './settings';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HudScene } from './scenes/HudScene';
import { EndingScene } from './scenes/EndingScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MultiplayerScene } from './scenes/MultiplayerScene';
import { SoloScene } from './scenes/SoloScene';
import { ShopScene } from './scenes/ShopScene';
import { ArmoryScene } from './scenes/ArmoryScene';
import { TitleScene } from './scenes/TitleScene';
import { PauseScene } from './scenes/PauseScene';
import { OptionsScene } from './scenes/OptionsScene';
import { BonusViewerScene } from './scenes/BonusViewerScene';
import { UpgradeViewerScene } from './scenes/UpgradeViewerScene';
import { MiscViewerScene } from './scenes/MiscViewerScene';
import { MapEditorScene } from './scenes/MapEditorScene';
import { ObstacleEditorScene } from './scenes/ObstacleEditorScene';
import { ParticleViewerScene } from './scenes/ParticleViewerScene';
import { WaveEditorScene } from './scenes/WaveEditorScene';
import { SoundTestScene } from './scenes/SoundTestScene';
import { PacksViewerScene } from './scenes/PacksViewerScene';
import { UnitViewerScene } from './scenes/UnitViewerScene';

void bootPokiGame({
  safeSize: SAFE_SIZE,
  backgroundColor: PALETTE.bgDark,
  scenes: [BootScene, GameScene, HudScene, EndingScene, PauseScene, LobbyScene, MultiplayerScene, TitleScene, SoloScene, ShopScene, ArmoryScene, OptionsScene, LevelUpScene, GameOverScene, ...(DEV_TOOLS ? [UnitViewerScene, ParticleViewerScene, ObstacleEditorScene, MiscViewerScene, BonusViewerScene, UpgradeViewerScene, WaveEditorScene, MapEditorScene, SoundTestScene, PacksViewerScene] : [])],
  beforeCreate: () => {
    storage.setNamespace('xiao-swarm');
    Button.clickHook = (scene) => playSfx(scene, 'ui_click'); // clic de tous les boutons des menus
    i18n.init(settings.lang ?? (poki.getURLParam('lang') || 'en')); // anglais par défaut (pas la langue du navigateur)
    setTheme({
      font: '"Baloo 2", "Trebuchet MS", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      panel: PALETTE.panel,
      panelBorder: 0x0a1422,
      primary: PALETTE.primary,
      primaryText: '#2a1d2e',
      rewarded: PALETTE.rewarded,
      rewardedText: '#ffffff',
      secondary: PALETTE.panel,
    });
  },
});
