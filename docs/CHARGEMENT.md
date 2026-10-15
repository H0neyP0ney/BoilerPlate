# Règles de chargement et de fabrication des visuels

Tout ce qui s'affiche vient de deux sources : des **fichiers** (PNG / WebP / mp3, chargés par paquet) et des **textures dessinées par le code** (« procédurales », fabriquées par l'atelier de textures). Les deux se règlent dans la vue **Paquets** (`?packs`, dev / `?debug=1`). Les règles ci-dessous sont l'état voulu au 15/10 ; une revue des assets (quels replis garder, à quel moment charger / fabriquer chacun) est prévue et fera évoluer les tables.

## 1. Trois paquets de fichiers

| Paquet | Quand il arrive | Contenu |
|---|---|---|
| **1** (`CORE_ASSETS`) | avant le premier affichage (écran de chargement HTML) | le minimum : soldats, décor, interface du début, barre d'XP, écran de choix d'upgrade, slime, gling, kamikaze, pièces de la recrue, globe d'XP, 14 bruitages (`CORE_SFX`) |
| **2a** (`LATE_ASSETS`) | en tâche de fond, 300 ms après le lancement de la scène de jeu (au plus tard à l'indice des commandes, ou dès qu'un visuel absent est demandé) | ce qui sert dans les premières minutes : aliens précoces, Gling Mère, Rhino Alpha, œuf, timeline, barre du boss, power-ups, globes, bruitages |
| **2b** (`LATE_B_ASSETS`) | enchaîné dès que le 2a est arrivé | aliens tardifs et boss suivants (Scarab, rhinos jumeaux, Giant Crab…), critiques, drone de stase |

- **La table `PACK_OF` (`assets/packTable.ts`) est la seule source** : un paquet par fichier (ou `sfx:<id>`). Un asset absent de la table est au paquet 1. On la modifie avec les listes déroulantes de la vue Paquets (Save réécrit le fichier, effectif au rechargement).
- Tout est **chargé en mémoire et gardé** (pas de déchargement) : un fichier jamais utilisé dans la partie est quand même téléchargé.
- **Tout est chargé d'emblée** en ligne, avec `?jump` / `?endtest`, et en dev (`?split=1` force le découpage).

## 2. Replis : quand un fichier n'est pas encore arrivé

**Règle par défaut : rien ne s'affiche.** Une clé de texture absente est invisible (`hideMissingTexture` de l'engine remplace le carré vert « __MISSING » de Phaser par une texture transparente). Il n'y a **pas de repli** pour les images isolées (cadres, jauges, boutons, icônes d'interface, taches, obstacles, drone…).

Conséquences pour le code :
- un écran qui dépend d'images du paquet 2 se **construit à leur arrivée** (`latePack.onReady` pour le 2a, `onComplete` pour le 2b) ou **teste `textures.exists`** avant de les utiliser ; il ne doit jamais créer un objet sur une clé absente (l'objet resterait invisible à vie : il ne se met pas à jour quand le fichier arrive) ;
- un asset qui doit exister dès le départ va au **paquet 1** (il n'a alors jamais besoin de repli).

**Exceptions : les replis dessinés**, seulement pour les visuels **complexes, longs à charger ou vus dès les premières secondes** :
- les **aliens** des paquets 2a / 2b : dessin procédural calé sur la vraie texture (`art/alienFallbacks.ts`, fabriqué par l'atelier) ; remplacé par le vrai sprite à l'arrivée du paquet (`AlienView.refreshSprite`) ;
- les **soldats** / têtes de recrue, tourelles : dessinés par le code (atelier) ;
- les **cartes d'upgrade** : dérivées de `ui_card_base` / `ui_slot_empty` (`art/cardTextures.ts`) ; si ces images arrivent avec un lot, `latePack` refait les fonds de cartes sur place (`rebuildUpgradeCardTextures`) ;
- cas à part : globe d'XP (`fx_xp`), fusée (`fx_rocket`), œuf (`alien_boss_egg_proc`), sol (`drawGroundChunk`), icônes de power-up (emoji), chiffres de critique (texte), pièces de la recrue (`art/recruits.ts`).

Un nouvel asset du paquet 2 : choisir s'il mérite un repli (alien : oui, ajouter sa fiche à `SPECS` de `art/alienFallbacks.ts` et sa largeur à `PROCEDURAL_BODY_WIDTH`) ou s'il peut rester invisible (image d'interface : construire l'écran à l'arrivée). La vue Paquets marque d'une pastille rouge les fichiers qui ont un repli.

## 3. Textures procédurales : trois états

Les textures dessinées par le code sont **déclarées** au lancement (clé, taille, dessin : `TextureFactory` de l'engine, `canvasTexture` en mode déclaration) puis **fabriquées plus tard**, par tranches de 4 ms de calcul au plus toutes les 16 ms, dans l'ordre de `makePriority` (`art/textureWorkshop.ts`). La 3e colonne de la vue Paquets donne à chacune un état (`art/textureModes.ts`, Save réécrit le fichier) :

| État | Quand la texture est fabriquée | Liste |
|---|---|---|
| **Paquet 1** | pendant le chargement, avant l'affichage du jeu (rallonge le chargement) | `AT_LAUNCH` |
| **Paquet 2a** (défaut) | en tâche de fond pendant que le paquet 2a se télécharge, donc dès l'affichage du jeu (400 ms après) | — (absente des listes) |
| **Paquet 2b** | en tâche de fond pendant que le paquet 2b se télécharge, donc quand le 2a est arrivé | `AT_PACK_2B` |

- **Filet de sécurité** : une texture demandée avant son tour est fabriquée à l'instant (`textures.get / exists / getFrame` passent par l'atelier, `install`). Le joueur ne voit jamais de trou ; le coût est une saccade possible si la texture est lourde (carte prismatique ≈ 27 ms, petit effet 1 à 2 ms). Le journal `[textures]` (console, F4) signale toute fabrication « à la demande » de plus de 8 ms (`SLOW_ON_DEMAND_MS`) : la passer au paquet 1 ou lui donner une priorité plus haute.
- **Pas de texture procédurale pour un visuel dont le fichier est au paquet 1** (chargé avant l'affichage, son repli ne servirait à rien) ; les soldats des classes désactivées ne sont fabriqués qu'en dev.
- Verrouillées au paquet 1 (cadenas dans la vue) : la recrue assemblée à partir de ses pièces (`makeRecruitTextures`).
- À part (non préfabricables, listées pour mémoire) : variantes de couleur de chaque joueur (à la demande), textures dynamiques de l'interface.
- Mémoire : ≈ 11,6 à 12,5 Mo de canvas une fois tout fabriqué (cartes d'upgrade 5,7 Mo, globes et globes d'upgrade 3,8 Mo, effets 1,7 Mo).
- Aucune analytics pour ce mécanisme.

## 4. Où régler quoi

| Je veux… | Je fais… |
|---|---|
| déplacer un fichier d'un paquet à l'autre | vue Paquets, colonne de gauche / droite, liste déroulante, Save (`assets/packTable.ts`) |
| changer le moment de fabrication d'une texture procédurale | vue Paquets, colonne 3, liste déroulante, « Enregistrer les cases » (`art/textureModes.ts`) |
| changer l'ordre de fabrication | `makePriority` de `art/textureWorkshop.ts` |
| voir le vrai chargement en deux paquets | `?debug=1&split=1` (console de log : F4) |
| ne jamais charger le paquet 2 | `?nolate=1` (dev ; sur un build déployé : `?debug=1&split=1&nolate=1`) |
