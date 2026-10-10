import type Phaser from "phaser";
import { DIFFICULTY, DIFFICULTY_DEFAULTS } from "../config";
import {
  DIFFICULTY_SECTIONS,
  resetDifficulty,
  shiftDifficulty,
  saveDifficulty,
  saveDifficultyToCode,
} from "../debugDifficulty";
import { saveCrowdSpeedToCode, shiftCrowdSpeed } from "../debugCrowd";
import { saveModifiedStatsToCode, shiftAllStat, type StatGroup, type StatKind } from "../debugStats";
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
      heading("Stats de base de tous les aliens"),
      note("Ajoute ou retranche 5 % de la valeur du code à la stat de chaque alien (boss compris). Dégâts : contact, capacités et flaques. Cadence : délai d'attaque raccourci quand elle monte. XP et chance de recrue : par alien. Save les écrit dans data/aliens.ts."),
    );
    const addRows = (kind: StatKind, rows: [StatGroup, string][], unit: string) => {
      for (const [group, label] of rows) {
        const shift = (part: number) => say(`${label} de ${shiftAllStat(kind, group, part)} ${unit} : ${part > 0 ? "+" : "−"}5 % de la valeur du code`);
        body.append(line(`${label} `, button("−5 %", () => shift(-0.05)), button("+5 %", () => shift(0.05))));
      }
    };
    addRows("alien", [["hp", "PV"], ["speed", "Vitesse"], ["damage", "Dégâts"], ["cadence", "Cadence"], ["xp", "XP laissée"], ["recruit", "Chance de recrue"]], "aliens");
    body.append(
      heading("Stats de base de tous les soldats"),
      note("Même principe pour les classes de soldats (data/classes.ts) : dégâts de l'arme et de l'explosion, cadence = délai de tir raccourci, portée de l'arme (avant l'upgrade Portée). Vitesse de la squad = CROWD.speed (curseur Vitesse du panneau Foule), avant upgrade et stimpack."),
    );
    addRows("soldier", [["hp", "PV"], ["damage", "Dégâts"], ["cadence", "Cadence"], ["range", "Portée"], ["projSpeed", "Vitesse des projectiles"], ["spread", "Dispersion"]], "classes");
    const shiftRow = (label: string, key: "magnetRadius" | "xpCostMul", unit: string) =>
      body.append(
        line(
          `${label} `,
          button("−5 %", () => { say(`${label} : ${shiftDifficulty(key, -0.05)}${unit} (−5 % de la valeur du code)`); this.syncs.forEach((f) => f()); }),
          button("+5 %", () => { say(`${label} : ${shiftDifficulty(key, 0.05)}${unit} (+5 % de la valeur du code)`); this.syncs.forEach((f) => f()); }),
        ),
      );
    body.append(
      line(
        "Vitesse de la squad ",
        button("−5 %", () => say(`Vitesse de la squad : ${shiftCrowdSpeed(-0.05)} px/s (−5 % de la valeur du code)`)),
        button("+5 %", () => say(`Vitesse de la squad : ${shiftCrowdSpeed(0.05)} px/s (+5 % de la valeur du code)`)),
      ),
    );
    body.append(heading("Ramassage et progression"), note("Rayon d'attraction de base des objets au sol, et coût d'XP de chaque niveau (courbe xpToNext). Mêmes curseurs dans « Aides au joueur »."));
    shiftRow("Rayon d'attraction", "magnetRadius", " px");
    shiftRow("Coût d'XP des niveaux", "xpCostMul", " ×");
    body.append(
      line(
        button("Save", () => void saveDifficultyToCode().then(async (m) => say([m, await saveModifiedStatsToCode(), await saveCrowdSpeedToCode()].filter(Boolean).join("\n")))),
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
