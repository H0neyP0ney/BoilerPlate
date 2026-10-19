# Multijoueur (coop par défaut, 2–4 joueurs, P2P)

Un joueur **héberge** (il fait tourner la simulation), les autres **rejoignent** et n'affichent que ce que l'hôte leur envoie.
**Survie à plusieurs** (mode `survival`, le même qu'en solo depuis le 08/10 ; `SimConfig.online` active ce qui est propre au jeu en ligne ; `pvp: false`, pas de tir ami) : tout le monde affronte les mêmes vagues (boss compris). Difficulté dynamique : chaque joueur vivant en plus ajoute 75 % d'ennemis (`DIFFICULTY.extraPlayerAliens` : 2 joueurs = ×1,75, 3 = ×2,5, 4 = ×3,25), répartis entre les squads vivantes, et un boss unique a ses PV multipliés par le même facteur (×1,75 à 2 joueurs ; ×le nombre de squads avant le 08/10). Un joueur mort regarde un équipier ; quand tous sont morts (défaite) ou que le boss final est tombé (victoire), écran de fin puis l'hôte relance la partie (`Sim.restart`). XP et level up fonctionnent en ligne sans pause : le client envoie son choix d'upgrade à l'hôte (message `upgrade`). Le mode `versus` (PvP) reste disponible dans `MODES`.
Les aliens s'en prennent à la squad la plus proche, quel que soit son joueur. On peut rejoindre en cours de partie ;
une squad anéantie **réapparaît toute seule** après 2,5 s (l'hôte s'en charge) : escouade de départ, endroit aléatoire
de la carte à distance des autres squads, brève invulnérabilité. Pas d'écran de fin en ligne.

## Tester
| URL | Effet |
|---|---|
| `?net=host` | crée une salle publique ; le code s'affiche dans le HUD |
| `?net=join&room=CODE` (ou `?room=CODE`) | rejoint cette salle |
| `?net=auto` | rejoint une salle publique, sinon en crée une |

- Ouvre **deux fenêtres côte à côte** (pas deux onglets d'une même fenêtre) : un onglet en arrière-plan est gelé par le
  navigateur, et si c'est l'hôte, toute la partie s'arrête.
- Sans navigateur : `npm run sim:net` (hôte + client reliés par un transport en mémoire : jonction en cours de partie,
  cohérence des états, PvP, mort + réapparition automatique, départ).
- Latence simulée : F12 → Réseau → Throttling.

## Architecture (dossier `games/xiao-swarm/src/net/`, pur — sans DOM)
- `Transport.ts` : **la seule interface réseau que le jeu connaît** (salles + envoi de messages, canaux `reliable` / `unreliable`).
  Changer de lib = écrire un `Transport` et le brancher dans `online.ts` (`makeTransport`).
  Implémentations : `transport/NetlibTransport.ts` (Netlib de Poki), `net/LoopbackTransport.ts` (mémoire, tests ; latence réglable `hub.latency`).
- `HostSession` : simule (Sim autoritaire), applique les inputs des clients, diffuse un snapshot 15 Hz (`SNAPSHOT_EVERY`) + les événements.
- `ClientSession` + `Mirror` : le client écrit les snapshots dans un `Sim` jamais avancé ; le `WorldView` le lit comme une partie locale.
- `Prediction.ts` (`AnchorPredictor`) : prédiction de la squad locale (voir plus bas).
- `Protocol.ts` : messages JSON (`hello` / `welcome` / `input` / `upgrade` / `events` / `refused`) et snapshot binaire. Les cartes (obstacles, hitbox,
  tailles ±10 %) sont dérivées de la seed et de `data/` : pas de données de carte dans les snapshots.
- `online.ts` (hors `net/`) : lit l'URL, crée le transport, gère timeout et repli solo. `NETLIB_GAME_ID` y est un id de dev.

## Netcode : fonctionnement actuel (protocole v77)

### Paramètres
| Quoi | Valeur | Où |
|---|---|---|
| Pas de simulation (hôte **et** client) | 30 Hz fixe | `TICK_RATE` (`Session.ts`) |
| Snapshots hôte → clients | 15 Hz (1 tick sur 2), canal `unreliable`, binaire | `SNAPSHOT_EVERY` (`Protocol.ts`) |
| Événements hôte → clients | groupés avec chaque snapshot (même `seq`), canal **`unreliable`** (donc non fiables). Sauf `shot` / `impact` / `hit` : en binaire **dans** le snapshot depuis v38 | `HostSession.broadcast` |
| Tampon d'interpolation (client) | **100 ms** : snapshots et événements joués à cadence régulière, 100 ms derrière le plus récent reçu (v38) ; 0 = appliqués dès réception. **Ne concerne PAS la squad locale** (lue sans délai depuis le 19/10, `Mirror.applyLocal`) | `INTERP_DELAY_MS` (`ClientSession.ts`) |
| Inputs client → hôte | **1 par tick** (30/s), JSON, canal `unreliable`, numérotés `n`, avec les **2 précédents** (`prev`, v76). L'hôte les met dans une **file** et en joue **UN par tick** dans l'ordre (v76) | `ClientSession.sendInput`, `HostSession.consumeInput` |
| Messages de contrôle (`hello`, `welcome`, `refused`, `upgrade`) | `reliable` | |
| Joueurs max (hôte inclus) | 4 | `MAX_PLAYERS` (`HostSession.ts`) |
| Squad d'un client sans input depuis | 1,5 s → arrêtée | `INPUT_TIMEOUT` |
| Taille d'un snapshot | ≈ 21 octets / alien, 23 / soldat, 12,5 / projectile, 7 / globe, 7 / flamme (v38) ; ≈ 6 Ko pour 145 aliens + 60 soldats + 200 globes | `encodeSnapshot(…, sizes)` |
| Positions | 1/4 de pixel sur 16 bits signés (−8192 → 8191 px) : soldats, aliens, recrues, projectiles, globes, effets de tir. Ancres des squads et télégraphes restent en f32 | `Writer.pos` / `POS_SCALE` (`Protocol.ts`) |
| Version du protocole | **77** (`PROTOCOL_VERSION` : hôte et client doivent être identiques, sinon `refused: version`). Historique complet dans le commentaire de `PROTOCOL_VERSION` (`Protocol.ts`). Derniers : v77 `choiceIn` (ticks avant la pause de choix d'upgrade, après `choiceT`) ; v76 file d'inputs côté hôte, `ack` = dernier input JOUÉ, champ `prev` du message `input` | |

### Hôte autoritaire
L'hôte fait tourner `Sim` et applique les inputs reçus (le dernier input connu est maintenu d'un tick à l'autre). Tout ce qu'un client doit voir passe
par le **snapshot** (état, renvoyé 15×/s donc tolérant à la perte) ou par un `SimEvent` (cosmétique : un événement perdu ne doit jamais rendre l'état faux).

### Côté client : ce qui est affiché
- **Globes d'XP** : objets persistants côté client (retrouvés par `id` stable du snapshot, protocole v21), lissés vers leur position hôte comme les recrues. Leur **clignotement de fin de vie** est décidé par l'hôte (`ORB_BLINK_TIME` = 5 s) et transmis dans le bit 7 de l'octet de valeur (protocole v22, aucun octet de plus), donc exact même pour un joueur arrivé en cours de partie. Avant, ils étaient recréés à chaque snapshot sans lissage et sautaient à 15 Hz quand un soldat les attirait.
- **Hôte muet** : sans snapshot depuis 1,5 s, `ClientSession.hostStalled` passe à vrai et le HUD affiche « The host is not responding… » (la connexion, elle, n'est pas coupée : `connection` reste `connected`). Le message disparaît au snapshot suivant.
- **Projectiles** : chacun porte un `id` stable dans le snapshot (modulo 65536, +2 octets ; `Projectile.id` est attribué à chaque acquisition du pool côté hôte). Le client les garde d'un snapshot à l'autre (retrouvés par `id`, créés à l'apparition, libérés à la disparition) et les lisse comme les autres entités : le but avance à la vitesse du projectile et il le rattrape (`CATCH_UP`). Avant, ils étaient recréés à chaque snapshot à la position exacte de l'hôte, d'où de petits sauts (une balle à 760 px/s × une gigue de 33 ms ≈ 25 px).
- **Compteurs et télégraphes** : entre deux snapshots, `Mirror.step` décompte localement, comme la sim hôte, `slamWind` / `rushWind` / `leapT` / `castT` / `lurkT` des aliens, `t` des murs, `ttl` des flaques, cailloux et globes persistants, `life` des power-ups (arrêt à 0 ; la disparition réelle vient du snapshot). Sans cela, leurs animations avançaient par paliers de 66 ms. La progression de la zone de réanimation reste recopiée telle quelle (elle monte ou descend selon la présence d'un équipier).
- **Tampon d'interpolation** (v38, `ClientSession.playback`) : les snapshots reçus sont rangés par `seq` et appliqués quand une horloge de lecture
  les atteint ; elle vise `INTERP_DELAY_MS` (100 ms = 3 frames hôte) derrière le dernier reçu et s'y recale doucement (±20 % de vitesse), ou
  d'un coup au-delà de 30 frames d'écart (onglet en arrière-plan, hôte figé). Les événements JSON portent le `seq` de leur snapshot et sont joués
  avec lui. Effet : un snapshot perdu, en retard ou arrivé en rafale ne fait plus sauter les aliens (mesure : réseau en rafales toutes les 166 ms,
  saut max d'un alien 27 px / image avec le tampon, comme sur un réseau parfait, contre 64 px sans). Coût : aliens et autres squads affichés
  100 ms plus tard ; la squad locale, prédite, n'est pas retardée.
  **Ma squad ne passe PAS par ce tampon** (19/10) : voir § « Squad locale d'un client invité » plus bas.
- **Autres entités** (aliens, autres squads, recrues, projectiles) : `Mirror.step` à 30 Hz les fait avancer à la vitesse connue (**extrapolation**)
  et les rapproche du dernier snapshot appliqué (**lissage**, `CATCH_UP = 0.5` par tick) ; au-delà de `TELEPORT = 240` px d'écart, on téléporte.
- **Effets de tir** (v38) : l'hôte range `shot` (id du tireur + position), `impact` (position + texture) et `hit` (id) dans le snapshot au lieu
  du JSON ; `ClientSession.applySnapshot` les rejoue en `SimEvent` (classe et visée lues sur le soldat reflété). Un snapshot perdu = ses effets
  perdus, comme avant avec les événements non fiables.
- **Flammes des burners** (v37) : dans le snapshot (`fires`), l'affichage suit la liste (`WorldView.syncFires`). Avant, `fire` / `fireEnd` partaient
  en événements non fiables : chaque `fireEnd` perdu laissait chez le client une flamme affichée et animée pour toujours (lag croissant à partir
  des vagues de burners, ≈ 4 min).
- **Squad locale d'un client invité** : **prédite et simulée chez le client** (chaîne complète ci-dessous).

### Squad locale d'un client invité : chaîne complète (état au 19/10, protocole v77)

Objectif : le joueur invité doit sentir ses commandes comme celles de l'hôte (aucun aller-retour), sans que la correction par l'hôte se voie.

1. **Tick client** (`ClientSession.advance` → `Mirror.step`, 30 Hz) : l'input courant est numéroté `n`, envoyé à l'hôte (avec les 2 précédents, `prev`), et appliqué tout de suite à l'**ancre prédite**
   (`AnchorPredictor.step` → `stepAnchor` de `sim/Squad.ts`, le même code que l'hôte). L'historique des inputs (`HISTORY` 120 ticks) sert au rejeu.
2. **Hôte** (`HostSession`) : les inputs reçus entrent dans une **file** par joueur (`RemotePlayer.queue`) : dédoublonnés par `n`, trous comblés (`prev`, sinon répétition du dernier input, `MAX_INPUT_GAP` 8),
   file plafonnée à `MAX_INPUT_QUEUE` 6. `consumeInput` en joue **un par tick d'hôte**, dans l'ordre ; file vide = on garde le dernier input ; file toujours ≥ 2 pendant `INPUT_QUEUE_WINDOW` 90 ticks = on la
   raccourcit d'un cran (la gigue a disparu). `ack` = numéro du dernier input **joué** (avant : « reçu »). Avant le 19/10 l'hôte appliquait « le dernier input reçu » : une rafale sautait des numéros et l'ancre
   divergeait de la prédiction (correction moyenne 3-4 px, max 20 px avec 2-3 ticks de gigue ; 0,04 px depuis). Coût : un joueur distant est joué avec 0 à 2 ticks de retard de plus chez l'hôte.
3. **Snapshot reçu** (`ClientSession.onMessage`) : si son `seq` est le plus récent vu, `Mirror.applyLocal(snap)` est appelé **tout de suite** (hors tampon de 100 ms) ; le chemin tamponné (`Mirror.apply`) saute
   ma squad (`directLocal`). Avant le 19/10 la réconciliation passait par le tampon : fenêtre de rejeu RTT + 100 ms + 66 ms, donc des corrections plus grandes.
4. **Réconciliation de l'ancre** (`AnchorPredictor.reconcile`) : on repart de l'ancre hôte (état après l'input `ack`), on rejoue les inputs `n > ack` (le chemin est gardé : `predictor.path`), l'écart avec
   l'ancre prédite est fondu (`BLEND` 0,4) ; au-delà de `SNAP` 80 px on recale d'un coup. Gelée quand la squad est morte ou pendant la pause.
5. **Soldats de ma squad** (`Mirror.reconcileSoldier` / `crowdStep` / `followPredicted`) : chaque soldat est **simulé localement avec la loi de `Squad.update`** (`desired = (ancre + slot − position) × gain`
   plafonné à `speed × CROWD.maxSpeedMul`, `damp(v, desired, CROWD.velDamp)`, contraintes de l'arène). À chaque snapshot : état hôte (position, vitesse à l'instant de l'`ack`), rejeu le long de
   `predictor.path`, écart avec l'état simulé fondu (`SOLDIER_BLEND` 0,4, recalage au-delà de `SOLDIER_SNAP` 80 px). Avant, chaque soldat visait « position hôte périmée + déplacement rigide de l'ancre » :
   départ d'un bloc, retour en arrière quand les positions hôte arrivaient, petit élan à l'arrêt.
   - **Slot** non transmis : `position + vitesse / gain` (`CROWD_GAIN` = gain moyen : le `gain` propre à chaque soldat n'est pas transmis) ; conservé pendant les accélérations et freinages (au repos,
     `SLOT_REST` 8 px/s, il est relu ; un écart > `SLOT_TOLERANCE` 30 px = réattribué).
   - **Vitesse plafonnée** (≥ `CAPPED_FRACTION` 92 % du plafond : soldat loin de son slot, de retour d'un isolement, poussé, recruté) : le slot ne peut plus se déduire de la vitesse, le modèle est **coupé**
     et le soldat suit la position hôte (`follow`, extrapolée à sa vitesse, donc en retard d'un aller simple). À l'entrée (ou ré-entrée) dans le modèle, l'affichage garde sa position et l'écart (`ox` / `oy`)
     se ferme à `ENTER_CLOSE_SPEED` 200 px/s. Tout rattrapage de position hôte d'un soldat est limité à `SOLDIER_MAX_STEP` 14 px par tick (course, pas saut). Retard d'arrivée d'un soldat isolé par rapport
     à l'hôte : 13-17 ticks avant, 3-5 ticks maintenant.
   - **États pilotés par l'hôte** (`Mirror.hostDriven` : gelé, étourdi, dans une bulle, en vol vers la Gling Mère, soufflé par un kamikaze) : pas de modèle, position hôte.
6. **Pause de choix d'upgrade** : l'hôte fige sa simulation `LEVEL_UP_DELAY` (1 s) après le level up et jette ensuite les inputs. Le snapshot porte `choiceT` (pause ouverte) et `choiceIn` (ticks avant
   l'ouverture) : `Mirror.limitOf` en déduit le **dernier input que l'hôte jouera** (`AnchorPredictor.limitN` ; pause ouverte = `ack`) et la prédiction (ancre et soldats, `localHold`) s'y arrête. Avant :
   recul de 36 à 66 px (2 à 4 ticks de latence) à l'ouverture ; maintenant 0 px. À la reprise de la partie, un petit saut en avant reste possible (non traité).
7. **Vue** (`view/UnitViews.ts`, `SoldierView.sync`) : le sens du sprite et l'animation de marche suivent une vitesse **lissée** (`VELOCITY_SMOOTH` 0,12 s), pas la vitesse brute : les petites poussées
   latérales (séparation, aliens) ne retournent plus les soldats gauche / droite en courant vers le haut ou le bas. Vaut aussi pour l'hôte et le solo.

**Non modélisé chez le client** (corrigé en fondu par le snapshot) : séparation entre soldats, repoussement des aliens et recul des coups (`kx` / `ky`), laisse de l'ancre autour du cœur de la squad
(`Squad.update` § 2 : l'ancre hôte peut être tirée en arrière, pas la prédite), ralentissement des flaques sur les soldats, tirs. **Autres joueurs et aliens** : extrapolation + lissage + tampon de 100 ms,
sans prédiction.

**Constantes** : `SNAP` 80, `BLEND` 0,4, `HISTORY` 120 (`Prediction.ts`) ; `SOLDIER_BLEND` 0,4, `SOLDIER_SNAP` 80, `SLOT_REST` 8, `SLOT_TOLERANCE` 30, `CAPPED_FRACTION` 0,92, `ENTER_CLOSE_SPEED` 200,
`SOLDIER_MAX_STEP` 14, `CATCH_UP` 0,5, `TELEPORT` 240 (`Mirror.ts`) ; `VELOCITY_SMOOTH` 0,12 (`view/UnitViews.ts`) ; `MAX_INPUT_QUEUE` 6, `INPUT_QUEUE_WINDOW` 90, `MAX_INPUT_GAP` 8 (`HostSession.ts`) ;
`INTERP_DELAY_MS` 100 (`ClientSession.ts`).

**Chronologie du ressenti d'un joueur invité (19/10) et ce que chaque retour a révélé** : (a) « je me bats avec la réconciliation, ça jitter avec de petits inputs » → le tampon de 100 ms s'appliquait aussi à
ma squad, puis l'hôte rejouait les inputs dans le désordre ; (b) « le départ et l'arrêt sont pourris » → soldats sans inertie (déplacement rigide de l'ancre) ; (c) « les soldats isolés reviennent en
saccades, puis trop lentement » → modèle de foule faux quand la vitesse est plafonnée, puis queue exponentielle de la résorption ; (d) « les sprites changent de direction en courant » → vue (vitesse brute) ;
(e) « petit jitter à la pause de level up » → la prédiction dépassait la pause annoncée.

**Pistes ouvertes** (non traitées) : prédire la laisse de l'ancre et la séparation / poussée des aliens (réduirait le fondu des soldats) ; transmettre le `gain` de chaque soldat ou ses slots ; saut en
avant à la reprise après la pause de choix ; prédire les soldats isolés qui reviennent (retard d'un aller simple aujourd'hui) ; tester avec de la **perte de paquets** et du réordonnancement (aucun script
ne les simule) ; revoir `INTERP_DELAY_MS` (100 ms) et le plafond de file d'inputs ; envisager un tampon adaptatif pour les aliens ; 15 Hz de snapshots contre 30 Hz de simulation.

### Pièges (déjà rencontrés)
- **Encodeur / décodeur binaires : mêmes tests, sur la valeur *écrite*.** Un champ conditionnel (`if (def.rush) …`, `if (valeur > 0) w.f32…`) doit tester
  l'octet arrondi / borné, pas la valeur brute, sinon le décodeur lit des octets non écrits et **tout le snapshot se décale** : aliens figés puis
  téléportés. Cas réel (0.1.11) : `rushWind` du rhinocéros devient négatif après la charge, et `u8(-6)` s'écrivait 250. `Writer.u8` / `u16` bornent désormais.
  Tout nouveau champ de compteur doit être testé dans `sim:net` **après** la fin de sa capacité (valeur ≤ 0), pas seulement pendant.
- Tout champ ajouté à un objet recyclé par `Pool` doit être remis à zéro à la libération (règle 7 de `CLAUDE.md`).
- Toute nouvelle donnée visible chez un client : `Protocol.ts` + `Mirror` ; incrémenter `PROTOCOL_VERSION` si le format change.
- Un onglet hôte en arrière-plan est gelé par le navigateur : toute la partie s'arrête.

## Protocole v52 → v57 (11-12/10)

- **v53** : liste `turrets` du snapshot (tourelles automatiques : `id`, propriétaire, position, PV, durée restante, visée) ; power-up `turrets` ajouté en fin de liste.
- **v54** : texture du tir électrique des tourelles (`fx_bolt_electric`, en tête de la liste `TEXTURES`).
- **v60** : tourelles supprimées (liste `turrets` du snapshot, sorte de power-up `turrets`, texture `fx_bolt_electric`, `Arena.blockers`).
- **v55** : power-up / loot `prism` (booster prismatique), ajouté en fin de liste des power-ups.
- **v56** : 8 paliers de couleur du tir (cyan et rose) : la liste des textures de `DAMAGE_TIERS` change.
- **v57** : prises prismatiques par upgrade dans le quartet haut de l'octet `picked` (≤ 10 prises : tient dans 4 bits) ; le quartet bas garde le nombre de prises.
- **v58** : 7 paliers de couleur du tir (cyan retiré, seuils tous les ×0,5) : la liste des textures de `DAMAGE_TIERS` change.
- Hors protocole (événements JSON) : `rockBreak` (rocher de mur fracassé par une charge : débris côté client), `explosion` de style `electric`.
- **XP et mobs à plusieurs** : seuil d'XP (`Sim.xpScale`) et charge de mobs suivent `1 + DIFFICULTY.extraPlayerAliens × (joueurs − 1)` ; les joueurs à terre comptent (la squad quittée, non).

## Tests automatiques du netcode
- `npm run sim:net` : hôte + client en mémoire (jonction en cours de partie, cohérence, coop, XP partagée, rhino, zones de réanimation, fin / relance…).
- `npm run sim:predict -- 4` : prédiction avec latence simulée (4 ticks par sens ≈ 270 ms d'aller-retour) : réactivité, erreur de prédiction,
- `npm run sim:jitter -- <latence> <soldats> aliens <gigue>` (ex. `2 30 aliens 2`) : corrections de réconciliation d'un invité avec **gigue réseau** (latence variable à chaque tick), grosse squad, aliens
  présents, petits inputs dans tous les sens. Sortie : « correction d'ancre par snapshot » (doit rester ≈ 0,04 px) et à-coup du centre affiché, invité contre hôte.
- `npm run sim:startstop -- <latence> [aliens] [gigue]` : profil de vitesse du centre de la squad au démarrage et à l'arrêt (invité contre hôte), changements de sens des soldats en course verticale
  (`KICK=1 NS=35` simule des poussées d'aliens), **recul à l'ouverture de la pause de choix** (`NOLIMIT=1` désactive la limite de prédiction pour comparer), retour d'un **soldat isolé** (pas max, remontées
  d'écart, retard d'arrivée par rapport à l'hôte). Aucun de ces scripts ne simule de **perte de paquets** ni de réordonnancement : seulement latence fixe et gigue.
  convergence à l'arrêt, téléportation, pause de choix d'upgrade, encodage de l'ack. Le loopback est **parfait** (pas de perte, pas de gigue) :
  il valide la logique, pas la sensation de jeu.
- En navigateur : deux **fenêtres** côte à côte + F12 → Réseau → Throttling (latence, hors ligne).

## Pistes d'amélioration (par ordre de rentabilité)
1. **Valider en conditions réelles** : throttling 100-200 ms + un peu de perte. Régler `BLEND` / `SNAP` si la squad « tire » en arrière à chaque snapshot ;
   ajouter un peu d'inertie aux soldats prédits si l'arrêt paraît trop sec.
2. ~~**Interpolation des entités distantes**~~ : *fait en v38* (tampon de 100 ms, voir § Optimisations v37-v38). *Fait en v43 pour les aliens* :
   vraie interpolation entre deux snapshots (`Mirror.apply(snap, next)` : vitesse = vers la position du snapshot suivant déjà dans le tampon,
   sinon depuis la précédente ; un saut > 2000 px/s = 0). Reste : soldats des autres squads, projectiles, objets au sol (vitesse reçue).
3. **Événements fiables** : ils partent aujourd'hui en `unreliable` (un événement perdu = un effet manqué, jamais un état faux). Option : canal
   `reliable` pour les rares événements structurants (`gameEnd`, `restart`, `levelUp`), ou rediffusion des N derniers événements avec numéro de séquence.
4. **Test réseau plus dur** : ajouter perte et gigue à `LoopbackHub` (aujourd'hui latence fixe seulement) pour régler la prédiction de façon reproductible.
5. **Compensation de latence du ressenti** : un client voit les aliens ~150 ms en retard alors que l'hôte tranche les dégâts. À surveiller en playtest,
   surtout pour les télégraphes de charge (rhino) et de saut (crabe). Pas de remède simple (rewind côté hôte = complexe).
6. **Bande passante** : snapshots par delta (n'envoyer que ce qui change), filtrage par zone visible (« interest management »), inputs en binaire
   (≈ 1,3 Ko/s par client en JSON aujourd'hui). *Fait en v38* : positions en i16, effets de tir en binaire (≈ −25 à −30 % de débit). *v46* : upgrades `teamSpirit` / `lastStand` / `bossHunter` (liste `picked` allongée de 3 octets), Dernier rempart actif = bit 2 de l'octet `healing` de la squad, power-up `reroll` (liste `POWERUP_KINDS`). *v45* : rhinos jumeaux et orbe de feu (nouveaux ids d'aliens : la liste `ALIEN_IDS` change). *v44* : coffres de boss (`chests` : id, position, progression d'ouverture) et globes d'upgrade (`upgradeOrbs` : id, propriétaire, upgrade, position, temps de chute), listes après les stalactites ; progression transmise en part de `chestTime` (celui de l'hôte peut différer du réglage local). *Fait en v43* : alien de 21 à 14 octets (id sur 24 bits, plus de vitesse, PV max en u16 sauf boss : drapeau 32 → f32) : −33 % sur les aliens, ≈ −26 % sur le snapshot (3,7 → 2,7 Ko avec ~150 aliens à 2 joueurs). Pistes suivantes : delta par rapport au dernier snapshot confirmé, interest management. Utile si on dépasse 4 joueurs ou si les vagues grossissent
   (limite de taille des messages d'un datachannel WebRTC : à vérifier avec ~600 aliens, soit ≈ 15 Ko).
7. **Horloge partagée** : ne pas dépendre du simple tick pour les télégraphes ; envoyer l'heure hôte et la dérive client pour caler les animations.
8. **L'hôte** : il garde l'avantage de latence, et s'il part la partie s'arrête (« Connexion perdue »). Migration d'hôte = lourd ; la vraie réponse est
   un **serveur Node autoritaire** (`sim/` est déjà pur : il suffit d'un `Transport` WebSocket), utile aussi au-delà de 4 joueurs.
9. **Pause en ligne** : pas de pause en ligne (hors choix d'upgrade). *Fait (02/10)* : un client est **prévenu quand l'hôte ne répond plus** (aucun snapshot depuis 1,5 s alors que la connexion tient : onglet de l'hôte en arrière-plan, gel, réseau coupé) → message « The host is not responding… Waiting for them to come back » (`Session.hostStalled`, `HOST_STALL_MS`, HUD). Reste : un message explicite de l'hôte avant de passer en arrière-plan (« hôte absent » plutôt que « silencieux »), et les événements Poki (`gameplayStop` pendant le gel) si on veut les respecter.

10. **Globes d'XP : moins de données** (idée du 02/10, à mesurer avant). Aujourd'hui chaque snapshot renvoie *tous* les globes (13 octets chacun : `id`, x, y, valeur ; plafond 350, soit jusqu'à ≈ 4,5 Ko). Piste : une **photo complète** toutes les ~2 s + entre deux, seulement les globes apparus et les `id` disparus depuis la photo (cumulatif : un snapshot perdu se rattrape au suivant, un nouveau joueur reçoit la photo). Côté client, globes immobiles ; à la disparition, ils volent vers le soldat le plus proche (purement visuel) ; expiration locale à 45 s (le clignotement final est déjà transmis, voir ci-dessus). Gain probable > 90 % sur ce poste ; à décider après avoir mesuré la part des globes dans un snapshot (`sim:net`) : surtout utile au-delà de 4 joueurs.
11. **Déterminisme** : la simulation est déterministe (pas fixe 30 Hz, `sim.rng` seedé, aucun `Math.random` / `Date.now` dans `sim/`, `data/`, `net/`), mais le multijoueur n'en dépend pas (hôte autoritaire + snapshots). Limites si on voulait un vrai modèle déterministe (lockstep, rejeu) : `Math.sin` / `Math.cos` peuvent différer d'un navigateur à l'autre (utiliser des tables ou des approximations maison), et les outils de dev (triche, stats éditées, vitesse du jeu) ne sont pas rejouables.

## Optimisations v37-v38 et retour en arrière

Contexte (08/10, 0.1.36) : en coop, des sauts du déplacement (squad et aliens) chez un joueur à partir de ≈ 3 min. Mesures sans navigateur
(partie coop hôte + client jusqu'au Scarab) : pas de fuite côté simulation, mais des envois de 5 à 10 Ko de snapshot plus 2 à 17 Ko
d'événements JSON (rafales de `fire` / `fireEnd` des burners, `shot` / `impact` / `hit` de chaque tir), 15 fois par seconde. Un message de 8 Ko
part en ≈ 7 paquets : un seul perdu et le snapshot entier est perdu.

| Version | Changement | Gain mesuré | Fichiers |
|---|---|---|---|
| v37 (0.1.37) | Flammes des burners dans le snapshot, plus d'événements `fire` / `fireEnd` | plus de flammes fantômes chez le client ; événements de 15-17 Ko → ≈ 5 Ko sous les vagues de burners | `Protocol.ts` (`fires`), `Mirror.apply`, `Sim.addFire` / `endFire`, `sim/types.ts`, `WorldView.syncFires` |
| v38 | Positions au 1/4 de pixel en i16 (`Writer.pos` / `Reader.pos`) | −4 octets par soldat, alien, recrue, projectile, globe | `Protocol.ts` |
| v38 | `shot` / `impact` / `hit` en binaire dans le snapshot | événements JSON ≈ 1,5 Ko → ≈ 0,7 Ko par envoi | `Protocol.ts` (`shots`, `impacts`, `hits`), `HostSession` (`fxShots`…), `ClientSession.applySnapshot`, `Mirror.soldier` |
| v38 | `seq` (compteur de frames de l'hôte) en tête du snapshot et dans `events` | ordonne le tampon (le `tick` de la sim se fige pendant l'écran de fin) | `Protocol.ts`, `HostSession.broadcast` |
| v38 | Tampon d'interpolation de 100 ms | sauts des aliens sur réseau en rafales : 64 → 27 px / image (= réseau parfait) | `ClientSession` (`INTERP_DELAY_MS`, `playback`) |

Au total, ≈ −25 à −30 % de débit à charge égale (≈ 94 Ko/s contre ≈ 120 Ko/s par client) et le tampon masque les pertes restantes.

**Revenir en arrière** (chaque point est indépendant ; incrémenter `PROTOCOL_VERSION` à chaque changement de format) :
- **Tampon d'interpolation** : `INTERP_DELAY_MS = 0` dans `ClientSession.ts` suffit (snapshots et événements appliqués dès réception, comme avant
  v38 ; pas de changement de format). Pour régler sans le retirer : 50 ms = moins de retard, 150 ms = plus robuste à la perte.
  Dans `scripts/net-headless.mjs`, `lag()` attend ce retard avant de comparer hôte et client.
- **Positions en 16 bits** : remplacer `w.pos(…)` / `r.pos()` par `w.f32(…)` / `r.f32()` dans `encodeSnapshot` / `decodeSnapshot` (mêmes champs
  des deux côtés !) ; remettre la tolérance du test du rhinocéros (`net-headless.mjs`, 0,13 px) à 0,01. Obligatoire si une carte dépasse 8191 px.
- **Effets de tir en binaire** : dans `HostSession` (drain des événements), renvoyer `shot` / `impact` / `hit` dans `outbound`, et supprimer les
  listes `shots` / `impacts` / `hits` (type `Snapshot`, `takeSnapshot`, fin de `encodeSnapshot` / `decodeSnapshot`, rejeu dans
  `ClientSession.applySnapshot`).
- **`seq`** : nécessaire au tampon ; sans tampon, on peut le retirer (premier `u32` du snapshot, champ `seq` du message `events`).
- **Flammes dans le snapshot** (v37) : à garder. Revenir aux événements ramènerait le bug des flammes fantômes.
- Pour tout annuler d'un coup : `git log -- games/xiao-swarm/src/net/` et revenir au commit d'avant (les changements v37 / v38 touchent `net/`,
  `sim/Sim.ts`, `sim/types.ts`, `view/WorldView.ts` et `scripts/net-headless.mjs`).

## Poki / déploiement
- Netlib : l'id de jeu doit être un UUID ; **prévenir Poki avant la mise en ligne** (API en bêta) et autoriser leurs serveurs de signalisation / STUN / TURN dans la CSP.

## Menu multijoueur et salle d'attente (16/10, protocole v61)
- **Entrée** : bouton **Multiplayer** de l'écran titre (`TitleScene`) → `scenes/MultiplayerScene.ts` : Partie rapide (`?net=auto` : rejoint une salle publique ou en crée une), créer une partie publique / privée, rejoindre par code (champ `<input>` DOM), liste des parties publiques (`listPublicRooms` → `Transport.listRooms`, Netlib `list()`). Une salle **privée** (`host({public:false})`) n'apparaît pas dans la liste : on la rejoint par son code ou son lien (`?room=CODE`, `poki.shareableURL`).
- **Salle d'attente** (`scenes/LobbyScene.ts`, overlay de `GameScene` tant que `session.lobby` n'est pas `started`) : `HostSession({ lobby: true })` fige la simulation (les snapshots partent quand même) ; l'hôte règle la difficulté, ajoute / retire des bots et appuie sur Start (`startGame()`) ; les clients voient l'effectif (`LobbyInfo`, message `lobby`) et « on attend l'hôte ». Une partie lancée sans salle d'attente (`?net=host` seul) garde l'ancien comportement.
- URL de dev : `?net=host&lobby=1&public=0`. Test : `npm run sim:lobby` (liste publique / privée, monde figé, bot, Start).
- **Fin de partie** : défaite ou victoire en ligne → après l'écran de fin (3 s), `HostSession.backToLobby` relance la run, fige le monde et rouvre la salle d'attente chez tous (même pour une partie lancée sans salle) ; l'hôte relance avec Start.
- **Menu pause en ligne** : bouton roue crantée des écrans titre ; en jeu, pause (ESC / P) = menu « Menu » sans pause du jeu (la squad n'a plus d'ordre), Resume / Options / Quit **avec confirmation** : l'hôte ramène **tout le monde** à la salle d'attente (run abandonnée), un joueur quitte la salle et revient au menu multijoueur. « Back » de la salle d'attente quitte la salle (menu multijoueur) ; si l'hôte part, les clients passent en « Connection lost ».
- **Salle d'attente** : tableau des joueurs (Host, Player n, Bot n, places libres avec « Add bot » / « Remove bot » à droite, hôte seulement), difficulté (niveaux verrouillés grisés avec un cadenas), grand bouton Play.
- **À faire** : `NETLIB_GAME_ID` définitif fourni par Poki, nombre de joueurs / difficulté dans la liste publique (nécessite `customData` de Netlib, non documenté).
