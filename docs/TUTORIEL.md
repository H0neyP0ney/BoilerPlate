# Onboarding scripté (tutoriel)

Première partie solo en mode `survival` : une partie normale dont la timeline de vagues est **remplacée au début** par quelques vagues de tutoriel. Quand le joueur a tout fait, le gestionnaire de vagues normal prend le relai à 0 s, sans écran de transition.

## Déroulé

1. **Départ.** Le conseil « WASD / drag to move » (déjà existant) s'affiche. Un **point vert** pulse sur le sol, à l'écran ; hors écran, une flèche verte au bord de l'écran. Il faut s'y rendre.
2. **Vague 1.** Dès qu'un soldat est sur le point : 4 glings apparaissent en cercle autour de la squad. Peu d'XP (pas de level-up).
3. **2e point vert** (un peu plus loin, à l'écran) quand la vague 1 est morte.
4. **Vague 2.** Sur le point : 3 glings + 1 slime. Le slime lâche **toujours une recrue, à 240 px de la squad** (elle ne disparaît pas) ; une **flèche jaune** pointe dessus avec la bulle **« Get +1 trooper »**.
5. **Vague 3** (après ramassage de la recrue) : 6 glings qui ne lâchent **que de l'XP**, assez pour **un level-up**. Il faut **ramasser tous les globes** (bandeau « Collect all the XP orbs »). L'offre est imposée : **damage / speed / fireRate**, sans relance ni prismatique ; une **flèche verte** recommande *damage*, mais le joueur choisit ce qu'il veut.
6. **Vague 4** (après le choix) : 10 glings + 2 slimes, **sans XP** ; un slime lâche une recrue, l'autre un **power-up de soin** (flèches). Quand la vague est finie, la recrue et le power-up ramassés : **fin**.

Pendant l'onboarding : pas de power-up au hasard, pas de vagues normales, et **la squad ne peut pas mourir** (ses PV ne descendent pas sous 1 ; le soin de la fin la remet d'aplomb).

## Où régler

- **`data/tutorial.ts`** (données pures) : rayon des points verts, distances, rayon d'apparition, composition de chaque vague, XP lâchée par alien (`xp`), recrue forcée (`recruit`), power-up forcé (`powerup`), offre de level-up (`offer`) et carte recommandée (`suggest`). Budget d'XP : le niveau 1 coûte `xpToNext(1)` = 10 XP ; vagues 1 + 2 = 9 XP (pas de level-up) ; vague 3 = 12 XP (un seul level-up).
- **`sim/Tutorial.ts`** (pur) : machine à états `move1 → wave1 → move2 → wave2 → wave3 → wave4 → done`. Lue par `Sim` (`sim.tutorial`), qui suspend `waves.update` tant qu'il est actif.
- Marqueur vert au sol : `WorldView.drawTutorialMarker`. Flèches, bulle et bandeau : `HudScene.drawTutorial`. Flèche de recommandation : `LevelUpScene` (`suggest`).
- Textes : `locales/en.json` (`tutoRecruit`, `tutoOrbs`, `replayTutorial`, `tutorialNextGame`).

## Activation

- Automatique à la **première partie solo** (`settings.tutorialDone` faux), jamais en ligne ni en royale / versus.
- À la fin, `settings.tutorialDone` passe à vrai (mémorisé dans le navigateur) ; chaque étape envoie `poki.measure('onboarding', étape, 'complete')`.
- **Rejouer** : bouton « Replay tutorial » du menu Options, ou `?tuto=1` dans l'URL. **Sauter** : `?tuto=0`.

## Test

`npm run sim:tutorial` : un joueur automatique suit les cibles ; vérifie l'enchaînement des étapes, l'absence de level-up avant la vague 3, un seul level-up, l'offre imposée, la recrue à distance, la fin et le relai des vagues normales.
