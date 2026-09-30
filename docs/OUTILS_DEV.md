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

## Visionneuse divers (`?misc`, `src/scenes/MiscViewerScene.ts`)

Consultation : projectiles (balle, blaster bleu, éclair vert, grenade en cloche, flamme, traçante), recrues à ramasser, barres de
vie, anneaux de squad, zone de soin, joystick, main du tutoriel, sol, eau, textures d'effets. Chaque aperçu rejoue la logique
d'affichage du jeu ; curseur de ralenti.

## Test dans le panneau de prévisualisation de Claude

Le navigateur du panneau fige souvent la boucle de jeu (4–10 fps, rendu qui se bloque) : après une navigation, attendre une
trentaine de secondes avant d'interroger la page, et ne pas conclure à un bug si un effet met longtemps à apparaître. Pour
vérifier de la logique sans dépendre du rendu, appeler `scene.session.advance(33, () => {})` à la main.
