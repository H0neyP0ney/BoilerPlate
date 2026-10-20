# Onboarding scripté (tutoriel)

Première partie solo en mode `survival` : une partie normale dont la timeline de vagues est **remplacée au début** par quelques vagues de tutoriel. Quand le joueur a tout fait, le gestionnaire de vagues normal prend le relai à 0 s, sans écran de transition.

## Déroulé

Le HUD est allégé pendant tout l'onboarding : ni compte à rebours « Next boss », ni timeline, ni bouton pause, ni jauge d'XP (elle réapparaît à l'étape des globes), puis tout revient à la fin.

1. **Départ.** « WASD to move » (« Drag to move » sur mobile). Un **point vert** pulse sur le sol, en haut à droite de la squad (240 px), avec « Move here » au-dessus du chevron, et une petite flèche verte autour de la squad qui pointe vers lui ; hors écran, flèche au bord de l'écran.
2. **Vague 1.** Une courte pause (1,2 s) après l'arrivée sur le point, avec une **flèche rouge « Enemy incoming! »** vers l'endroit d'où ils viennent (à droite, **à la même hauteur (y) que la squad** depuis le 20/10, hors écran, 680 px). 8 glings + 1 slime, **sans XP**. Le slime lâche **toujours une recrue, sur lui** : elle fait sa cloche **sur place** (imprenable en l'air, 0,55 s). 1 s plus tard, une **flèche jaune** avec « Get +1 trooper ».
3. **Vague 2** (recrue ramassée, directement) : 12 glings à droite, **à la même hauteur que la squad**, plus loin (850 px) : 10 lâchent **1 XP** et 2 aucune, soit **exactement les 10 XP du niveau 1** (20/10) : le level-up n'arrive qu'avec le **dernier globe** ramassé, le joueur doit donc tous les prendre. **Ces globes ne disparaissent jamais** (`XpOrb.eternal`, `Xp.drop(…, eternal)` appelé par `Tutorial.drop` ; la durée de vie normale est de 45 s, plus de clignotement). Flèche rouge 1,5 s après leur apparition. Une fois la vague morte : **flèche et zone bleues** autour des globes restants (« Get experience », recalculées à chaque globe ramassé, retirées si la squad a déjà monté de niveau) et jauge d'XP visible. L'offre est imposée : **speed / damage / fireRate** (damage, la carte recommandée, au centre), sans relance ni prismatique ; une **flèche verte** « Claim upgrade » recommande *damage*, mais le joueur choisit ce qu'il veut.
4. **Vague 3** (après le choix) : 15 glings + 2 slimes **en cercle autour de la squad** (340 px), **sans XP** ; un slime lâche une recrue (sans indication), l'autre un **power-up de soin** (flèche « Take power-up »). Quand la vague est finie et le power-up ramassé : **fin** (la recrue n'est plus exigée depuis le 20/10 : elle reste au sol).

Pendant l'onboarding : pas de power-up au hasard, pas de vagues normales, et **la squad ne peut pas mourir** (ses PV ne descendent pas sous 1 ; le soin de la fin la remet d'aplomb).

