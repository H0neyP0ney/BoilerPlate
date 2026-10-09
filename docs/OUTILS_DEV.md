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
| **Panneau Difficulté** | TOUS les réglages globaux d'équilibrage (`DIFFICULTY` / `DIFFICULTY_DEFAULTS`, `config.ts`), par section : aliens, boss (PV, escalade, enragement), zombies, squad (stats de base), multijoueur, vagues (pause / reprise, rejeu pendant un boss), aides au joueur (power-ups, stimpack, revive, relances, prismatiques) ; Save / Reset (`src/dev/difficultyPanel.ts`, `src/debugDifficulty.ts`, bouton tête de mort du HUD) |

Les menus (Réglages, Foule, Triche) s'ouvrent toujours **à gauche**, sous les boutons du HUD, côte à côte dans l'ordre
d'ouverture (`src/dev/dock.ts`). Boutons du HUD (**en bas à gauche**), de gauche à droite : Réglages · Foule · Triche · Difficulté · Unités · Particules ·
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

**⏩ Aller plus loin dans la timeline** (section Progression) : 4 points de saut — **Après Gling Mère** (niveau 6), **Après Alpha Rhino**
(niveau 11), **Après Scarab** (niveau 20, calé sur une partie enregistrée) et **Avant Giant Crab** (30 s avant le boss final, niveau 30). Terrain
vidé, timeline des vagues reprise juste après l'apparition du boss (ou 30 s avant), boss précédents comptés pour l'escalade, un choix d'upgrade
par niveau comme en jeu (vraie offre de 3 cartes, toutes les upgrades, prismatiques et renforts compris ; carte retenue selon les préférences
mesurées dans tes parties enregistrées : `PICK_WEIGHTS`), squad pleine de Gunners seulement (taille max après upgrades + renforts ; classes
spéciales retirées en attendant les pièces). Réglages : `JUMPS` (niveau, durée de combat) et `PICK_WEIGHTS` en tête de `dev/jumpAhead.ts`. Aussi
par l'URL, **build déployé compris** : `?jump=gling`, `?jump=rhino`, `?jump=scarab`, `?jump=twins`, `?jump=crab` (saute le tutoriel ; « Rejouer » refait le
saut) ; code : `Sim.fastForward`, `Squad.fastForward`, `WaveRunner.skipTo`.

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
- Ordre du panneau : **Échelle** (réglage global du sprite), puis Ancrage (portée par défaut : « Cette séquence + direction »), Ombre (rayon en px, indépendant de la hitbox), **Décalage Y** (sprite + ombre, la hitbox ne bouge pas), Muzzle flash.
- **Hitbox et poignées** (vue détaillée seulement) : cercle rouge transparent de rayon `radius` au point au sol (case « Hitbox ») ; trois poignées à glisser sur l'unité : **rouge** (à droite du cercle : `radius`, le même que le curseur du panneau Stats), **grise** (bas de l'ombre : rayon de l'ombre), **bleue** (coin haut droit du sprite : échelle).
- **Muzzle flash** : case « Cette unité a un muzzle flash » (`muzzleFlash: true` dans le manifeste ; seul `soldier_trooper` en a un, le jeu n'affiche le flash que si la case est cochée). Cochée : point rouge (bouche du canon par frame), bouton **« Placer le canon au clic »** (le clic gauche pose le canon sur la frame affichée au lieu de déplacer le sprite), « Toutes les frames », « Effacer la frame », « Défaut unité ».
- **Ancrage** (croix jaune, glisser le sprite) : pour toute l'unité, une séquence, ou une séquence **dans une direction**
  (`anchors: { 'walk': [x, y], 'walk:left': [x, y] }`). Pour un sprite retourné, `originX/Y` se rapportent à la boîte de l'image
  en miroir : régler la direction gauche directement, ne pas la déduire de la droite.
- **Bouche du canon** (point rouge) **frame par frame** (`muzzles: { walk: [null, [x, y], …] }`), repli sur `muzzle` de l'unité ;
  pause, curseur de frame, touches ← →, aperçu du flash. *Le jeu n'utilise pas encore ces points* (voir « À faire »).
- Le jeu applique les ancrages via `sprites.place` (`SoldierView`, `AlienView`, cadavres).

## Visionneuse de particules (`?particles`, `src/fxParams.ts`, `src/debugFx.ts`)

**Tous** les effets visuels du jeu, 27 entrées, chacune rejouable et avec son bloc de réglages dans `FX_DEFAULTS` : **télégraphes** des attaques d'aliens (`telegraph` : une couleur par type — charge, saut, boules en cloche, kamikaze, pics du lurker, Scarab, stalactites, murs — et opacité à l'impact ; aperçu des 8 types en boucle ; code commun dans `view/telegraph.ts`), éclaboussure, explosion (flammes + onde + secousse), **fissures noires au sol** (avec une trace de brûlure noir / gris dessous), onde de choc, soin, texte flottant, impact de balle, éclatement de gelée, flaques, flash de tir, roquette + fumée, spirale et colonne de lumière, perte et **gain** d'un soldat, **globe d'upgrade** (taille, étoiles et paillettes multicolores, cercle au sol), **secousses d'écran** (slam, mort d'un soldat, mort d'un gros alien), poussière d'apparition, bulle de critique, flammes d'enragé, **croix de soin** dans les globes de soin, **glaçon** (éclats à chaque coup, fissures, taille qui rétrécit), globe de **stase** (flocon), **ondes de montée de niveau** (avec la déformation de l'écran), pluie prismatique des cartes, recrue (bonus +1). Sliders de
vitesse / taille / opacité / durée / quantité / couleur / secousse, aperçu en boucle ou au clic, Gunner de référence (case pour
le masquer). « Copier le code » → bloc à coller dans `FX_DEFAULTS` ; **Save** réécrit les valeurs de tous les effets dans `fxParams.ts`, **Reset** revient à la dernière sauvegarde.
**Règle** : tout nouvel effet (particules, tween, secousse, décor au sol) lit ses valeurs dans `FX` (`fxParams.ts`) et a une entrée dans la visionneuse (`EFFECTS`, `ParticleViewerScene.ts`) avec son aperçu ; pas de nombre codé en dur dans `Fx.ts` / `WorldView.ts`. Les effets partagés par le jeu et la visionneuse vivent dans `view/` (`Fx.ts`, `EnragedFx.ts`, `PrismFx.ts`, `ShockDistort.ts`).

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

