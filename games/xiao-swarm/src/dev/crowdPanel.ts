import type Phaser from 'phaser';
import { CROWD, CROWD_DEFAULTS } from '../config';
import { copyCrowd, CROWD_SPECS, loadPreset, resetCrowd, saveCrowd, savePreset } from '../debugCrowd';
import { button, floatingPanel, heading, line, note, slider, type FloatingPanel } from './devUi';

/**
 * Panneau « Foule » (dev) : règle en direct le mouvement de la squad — vitesse, réactivité, laisse, espacement,
 * séparation… (`CROWD` dans config.ts). Bouton en haut à gauche du jeu. Les réglages courants sont mémorisés dans le
 * navigateur ; la config de travail se sauvegarde / se recharge avec les boutons ou F8 / F9.
 */
export class CrowdPanel {
  private readonly panel: FloatingPanel;
  private readonly status: HTMLDivElement;
  private readonly syncs: (() => void)[] = [];

  constructor(scene: Phaser.Scene) {
    this.panel = floatingPanel('Mouvement de foule', { width: 290 });
    this.status = document.createElement('div');
    this.status.style.cssText = 'font-size:12px;color:#9fe;min-height:1.4em';
    const say = (msg: string) => (this.status.textContent = msg);

    const body = this.panel.body;
    body.append(note('Les valeurs s\'appliquent tout de suite à ta squad. Survol d\'un nom : explication.'));
    for (const s of CROWD_SPECS) {
      const c = slider(s.label, {
        min: s.min,
        max: s.max,
        step: s.step,
        hint: `${s.hint} (défaut ${CROWD_DEFAULTS[s.key]})`,
        get: () => CROWD[s.key],
        set: (v) => {
          CROWD[s.key] = v;
          saveCrowd();
        },
      });
      this.syncs.push(c.sync);
      body.append(c.row);
    }
    const syncAll = () => this.syncs.forEach((f) => f());
    body.append(
      line(
        button('Réinitialiser', () => {
          resetCrowd();
          syncAll();
          say('Valeurs par défaut restaurées');
        }),
        button('Copier (JSON)', () => {
          copyCrowd();
          say('Valeurs copiées dans le presse-papiers (à recoller dans CROWD_DEFAULTS)');
        }),
      ),
      heading('Config de travail'),
      line(button('Sauvegarder (F8)', () => savePreset(say)), button('Charger (F9)', () => loadPreset(say, syncAll))),
      this.status,
    );

    const kb = scene.input.keyboard;
    const onF8 = () => savePreset(say);
    const onF9 = () => loadPreset(say, syncAll);
    kb?.on('keydown-F8', onF8);
    kb?.on('keydown-F9', onF9);
    scene.events.once('shutdown', () => {
      kb?.off('keydown-F8', onF8);
      kb?.off('keydown-F9', onF9);
      this.panel.destroy();
    });
  }

  toggle(): void {
    this.panel.toggle();
  }
}
