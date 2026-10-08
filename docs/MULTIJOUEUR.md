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

## Netcode : fonctionnement actuel (protocole v38)

### Paramètres
| Quoi | Valeur | Où |
|---|---|---|
| Pas de simulation (hôte **et** client) | 30 Hz fixe | `TICK_RATE` (`Session.ts`) |
| Snapshots hôte → clients | 15 Hz (1 tick sur 2), canal `unreliable`, binaire | `SNAPSHOT_EVERY` (`Protocol.ts`) |
| Événements hôte → clients | groupés avec chaque snapshot (même `seq`), canal **`unreliable`** (donc non fiables). Sauf `shot` / `impact` / `hit` : en binaire **dans** le snapshot depuis v38 | `HostSession.broadcast` |
| Tampon d'interpolation (client) | **100 ms** : snapshots et événements joués à cadence régulière, 100 ms derrière le plus récent reçu (v38) ; 0 = appliqués dès réception | `INTERP_DELAY_MS` (`ClientSession.ts`) |
| Inputs client → hôte | **1 par tick** (30/s), JSON, canal `unreliable`, numérotés `n` | `ClientSession.sendInput` |
| Messages de contrôle (`hello`, `welcome`, `refused`, `upgrade`) | `reliable` | |
| Joueurs max (hôte inclus) | 4 | `MAX_PLAYERS` (`HostSession.ts`) |
| Squad d'un client sans input depuis | 1,5 s → arrêtée | `INPUT_TIMEOUT` |
| Taille d'un snapshot | ≈ 21 octets / alien, 23 / soldat, 12,5 / projectile, 7 / globe, 7 / flamme (v38) ; ≈ 6 Ko pour 145 aliens + 60 soldats + 200 globes | `encodeSnapshot(…, sizes)` |
| Positions | 1/4 de pixel sur 16 bits signés (−8192 → 8191 px) : soldats, aliens, recrues, projectiles, globes, effets de tir. Ancres des squads et télégraphes restent en f32 | `Writer.pos` / `POS_SCALE` (`Protocol.ts`) |
| Version du protocole | **40** (`PROTOCOL_VERSION` : hôte et client doivent être identiques, sinon `refused: version`). v40 : stalactites du Scarab (liste `stalactites` après les flammes : id, position, rayon, temps restant, durée) ; v39 : alien qui s'enterre avant le recyclage des traînards (bit 16 de l'octet de drapeaux d'un alien) ; v38 : positions en 16 bits, numéro d'envoi `seq` en tête du snapshot et dans les messages d'événements, effets de tir (`shots`, `impacts`, `hits`) en binaire à la fin du snapshot ; v37 : flammes des burners dans le snapshot (plus d'événements `fire` / `fireEnd`) ; v36 : **gel = état du soldat** (bit 32 de l'octet de drapeaux d'un soldat, suivi d'un octet de PV de gel ; plus d'alien glaçon) ; v35 : nuages de glace du chaman (flaque `frost` : octet de ralentissement à 255) ; v34 : le power-up bouclier n'existe plus (la liste des types de power-ups du snapshot perd `shield`) ; v24 : relances d'upgrade (message `reroll`, octet `rerolls` par squad) ; v33 : soldat **étourdi** (bit 16 de l'octet de drapeaux d'un soldat : slam du Scarab) ; v25 : bouclier (octet par soldat ; octet par alien **selon son type** `def.shield`, donc le décodeur teste la même chose) et textures de paliers de dégâts dans la liste des projectiles | |

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
- **Autres entités** (aliens, autres squads, recrues, projectiles) : `Mirror.step` à 30 Hz les fait avancer à la vitesse connue (**extrapolation**)
  et les rapproche du dernier snapshot appliqué (**lissage**, `CATCH_UP = 0.5` par tick) ; au-delà de `TELEPORT = 240` px d'écart, on téléporte.
- **Effets de tir** (v38) : l'hôte range `shot` (id du tireur + position), `impact` (position + texture) et `hit` (id) dans le snapshot au lieu
  du JSON ; `ClientSession.applySnapshot` les rejoue en `SimEvent` (classe et visée lues sur le soldat reflété). Un snapshot perdu = ses effets
  perdus, comme avant avec les événements non fiables.
