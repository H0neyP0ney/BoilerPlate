import type Phaser from "phaser";
import { DIFFICULTY, DIFFICULTY_DEFAULTS } from "../config";
import {
  DIFFICULTY_SECTIONS,
  resetDifficulty,
  saveDifficulty,
  saveDifficultyToCode,
} from "../debugDifficulty";
import {
  button,
  floatingPanel,
  heading,
  line,
  note,
  slider,
  type FloatingPanel,
} from "./devUi";

/**
 * Panneau « Difficulté » (dev) : règle en direct les multiplicateurs globaux des stats des unités (`DIFFICULTY` dans config.ts) :
 * aliens, boss, zombies, squad, multijoueur, vagues, aides au joueur (tout `DIFFICULTY_DEFAULTS`). Bouton en haut à gauche du jeu. Save / Reset.
 */
export class DifficultyPanel {
  private readonly panel: FloatingPanel;
  private readonly syncs: (() => void)[] = [];

  constructor(scene: Phaser.Scene) {
    this.panel = floatingPanel("Difficulté globale", { width: 290 });
    const status = document.createElement("div");
    status.style.cssText = "font-size:12px;color:#9fe;min-height:1.4em";
    const say = (msg: string) => (status.textContent = msg);

    const body = this.panel.body;
    body.append(
      note(
        "Multiplicateurs appliqués par-dessus les stats de chaque unité. En ligne, ceux de l'hôte comptent. Survol d'un nom : explication.",
      ),
    );
    const sliders = document.createElement("div");
    sliders.style.cssText =
      "display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow-y:auto;padding-right:4px";
    for (const sec of DIFFICULTY_SECTIONS) {
      sliders.append(heading(sec.title));
      for (const s of sec.specs) {
        const c = slider(s.label, {
          min: s.min,
          max: s.max,
          step: s.step,
          hint: `${s.hint} (défaut ${DIFFICULTY_DEFAULTS[s.key]})`,
          get: () => DIFFICULTY[s.key],
          set: (v) => {
            DIFFICULTY[s.key] = v;
            saveDifficulty();
          },
        });
        this.syncs.push(c.sync);
        sliders.append(c.row);
      }
    }
    body.append(sliders);
    body.append(
      line(
        button("Save", () => void saveDifficultyToCode().then(say)),
        button("Reset", () => {
          resetDifficulty();
          this.syncs.forEach((f) => f());
          say("Retour à la dernière sauvegarde (valeurs par défaut du code)");
        }),
      ),
      status,
    );
    scene.events.once("shutdown", () => this.panel.destroy());
  }

  toggle(): void {
    this.panel.toggle();
  }
}
