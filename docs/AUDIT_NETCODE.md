# Audit du netcode (19/10, protocole v77, après la 0.1.153)

Audit complet de `games/xiao-swarm/src/net/` (+ `sim/Squad.ts`, `sim/Sim.ts`, `transport/NetlibTransport.ts`, ce que la vue consomme) du point de vue
qui compte : **le ressenti d'un joueur invité**. Chaque trouvaille est classée (bug confirmé / risque / amélioration), avec fichier:ligne, mesure et
correctif fait ou proposé.

**Compatibilité** : tous les correctifs gardent le protocole **v77** et restent compatibles avec un hôte ou un client 0.1.153 (champs JSON optionnels,
même message sur un autre canal). Tes amis peuvent jouer avec une version d'écart sans « refused: version ». Rien n'est déployé ni poussé.
**Sauf le § 2.1 (laisse de l'ancre, après l'audit)** : protocole **v78**, et le § 1.8 (tirs de ma squad) : **v79**, incompatibles avec la 0.1.153 / 0.1.154 (même version pour tous).

## Résumé

| # | Trouvaille | Gravité | Avant → après | Commit |
|---|---|---|---|---|
| 1 | Squad de l'invité figée puis projetée en avant à la reprise après la pause de choix d'upgrade | bug confirmé | pas max du centre affiché 23,3 → 10,8 px/tick (croisière 7,6) | `2456679` |
| 2 | `gameEnd` / `restart` / annonces de boss sur le canal non fiable : écran de fin, déblocage du niveau, `gameplayStop` perdus | bug confirmé | 30 % de perte : `gameEnd` 10/12 → 12/12, `restart` 7/12 → 12/12 | `a44d9cf` |
| 3 | Clic d'upgrade tardif appliqué à une proposition que l'invité n'a jamais vue | bug confirmé | 7/8 clics mal appliqués → 0/8 | `fdf848a` |
| 4 | Coupure courte (WiFi) : l'hôte comble le trou d'inputs en répétant le dernier | bug confirmé | rafales : correction p95 8,2 → 4,4 px, à-coup p95 8,1 → 4,2 | `a8e7665` |
| 5 | Input arrondi par l'hôte, pas par la prédiction | bug confirmé (mineur) | correction en réseau parfait 0,04 → 0,01 px | `2456679` |
| 6 | Snapshot reçu deux fois appliqué deux fois (monde cru figé ~66 ms) | bug confirmé (impact faible) | 28 → 0 doubles applications | `1f1a570` |
| 7 | File d'événements du client sans borne quand son onglet est caché | bug confirmé (mineur) | 247 → 64 paquets après 60 s | `7ded61f` |
| 7b | Tirs de ma squad affichés en retard, partis d'où l'invité n'est plus (retour de joueur) | bug confirmé | écart visuel balle / tireur 114 → 4,9 px (p95 131 → 17), retard 6,5 → 2,5 ticks | v79 (§ 1.8) |
| 7c | Fin des télégraphes vue 230-300 ms trop tard par l'invité (« j'étais sorti et j'ai pris les dégâts ») ; mèche du kamikaze perdue avec son événement | bug confirmé | impact affiché 7-9 ticks → 0-1 tick du moment où l'hôte juge (saut du crabe 13,5 → 1) ; mèches dans le snapshot | `7d265c1`, v80 (§ 1.9) |
| 8 | Laisse de l'ancre et poussée des aliens non prédites : la squad « tire » dans une horde | **risque, le plus gros restant** | correction p95 22 → 8,2 px par snapshot, écart réel p95 143 → 73 px, plus de recalage (v78) | v78 (§ 2.1) |
| 9 | Débit à 4 joueurs : 11,4 Ko par snapshot, 514 Ko/s en sortie chez l'hôte, 11 fragments | risque | mesure | proposé |
| 10 | Retard de la squad de l'invité chez l'hôte (file d'inputs) : équité des dégâts | risque | +1,9 tick (gigue 0-2), +3,7 (rafales) | proposé (essai mesuré) |

Outils ajoutés : `LoopbackHub.conditions` (perte, gigue réordonnée, doublons, rafales, latence asymétrique, graine) et `npm run sim:netloss`
(`games/xiao-swarm/scripts/net-loss-headless.mjs`), commit `2f7b940`.

## Méthode : ce qui est vérifié, ce qui est supposé

- **Vérifié par lecture** : tout `net/` (HostSession, ClientSession, Mirror, Prediction, Protocol, Session, Transport, LoopbackTransport), `NetlibTransport`,
  `Sim.step` / pause de choix / `restart`, `Squad.update` (ancre, laisse, slots), `Combat.stepProjectile` (durée de vie des projectiles), l'usage des
  événements dans `GameScene.onEvent` / `HudScene` / `WorldView`, `LevelUpScene` (verrou `busy`).
- **Vérifié par mesure** (Node, sans navigateur, réseau simulé et seedé : deux lancements donnent les mêmes chiffres, sauf `sim:jitter` /
  `sim:startstop` qui tirent leur gigue avec `Math.random`) : chaque ligne du tableau ci-dessus, avant et après.
- **Supposé, non vérifié** : le comportement réel de Netlib / WebRTC (taille des fragments ~1,15 Ko, perte réelle, absence de doublons en pratique),
  le ressenti à l'écran. Voir § « À tester en réel ».

### Nouveaux scénarios (`npm run sim:netloss -- [recon|resume|dup|events|upgrade|shots|hidden|tele|big]`)

| Scénario | Ce qu'il mesure |
|---|---|
| `recon` | corrections de l'ancre prédite et à-coups de la squad affichée d'un invité (30 soldats, aliens, petits inputs dans tous les sens) sous 5 profils : parfait, perte 5 % + gigue réordonnée, perte 10 % + doublons 5 % + gigue, rafales (1 %/tick, 8 ticks coupés), latence asymétrique ; plus la file d'inputs de l'hôte (ticks sans input, inputs sautés, retard ajouté) |
| `resume` | reprise après la pause de choix d'upgrade : pas par tick du centre affiché et du soldat le plus rapide, invité contre hôte |
| `dup` | snapshots doublés / réordonnés : aliens affichés qui s'arrêtent, snapshots appliqués deux fois |
| `events` | 12 fins de partie avec 30 % de perte : `gameEnd` / `restart` reçus, ancre recalée après relance |
| `upgrade` | deux niveaux d'avance, clic de l'invité dans les 100 dernières ms affichées des 5 s |
| `shots` | balles de ma squad pendant une course : écart visuel balle / tireur (invité contre hôte, au tick du snapshot lu), retard d'apparition |
| `tele` | stalactites, croix de pics, boules en cloche et mèches de kamikaze posées (+ Giant Crab, sortie du Scarab, charges du chargeur et du Rhino Alpha : position affichée / hôte au même input) sur la squad d'un invité qui bouge, puis un Giant Crab (saut, couronne de pics) : input de l'invité au moment où l'impact s'affiche chez lui, moins l'input que l'hôte avait joué en calculant les dégâts (0 = juste). `NOTELE=1` : sans avance des télégraphes |
| `hidden` | onglet de l'invité caché 60 s en combat : files du client, état au retour |
| `big` | 4 joueurs (hôte + 3 invités, dont un qui rejoint en plein combat), 40 soldats chacun, ~470 aliens gardés en vie + Rhino Alpha + Giant Crab, 3 % de perte : taille et débit des snapshots, événements JSON par type, corrections de l'invité arrivé en dernier. `NOLEASH=1` désactive la laisse chez l'hôte, `TRACE=1` détaille les grosses corrections |

`LoopbackHub` : par défaut rien ne change (réseau parfait, ordre d'envoi conservé) ; le canal `reliable` reste ordonné et sans perte. Limite : un
message = un paquet (pas de fragmentation simulée ; le risque est estimé dans `big`).

## 1. Bugs confirmés (corrigés)

### 1.1 Saut de ma squad à la reprise après la pause de choix — `2456679`
- **Où** : `net/Mirror.ts:138` (`localFrozen`), `:406` / `:414` ; `net/Prediction.ts:69` (`held`) ; `net/ClientSession.ts:163`.
- **Causes** (deux) : (a) les soldats de ma squad étaient avancés avec le `dt` du monde **tamponné** (`Mirror.frozen`, 100 ms de retard) : à la reprise,
  l'ancre repartait, les soldats restaient immobiles puis rattrapaient par bonds à chaque snapshot ; (b) pendant l'aller simple où le client ignore la
  reprise, il **tient** ses inputs (prédiction immobile) mais les **envoie** : l'hôte les jouait, la réconciliation projetait la squad en avant.
- **Correctif** : gel de ma squad lu dans le dernier snapshot reçu (`choiceT > 0` ou tick qui n'avance plus : couvre aussi écran de fin et salle
  d'attente) ; un input tenu part **nul** (hôte et prédiction font la même chose).
- **Mesure** (`resume`, latence 3 ticks) : invité `0 ×7, 21.4, 0.0, 18.9, 9.3, 23.3, 9.9, 15.2…` → `0 ×7, 10.8, 6.1, 7.2, 6.9, 7.4, 7.5…` px/tick ;
  pas max d'un soldat 24,1 → 13,7.
- **Contrepartie** (choisie) : chez l'hôte et les autres joueurs, la squad de l'invité « roule » ~260 ms sur sa vitesse acquise avant de repartir (comme
  un joueur qui lâche le stick un instant), au lieu que l'invité, lui, saute. Les 7 ticks d'immobilité au début restent : c'est l'aller simple + la
  cadence des snapshots (l'invité apprend la reprise ~170 ms après l'hôte), incompressible sans annoncer la reprise à l'avance.

### 1.2 Événements structurants perdus — `a44d9cf`
- **Où** : `net/HostSession.ts:82` (`RELIABLE_EVENTS`), `broadcast` (`:311`).
- **Avant** : tout partait en `unreliable`. Or `gameEnd` déclenche chez l'invité `saveRun`, `settings.unlockAfterWin` (une victoire perdue = Hard
  pas débloqué), `flow.win/fail` (`gameplayStop` : exigence Poki) et l'écran de fin ; `restart` la relance du `RunFlow` et la fermeture de l'écran de
  choix ; `boss` / `bossDown` / `bossEnrage` les bandeaux, le son et l'analytics.
- **Correctif** : ces 5 types partent dans un message `events` à part sur le canal fiable (même `seq`, même format).
- **Mesure** (`events`, 30 % de perte) : `gameEnd` 10/12 → 12/12, `restart` 7/12 → 12/12.

### 1.3 Choix d'upgrade tardif appliqué à des cartes jamais vues — `fdf848a`
- **Où** : `net/HostSession.ts:389` (`sameOffer`), `net/ClientSession.ts:175` (`shownOffer`), `net/Protocol.ts` (`offerKey`, champ `offer`).
- **Scénario** : deux niveaux d'avance ; l'invité voit la jauge des 5 s ~200 ms en retard (tampon 100 ms + aller simple) ; il clique dans ses derniers
  instants ; l'hôte a déjà choisi au hasard et ouvert le niveau suivant ; l'index s'appliquait à cette proposition jamais affichée (le joueur perd son
  choix pour ce niveau). Le double clic « Reroll puis carte » est, lui, déjà bloqué par `LevelUpScene.busy`.
- **Correctif** : `upgrade` et `reroll` emportent les cartes affichées (`offer`, ids + prismatiques) ; l'hôte refuse si sa proposition a changé, le
  client voit la nouvelle et choisit. Sans `offer` (client 0.1.153) : accepté comme avant.
- **Mesure** (`upgrade`) : 7/8 mal appliqués → 0/8 (7 refusés, 1 arrivé à temps).

### 1.4 Trou d'inputs comblé par répétition après une coupure — `a8e7665`
- **Où** : `net/ClientSession.ts:204` (`prev` = inputs non acquittés, 2 à 8), `net/HostSession.ts:355` (lecture jusqu'à `MAX_INPUT_GAP`).
- **Avant** : `prev` ne portait que 2 inputs ; après 8 ticks coupés, l'hôte répétait le dernier input connu pour les 6 autres. Si le joueur avait
  tourné, l'ancre hôte divergeait.
- **Mesure** (`recon`, rafales) : correction moy 1,53 → 0,72 px, p95 8,2 → 4,4, max 30 → 24 ; à-coup p95 8,1 → 4,2. Autres profils inchangés.
  Coût : ~60 octets de plus par input en régime, ~1,8 Ko/s en montée par invité.
- **Reste** : 20 ticks sans input et 15 inputs sautés par 12 s dans ce profil (pendant la coupure, rien n'arrive) : voir § 2.3.

### 1.5 Input arrondi après la prédiction — `2456679`
- `ClientSession` envoyait `round(mx)` mais prédisait avec `mx` brut. Correction d'ancre en réseau parfait 0,04 → 0,01 px (invisible, mais c'était
  la totalité de l'erreur résiduelle).

### 1.6 Snapshot reçu deux fois — `1f1a570`
- `net/ClientSession.ts:229`. Le doublon était rangé dans le tampon ; rejoué, son `tick` identique faisait passer `Mirror.frozen` à vrai jusqu'au
  snapshot suivant (extrapolation et télégraphes arrêtés ~66 ms). 28 doubles applications → 0 (`dup`, 20 % de doublons). Impact visible faible : le
  lissage continue de rapprocher les aliens (taux d'arrêt inchangé, 2,10 %). WebRTC duplique rarement : correctif de principe.

### 1.7 File d'événements sans borne, onglet caché — `7ded61f`
- `net/ClientSession.ts:241`. Onglet caché : `playback` ne tourne plus, les snapshots sont bornés (16) mais `eventBuffer` grossissait (~250 paquets par
  minute en combat). Au-delà de 64, les plus vieux passent dans `pending` (déjà plafonné à 400). 247 → 64 après 60 s ; au retour, files vides et
  aliens à jour.

### 1.8 Tirs de ma squad en retard (retour de joueur, après l'audit) — v79
- **Retour** : « quand je bouge, ça tire depuis un endroit où mon soldat n'est plus ».
- **Cause** : ma squad est prédite et lue hors tampon, mais ses balles et ses tirs (flash, son) passaient par le tampon (+100 ms) et naissaient là où
  l'hôte voyait mes soldats (en retard d'un aller-retour et de la file d'inputs). `WorldView.shiftFreshBullets` ne recalait la balle qu'à sa
  naissance, et seulement si sa position collait au tir, puis `Mirror` la ramenait sur l'ancienne trajectoire.
- **Correctif** : octet « squad du tireur » par projectile (`ProjectileSnap.squad`, v79) ; balles de ma squad lues par `Mirror.applyLocal`
  (`localProjectiles`), tirs rejoués dès réception (`ClientSession.shotEvents`) ; une balle neuve naît décalée de l'avance de la prédiction
  (`predictor.dx` / `dy`) puis rejoint sa trajectoire hôte par le lissage.
- **Mesure** (`sim:netloss -- shots`, course dans 4 directions, latence 3) : écart visuel balle / tireur (invité contre hôte) moy 114 → 4,9 px,
  p95 131 → 17 ; hors tampon seul (sans le décalage de naissance) : 36,7. Retard d'apparition 6,5 → 2,5 ticks. Coût : +1 octet par projectile.
- **Reste** : impacts toujours tamponnés (la balle peut disparaître ~100 ms avant l'étincelle) ; dégâts calculés chez l'hôte (visuel seulement).

### 1.9 Fin des télégraphes vue trop tard par l'invité (retour de joueur, après l'audit) — `7d265c1`, kamikaze en v80
- **Retour** : « je sors du télégraphe à temps sur mon écran et je prends quand même les dégâts ».
- **Cause** : sur l'écran de l'invité, sa squad est **en avance** (prédite : un aller simple + la file d'inputs de l'hôte) et les télégraphes **en
  retard** (un aller simple + le tampon de 100 ms). Les dégâts sont calculés chez l'hôte avec la position de la squad chez l'hôte : la fin d'un
  télégraphe arrivait chez l'invité ~un aller-retour + 100 ms + la file après que l'hôte l'avait jugé (7 à 9 ticks mesurés, 13 pour le saut du crabe).
- **Correctif** (`Mirror.teleLead`, client seulement) : l'écart se mesure exactement, input courant de l'invité − `ack` du snapshot affiché (lissé,
  plafonné à 0,5 s, gardé pendant une pause). Les minuteurs des télégraphes sont avancés d'autant (`Mirror.advanceTelegraphs`) : stalactites, croix de
  pics, murs (remplissage), pics du lurker et couronne du crabe (télégraphe puis poussée), saut du crabe (minuteur + position en vol, `placeLeaper`, d'après
  le départ vu pendant la préparation), boules en cloche des aliens (vol avancé dans `upsertProjectile`). L'effet d'impact (stalactite, `slam` du saut,
  explosion d'une boule) est joué **ici** à la fin du télégraphe avancé (`Mirror.localEvents`) et son double venu de l'hôte est jeté
  (`Mirror.swallowHostEvent`, même type à moins de 24 px).
- **Mesure** (`sim:netloss -- tele`, en ticks d'input de l'invité, + = impact vu trop tard) : avant → après
  - latence 3 / 3 : stalactites 7 → 0, croix de pics 7,5 → −0,8, boules en cloche 7 → −1 ;
  - latence 5 / 3 + gigue 0-2 + 3 % de perte : stalactites 9 → −0,8, croix 9,5 → −0,4, boules 9 → −0,9 ;
  - Giant Crab (même réseau) : atterrissage du saut 13,5 → 1, départ de la couronne de pics 13 → 1 ;
  - kamikaze (v80) : 7,5 → −0,4 (latence 3 / 3), 9,5 → −0,9 (gigue + perte) ;
  - sortie du Scarab (gigue + perte) : moment 14,6 → 0,8 tick, une sortie sur 6 jamais vue (événement perdu) → 0, position de l'onde de choc à
    8 px en moyenne de celle de l'hôte (19 au plus, zone de 180 px de rayon).
  (`NOTELE=1` : télégraphes non avancés, pour comparer.) `recon` / `resume` identiques, `sim:net`, `sim:predict`, `sim:combat`, `sim:jitter`, autres
  scénarios de `sim:netloss` : OK.
- **Kamikaze (v80)** : sa mèche n'était pas dans le snapshot mais un événement `fuse` (canal non fiable : perdu = aucun télégraphe, explosion sans
  prévenir) dont la vue tenait le compte à rebours. Les mèches (`Sim.fuses`, type `Fuse`) passent maintenant dans le snapshot (liste `fuses` après les
  croix, 9 octets par mèche), `Mirror` les avance comme les stalactites (explosion `fire` jouée ici, double de l'hôte jeté), la vue les lit dans
  `sim.fuses` (hôte et invité) ; l'événement `fuse` est supprimé. **Incompatible avec la 0.1.155** (v79 → v80).
- **Sortie du Scarab** : sa plongée (`lurkPhase` 1-4) est avancée (`Mirror.advanceBurrow`) ; quand il vise MA squad, la zone de sortie est suivie
  ici (`trackBurrows`) : sur le centre de ma squad affichée avant le verrouillage (comme `Horde.aimBurrow`), puis sur l'axe figé à la vitesse
  lissée de mon ancre prédite (`myVel`, même lissage que `Squad.vel`, celle que l'hôte aura en jouant mes inputs). La squad visée est déduite de la
  zone de l'hôte (ancre la plus proche dans le snapshot). Essai écarté : recaler la zone sur celle de l'hôte avancée du déplacement de mon ancre
  depuis l'`ack` (l'hôte glisse avec une vitesse lissée, pas le déplacement : écart moyen 8 → 37 px). **Défaut de l'hôte corrigé au passage** :
  sous terre, le Scarab n'a pas de cible et la zone suivait « la squad la plus proche de l'endroit où il a plongé », recalculée à chaque tick ; en
  multi, elle pouvait changer de squad en route et se figer. La squad visée est maintenant fixée quand il s'enterre (`AlienState.burrowSq`,
  `Horde.burrowSquad`) ; en solo rien ne change.
- **Charges** (chargeur, Rhino Alpha, jumeaux) : l'alien qui charge (1000-1300 px/s) était affiché ~`teleLead` en retard, donc loin de là où l'hôte
  le juge. Chez l'invité, la charge est **simulée** (`Mirror.charges`, `startCharge` / `stepCharge`) : départ à la fin du télégraphe avancé
  (`rushWind`), de la dernière position reçue, sur l'axe verrouillé (normalisé), loi de l'hôte (accélération `damp` 8, durée `length / speed`, arrêt
  contre un obstacle de la carte : `rushStop`, rochers des murs d'alien brisés ici : `rushSmashes`, événement `rockBreak` local, double de l'hôte jeté,
  rocher écarté des snapshots) ; quand l'hôte annonce la charge, l'écart latéral est recalé et une charge arrêtée ici à tort reprend. L'alien est
  rendu au snapshot quand l'hôte l'a dite finie. **Gameplay (hôte, solo compris)** : une charge s'arrête maintenant net contre un obstacle de la carte
  ou le bord de l'arène (avant : elle glissait le long), sauf si l'alien le frôlait déjà au départ.
  Mesure (`tele`, gigue + perte, position affichée / hôte au même input pendant les charges) : chargeur moy 184 → 49 px, p95 391 → 105 ; Rhino
  Alpha moy 140 → 38, p95 385 → 65. Reste un cas rare : charge locale arrêtée par un petit obstacle frôlé que l'hôte évite (départ estimé à ~15 px
  près : l'alien dérive encore pendant le télégraphe), reprise quand l'hôte annonce la charge (max 440 px une fois sur 20). Essai sans effet :
  ajouter au départ la glissade de fin d'élan (vitesse reçue freinée).
- **Pas traité** : ruée du Scarab après sa sortie (alien qui bouge, comme une charge, mais vitesse et cible propres), apparition des rochers d'un
  mur (obstacles que la prédiction contourne, positions calculées par l'hôte). Visuel seulement : les dégâts restent calculés chez l'hôte.
  Non vérifié en navigateur.

## 2. Risques (non corrigés)

### 2.1 Laisse de l'ancre et poussée des aliens non prédites — le plus gros écart restant (réduit en v78)
- **Où** : `sim/Squad.ts` § 2 de `update` (laisse : `CROWD.leash + √n × leashPerRoot` autour du cœur de la squad) ; le client n'a pas la poussée des
  aliens sur les soldats (`Mirror.crowdStep` : « sans séparation ni répulsion des aliens »).
- **Mesure de départ** (`big`, invité de 40 soldats dans une horde, latence 5 / 3, 3 % de perte) : correction d'ancre moy 2,5 px, **p95 22 px**, max
  25 px à chaque snapshot (15/s). Avec `NOLEASH=1` (laisse coupée chez l'hôte) : p95 **1,1 px**. `TRACE=1` : chez l'hôte, la horde repousse les soldats,
  le cœur recule (jusqu'à ~9 px/tick) et la laisse tire l'ancre en arrière ; chez l'invité, l'ancre prédite file librement.
- **Nouvelles mesures du scénario `big`** (`net-loss-headless.mjs`) : *écart réel* = ancre prédite par l'invité après son input n contre ancre de l'hôte
  après avoir joué ce même input (ce que l'invité voit de faux) ; *pas de l'ancre prédite par tick* (un rappel dans le pas client ne se voit pas dans la
  correction par snapshot) ; `BIGTICKS=300` allonge la partie (deux épisodes de retenue au lieu d'un, le premier tombe à la toute fin des 150 ticks par
  défaut) ; `NOLEASHBIT=1` fait ignorer la laisse annoncée par l'invité (comportement v77). Écart réel en v77 : moy 18 px, **p95 143 px**, max 163 px.
- **Correctif (v78)** : piste (a) étendue. L'hôte annonce la laisse dans le snapshot (bit 4 de l'octet de drapeaux de squad, puis cœur, rayon et vitesse
  lissée du cœur : `SquadSnap.leash`, `Squad.leashed`) dès que l'ancre est à plus de `LEASH_WARN` 0,5 × le rayon (pas seulement quand elle est retenue :
  sinon l'invité l'apprenait encore plus tard). L'invité rejoue la laisse (`AnchorPredictor.applyLeash`, rejeu et pas client) autour du cœur de l'hôte,
  extrapolé à sa vitesse (≤ 15 ticks) seulement s'il avance vers l'ancre, figé quand la horde le repousse ; dans le pas client, rappel limité à
  `LEASH_PULL` 16 px par tick. Les soldats suivent l'ancre rejouée (`predictor.path`), donc la laisse aussi.

  | `big` (latence 5 / 3, 3 % de perte) | v77 150 ticks | v78 150 ticks | v77 300 ticks | v78 300 ticks |
  |---|---|---|---|---|
  | correction d'ancre / snapshot (moy / p95 / max) | 2,5 / **22,0** / 25,1 | 1,3 / **8,2** / 19,1 | 2,6 / 16,8 / **83,8** | 2,0 / 13,4 / **19,1** |
  | écart réel prédite / hôte (moy / p95 / max) | 18,1 / **143** / 163 | 9,9 / **73** / 123 | 18,4 / 143 / 163 | 13,5 / 73 / 123 |
  | pas de l'ancre prédite par tick, max (croisière 7,6) | 32,8 | 29,0 | **80,6** | **29,0** |

  `recon` (5 profils) et `resume` : sortie **identique** au bit près (la laisse n'y est jamais annoncée). `sim:net`, `sim:predict -- 4`,
  `sim:startstop -- 3 no 2` (creux au démarrage dus à sa gigue `Math.random`, présents aussi avec `LEASH_WARN` = 1), `sim:jitter`, `sim:netloss -- dup
  events upgrade hidden` : OK. **Casse la compatibilité avec la 0.1.153 / 0.1.154** (v77 → v78) : hôte et invités doivent avoir la même version.
- **Variantes mesurées et écartées** (`big`, 150 / 300 ticks ; à ne pas refaire) :
  - Laisse annoncée seulement quand elle retient l'ancre, cœur figé, correction normale : écart p95 66 / 69 mais **recalage de 81-86 px** au début de la
    retenue (l'écart déjà accumulé dépasse `SNAP`).
  - Idem avec correction plafonnée à 24-34 px par snapshot : le pas client ramenait l'ancre dans la laisse d'un coup (**pas de 81 px**, invisible dans la
    correction) ; avec un rappel limité à 4-14 px/tick, écart p95 92-115.
  - Cœur toujours extrapolé à sa vitesse : il dépasse l'hôte quand la poussée s'arrête (correction max 134-150 px, écart p95 97).
  - Annonce dès 0,5 × rayon, cœur toujours figé : correction max 11-14, mais dent de scie quand le cœur de l'hôte repart en avant (écart moyen 24 px sur
    300 ticks, pire que la v77).
  - Rappel limité à 10 px/tick (au lieu de 16) : pas max 23-26 mais écart p95 84.
  - Essais rejetés de l'audit initial : laisse rejouée sur le cœur des soldats **simulés** (p95 16 mais recalage de 86 px : le modèle de foule ignore la
    poussée, cœur faux de ~130 px) ; cœur hôte extrapolé à sa vitesse mesurée d'un snapshot à l'autre (bruitée : `recon` p95 1 → 8-12 px).
- **Reste** : le début d'une retenue arrive un aller-retour en retard (≈ 10 inputs à ~15 px d'écart de plus chacun), d'où l'écart max ~120 px. Pistes :
  (b) modéliser la poussée des aliens sur chaque soldat pendant le rejeu (part de sa vitesse hôte qui n'est pas la loi de foule, appliquée décroissante),
  pour un cœur estimé juste avant l'annonce ; (c) régler `LEASH_PULL` / `BLEND` en réel (subjectif).

### 2.2 Débit et fragmentation à 4 joueurs
- **Mesure** (`big` : 4 × 40 soldats, ~470 aliens, 2 boss) : snapshot moyen **11,4 Ko** (squads 3,7, aliens 6,5), plus gros 12,2 Ko ;
  **171 Ko/s par invité, 514 Ko/s (≈ 4,1 Mbit/s) en sortie chez l'hôte** ; événements JSON 6,2 Ko/s par invité (`alienDied` 2,0, `corpse` 1,8,
  `corpseEnd` 1,7). Le plus gros snapshot ≈ 11 fragments : avec 2 % de perte par paquet, ~20 % de ces snapshots seraient perdus (estimation : le
  harnais ne fragmente pas). Une connexion ADSL / 4G de l'hôte (1-5 Mbit/s en montée) sature.
- **Pistes** : (a) soldat de 23 octets → ~12 (id u32 → u16 relatif, PV en u8 de fraction, visée sur 1 octet, vitesse quantifiée) : −2 Ko à 4 × 40 ;
  (b) `alienDied` / `corpse` / `corpseEnd` en binaire dans le snapshot (comme `shot` / `impact` / `hit` en v38) : −5 Ko/s par invité ;
  (c) « interest management » : n'envoyer à un invité que les aliens à moins de ~1,5 écran de ses squads ; (d) delta par rapport au dernier snapshot
  acquitté. (a) et (b) sont sûrs et mesurables avec `big` ; ils demandent v78.

### 2.3 Équité : retard de la squad de l'invité chez l'hôte
- **Où** : `net/HostSession.ts:217` (`consumeInput`), `MAX_INPUT_QUEUE` 6, `INPUT_QUEUE_WINDOW` 90.
- **Mesure** (`recon`) : la file ajoute en moyenne **1,9 tick (62 ms)** avec une gigue de 0-2 ticks, **3,7 ticks (123 ms)** avec des rafales, en plus
  de l'aller simple. C'est là que l'hôte tranche dégâts, ramassages et réanimations : l'invité se voit esquiver (prédit, en avance) alors que l'hôte le
  touche encore. Le budget complet d'un télégraphe esquivé par l'invité : aller simple (vu par l'invité) + 100 ms de tampon + aller simple (input) + file.
- **Essais** :
  - Deviner l'input manquant et le compter comme joué (pas de file) : **rejeté**, corrections p95 1 → 17 px sous gigue.
  - Rattraper à deux inputs par tick (l'ancre fait deux pas : `PlayerInput.catchUp` dans `Squad.update`) au lieu de jeter des inputs, avec une fenêtre
    de 30 ticks : retard 1,86 → 1,33 tick (perte 5 %), corrections inchangées ; rafales 3,72 → 3,51, corrections un peu moins bonnes (p95 4,4 → 6,1).
    Gain trop faible pour toucher `sim/Squad.ts` : **non retenu**, à reprendre si l'équité devient un retour de joueur.
- **Pistes** : compensation de latence légère côté hôte pour les télégraphes (tolérer un soldat d'invité sorti de la zone dans les N derniers ticks) :
  plus juste pour l'invité, plus permissif ; à décider en jeu.

### 2.4 Jauge du choix d'upgrade décalée chez l'invité
- Il voit le temps restant ~200 ms trop haut (tampon + aller simple). Le correctif 1.3 évite le mauvais choix ; reste une petite injustice d'affichage.
  Piste : retrancher `INTERP_DELAY_MS` + une estimation de l'aller simple à la jauge affichée (vue seulement).

### 2.5 Petits écarts mesurés, non traités
- **Dérive après l'arrêt sous gigue** (`sim:startstop -- 3 no 2`) : après s'être arrêtée, la squad de l'invité glisse encore ~5 px sur 5 ticks
  (`1.2 1.2 1.3 1.3`). Cause probable : un tick où la file de l'hôte est vide, l'input précédent est joué **en plus** (décalage d'un tick qui ressort au
  changement d'input). L'alternative (compter le tick deviné comme joué) est pire (§ 2.3).
- **Soldat isolé qui revient, squad à l'arrêt** (`sim:startstop`) : pas max 21,4 px/tick alors que `SOLDIER_MAX_STEP` vaut 14 (`net/Mirror.ts:51`).
  Présent avant cet audit (21,5). Hypothèse : à l'entrée dans le modèle de foule, la vitesse simulée (~10 px/tick) s'ajoute à la fermeture de l'écart
  (`ENTER_CLOSE_SPEED`, 6,7 px/tick). Non investigué.
- **Vitesse de l'ancre envoyée en entier** (`net/Protocol.ts:518`) : 226,8 → 227 px/s, soit ~0,04 px d'écart sur un rejeu de 6 ticks. Négligeable ; à
  passer en ×10 si un autre changement impose v78.

### 2.6 Messages malformés ou malveillants (relu, pas de faille trouvée)
- `input` : `n` non fini → 0 → ignoré ; `n` énorme → l'invité se bloque lui-même (ses inputs suivants sont « en retard ») ; `prev` lu au plus 8 paires,
  valeurs bornées à [−1, 1] (`finite`). `upgrade` : index `NaN` / hors bornes → `Squad.chooseUpgrade` renvoie faux. `reroll` : limité par `rerolls`.
- `hello` répété : renvoie `welcome` et diffuse `lobby` à chaque fois (amplification possible, sans conséquence entre amis).
- Un client ne peut pas usurper l'hôte : `ClientSession.onMessage` ignore tout pair autre que l'hôte. Snapshot corrompu → `decodeSnapshot` renvoie null.
- `w.str` écrit la longueur sur un octet : un id de joueur > 255 caractères décalerait le décodeur. Ids de Netlib (UUID) : non exploitable, à garder en tête.

## 3. Vérifié sans problème
- **Champs conditionnels de l'encodeur** (`encodeSnapshot` / `decodeSnapshot`) : soldat (`capturedBy`, glaçon sur l'octet écrit), alien (`rush` sur
  l'octet arrondi, `leap`, `cast`, `lurk`, bouclier selon le type), projectile (`lob` dans l'octet de drapeaux) : mêmes tests des deux côtés.
  L'octet de drapeaux des projectiles ne peut pas déborder : `Combat.stepProjectile` libère tout projectile à `life ≤ 0`, et `life ≤ maxLife`.
- `INPUT_TIMEOUT` après une relance : `Sim.restart` ne remet pas `tick` à zéro, pas de différence négative.
- Arrivée et départ d'un joueur pendant la pause de choix (`Sim.stepChoice` / `afterChoice`), joueur qui rejoint en plein combat (`big` : 476 aliens vus
  contre 471, l'écart = le tampon de 100 ms).
- Après 12 relances avec perte, l'ancre prédite est recalée sur celle de l'hôte (< 1 px).
- Pause de choix annoncée (`choiceIn`) : recul toujours 0 px à l'ouverture (`sim:startstop`).

## 4. Améliorations proposées (sans bug derrière)
1. **Soldats des autres squads** : interpolés comme les aliens (vers leur position du snapshot suivant, `Mirror.apply(snap, next)`), au lieu d'être
   extrapolés à leur vitesse. Le tampon le permet déjà ; à mesurer (pas max d'un soldat d'une autre squad).
2. **Tampon adaptatif** : `INTERP_DELAY_MS` (100 ms) choisi d'après la gigue mesurée des snapshots (50 ms sur un bon réseau = 50 ms de moins sur tout
   ce que voit l'invité).
3. **Annonce de la reprise** : l'hôte connaît la reprise un tick avant (tous ont choisi) ; l'annoncer comme `choiceIn` raccourcirait les 7 ticks
   d'immobilité du § 1.1 (v78).
4. **Serveur Node autoritaire** (`sim/` est pur) : supprime l'avantage de latence de l'hôte et la montée de 514 Ko/s chez lui. Gros chantier.
5. **Fin de vie des balles de ma squad** (après la v79, à faire si un défaut se voit en jeu) : aujourd'hui une balle de ma squad disparaît dès le snapshot
   qui ne la contient plus (`Mirror.syncProjectiles`). Trois défauts visuels possibles :
   - **Étincelle en retard** : `impact` et `hit` restent tamponnés (heure des aliens), donc l'étincelle et le flash de l'alien arrivent ~100 ms après la
     disparition de la balle. Correctif : marquer aussi les impacts avec la squad du tireur (+1 octet, v80) et rejouer ceux de ma squad hors tampon,
     comme les tirs (`ClientSession.shotEvents`).
   - **Dépassement de la cible** : entre deux snapshots la balle est extrapolée à sa vitesse ; elle peut voler jusqu'à ~2 ticks de trop (~50 px) avant
     de disparaître (existait déjà avant la v79). Correctif : arrêter l'extrapolation d'une balle de ma squad qui croise un alien affiché (visuel seul,
     sans protocole ; approximatif car l'alien affiché a 100 ms de retard).
   - **Tir à bout portant** : une balle qui vit moins de ~3 ticks disparaît avant que son décalage de naissance (avance de la prédiction) ait fondu.
     Accepté tel quel.

## 5. À tester en réel (deux fenêtres, ou des amis)
1. **Reprise après level up** (§ 1.1) : invité qui garde le stick enfoncé pendant le choix → la squad doit repartir sans bond. Chez l'hôte, regarder
   la squad de l'invité : un léger « roulé » de ~1/4 s est attendu.
2. **Victoire en ligne** (§ 1.2) : un invité qui gagne en Normal doit voir Hard débloqué sur son écran Solo.
3. **Choix tardif** (§ 1.3) : invité qui clique pile à la fin de la jauge avec deux niveaux d'avance → soit sa carte est prise, soit l'écran repart sur
   le niveau suivant (jamais une carte non vue).
4. **Horde** (§ 2.1, v78) : invité de 30-40 soldats qui pousse dans une grosse vague → noter s'il sent encore des « coups de laisse » (début d'une
   retenue : rappel de 16 px/tick au plus, `LEASH_PULL`). C'est le point à prioriser.
5. **Débit** (§ 2.2) : à 4 joueurs, F12 → Réseau → onglet WebRTC (`chrome://webrtc-internals`) chez l'hôte : débit sortant et paquets perdus quand
   les vagues sont pleines.
6. **WiFi instable** (§ 1.4) : invité en WiFi loin de la box ; regarder les sauts de sa squad après une microcoupure.

## Annexe : commandes
```
npm run typecheck                       # racine
cd games/xiao-swarm
npm run sim:netloss                     # tous les scénarios ci-dessus (≈ 3 min)
npm run sim:netloss -- recon resume     # quelques scénarios
NOLEASH=1 npm run sim:netloss -- big    # part de la laisse dans les corrections
NOLEASHBIT=1 BIGTICKS=300 npm run sim:netloss -- big   # l'invité ignore la laisse annoncée (v77), partie plus longue
npm run sim:net && npm run sim:lobby && npm run sim:predict -- 4 && npm run sim:startstop -- 3 no 2
```
