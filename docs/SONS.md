# Bruitages (SFX)

Le jeu a **un fichier mp3 par bruitage** dans `games/xiao-swarm/public/assets/audio/sfx/<nom>.mp3` (mono, 64 kbit/s : quelques Ko chacun). Les **sons de remplacement** ont été synthétisés par `tools/gen-sfx.py` (ondes, bruit, enveloppes : pas des sons de studio) pour que le jeu ne soit pas muet ; ils sont faits pour être **écrasés un par un** par de vrais sons.

## Remplacer un son

1. Exporter le nouveau son en **mp3 mono** (44,1 kHz, 64 kbit/s suffisent), le plus **court** possible (les ramassages et les morts d'alien jouent très souvent).
2. L'enregistrer sous le **même nom** dans `public/assets/audio/sfx/` (ex. `levelup.mp3`).
3. Ouvrir `http://localhost:5173/?sounds` (ou le bouton haut-parleur vert des boutons de debug du jeu, ou le jeu déployé avec `?debug=1&sounds`) : un bouton par son, avec **quand il joue**. F5 après chaque remplacement.
4. Régler le son dans la page `?sounds` (appliqué tout de suite dans le jeu, mémorisé dans le navigateur ; **Save** l'écrit dans `src/data/sfxTuning.ts`, **Reset** revient à cette sauvegarde ; Save marche en dev seulement) : **volume de base** (curseur), **variation de hauteur** (`detune`, cents), **écart minimal** entre deux lectures (`minGapMs`), **voix** simultanées (`maxVoices`, 0 = illimité), et un compteur « ×joué (−ignoré) » depuis le début de la partie pour repérer les sons qui reviennent trop. Pour le reste (variation de hauteur `detune` en cents, délai minimal entre deux lectures `minGapMs`, nombre de voix simultanées `maxVoices`) : `SFX` de `games/xiao-swarm/src/settings.ts`. Les sons très fréquents (`xp`, `alien_die_s`, tirs) doivent avoir un `minGapMs` et un `maxVoices` bas pour ne pas saturer.
5. Les sources `.wav` des sons synthétisés sont dans `art-src/audio/sfx/` (non versionnées, régénérables) ; `python tools/gen-sfx.py <nom>` régénère un son synthétisé (attention : cela **écrase** ton remplacement).

## Variantes : tester plusieurs versions d'un même son

Chaque son de la page `?sounds` a une **liste déroulante** : `base` (le fichier `<nom>.mp3`) et toutes ses **variantes**. C'est **toi qui choisis** laquelle est active dans le jeu (rien n'est tiré au hasard) : tu peux changer pour comparer, et revenir au son validé avec Reset ou en rechoisissant `base`.

- Une variante = un fichier `<nom>--<variante>.mp3` dans le même dossier, par exemple `levelup--v2.mp3` ou `xp--note.mp3`. Dépose le fichier (même pendant que `npm run dev` tourne) puis rouvre la page : il apparaît dans la liste.
- Le choix est mémorisé dans le navigateur ; **Save** l'écrit dans `data/sfxTuning.ts` (`variant` : la variante active, `variants` : la liste connue, utile aussi sur le jeu déployé avec `?debug=1`).
- Exemple fourni : `xp` (bruitage de collecte sans note, la base) et `xp--note` (l'ancien « bip » à une note).
- **Bouton « ＋ » à droite de la liste** : choisis un fichier son de ton ordinateur (mp3, wav, ogg, m4a, flac…), donne-lui un nom : il est copié dans le dossier sous la forme `<nom>--<variante>.mp3` (converti en mp3 mono par ffmpeg s'il n'est pas déjà en mp3), devient la variante active et se joue tout de suite. Dev (`npm run dev`) seulement.
- Pour livrer le jeu, garde dans `public/assets/audio/sfx/` seulement les variantes que tu veux conserver (chaque fichier est dans le build).

## Ajouter un son

**Depuis la page `?sounds`** : le bouton « ＋ Nouveau son » (en haut) prend un fichier son, lui donne un nom (minuscules, chiffres, `_`) et l'ajoute au catalogue dans un groupe « Ajoutés (non branchés au jeu) » ; Save l'enregistre dans `data/sfxTuning.ts`. Il ne se jouera dans le jeu qu'une fois branché dans le code (étape 3 ci-dessous).

**À la main** :

1. Déposer `public/assets/audio/sfx/<nom>.mp3`.
2. Déclarer `<nom>: sfxDef('<nom>', volume, { detune, minGapMs, maxVoices })` dans `SFX` (`settings.ts`) : il est alors chargé avec le paquet 2 de visuels.
3. Le jouer depuis la vue : `playSfx(scene, '<nom>')` (`src/playSfx.ts`), jamais depuis `sim/`.
4. L'ajouter à `SFX_INFO` (`src/sfxInfo.ts`) pour qu'il apparaisse dans la page de test et ci-dessous.

## Sons et moments du jeu

### Armes (fournis)

| Son | Quand |
|---|---|
| `blaster` | Tir de chaque soldat (cadence limitée, hauteur variable) |
| `blast` | Explosions : grenades, kamikaze, boules des aliens, mort du Giant Crab |

### Interface

| Son | Quand |
|---|---|
| `ui_click` | Clic sur un bouton (menus, HUD, pause, options) |
| `ui_hover` | Survol d'une carte d'upgrade |
| `ui_open` | Ouverture de l'écran de choix d'upgrade |
| `ui_claim` | Upgrade choisie (la mienne) |
| `ui_claim_prism` | Upgrade prismatique choisie |
| `ui_reroll` | Relance des cartes d'upgrade |
| `levelup` | Montée de niveau (« LEVEL UP! ») |
| `defeat` | Écran de défaite (« Squad wiped out ») |
| `victory` | Fin du jeu (« Congratulations! ») |

### Ramassages

| Son | Quand |
|---|---|
| `xp` | Globe d'XP ramassé (très fréquent : très court) |
| `recruit` | Recrue qui rejoint la squad (le « +1 ») |
| `pu_stim` | Power-up Stimpack ramassé |
| `pu_magnet` | Power-up Aimant ramassé |
| `pu_heal` | Power-up Globe de soin ramassé |
| `pu_stasis` | Power-up Globe de stase ramassé |
| `pu_rockets` | Power-up Rafale de roquettes ramassé |
| `pu_reroll` | Dé de relance (loot rose) ramassé |
| `pu_prism` | Booster prismatique (loot doré) ramassé |
| `egg_break` | Œuf de boss détruit (les globes d'upgrade en sortent) |

### Combat

| Son | Quand |
|---|---|
| `alien_die_s` | Mort d'un petit alien (moins de 100 PV : gling, slime, kamikaze…) |
| `alien_die_m` | Mort d'un alien moyen (100 à 300 PV : cracheur, burner, bâtisseur) |
| `alien_die_l` | Mort d'un gros alien ou d'un boss (chargeur, lurker, bulle, boss) |
| `soldier_die` | Mort d'un soldat |
| `crit` | Coup critique (la bulle jaune) |
| `alien_shot` | Tir d'un alien (shooter, cracheur, crabe, slime de glace) |
| `tongue` | Coup de langue du crapaud |
| `fuse` | Mèche du kamikaze qui s'allume |
| `cleave` | Mêlée en zone (chargeur) et slam |
| `stalactite` | Stalactite du Scarab qui tombe |
| `freeze` | Un soldat est gelé dans un glaçon |
| `thaw` | Un glaçon se brise (soldat libéré) |
| `capture` | Une bulle avale un soldat |
| `release` | Un soldat est libéré d’une bulle |
| `rock_break` | Un rocher de mur est fracassé par une charge |
| `heal` | Un soldat est soigné (Medic / soin) |

### Boss

| Son | Quand |
|---|---|
| `boss_arrive` | Arrivée d'un boss (bannière « MINI-BOSS! » / « FINAL BOSS ») |
| `boss_down` | Boss tué (bannière « defeated! ») |
| `boss_enrage` | Boss enragé (un cran toutes les 45 s) |

## Pas encore de son

- **Musique** : une seule piste en boucle (`public/assets/audio/music.mp3`).
- **Armes des autres soldats** : sniper, flammer, bruiser, bomber, medic (le blaster du trooper sert à tous).
- **Capacités de boss** : saut du Giant Crab, couronne de pics, plongée / sortie du Scarab, essaim de la Gling Mère, charge des rhinos jumeaux.
- **Aliens** : sortie de terre des vagues, charge du chargeur, pics du lurker, incantation du chaman, flaques et flammes.
- **Interface** : fenêtre de pause, volume réglé dans Options.
