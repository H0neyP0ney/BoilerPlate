# Aliens : capacités

Source de vérité : `games/xiao-swarm/src/data/aliens.ts` (types `AlienDef`, commentaires de chaque capacité). Ce fichier liste **toutes** les capacités du jeu, y compris celles qui sont **désactivées ou sans utilisateur** pour l'instant, et qui y est branché. À mettre à jour à chaque ajout / retrait de capacité.

Légende : ✅ actif · 💤 désactivé / sans alien (le code existe, rien ne l'utilise) · 🔧 réglage de capacité.

## Capacités par alien (état actuel)

| Alien | Capacités actives |
|---|---|
| `gling` (cafard) | rapide, fragile, `revivable` |
| `slime` | de base, `revivable` |
| `shooter` | `lob` (boule rouge en cloche), `revivable` |
| `kamikaze` | `deathBlast` (explose 1 s après sa mort), `revivable` |
| `toad` | `tongue` (attrape et tire un soldat ; portée 297 px depuis le 14/10), `revivable` |
| `charger` | `rush` (charge télégraphiée), `cleave` (mêlée en zone), `revivable` ; télégraphe 0,3 s, 997,5 PV (14/10) |
| `spitter` | `spray` (5 boules de crachat (3 avant le 20/10), et à sa mort une fontaine de 7 à 10 boules : `spray.deathBlobs`) ; `cloud` 💤 (nuage ralentissant retiré le 08/10), `revivable` |
| `shaman` | `frost` (nuages de glace), `revive` (3 résurrections puis 30 s de repos), `deathSpawn` (5 araignées à sa mort, `hpMul` ×2), `revivable` (un chaman ressuscité peut ressusciter aussi) |
| `wall` (bâtisseur) | `wall` (murs de rochers), `revivable` ; 384,75 PV (14/10) |
| `lurker` | `lurk` (s'enterre, ligne de pics ; évite la hitbox d'un autre lurker enterré (70 px de marge, 20 px au bout de 0,8 s : `LURKER_SPACING`, `LURKER_PATIENCE`) ; télégraphe 0,45 s et pics à 1200 px/s depuis le 14/10 ; 1026 PV), `revivable` |
| `bubble` | `capture` (avale un soldat), `dash`, `floats`, `maxPerWave` 3 (1 avant le 12/10 ; 3 dans les vagues de bulles des niveaux 7 et 8), digestion 39 dégâts/s (14/10), `revivable` |
| `burner` | `trail` (flaques de feu), `revivable` |
| `iceballer` | `ice` (orbe de glace), `maxPerWave` 2, `revivable` |
| `ice_orb` / `fire_orb` | `projectile` (alien-projectile destructible), `fire_orb` : `trail` de flammes |
| `spider` | unité à part entière (propre définition, sprites, couleurs), **jamais dans une vague** : invoquée par la Gling Mère, le chaman à sa mort et les boules du Giant Crab (PV réglables par source : `swarm.hpMul`, `deathSpawn.hpMul`, `lob.spawnHpMul`) ; stats de base proches du gling, indépendantes ; `revivable` |
| `boss_egg` | œuf laissé par un boss tué (`egg`) : immobile, inoffensif, PV exacts (2500 actuellement), insensible aux ondes de choc ; détruit, il libère 2 globes d'upgrade roses par joueur |
| `boss_rhino` (2:00, **Ironhorn** / Corne-de-Fer) | `rush` (charge), `oneShot`, `spikeCross` (dès Hard, pas en Normal : toutes les 6 s, deux croix de 4 petites rangées de pics de 150 px, une sur la squad et une là où elle se dirige) |
| `boss_scarab` (4:30, **Sandstalker** / Rôdeur des Sables) | `burrow` (s'enterre, ressort sur la squad), `stalactites` (pluie), `oneShot` (bouclier retiré en normal le 14/10 ; bouclier de 5 % en impossible, comme tous les boss) ; **expert** : toutes les 3 s un mur de rochers sur la squad et un devant elle (`impossible.walls`) ; stalactites seulement en Hard et Expert |
| `boss_gling` (Gling Mère, **Brood Queen** / Reine de la Couvée) | `swarm` (15 araignées toutes les 4 s, `hpMul`), `oneShot` ; **Hard et Expert** : 5 toiles (rayon 56) toutes les 5,6 s (`expert.web`) : un soldat qui y marche saute vers la Mère (arrivée à 120 px, étourdi 1 s) ; **Expert** : en plus 10 araignées en cercle autour de la squad toutes les 6 s (`impossible.spiderRing`) |
| `boss_rhino_fire` / `boss_rhino_ice` (7:00, **Cinder** / Braise et **Frost** / Givre) | `rush` + `rush.trail` (feu / gel) + `rush.burst` (8 orbes), `oneShot` ; **le premier tombé est un alien comme les autres** (`boss.twin` : ni clear screen, ni œuf, ni escalade) ; **seul le dernier** fait le clear screen, laisse l'œuf et déclenche l'escalade (une fois) |
| `boss_crab` (10:00, final, **King Claw** / Roi Pince) | `leap` (saut écrasant), `spikeRing` (8 lignes de pics à la réception du saut ; télégraphe 0,45 s, front à 1200 px/s depuis le 14/10), `lob` (3 boules rouges + 5 araignées enragées par boule, `spawnHpMul` ×3), `oneShot` |

## Catalogue des capacités

### Déplacement / contact
- ✅ `egg` : œuf de boss, jamais recyclé, épargné par le clear screen.
- ✅ `oneShot` : la mêlée tue un soldat d'un coup (les boss).
- ✅ `cleave` : mêlée en zone, touche tous les soldats à moins de N px (chargeur).
- ✅ `dash` : accélération à l'approche de la cible (bulle).
- ✅ `floats` : ombre décollée (bulle, orbes).
- ✅ `maxPerWave` : plafond d'aliens de l'espèce par vague et par squad.
- ✅ `target` : `nearest`, `specialist`, `center` (le boss final vise le centre de la squad, il n'a pas de soldat ciblé).

### Charges et sauts
- ✅ `rush` : charge télégraphiée (zone rouge, puis fonce en ligne) ; **elle fracasse les rochers de mur** du Wall sur son chemin (`Horde.smashRocks`, débris projetés très loin par la vue : événement `rockBreak`). 🔧 `rush.trail` (traînée de feu ou de gel), `rush.burst` (orbes en étoile à la fin).
- ✅ `leap` : saut écrasant (tout soldat sous la zone meurt). 🔧 `height` : arc visuel du sprite.
- ✅ `burrow` : s'enterre, intouchable sous terre, ressort sur la squad (Scarab).

### Projectiles et zones
- ✅ `lob` : tir en cloche explosif. 🔧 `count`, `lead` (anticipation), `scatter` (spray), `keepMoving`, `spawn` (✅ araignées enragées à l'impact : crabe), `poison` (💤 voir plus bas).
- ✅ `spray` : crachat de plusieurs boules télégraphiées (cracheur) ; `spray.deathBlobs` / `deathBlobsMax` : fontaine de boules à sa mort (7 à 10).
- ✅ `ice` : orbe de glace destructible qui gèle un soldat (slime de glace).
- ✅ `projectile` : alien-projectile (`ice_orb`, `fire_orb`), 500 PV, la squad peut le détruire.
- ✅ `wall` : murs de rochers qui gênent la fuite.
- ✅ `stalactites` : pluie de zones télégraphées (Scarab).
- ✅ `frost` : nuages de glace autour de la squad, gèlent au contact (chaman) ; jamais hors de la carte (angles retentés, `Sim.addPuddle` recadre).
- 💤 `cloud` : nuage violet ralentissant posé sur la squad (cracheur, désactivé ; ligne de rétablissement en commentaire dans `aliens.ts`).
- ✅ `trail` : flaques de flammes au sol (brûleur, `fire_orb`).

### Lignes de pics
- ✅ `lurk` : enterré, vise puis lance une ligne de pics (lurker) ; la ligne s'arrête au bord de la carte (`Arena.rayLength`).
- ✅ `spikeRing` : 8 lignes de pics en étoile (crabe), le télégraphe tourne de 22,5° avant le lâcher (`turn`) ; chaque ligne s'arrête au bord de la carte.

### Contrôle des soldats
- ✅ Gel (`ice`, `frost`, `rush.trail` frost) : état `SoldierState.frozen`, brisé par les coups alliés.
- ✅ `capture` : la bulle avale un soldat (`dps`), la détruire le libère.
- ✅ `tongue` : tire un soldat vers l'alien.
- 💤 **Poison** : `lob.poison` (durée en s). Les PV du soldat touché descendent linéairement vers 1 pendant la durée (jamais mortel), remis à plein par une nouvelle application. Code : `Combat.throwBlob` / `Sim.updatePoison` / `SoldierState.poison`. Pas d'effet visuel (la barre de vie baisse seulement). Retiré du crabe, **aucun alien ne l'utilise**.
- 💤 **Étourdissement** : `slam.stun` (s). Un soldat étourdi ne bouge ni ne tire mais reste attaquable (`SoldierState.stun`). Le `slam` (onde de choc de zone avec recul) existe mais **aucun alien n'en a** (retiré du Scarab le 08/10, remplacé par la pluie de stalactites).

### Invocation et mort
- ✅ `swarm` : fait apparaître des aliens en continu (Gling Mère).
- ✅ `deathSpawn` : aliens qui surgissent à la mort (chaman).
- ✅ `deathBlast` : explosion différée après la mort (kamikaze).
- ✅ `revive` / `revivable` : le chaman ressuscite des aliens morts en zombies ; **depuis le 14/10 tous les aliens le sont sauf les boss, les projectiles et l'œuf** ; choix du cadavre : distance − PV de base × 3 + hasard stable ± 200 px.
- ✅ `lob.spawn` : araignées enragées (`AlienState.enraged` = 1) à l'impact (crabe). Ni XP ni recrue.

### Défense et statuts
- ✅ `shield` : barre bleue consommée avant les PV, régénérée après un délai (Scarab).
- ✅ `boss` : `mini` ou `final` (bandeau, barre de vie, clear screen à sa mort, escalade +10 %, coffre sauf le final). Enragement sans fin tous les 45 s.

## Capacités de la squad (hors aliens)
Aucun soldat n'a de bouclier (retiré). Le gel, le poison, l'étourdissement, la capture et la brûlure sont des **états du soldat** (`SoldierState`), appliqués par les capacités ci-dessus.

## Multiplicateurs actifs sur les stats (09/10)

Les stats de `data/aliens.ts` et `data/classes.ts` sont les valeurs réelles de base. Ce qui s'y ajoute encore :

- **Aliens** : escalade par boss tué, un gain par stat (PV `bossEscalationHp` +15 %, dégâts `bossEscalationDamage` +15 %, cadence `bossEscalationRate` +15 %, vitesse `bossEscalationSpeed` +7 % ; `a.escDmg` / `a.escRate` / `a.escSpeed`) ; enragement des boss (+30 % vitesse, +30 % cadence, −30 % cooldown par niveau toutes les 45 s : `bossEnrage*`) ; zombies du chaman (PV ×3, vitesse ×1,35, cadence ×3, dégâts ×1, 2 exemplaires : `shaman.revive.zombie`, réglables dans la vue du chaman) ; en ligne, boss PV ×(1 + 0,75 × joueurs en plus) et aliens en nombre (`extraPlayerAliens`) ; effectifs réels dans `data/waves.ts` (le ×1,5 d'`alienCountMul` y est intégré) et effectif par entrée de timeline (`mul`) ; vagues rejouées pendant un boss × `bossReplayMul…` du boss.
- **Dégâts subis par les aliens** : semi-enterrés ×0,5 (`BURIED.semiDmg`), bulle qui digère ×3,6 (`CAPTIVE_VULN`).
- **Soldats** : upgrades (stats `Stats`), stimpack (cadence ×1,5, vitesse ×1,25 : `STIM_FIRE`, `STIM_SPEED`), Esprit d'équipe / Dernier rempart, bonus caché de fin de tutoriel, champ de stase ×0,2 de vitesse, grab (langue) ×0,55 de vitesse (`GRAB_SLOW`).
