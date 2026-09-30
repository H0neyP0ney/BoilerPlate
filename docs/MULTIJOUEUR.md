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
  Implémentations : `transport/NetlibTransport.ts` (Netlib de Poki), `net/LoopbackTransport.ts` (mémoire, tests).
- `HostSession` : simule (Sim autoritaire), applique les inputs des clients, diffuse un snapshot 15 Hz (`SNAPSHOT_EVERY`) + les événements.
- `ClientSession` + `Mirror` : le client écrit les snapshots dans un `Sim` jamais avancé ; le `WorldView` le lit comme une partie locale.
  Entre deux snapshots : extrapolation à la vitesse connue + lissage.
- `Protocol.ts` : messages JSON (`hello` / `welcome` / `input` / `events`) et snapshot binaire (~1,8 Ko pour 57 aliens).
  Version du protocole **2** : le projectile porte un indicateur de grenade en cloche (`lob`, l'arc est calculé côté affichage) ; les
  explosions de grenade voyagent comme événements `explosion`. Les cartes (obstacles, hitbox, tailles ±10 %) sont dérivées de la seed et de
  `data/` : pas de données de carte dans les snapshots.
- `online.ts` (hors `net/`) : lit l'URL, crée le transport, gère timeout et repli solo. `NETLIB_GAME_ID` y est un id de dev.

## Limites connues / suite
- **Pas de prédiction** : la squad locale d'un client réagit avec ≈ un aller-retour de délai (à ajouter : prédire l'ancre).
- L'hôte a l'avantage de latence ; si l'hôte part, la partie s'arrête pour tous (« Connexion perdue »).
- Pas de pause en ligne. Hôte en arrière-plan = partie gelée (limite des navigateurs).
- Netlib : l'id de jeu doit être un UUID ; **prévenir Poki avant la mise en ligne** (API en bêta) et autoriser leurs serveurs de signalisation / STUN / TURN dans la CSP.
- Au-delà de 4 joueurs : serveur Node autoritaire (`sim/` est déjà pur) — il suffira d'un `Transport` WebSocket.