- **Flammes des burners** (v37) : dans le snapshot (`fires`), l'affichage suit la liste (`WorldView.syncFires`). Avant, `fire` / `fireEnd` partaient
  en événements non fiables : chaque `fireEnd` perdu laissait chez le client une flamme affichée et animée pour toujours (lag croissant à partir
  des vagues de burners, ≈ 4 min).
- **Squad locale** : **prédite** (`AnchorPredictor`).
  1. Chaque tick client applique l'input tout de suite à une copie de l'ancre avec `stepAnchor` (`sim/Squad.ts`, **le même code que l'hôte** :
     vitesse, obstacles, bords) ; l'input est mémorisé avec son numéro `n` (historique de 120 ticks).
  2. Le snapshot porte par squad : ancre (`anchorX/Y`), vitesse de l'ancre (`speed`, upgrades et stimpack compris) et `ack` (dernier `n` reçu par l'hôte).
  3. **Réconciliation** : on repart de l'ancre de l'hôte, on rejoue les inputs non acquittés, l'écart résiduel est fondu (`BLEND = 0.4`) ;
     au-delà de `SNAP = 80` px (réapparition, téléportation) on recale d'un coup.
  4. Les soldats locaux visent *position hôte du dernier snapshot + déplacement prédit de l'ancre depuis* (sans extrapolation à la vitesse reçue).
  5. La prédiction est **gelée** pendant le choix d'upgrade (le monde est figé chez l'hôte) et quand la squad est morte.
  - Non prédits : tirs, laisse de l'ancre autour du cœur de la squad, collisions entre soldats, ralentissement des flaques (la formation suit l'ancre).

### Pièges (déjà rencontrés)
- **Encodeur / décodeur binaires : mêmes tests, sur la valeur *écrite*.** Un champ conditionnel (`if (def.rush) …`, `if (valeur > 0) w.f32…`) doit tester
  l'octet arrondi / borné, pas la valeur brute, sinon le décodeur lit des octets non écrits et **tout le snapshot se décale** : aliens figés puis
  téléportés. Cas réel (0.1.11) : `rushWind` du rhinocéros devient négatif après la charge, et `u8(-6)` s'écrivait 250. `Writer.u8` / `u16` bornent désormais.
  Tout nouveau champ de compteur doit être testé dans `sim:net` **après** la fin de sa capacité (valeur ≤ 0), pas seulement pendant.
- Tout champ ajouté à un objet recyclé par `Pool` doit être remis à zéro à la libération (règle 7 de `CLAUDE.md`).
- Toute nouvelle donnée visible chez un client : `Protocol.ts` + `Mirror` ; incrémenter `PROTOCOL_VERSION` si le format change.
- Un onglet hôte en arrière-plan est gelé par le navigateur : toute la partie s'arrête.

## Tests automatiques du netcode
- `npm run sim:net` : hôte + client en mémoire (jonction en cours de partie, cohérence, coop, XP partagée, rhino, zones de réanimation, fin / relance…).
- `npm run sim:predict -- 4` : prédiction avec latence simulée (4 ticks par sens ≈ 270 ms d'aller-retour) : réactivité, erreur de prédiction,
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
   (≈ 1,3 Ko/s par client en JSON aujourd'hui). *Fait en v38* : positions en i16, effets de tir en binaire (≈ −25 à −30 % de débit). *v45* : rhinos jumeaux et orbe de feu (nouveaux ids d'aliens : la liste `ALIEN_IDS` change). *v44* : coffres de boss (`chests` : id, position, progression d'ouverture) et globes d'upgrade (`upgradeOrbs` : id, propriétaire, upgrade, position, temps de chute), listes après les stalactites ; progression transmise en part de `chestTime` (celui de l'hôte peut différer du réglage local). *Fait en v43* : alien de 21 à 14 octets (id sur 24 bits, plus de vitesse, PV max en u16 sauf boss : drapeau 32 → f32) : −33 % sur les aliens, ≈ −26 % sur le snapshot (3,7 → 2,7 Ko avec ~150 aliens à 2 joueurs). Pistes suivantes : delta par rapport au dernier snapshot confirmé, interest management. Utile si on dépasse 4 joueurs ou si les vagues grossissent
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