- **Second panneau « Stats »** (vue détaillée d'un soldat ou d'un alien, à droite du premier) : un slider par nombre de la définition (`hp`, `speed`, `damage`, `attackCooldown`… et les capacités : `lob · range`, `weapon · cooldown`…) pour l'équilibrage (`src/debugStats.ts`). Appliqué en direct aux prochaines apparitions (les unités déjà en jeu gardent leurs valeurs), mémorisé dans le navigateur ; **Save** réécrit dans `data/aliens.ts` / `data/classes.ts` (commentaires conservés) **toutes les unités modifiées**, pas seulement celle affichée (la copie mémorisée est commune à toutes les unités et supprimée dès que le code change), **Reset** revient au code.
- **▶ Tester (4 Gunners contre 1)** (panneau Stats d'un alien) : lance le jeu en duel (`src/dev/alienTest.ts`) — aucune vague, 4 Gunners niveau 1 sans upgrade contre l'alien seul ; ni globes d'XP, ni recrues, ni power-ups, ni escalade. L'alien tué revient 1,5 s plus tard, la squad anéantie revient à 4 Gunners (pas de fin de partie). Panneau en haut : PV de l'alien, victoires / défaites, durée du dernier duel et soldats perdus ; **Recommencer**, **Quitter le test** (retour à la vue détaillée de l'alien). Les stats réglées dans le panneau s'appliquent au duel.

## Visionneuse d'upgrades (`?upgrades`, `src/scenes/UpgradeViewerScene.ts`, `src/debugUpgrades.ts`)

Toutes les cartes de choix d'upgrade d'un coup d'œil (zoom et colonnes ajustés à la fenêtre). Un clic sur une carte ouvre son panneau : **Bonus** (valeur affichée ; fixe aussi `mod.pct` = valeur / 100 ou `mod.flat`) et **Prises max** ; la carte suit en direct, Save écrit dans `data/progression.ts`, Reset revient au code.

## Visionneuse bonus (`?bonus`, `src/scenes/BonusViewerScene.ts`)

