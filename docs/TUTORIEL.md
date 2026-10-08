# Onboarding scripté (tutoriel)

Première partie solo en mode `survival` : une partie normale dont la timeline de vagues est **remplacée au début** par quelques vagues de tutoriel. Quand le joueur a tout fait, le gestionnaire de vagues normal prend le relai à 0 s, sans écran de transition.

## Déroulé

Le HUD est allégé pendant tout l'onboarding : ni compte à rebours « Next boss », ni timeline, ni bouton pause, ni jauge d'XP (elle réapparaît à l'étape des globes), puis tout revient à la fin.

1. **Départ.** « WASD to move » (« Drag to move » sur mobile). Un **point vert** pulse sur le sol, en haut à droite de la squad (240 px), avec « Move here » au-dessus du chevron, et une petite flèche verte autour de la squad qui pointe vers lui ; hors écran, flèche au bord de l'écran.
2. **Vague 1.** Une courte pause (1,2 s) après l'arrivée sur le point, avec une **flèche rouge « Enemy incoming! »** vers l'endroit d'où ils viennent (à droite, un peu plus haut, hors écran, 680 px). 8 glings + 1 slime, **sans XP**. Le slime lâche **toujours une recrue, sur lui** : elle fait sa cloche **sur place** (imprenable en l'air, 0,55 s). 1 s plus tard, une **flèche jaune** avec « Get +1 trooper ».
3. **Vague 2** (recrue ramassée, directement) : 12 glings à droite, plus loin (850 px), **1 XP chacun** = assez pour **un level-up**. Flèche rouge 1,5 s après leur apparition. Une fois la vague morte : **flèche et zone bleues** autour des globes restants (« Get experience », recalculées à chaque globe ramassé, retirées si la squad a déjà monté de niveau) et jauge d'XP visible. L'offre est imposée : **damage / speed / fireRate**, sans relance ni prismatique ; une **flèche verte** « Claim upgrade » recommande *damage*, mais le joueur choisit ce qu'il veut.
4. **Vague 3** (après le choix) : 15 glings + 2 slimes **en cercle autour de la squad** (340 px), **sans XP** ; un slime lâche une recrue (sans indication), l'autre un **power-up de soin** (flèche « Take power-up »). Quand la vague est finie, la recrue et le power-up ramassés : **fin**.

Pendant l'onboarding : pas de power-up au hasard, pas de vagues normales, et **la squad ne peut pas mourir** (ses PV ne descendent pas sous 1 ; le soin de la fin la remet d'aplomb).

**Cadeau caché de fin** (`TUTORIAL_REWARD`) : à la fin d'un tutoriel complet, la squad reçoit en secret dégâts ×1, cadence ×1, vitesse ×3, recrue ×3, portée ×2 et PV max ×2 (nombre de prises de l'upgrade correspondante). Les stats changent, mais rien n'apparaît dans les upgrades prises ni à l'écran. Pour toutes les parties (tutoriel compris), la base de la squad est de plus à **dégâts ×1,10 et cadence ×1,15** (`DIFFICULTY.squad*`).

## Où régler

- **`data/tutorial.ts`** (données pures) : rayon des points verts, distance du 1er point, pause avant la 1re vague, rayons d'apparition de chaque vague, composition de chaque vague, XP lâchée par alien (`xp`), recrue forcée (`recruit`), power-up forcé (`powerup`), offre de level-up (`offer`) et carte recommandée (`suggest`). Budget d'XP : le niveau 1 coûte `xpToNext(1)` = 10 XP ; vague 1 = 0 XP ; vague 2 = 12 XP (un seul level-up).
- **`sim/Tutorial.ts`** (pur) : machine à états `move1 → wave1 → wave2 → wave3 → done` (`wave1` inclut la recrue du slime). Lue par `Sim` (`sim.tutorial`), qui suspend `waves.update` tant qu'il est actif.
- Marqueur vert et zone des globes au sol : `WorldView.drawTutorialMarker` (flèche verte autour de la squad comprise). Flèches et bulles de texte : `HudScene.drawTutorial` ; leur logique (délais, étapes) est dans `Tutorial.targets()`. Flèche de recommandation : `LevelUpScene` (`suggest`).
- Textes : `locales/en.json` / `fr.json` (`hintTutoMove`, `hintTutoDrag`, `tutoMove`, `tutoIncoming`, `tutoRecruit`, `tutoOrbs`, `tutoPowerup`, `tutoTakeUpgrade`, `replayTutorial`, `tutorialNextGame`).

## Activation

- Automatique à la **première partie solo** (`settings.tutorialDone` faux), jamais en ligne ni en royale / versus.
- À la fin, `settings.tutorialDone` passe à vrai (mémorisé dans le navigateur) ; chaque étape envoie `poki.measure('onboarding', étape, 'complete')`.
- **Rejouer** : bouton « Replay tutorial » du menu Options (plus de paramètre d'URL).

## Test

`npm run sim:tutorial` : un joueur automatique suit les cibles ; vérifie l'enchaînement des étapes, l'absence de level-up avant la vague 2, un seul level-up, l'offre imposée, la recrue qui saute sur place, le cadeau caché (et sa discrétion), la fin et le relai des vagues normales.
