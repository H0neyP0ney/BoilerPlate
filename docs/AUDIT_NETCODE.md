# Audit du netcode (19/10, protocole v77, après la 0.1.153)

Audit complet de `games/xiao-swarm/src/net/` (+ `sim/Squad.ts`, `sim/Sim.ts`, `transport/NetlibTransport.ts`, ce que la vue consomme) du point de vue
qui compte : **le ressenti d'un joueur invité**. Chaque trouvaille est classée (bug confirmé / risque / amélioration), avec fichier:ligne, mesure et
correctif fait ou proposé.

**Compatibilité** : tous les correctifs gardent le protocole **v77** et restent compatibles avec un hôte ou un client 0.1.153 (champs JSON optionnels,
même message sur un autre canal). Tes amis peuvent jouer avec une version d'écart sans « refused: version ». Rien n'est déployé ni poussé.

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
| 8 | Laisse de l'ancre et poussée des aliens non prédites : la squad « tire » dans une horde | **risque, le plus gros restant** | p95 22 px par snapshot (1,1 px sans laisse) ; 2 essais rejetés | proposé |
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

### Nouveaux scénarios (`npm run sim:netloss -- [recon|resume|dup|events|upgrade|hidden|big]`)

| Scénario | Ce qu'il mesure |
|---|---|
| `recon` | corrections de l'ancre prédite et à-coups de la squad affichée d'un invité (30 soldats, aliens, petits inputs dans tous les sens) sous 5 profils : parfait, perte 5 % + gigue réordonnée, perte 10 % + doublons 5 % + gigue, rafales (1 %/tick, 8 ticks coupés), latence asymétrique ; plus la file d'inputs de l'hôte (ticks sans input, inputs sautés, retard ajouté) |
| `resume` | reprise après la pause de choix d'upgrade : pas par tick du centre affiché et du soldat le plus rapide, invité contre hôte |
| `dup` | snapshots doublés / réordonnés : aliens affichés qui s'arrêtent, snapshots appliqués deux fois |
| `events` | 12 fins de partie avec 30 % de perte : `gameEnd` / `restart` reçus, ancre recalée après relance |
| `upgrade` | deux niveaux d'avance, clic de l'invité dans les 100 dernières ms affichées des 5 s |
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

## 2. Risques (non corrigés)

### 2.1 Laisse de l'ancre et poussée des aliens non prédites — le plus gros écart restant
- **Où** : `sim/Squad.ts:561-569` (laisse : `CROWD.leash + √n × leashPerRoot` autour du cœur de la squad) ; le client n'a ni la laisse ni la poussée des
  aliens sur les soldats (`Mirror.crowdStep` : « sans séparation ni répulsion des aliens »).
- **Mesure** (`big`, invité de 40 soldats dans une horde, latence 5 / 3, 3 % de perte) : correction d'ancre moy 2,5 px, **p95 22 px**, max 25 px à
  chaque snapshot (15/s). Avec `NOLEASH=1` (laisse coupée chez l'hôte) : p95 **1,1 px**. La laisse explique donc presque tout. `TRACE=1` montre pourquoi
  : chez l'hôte, la horde repousse les soldats à ~100 px de l'ancre (laisse atteinte) ; chez l'invité, ses soldats simulés restent collés à l'ancre.
  Ressenti attendu : en poussant dans une horde, la squad avance puis est retenue par à-coups (~9 px par snapshot avec `BLEND` 0,4).
- **Essais rejetés** (code annulé, chiffres ici pour ne pas les refaire) :
  1. Laisse rejouée avec le cœur calculé sur les soldats **simulés** chez le client : p95 22 → 16 mais max 25 → **86 px** (recalage) ; le modèle de
     foule ignore la poussée, le cœur estimé est faux de ~130 px.
  2. Laisse sur le cœur **hôte** reçu, extrapolé à sa vitesse mesurée d'un snapshot à l'autre : pire partout (profils `recon` p95 1 → 8-12 px,
     recalages de 110 px) ; la vitesse du cœur est trop bruitée avec des petits inputs.
- **Pistes** (par coût croissant) :
  - (a) L'hôte transmet un bit « ancre retenue par la laisse » (octet de drapeaux de la squad, v78) et le cœur ; le client ne rejoue la laisse que
    quand ce bit est vrai, sur ce cœur figé. À mesurer avec `big` ; risque faible car inactif hors horde.
  - (b) Modéliser la poussée : pour chaque soldat, part de sa vitesse hôte qui n'est pas la loi de foule (= poussée), appliquée décroissante pendant
    le rejeu. Plus fidèle, plus cher, à mesurer avec `big` et `recon`.
  - (c) Baisser `BLEND` quand la correction est due à la laisse (fondu plus lent = moins d'à-coups, plus de dérive). Subjectif : à essayer en réel.

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

## 5. À tester en réel (deux fenêtres, ou des amis)
1. **Reprise après level up** (§ 1.1) : invité qui garde le stick enfoncé pendant le choix → la squad doit repartir sans bond. Chez l'hôte, regarder
   la squad de l'invité : un léger « roulé » de ~1/4 s est attendu.
2. **Victoire en ligne** (§ 1.2) : un invité qui gagne en Normal doit voir Hard débloqué sur son écran Solo.
3. **Choix tardif** (§ 1.3) : invité qui clique pile à la fin de la jauge avec deux niveaux d'avance → soit sa carte est prise, soit l'écran repart sur
   le niveau suivant (jamais une carte non vue).
4. **Horde** (§ 2.1) : invité de 30-40 soldats qui pousse dans une grosse vague → noter s'il sent des « coups de laisse ». C'est le point à prioriser.
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
npm run sim:net && npm run sim:lobby && npm run sim:predict -- 4 && npm run sim:startstop -- 3 no 2
```