**Power-ups scriptés (20/10)** : le globe de **soin** est celui de la vague 3 du tutoriel ; ensuite, les premiers power-ups de la vraie partie suivent `TUTORIAL_POWERUPS` (`data/tutorial.ts`, lu par `PowerUps.spawn`) : **stimpack, rafale de roquettes, aimant, orbes électriques, globe de stase (freezebot)**, au rythme habituel (premier à `DIFFICULTY.powerupFirst` = 20 s, puis un toutes les 10 à 15 s). Un power-up qui expire sans être ramassé revient (le script n'avance qu'au ramassage ; pas de doublon tant qu'il est au sol) ; après le dernier, tirage au hasard. La relance (dé) et le booster prismatique sont des loots d'alien à compteur, pas scriptés.

**Level up scriptés (20/10)** : les trois premiers level up d'une partie qui commence par le tutoriel sont scriptés (`TUTORIAL_LEVELUPS` de `data/tutorial.ts`, tirés dans `Squad.rollOffer` via `Tutorial.scriptedLevelUp`, jamais sur une relance ; la relance est désactivée tant qu'un level up scripté est ouvert et n'est pas consommée ; le booster prismatique n'est pas consommé non plus) : n°1 `speed / damage / fireRate` (Damage imposée, flèche verte « Claim upgrade »), n°2 `range / speed / hp` (portée à gauche, vitesse au centre, vie à droite, choix libre, sans flèche), n°3 `speed / recruit / range` avec **`recruit` prismatique au centre**, imposée, texte « Prismatic upgrade! / Double bonus! » sur deux lignes sous la flèche (clé `tutoPrism`). **Carte imposée = seule carte qu'on peut prendre** : les autres cartes ont l'air normales (aucun grisage, survol et inclinaison normaux) mais un clic, un toucher ou une touche 1 / 2 / 3 ne font rien (`LevelUpScene.onlyCard` / `allowed`, `LevelUpData.suggest` / `tip`) ; la simulation, elle, accepte n'importe quelle carte. À partir du n°4, tirage normal.

**Cadeau caché de fin** (`TUTORIAL_REWARD`) : **vide depuis le 20/10** (test d'équilibrage sans cadeau ; la mécanique reste, remettre des prises dans `data/tutorial.ts` la réactive : avant, dégâts ×1, cadence ×1, vitesse ×3, recrue ×3, portée ×2, PV max ×2). Pour toutes les parties (tutoriel compris), la base de la squad est de plus à **dégâts ×1,10 et cadence ×1,15** (`DIFFICULTY.squad*`).

## Où régler

- **`data/tutorial.ts`** (données pures) : rayon des points verts, distance du 1er point, pause avant la 1re vague, rayons d'apparition de chaque vague, composition de chaque vague, XP lâchée par alien (`xp`), recrue forcée (`recruit`), power-up forcé (`powerup`), offre de level-up (`offer`) et carte recommandée (`suggest`). Budget d'XP : le niveau 1 coûte `xpToNext(1)` = 10 XP ; vague 1 = 0 XP ; vague 2 = 12 XP (un seul level-up).
- **`sim/Tutorial.ts`** (pur) : machine à états `move1 → wave1 → wave2 → wave3 → done` (`wave1` inclut la recrue du slime). Lue par `Sim` (`sim.tutorial`), qui suspend `waves.update` tant qu'il est actif.
- Marqueur vert et zone des globes au sol : `WorldView.drawTutorialMarker` (flèche verte autour de la squad comprise). Flèches et bulles de texte : `HudScene.drawTutorial` ; leur logique (délais, étapes) est dans `Tutorial.targets()`. Flèche de recommandation : `LevelUpScene` (`suggest`).
- Textes : `locales/en.json` / `fr.json` (`hintTutoMove`, `hintTutoDrag`, `tutoMove`, `tutoIncoming`, `tutoRecruit`, `tutoOrbs`, `tutoPowerup`, `tutoTakeUpgrade`, `replayTutorial`, `tutorialNextGame`).

## Activation

- Automatique à la **première partie solo** (`settings.tutorialDone` faux), jamais en ligne ni en royale / versus.
- À la fin, `settings.tutorialDone` passe à vrai (mémorisé dans le navigateur) ; chaque étape envoie `poki.measure('onboarding', étape, 'complete')`.
- **Rejouer** : bouton « Replay tutorial » du menu Options, **seulement quand le jeu est lancé en debug** (`DEV_TOOLS` : `?debug=1` ou dev ; le joueur normal ne le voit pas, 13/10).

## Test

`npm run sim:tutorial` : un joueur automatique suit les cibles ; vérifie l'enchaînement des étapes, l'absence de level-up avant la vague 2, un seul level-up, l'offre imposée, la recrue qui saute sur place, le cadeau caché (et sa discrétion), la fin et le relai des vagues normales.

**Level up suivants (13/10, remplacé le 20/10)** : voir « Level up scriptés » ci-dessus (avant : deux level up sans prismatique, puis `Range` prismatique au troisième).