Consultation : **recrues** (une par classe, inactives à 25 %), **power-ups** (pastille `makePowerUpIcon` de `view/PickupViews.ts`, la même qu'en jeu), **globes d'XP** (3 tailles) et **zones au sol** (globes persistants de soin / stase et zone de réanimation, dessinés par `drawField` / `drawReviveZone`, les mêmes fonctions qu'en jeu). Pas de réglage ; l'UI (icônes d'upgrade…) n'est pas incluse.

## Visionneuse divers (`?misc`, `src/scenes/MiscViewerScene.ts`)

Consultation : projectiles (balle, blaster bleu, éclair vert, grenade en cloche, flamme, traçante), recrues à ramasser, barres de
vie, anneaux de squad, zone de soin, joystick, main du tutoriel, sol, eau, textures d'effets. Chaque aperçu rejoue la logique
d'affichage du jeu ; curseur de ralenti.

## Outils d'art (`tools/*.mjs`, Node + `pngjs`)

Chaque visuel d'interface part d'une image source de `games/xiao-swarm/art-src/` et est découpé / recoloré par un script ; le résultat va dans `public/assets/ui/` (ou `fx/`) et est déclaré dans `src/assets/manifest.ts`. Les scripts écrivent leurs mesures (zones sombres, repères) dans la console ; elles sont reprises dans le code (`TIMELINE_ART`, `XP_ART`, `BOSS_ART`, `CARD`…).

| Script | Source → sortie | Affiché par |
|---|---|---|
| `slice-timeline-ui.mjs` | `timeline_next_boss.png` → `ui/timeline/*` (cadre, jauge jaune 3-slice, flèche, crans, anneau) et `ui/xp/fill.png` (jauge jaune recolorée en bleu) | `view/TimelineHud.ts`, barre d'XP |
| `slice-xp-bar.mjs` | `experience bar.png` → `ui/xp/frame.png` (cadre vidé) | `HudScene.drawXp` |
| `slice-boss-bar.mjs` | `jauge_boss.png` (cadre à cornes vidé) + `ui/xp/fill.png` recoloré en rouge → `ui/boss/frame.png` + `fill.png` (à lancer après `slice-xp-bar`) | `HudScene.drawBoss` |
| `slice-powerup-icons.mjs` | `powerups.png` (grille 3 × 2) → `ui/powerups/<sorte>.png` + `fx/rocket.png` (la fusée, tournée vers la droite : projectile `fx_rocket`) | globes de power-up, texte flottant, tirs de roquette |
| `slice-freezebot.mjs` | `freezebot.png` → `fx/freezebot.png` (le medibot est la case « soin » de `powerups.png`) | `PickupViews.syncBots` |
| `slice-hud-buttons.mjs` | `bouton pause sound musique.png` → `ui/hud/` (bouton vide + 3 icônes) | `view/HudButtons.ts` |
| `slice-upgrade-cards.mjs` | `card_upgrade.png` → `ui/cards/card_<id>.png` (11 couleurs) + `card_prism.png` (holographique) | `LevelUpScene` |
| `hue-shift.mjs` | recolore une planche : `node tools/hue-shift.mjs entrée.png sortie.png <degrés> [saturation] [teinteMin teinteMax] [éclaircissement]` ; avec un intervalle de teintes seul le corps change (rhinos jumeaux : corps bleu → rouge / bleu pâle, corne beige intacte) | `public/assets/aliens/boss_rhino_fire.png`, `boss_rhino_ice.png` |
| `slice-upgrade-icons.mjs` | `icon_upgrade.png` → `ui/upgrades/<id>.png` | cartes, texte flottant, visionneuse |
| `slice-upgrade-slots.mjs` | `slot_upgrade.png` → `ui/slot_full.png`, `slot_empty_<id>.png` | slots des cartes |
| `slice-levelup-title.mjs`, `slice-reroll-button.mjs`, `slice-star-particle.mjs`, `slice-rewarded-icon.mjs` | titre, bouton Reroll, étoile (`fx/star.png`), icône rewarded | `LevelUpScene`, `Button` du moteur |
| `lighten-crit-digits.mjs [part]` | éclaircit le jaune des chiffres de critique (originaux sauvegardés dans `art-src/crit-original/`) | `Fx.crit` |

Un changement de la source = relancer le script (les scripts sont idempotents). Le cadre vide des barres est reconstitué en recopiant en miroir le côté déjà vide de la planche.

## Test dans le panneau de prévisualisation de Claude

Le navigateur du panneau fige souvent la boucle de jeu (4–10 fps, rendu qui se bloque) : après une navigation, attendre une
trentaine de secondes avant d'interroger la page, et ne pas conclure à un bug si un effet met longtemps à apparaître. L'onglet masqué déclenche la pause du jeu (événement `hidden`) : `window.__game.events.off('hidden', scene.pauseGame)` l'évite en test ; les animations (tweens) n'avancent pas quand le rendu est figé. Pour
vérifier de la logique sans dépendre du rendu, appeler `scene.session.advance(33, () => {})` à la main.

## Réglages mémorisés périmés

En dev, chaque vue de réglage mémorise ses valeurs dans le navigateur (localStorage) et les réapplique par-dessus le code. Pour éviter qu'une copie ne masque en silence des valeurs du code qui ont changé (nouveau boss absent des vagues mémorisées, par exemple), chaque copie est marquée avec une **empreinte des valeurs du code** (`dev/staleOverrides.ts`, `dropStaleOverride`, appelé en tête de chaque `load…Overrides`). Au démarrage, si l'empreinte a changé, la copie est supprimée et le HUD affiche « Réglages mémorisés périmés supprimés : … » pendant quelques secondes. Première fois (aucune empreinte connue) : la copie est gardée et marquée, sauf pour les vagues. **Toute nouvelle copie mémorisée doit appeler `dropStaleOverride`.**
