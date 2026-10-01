# Outils de dev — Xiao Swarm Attack

Tout ce qui est décrit ici n'existe **qu'en dev** (`npm run dev`) : rien n'est livré dans le build Poki (gardes
`import.meta.env.DEV`). Les réglages faits dans ces outils sont mémorisés dans le navigateur (`localStorage`, par site et par
navigateur) pour les tester tout de suite en jeu ; **seuls les fichiers de données du dépôt sont livrés** — chaque outil a un
bouton « Copier le code » qui donne quoi y coller.

## Vocabulaire

| Nom | Quoi |
|---|---|
| **Menu Réglages** | stats en direct, **Jeu** (zoom du jeu), **Visuel** (opacité des taches, échelle du sol). Touche `²` / F2 ou premier bouton du HUD (curseurs). Croix en haut à droite pour le fermer |
| **Panneau Foule** | sliders du mouvement de foule (`CROWD`, `config.ts`) + config de travail |
| **Panneau Triche** | tester vite une situation en jeu (hors ligne seulement) |
| **Visionneuses** | Unités, Particules, Obstacles, Divers — des scènes dédiées |
| **Panneau Équilibrage** | *annoncé, pas encore créé* : accueillera les réglages d'équilibrage du jeu (le « délai de soin » `CROWD.stillDelay` en a été retiré du panneau Foule pour y aller) |

Les menus (Réglages, Foule, Triche) s'ouvrent toujours **à gauche**, sous les boutons du HUD, côte à côte dans l'ordre
d'ouverture (`src/dev/dock.ts`). Boutons du HUD, de gauche à droite : Réglages · Foule · Triche · Unités · Particules ·
Obstacles · Divers. Dans une visionneuse, une **croix** en haut à droite de son panneau ramène au jeu (pas de navigation entre
vues : on repasse par le jeu).

## Save / Reset (toutes les vues de dev)
Chaque panneau ou visionneuse qui a des valeurs réglables a deux boutons : **Save** écrit les valeurs actuelles comme valeurs par défaut dans le code (plugin Vite `games/xiao-swarm/dev-save.ts` : réécrit seulement les nombres concernés de `config.ts`, `fxParams.ts`, `assets/manifest.ts`, `data/obstacles.ts` ou `data/waves.ts`, sans recharger la page) ; **Reset** revient à la dernière sauvegarde, c'est-à-dire aux valeurs par défaut du code. Le dev-save n'existe qu'avec `npm run dev` (pas dans le build Poki). Une unité sans planche dans le manifeste (visuel procédural) ne peut pas être enregistrée.

## Panneau Foule (`src/dev/crowdPanel.ts`, `src/debugCrowd.ts`)

- Un slider par paramètre de `CROWD` (vitesse, réactivité, laisse, espacement, séparation…), appliqué en direct.
- **Deux mémoires** : les *réglages courants* (réenregistrés à chaque changement, relus au démarrage avant la création de la
  simulation) et une *config de travail* (un seul emplacement, écrasé à chaque sauvegarde) : « Sauvegarder » / F8,
  « Charger » / F9. « Réinitialiser » remet les défauts de `config.ts` sans toucher à la config de travail.
- « Copier (JSON) » → à recoller dans `CROWD_DEFAULTS` (`config.ts`) pour rendre un réglage définitif.

## Panneau Triche (`src/dev/cheatPanel.ts`)

Squad (ajouter / retirer par classe avec quantité, +1 de chaque, garder 1 seul, reset à 4 Gunners, soigner, anéantir la
squad, invincibilité), aliens (faire apparaître un type × quantité, tout tuer), recrues (une, ou une de chaque), temps
(vitesse du jeu 0 → 3, +30 s / +2 min de vagues). Les retraits ignorent l'invulnérabilité des recrues fraîches. Pas de
raccourcis clavier (les anciens K / R / T / B ont été retirés).

## Visionneuse d'unités (`?viewer`, `src/scenes/UnitViewerScene.ts`, `src/debugSprites.ts`)

- Une ou toutes les unités (soldats, aliens, recrues), liste des animations du catalogue, orientation, zoom.
- **Ancrage** (croix jaune, glisser le sprite) : pour toute l'unité, une séquence, ou une séquence **dans une direction**
  (`anchors: { 'walk': [x, y], 'walk:left': [x, y] }`). Pour un sprite retourné, `originX/Y` se rapportent à la boîte de l'image
  en miroir : régler la direction gauche directement, ne pas la déduire de la droite.
