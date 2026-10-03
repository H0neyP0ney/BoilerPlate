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
| **Visionneuses** | Unités, Particules, Obstacles, Divers, Bonus, Vagues, Carte — des scènes dédiées (boutons à contour vert) |
| **Panneau Équilibrage** | *annoncé, pas encore créé* : accueillera les réglages d'équilibrage du jeu (le « délai de soin » `CROWD.stillDelay` en a été retiré du panneau Foule pour y aller) |

Les menus (Réglages, Foule, Triche) s'ouvrent toujours **à gauche**, sous les boutons du HUD, côte à côte dans l'ordre
d'ouverture (`src/dev/dock.ts`). Boutons du HUD (**en bas à gauche**), de gauche à droite : Réglages · Foule · Triche · Unités · Particules ·
Obstacles · Divers · Bonus · Upgrades · Vagues · Carte (les visionneuses ont un contour vert, `VIEW_BORDER` dans `dev/hudButtons.ts`). Dans une visionneuse, une **croix** en haut à droite de son panneau ramène au jeu (pas de navigation entre
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

**Coéquipiers IA (coop)** : l'hôte d'une partie coop (`?net=host`) a, dans ce panneau, une section « Coéquipiers IA » (seule
partie disponible en ligne) : ajouter un bot (niveau Standard / Expert au choix), changer le niveau de chacun, le retirer,
« Tout en Standard / Expert ». Au lancement : `?net=host&bot=2&botlevel=expert` (dev seulement, 3 bots max ; salle publique,
rejoignable en `?net=auto`). En mode debug, chaque bot est signalé en jeu (`dev/botOverlay.ts`) : étiquette « BOT standard / expert »,
flèche de son déplacement, cercle vert → rouge selon la menace, cible de ramassage. Un humain qui rejoint une salle pleine
prend la place d'un bot.
Code : `sim/CoopBot.ts` (pur) évalue 16 directions + « rester » (danger aux instants `probes`, moins les gains : XP, recrue, power-up,
équipier à relever, cohésion) ; réglages des deux niveaux dans `data/bots.ts` ; branché dans `net/HostSession.ts`
(`addBot` / `removeBot`). Standard : réagit avec retard, voit court, n'esquive pas les tirs ni les attaques annoncées, upgrades au
hasard. Expert : décide à chaque tick, voit loin, anticipe les aliens et leurs charges / sauts / grenades, ramasse les
power-ups, se laisse soigner, prend ses upgrades par priorités. `npm run sim:bot -- 300 2 7` (secondes, bots, seed) les compare
sans navigateur (expert doit durer plus longtemps que standard, déterminisme).

## Visionneuse d'unités (`?viewer`, `src/scenes/UnitViewerScene.ts`, `src/debugSprites.ts`)

- **S'ouvre toujours sur la vue d'ensemble** (toutes les unités, à 80 %, 6 par ligne, boss sur une ligne à part, barre de défilement + molette) : pas de panneau, un clic sur une unité ouvre sa vue détaillée, la croix en haut à droite quitte vers le jeu. Chaque unité porte son nom anglais et son id ; les unités **inactives** (hors `ACTIVE_CLASSES` / `ACTIVE_ALIENS`) sont à 25 % d'opacité.
- Vue d'une unité (panneau) : Save / Reset / Copier tout en haut, puis Zoom, Unité, Animation (seulement celles de la planche ; pas d'idle pour un alien qui a un walk), Orientation (boutons ← →). La croix du panneau ramène à la vue d'ensemble. Ombre à alpha 1.
- Ordre du panneau : **Échelle** (réglage global du sprite), puis Ancrage (portée par défaut : « Cette séquence + direction »), Ombre, Muzzle flash.
- **Muzzle flash** : case « Cette unité a un muzzle flash » (`muzzleFlash: true` dans le manifeste ; seul `soldier_trooper` en a un, le jeu n'affiche le flash que si la case est cochée). Cochée : point rouge (bouche du canon par frame), bouton **« Placer le canon au clic »** (le clic gauche pose le canon sur la frame affichée au lieu de déplacer le sprite), « Toutes les frames », « Effacer la frame », « Défaut unité ».
- **Ancrage** (croix jaune, glisser le sprite) : pour toute l'unité, une séquence, ou une séquence **dans une direction**
  (`anchors: { 'walk': [x, y], 'walk:left': [x, y] }`). Pour un sprite retourné, `originX/Y` se rapportent à la boîte de l'image
  en miroir : régler la direction gauche directement, ne pas la déduire de la droite.
- **Bouche du canon** (point rouge) **frame par frame** (`muzzles: { walk: [null, [x, y], …] }`), repli sur `muzzle` de l'unité ;
  pause, curseur de frame, touches ← →, aperçu du flash. *Le jeu n'utilise pas encore ces points* (voir « À faire »).
- Le jeu applique les ancrages via `sprites.place` (`SoldierView`, `AlienView`, cadavres).

## Visionneuse de particules (`?particles`, `src/fxParams.ts`, `src/debugFx.ts`)

Tous les effets de `view/Fx.ts` : éclaboussure, explosion (flammes + onde), onde de choc, soin, texte flottant, impact de balle, éclatement de gelée, flaques, flash de tir, roquette + fumée, recrue (bonus +1) ; plus en lecture seule la spirale de montée de niveau, la colonne de lumière et la perte d'un soldat (paramètres fixes dans `Fx.ts`). Sliders de
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
**Calibrer la courbe sur tes parties** : en `npm run dev`, chaque partie (solo, ou hôte en ligne) est enregistrée seconde par seconde par `sim/RunRecorder.ts` (PV d'aliens réellement retirés sans overkill, PV de soldats perdus, PV apparus, DPS théorique de la squad, taille d'un snapshot réseau) à partir des compteurs `Sim.metrics`. À la fin de la partie (≥ 10 s), le JSON est écrit dans `docs/bench/runs/` par le plugin dev-save (cible `bench-run`). `npm run sim:calibrate` lit ces fichiers et affiche : DPS réel et efficacité, la ligne `model: {…}` à coller dans `data/waves.ts` (rien n'est modifié tout seul), l'écart entre le modèle actuel et les PV d'aliens vivants observés, la pression subie par niveau (PV perdus et soldats morts par minute), l'évolution par tranche de 30 s (soldats, DPS par soldat, PV apparus contre infligés : repère la « spirale de mort »), les boss apparus (id, mini / final, instant) et le débit réseau (moyenne, p95, max, coût d'un alien, **ventilation par catégorie** : `encodeSnapshot(snap, sizes)`). Le DPS n'est calibré que sur les secondes « saturées » (assez d'aliens vivants pour tirer en continu). Jouer au moins 5 à 10 parties, avec des niveaux différents ; jouer dans un navigateur fluide (le panneau de test est trop lent et fausserait le DPS).
**Courbe cible + Générer** : « Cible = courbe actuelle » copie la courbe en points (toutes les 20 s) ; glisser un point, clic droit (ou double-clic) dans la courbe pour en ajouter, clic droit sur un point pour le supprimer. « Générer » recompose **la timeline seulement** (`generateTimeline`) pour suivre la cible : boss et boucles d'après 10:00 gardés, chaque niveau n'arrive qu'à partir de sa première apparition dans le script, au moins un envoi toutes les 8 s. « Annuler la génération » restaure la timeline d'avant. Réglages et cible suivent Save / Reset.

## Éditeur de carte (`?mapedit`, `src/scenes/MapEditorScene.ts`, `src/data/mapZones.ts`, `src/debugMapZones.ts`)

Place les **zones d'obstacle** de l'arène solo / coop (2880 × 2880 px, `JUNGLE_SIZE` dans `data/maps.ts`). À chaque début de partie, `makeJungleMap(seed)` tire **un obstacle au hasard** (parmi `data/obstacles.ts`) à une **position au hasard** dans chaque zone ; tout vient de la seed de la partie (celle du `welcome` en ligne), donc tous les joueurs ont la même carte. Le nombre de tirages par zone est fixe : modifier une zone ne change pas le tirage des autres.

- Zone = rectangle (centre `x` / `y`, `w` × `h`) + `chance` (0 → 1, 1 par défaut : probabilité que la zone donne un obstacle).
- Clic = sélectionner, glisser = déplacer, glisser un coin = redimensionner, clic droit glissé = déplacer la vue, molette = zoom, Suppr = supprimer, flèches = 5 px (Maj : 25). « + Ajouter une zone » puis clic sur la carte ; Dupliquer ; champs X / Y / Largeur / Hauteur / Chance.
- **Aperçu** : les obstacles affichés sont un vrai tirage (même code que la partie) avec une seed d'aperçu ; « Nouveau tirage » la change ; case pour les hitbox. Le point de départ de la squad (centre) est marqué en bleu : ne pas y mettre de zone.
- **Save** écrit `DEFAULT_MAP_ZONES` dans `data/mapZones.ts` ; **Reset** revient à cette sauvegarde ; le travail en cours est aussi mémorisé dans le navigateur (`xiao-debug-mapzones`).
- Hors édition : la carte royale (`makeRoyaleMap`, 4800 px) n'utilise pas les zones.

- **Second panneau « Stats »** (vue détaillée d'un soldat ou d'un alien, à droite du premier) : un slider par nombre de la définition (`hp`, `speed`, `damage`, `attackCooldown`… et les capacités : `lob · range`, `weapon · cooldown`…) pour l'équilibrage (`src/debugStats.ts`). Appliqué en direct aux prochaines apparitions (les unités déjà en jeu gardent leurs valeurs), mémorisé dans le navigateur ; **Save** réécrit les nombres dans `data/aliens.ts` / `data/classes.ts` (commentaires conservés), **Reset** revient au code.

## Visionneuse d'upgrades (`?upgrades`, `src/scenes/UpgradeViewerScene.ts`, `src/debugUpgrades.ts`)

Toutes les cartes de choix d'upgrade d'un coup d'œil (zoom et colonnes ajustés à la fenêtre). Un clic sur une carte ouvre son panneau : **Bonus** (valeur affichée ; fixe aussi `mod.pct` = valeur / 100 ou `mod.flat`) et **Prises max** ; la carte suit en direct, Save écrit dans `data/progression.ts`, Reset revient au code.

## Visionneuse bonus (`?bonus`, `src/scenes/BonusViewerScene.ts`)

Consultation : **recrues** (une par classe, inactives à 25 %), **power-ups** (pastille `makePowerUpIcon` de `view/PickupViews.ts`, la même qu'en jeu), **globes d'XP** (3 tailles) et **zones au sol** (globes persistants de soin / stase et zone de réanimation, dessinés par `drawField` / `drawReviveZone`, les mêmes fonctions qu'en jeu). Pas de réglage ; l'UI (icônes d'upgrade…) n'est pas incluse.

## Visionneuse divers (`?misc`, `src/scenes/MiscViewerScene.ts`)

Consultation : projectiles (balle, blaster bleu, éclair vert, grenade en cloche, flamme, traçante), recrues à ramasser, barres de
vie, anneaux de squad, zone de soin, joystick, main du tutoriel, sol, eau, textures d'effets. Chaque aperçu rejoue la logique
d'affichage du jeu ; curseur de ralenti.

## Test dans le panneau de prévisualisation de Claude

Le navigateur du panneau fige souvent la boucle de jeu (4–10 fps, rendu qui se bloque) : après une navigation, attendre une
trentaine de secondes avant d'interroger la page, et ne pas conclure à un bug si un effet met longtemps à apparaître. Pour
vérifier de la logique sans dépendre du rendu, appeler `scene.session.advance(33, () => {})` à la main.
