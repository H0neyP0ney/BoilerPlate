# Aliens : capacités

Source de vérité : `games/xiao-swarm/src/data/aliens.ts` (types `AlienDef`, commentaires de chaque capacité). Ce fichier liste **toutes** les capacités du jeu, y compris celles qui sont **désactivées ou sans utilisateur** pour l'instant, et qui y est branché. À mettre à jour à chaque ajout / retrait de capacité.

Légende : ✅ actif · 💤 désactivé / sans alien (le code existe, rien ne l'utilise) · 🔧 réglage de capacité.

## Capacités par alien (état actuel)

| Alien | Capacités actives |
|---|---|
| `gling` (cafard) | rapide, fragile, `revivable` |
| `slime` | de base, `revivable` |
| `shooter` | `lob` (boule rouge en cloche), `revivable` |
| `kamikaze` | `deathBlast` (explose 1 s après sa mort) |
| `toad` | `tongue` (attrape et tire un soldat) |
| `charger` | `rush` (charge télégraphiée), `cleave` (mêlée en zone) |
| `spitter` | `spray` (3 boules de crachat) ; `cloud` 💤 (nuage ralentissant retiré le 08/10) |
| `shaman` | `frost` (nuages de glace), `revive` (3 résurrections puis 30 s de repos), `deathSpawn` (5 araignées à sa mort) |
| `wall` (bâtisseur) | `wall` (murs de rochers) |
| `lurker` | `lurk` (s'enterre, ligne de pics ; évite la hitbox d'un autre lurker enterré (70 px de marge, 20 px au bout de 0,8 s : `LURKER_SPACING`, `LURKER_PATIENCE`)) |
| `bubble` | `capture` (avale un soldat), `dash`, `floats`, `maxPerWave` 1 |
| `burner` | `trail` (flaques de feu) |
| `iceballer` | `ice` (orbe de glace), `maxPerWave` 2, `revivable` |
| `ice_orb` / `fire_orb` | `projectile` (alien-projectile destructible), `fire_orb` : `trail` de flammes |
| `spider` | calquée sur le gling, `revivable` |
| `boss_egg` | œuf laissé par un boss tué (`egg`) : immobile, inoffensif, PV exacts (2500 actuellement), insensible aux ondes de choc ; détruit, il libère 2 globes d'upgrade roses par joueur |
| `boss_rhino` (2:00) | `rush` (charge), `oneShot` |
| `boss_scarab` (5:00) | `burrow` (s'enterre, ressort sur la squad), `stalactites` (pluie), `shield`, `oneShot` |
| `boss_gling` (Gling Mère) | `swarm` (22 araignées toutes les 4 s), `oneShot` |
| `boss_rhino_fire` / `boss_rhino_ice` (7:30) | `rush` + `rush.trail` (feu / gel) + `rush.burst` (8 orbes), `oneShot` |
| `boss_crab` (10:00, final) | `leap` (saut écrasant), `spikeRing` (8 lignes de pics à la réception du saut), `lob` (3 boules rouges + 5 araignées enragées par boule), `oneShot` |

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
- ✅ `rush` : charge télégraphiée (zone rouge, puis fonce en ligne). 🔧 `rush.trail` (traînée de feu ou de gel), `rush.burst` (orbes en étoile à la fin).
- ✅ `leap` : saut écrasant (tout soldat sous la zone meurt). 🔧 `height` : arc visuel du sprite.
- ✅ `burrow` : s'enterre, intouchable sous terre, ressort sur la squad (Scarab).

### Projectiles et zones
- ✅ `lob` : tir en cloche explosif. 🔧 `count`, `lead` (anticipation), `scatter` (spray), `keepMoving`, `spawn` (✅ araignées enragées à l'impact : crabe), `poison` (💤 voir plus bas).
- ✅ `spray` : crachat de plusieurs boules télégraphiées (cracheur).
- ✅ `ice` : orbe de glace destructible qui gèle un soldat (slime de glace).
- ✅ `projectile` : alien-projectile (`ice_orb`, `fire_orb`), 500 PV, la squad peut le détruire.
- ✅ `wall` : murs de rochers qui gênent la fuite.
- ✅ `stalactites` : pluie de zones télégraphées (Scarab).
- ✅ `frost` : nuages de glace autour de la squad, gèlent au contact (chaman).
- 💤 `cloud` : nuage violet ralentissant posé sur la squad (cracheur, désactivé ; ligne de rétablissement en commentaire dans `aliens.ts`).
- ✅ `trail` : flaques de flammes au sol (brûleur, `fire_orb`).

### Lignes de pics
- ✅ `lurk` : enterré, vise puis lance une ligne de pics (lurker).
- ✅ `spikeRing` : 8 lignes de pics en étoile (crabe), le télégraphe tourne de 22,5° avant le lâcher (`turn`).

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
- ✅ `revive` / `revivable` : le chaman ressuscite des slimes morts (zombies).
- ✅ `lob.spawn` : araignées enragées (`AlienState.enraged` = 1) à l'impact (crabe). Ni XP ni recrue.

### Défense et statuts
- ✅ `shield` : barre bleue consommée avant les PV, régénérée après un délai (Scarab).
- ✅ `boss` : `mini` ou `final` (bandeau, barre de vie, clear screen à sa mort, escalade +10 %, coffre sauf le final). Enragement sans fin tous les 45 s.

## Capacités de la squad (hors aliens)
Aucun soldat n'a de bouclier (retiré). Le gel, le poison, l'étourdissement, la capture et la brûlure sont des **états du soldat** (`SoldierState`), appliqués par les capacités ci-dessus.

## Multiplicateurs actifs sur les stats (09/10)

Les stats de `data/aliens.ts` et `data/classes.ts` sont les valeurs réelles de base. Ce qui s'y ajoute encore :

- **Aliens** : escalade par boss tué, un gain par stat (PV `bossEscalationHp` +15 %, dégâts `bossEscalationDamage` +15 %, cadence `bossEscalationRate` +15 %, vitesse `bossEscalationSpeed` +7 % ; `a.escDmg` / `a.escRate` / `a.escSpeed`) ; enragement des boss (+30 % vitesse, +30 % cadence, −30 % cooldown par niveau toutes les 45 s : `bossEnrage*`) ; zombies du chaman (PV ×3, vitesse ×1,35, cadence ×3, dégâts ×1, 2 exemplaires : `shaman.revive.zombie`, réglables dans la vue du chaman) ; en ligne, boss PV ×(1 + 0,75 × joueurs en plus) et aliens en nombre (`extraPlayerAliens`) ; effectifs réels dans `data/waves.ts` (le ×1,5 d'`alienCountMul` y est intégré) et effectif par entrée de timeline (`mul`) ; vagues rejouées pendant un boss × `bossReplayMul…` du boss.
- **Dégâts subis par les aliens** : semi-enterrés ×0,5 (`BURIED.semiDmg`), bulle qui digère ×3,6 (`CAPTIVE_VULN`), Chasseur de boss +30 % par prise.
- **Soldats** : upgrades (stats `Stats`), stimpack (cadence ×1,5, vitesse ×1,25 : `STIM_FIRE`, `STIM_SPEED`), Esprit d'équipe / Dernier rempart, bonus caché de fin de tutoriel, champ de stase ×0,2 de vitesse, grab (langue) ×0,55 de vitesse (`GRAB_SLOW`).
