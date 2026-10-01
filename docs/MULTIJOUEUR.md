# Multijoueur (coop par défaut, 2–4 joueurs, P2P)

Un joueur **héberge** (il fait tourner la simulation), les autres **rejoignent** et n'affichent que ce que l'hôte leur envoie.
**Coop** (mode `coop`, `pvp: false`, pas de tir ami) : tout le monde affronte les mêmes vagues (boss compris). Difficulté dynamique : chaque squad vivante reçoit la vague (2 joueurs = 2× plus d'ennemis) et un boss unique a ses PV × le nombre de squads vivantes. Un joueur mort regarde un équipier ; quand tous sont morts (défaite) ou que le boss final est tombé (victoire), écran de fin puis l'hôte relance la partie (`Sim.restart`). XP et level up fonctionnent en ligne sans pause : le client envoie son choix d'upgrade à l'hôte (message `upgrade`). Le mode `versus` (PvP) reste disponible dans `MODES`.
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

## Netcode : fonctionnement actuel (protocole v20)

### Paramètres
| Quoi | Valeur | Où |
|---|---|---|
| Pas de simulation (hôte **et** client) | 30 Hz fixe | `TICK_RATE` (`Session.ts`) |
| Snapshots hôte → clients | 15 Hz (1 tick sur 2), canal `unreliable`, binaire | `SNAPSHOT_EVERY` (`Protocol.ts`) |
| Événements hôte → clients | groupés avec chaque snapshot, canal **`unreliable`** (donc non fiables) | `HostSession.broadcast` |
| Inputs client → hôte | **1 par tick** (30/s), JSON, canal `unreliable`, numérotés `n` | `ClientSession.sendInput` |
| Messages de contrôle (`hello`, `welcome`, `refused`, `upgrade`) | `reliable` | |
| Joueurs max (hôte inclus) | 4 | `MAX_PLAYERS` (`HostSession.ts`) |
| Squad d'un client sans input depuis | 1,5 s → arrêtée | `INPUT_TIMEOUT` |
| Taille d'un snapshot | ≈ 25 octets / alien, ≈ 1,8 Ko pour 57 aliens | |
| Version du protocole | **20** (`PROTOCOL_VERSION` : hôte et client doivent être identiques, sinon `refused: version`) | |

### Hôte autoritaire
L'hôte fait tourner `Sim` et applique les inputs reçus (le dernier input connu est maintenu d'un tick à l'autre). Tout ce qu'un client doit voir passe
par le **snapshot** (état, renvoyé 15×/s donc tolérant à la perte) ou par un `SimEvent` (cosmétique : un événement perdu ne doit jamais rendre l'état faux).

### Côté client : ce qui est affiché
- **Autres entités** (aliens, autres squads, recrues, projectiles) : `Mirror.step` à 30 Hz les fait avancer à la vitesse connue (**extrapolation**)
  et les rapproche du dernier snapshot (**lissage**, `CATCH_UP = 0.5` par tick) ; au-delà de `TELEPORT = 240` px d'écart, on téléporte.
  Pas de tampon d'interpolation : latence visuelle minimale, mais un virage brusque ou une perte de paquets se voit.
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
2. **Interpolation des entités distantes** : tampon d'environ 100 ms entre deux snapshots au lieu de l'extrapolation. Plus fiable avec de la perte et
   des virages (aliens, autres joueurs) ; coût : un petit retard visuel sur les ennemis. Plus gros gain visible pour une connexion moyenne.
3. **Événements fiables** : ils partent aujourd'hui en `unreliable` (un événement perdu = un effet manqué, jamais un état faux). Option : canal
   `reliable` pour les rares événements structurants (`gameEnd`, `restart`, `levelUp`), ou rediffusion des N derniers événements avec numéro de séquence.
4. **Test réseau plus dur** : ajouter perte et gigue à `LoopbackHub` (aujourd'hui latence fixe seulement) pour régler la prédiction de façon reproductible.
5. **Compensation de latence du ressenti** : un client voit les aliens ~150 ms en retard alors que l'hôte tranche les dégâts. À surveiller en playtest,
   surtout pour les télégraphes de charge (rhino) et de saut (crabe). Pas de remède simple (rewind côté hôte = complexe).
6. **Bande passante** : snapshots par delta (n'envoyer que ce qui change), filtrage par zone visible (« interest management »), inputs en binaire
   (≈ 1,3 Ko/s par client en JSON aujourd'hui), positions en i16 relatives plutôt que f32. Utile si on dépasse 4 joueurs ou si les vagues grossissent
   (limite de taille des messages d'un datachannel WebRTC : à vérifier avec ~600 aliens, soit ≈ 15 Ko).
7. **Horloge partagée** : ne pas dépendre du simple tick pour les télégraphes ; envoyer l'heure hôte et la dérive client pour caler les animations.
8. **L'hôte** : il garde l'avantage de latence, et s'il part la partie s'arrête (« Connexion perdue »). Migration d'hôte = lourd ; la vraie réponse est
   un **serveur Node autoritaire** (`sim/` est déjà pur : il suffit d'un `Transport` WebSocket), utile aussi au-delà de 4 joueurs.
9. **Pause en ligne** : pas de pause (hors choix d'upgrade). Hôte en arrière-plan = partie gelée (limite des navigateurs) : détecter et prévenir les joueurs.

## Poki / déploiement
- Netlib : l'id de jeu doit être un UUID ; **prévenir Poki avant la mise en ligne** (API en bêta) et autoriser leurs serveurs de signalisation / STUN / TURN dans la CSP.