- **Bouche du canon** (point rouge) **frame par frame** (`muzzles: { walk: [null, [x, y], …] }`), repli sur `muzzle` de l'unité ;
  pause, curseur de frame, touches ← →, aperçu du flash. *Le jeu n'utilise pas encore ces points* (voir « À faire »).
- Le jeu applique les ancrages via `sprites.place` (`SoldierView`, `AlienView`, cadavres).

## Visionneuse de particules (`?particles`, `src/fxParams.ts`, `src/debugFx.ts`)

Cinq effets, lus par `view/Fx.ts` : éclaboussure, explosion (flammes + onde), onde de choc, soin, texte flottant. Sliders de
vitesse / taille / opacité / durée / quantité / couleur / secousse, aperçu en boucle ou au clic, Gunner de référence (case pour
le masquer). « Copier le code » → bloc à coller dans `FX_DEFAULTS`.

## Visionneuse d'obstacles (`?obstacles`, `src/data/obstacles.ts`, `src/debugObstacles.ts`)

- **Hitbox** en cercles (autant que voulu) : glisser un cercle / sa poignée de rayon, flèches, champs x / y / r.
- **Taches** sous l'obstacle : un *jeu de variantes* par obstacle (image `tache_N`, position, largeur, échelle Y, miroir) ; le jeu
  en tire une au hasard par obstacle posé (seed de la carte). Poignée blanche = largeur, poignée jaune du bas = échelle Y.
- **Taille** : le champ « Taille (échelle) » redimensionne sprite, hitbox et taches ensemble. En jeu chaque obstacle posé varie
  de ±10 % (`OBSTACLE_SIZE_JITTER`, `data/maps.ts`, tiré avec la seed de la carte → identique chez tous les joueurs).
- En ligne, des hitbox différentes entre deux navigateurs donneraient deux cartes différentes : réglages de test local seulement.

## Gestionnaire de vagues (`?waves`, `src/scenes/WaveEditorScene.ts`, `src/data/waves.ts`, `src/debugWaves.ts`)
Écrit le script de vagues : **9 niveaux** de vague, chacun avec plusieurs **configurations** (compositions d'aliens) dont une est tirée au hasard (`sim.rng`) à chaque envoi du niveau, et une **timeline** (quel niveau à quel moment, éventuellement répété toutes les X s jusqu'à Y s ; un clic dans la timeline ajoute un envoi du niveau sélectionné). Mémorisé dans le navigateur et joué tel quel ; « Copier le code » → coller dans `DEFAULT_WAVE_SCRIPT` (`data/waves.ts`). Le panneau Triche a un bouton « Envoyer » pour lancer un niveau à la demande. Exécution : `sim/WaveRunner.ts`.

**Courbe de pression** (`src/data/waveModel.ts`) : estimation des PV d'aliens vivants au fil du run (chaque envoi ajoute les PV moyens de son niveau, la squad en retire un DPS qui croît avec le temps). Réglages : DPS de départ, croissance par minute, efficacité, poids des boss (un gros boss seul compte moins). Grossière (un seul tas de PV, ni portée ni déplacements) : sert à comparer des scripts.
**Courbe cible + Générer** : « Cible = courbe actuelle » copie la courbe en points (toutes les 20 s) ; glisser un point, clic droit (ou double-clic) dans la courbe pour en ajouter, clic droit sur un point pour le supprimer. « Générer » recompose **la timeline seulement** (`generateTimeline`) pour suivre la cible : boss et boucles d'après 10:00 gardés, chaque niveau n'arrive qu'à partir de sa première apparition dans le script, au moins un envoi toutes les 8 s. « Annuler la génération » restaure la timeline d'avant. Réglages et cible suivent Save / Reset.

## Visionneuse divers (`?misc`, `src/scenes/MiscViewerScene.ts`)

Consultation : projectiles (balle, blaster bleu, éclair vert, grenade en cloche, flamme, traçante), recrues à ramasser, barres de
vie, anneaux de squad, zone de soin, joystick, main du tutoriel, sol, eau, textures d'effets. Chaque aperçu rejoue la logique
d'affichage du jeu ; curseur de ralenti.

## Test dans le panneau de prévisualisation de Claude

Le navigateur du panneau fige souvent la boucle de jeu (4–10 fps, rendu qui se bloque) : après une navigation, attendre une
trentaine de secondes avant d'interroger la page, et ne pas conclure à un bug si un effet met longtemps à apparaître. Pour
vérifier de la logique sans dépendre du rendu, appeler `scene.session.advance(33, () => {})` à la main.
