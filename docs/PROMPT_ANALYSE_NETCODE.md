# Prompt : audit complet du netcode (à donner à Claude Opus 5.5)

À copier-coller en début de session. Il suppose que `CLAUDE.md` est chargé (il l'est automatiquement dans ce repo).

---

Tu vas faire l'**audit complet du netcode** de Xiao Swarm (jeu coop Poki, Phaser 4 + TypeScript, monorepo npm), puis corriger ce qui peut l'être. Réponds, commente et documente en **français, en tutoyant** l'utilisateur.

## Contexte

- Architecture : **hôte autoritaire en P2P** (Netlib de Poki). L'hôte fait tourner la simulation (30 Hz fixe) ; les clients (jusqu'à 4 joueurs, hôte compris) n'affichent que ce que l'hôte leur envoie
  (snapshots binaires à 15 Hz, canal `unreliable`) et envoient un input par tick (JSON, `unreliable`). La squad locale d'un client est **prédite** ; le reste est extrapolé / lissé / interpolé.
- Les amis du développeur jouent en ligne : **le ressenti d'un joueur invité (non hôte) est la métrique qui compte**. Le jeu : une squad de 4 à 40 soldats qui suit une ancre (loi de foule avec inertie,
  `sim/Squad.ts`), des centaines d'aliens, des boss, des états spéciaux (gel, étourdissement, bulle, saut vers la Gling Mère, recul de kamikaze, isolement après un grab…).
- Le dev a fait plusieurs correctifs le **19/10** après des retours de joueurs (« je me bats avec la réconciliation », « départ / arrêt pourris », « soldats isolés en saccades », « jitter à la pause de level up »).
  Tout est décrit dans **`docs/MULTIJOUEUR.md`**, section « Squad locale d'un client invité : chaîne complète (protocole v77) » : **lis-la en premier**, ainsi que les sections Paramètres, Pièges, Pistes
  d'amélioration, Optimisations v37-v38. Les commits récents (`git log -- games/xiao-swarm/src/net`) racontent le détail.

## Fichiers à lire (tout le dossier `games/xiao-swarm/src/net/` + ce qui le touche)

- `net/HostSession.ts` (file d'inputs `consumeInput`, `broadcast`, joueurs distants, bots, lobby, relance), `net/ClientSession.ts` (tampon d'interpolation, `playback`, `applySnapshot`, `sendInput`),
  `net/Mirror.ts` (reflet du monde chez le client, `applyLocal` / `reconcileSoldier` / `crowdStep` / `followPredicted` / `follow`, extrapolation des autres entités), `net/Prediction.ts` (`AnchorPredictor`),
  `net/Protocol.ts` (snapshot binaire, `takeSnapshot` / `encodeSnapshot` / `decodeSnapshot`, `PROTOCOL_VERSION`), `net/Session.ts`, `net/LoopbackTransport.ts`, `net/Transport.ts`,
  `transport/NetlibTransport.ts`, `online.ts`.
- Côté simulation, ce qui conditionne la prédiction : `sim/Squad.ts` (`stepAnchor`, `update` : ancre, laisse, slots, loi de foule, états `isOut`), `sim/Sim.ts` (`step`, pause de choix `choiceT` /
  `choiceDelay`, `damage` / recul), `sim/Horde.ts` (ce qui pousse les soldats), `data/classes.ts` / `config.ts` (`CROWD`, `FREEZE`, `WEB`, `KNOCK_HOP`…).
- Vue : `view/WorldView.ts`, `view/UnitViews.ts` (`SoldierView.sync`), `view/Fx.ts` (ce qui consomme les événements réseau).

## Ce que je veux

1. **Un audit** : lis tout le netcode (pas seulement ce qui a été touché le 19/10) et cherche **bugs, conditions de course, incohérences hôte / client, cas limites et pistes d'amélioration**. Pense au moins à :
   - hôte : consommation des inputs (file, trous, gel / pause pendant lesquels les inputs sont consommés et jetés, relance de partie, joueur qui part / arrive en cours de partie, `INPUT_TIMEOUT`, validation des
     messages d'un client malveillant ou malformé) ; cadence et taille des snapshots (15 Hz, débit par client avec 4 joueurs et 150 aliens par joueur), snapshots perdus / en retard / dupliqués ;
   - client : tampon d'interpolation (`INTERP_DELAY_MS`, `playback`, resynchronisation, `MAX_BUFFER`), événements non fiables (perte = effet manquant ; état faux ?), cohérence entre `applyLocal` (immédiat)
     et `apply` (tamponné) pour des données de la même squad (xp, niveau, offres d'upgrade, `choiceT`…), reprise après la pause de choix (petit saut en avant connu), onglet en arrière-plan ;
   - prédiction : tout ce que l'hôte fait à l'ancre ou aux soldats que le client ne modélise pas (laisse de l'ancre, séparation entre soldats, poussée des aliens, recul, flaques, états spéciaux, obstacles et murs
     de rochers qui apparaissent / disparaissent) ; constantes `SNAP`, `BLEND`, `SOLDIER_*`, `CAPPED_FRACTION`… sont-elles cohérentes ? y a-t-il des oscillations ou des divergences lentes ?
   - interpolation des **autres** joueurs et des aliens (100 ms de retard + extrapolation) : quelle est la qualité réelle ? meilleure approche (tampon adaptatif, interpolation vraie, snapshot 30 Hz pour
     les squads…) ?
   - protocole : versionnage, champs conditionnels de l'encodeur binaire (piège documenté), débit, compatibilité hôte / client ;
   - équité : l'hôte joue sans latence, les invités avec RTT : y a-t-il des biais exploitables ou frustrants (ramassage de loot, tir, dégâts subis) ?
2. **Mesurer avant de corriger.** Les harnais existent (tous en Node, sans navigateur, depuis `games/xiao-swarm`) : `npm run sim:net` (cohérence hôte / client), `npm run sim:predict -- 4`
   (prédiction avec latence), `npm run sim:jitter -- 3 30 aliens 3` (corrections d'ancre sous gigue), `npm run sim:startstop -- 3 no 2` (profil de vitesse démarrage / arrêt, pause de choix, soldat isolé),
   et le test plus large `npm run typecheck` à la racine. **Limite connue : aucun script ne simule la perte de paquets ni le réordonnancement** (seulement latence fixe et gigue, `LoopbackHub.latency`). Ajoute-les
   (perte, réordonnancement, rafales, latence asymétrique) et écris les nouveaux scénarios que ton audit appelle (ex. : joueur qui rejoint en plein combat, relance, boss, squad à 40 soldats, 4 joueurs).
3. **Corrige** ce qui est sûr, en petits commits, chacun avec sa mesure avant / après dans le message ou la doc. Pour ce qui est risqué ou subjectif (ressenti), propose plutôt qu'imposer : liste les options,
   leur coût, et ce que tu mesures.
4. **Livrable** : un rapport (dans `docs/`, p. ex. `docs/AUDIT_NETCODE.md`) classant les trouvailles par gravité (bug confirmé / risque / amélioration), avec fichier:ligne, scénario de reproduction ou
   mesure, et correctif (fait ou proposé). Mets aussi à jour `docs/MULTIJOUEUR.md` et la ligne « Réseau » de `CLAUDE.md` pour tout ce que tu changes.

## Règles à respecter (extraits de `CLAUDE.md`)

- `sim/`, `data/`, `net/`, `config.ts` sont **purs** (pas de Phaser ni DOM, imports depuis `@xiao/engine/sim`) ; tout l'aléatoire de la sim passe par `sim.rng` ; la sim n'appelle jamais l'affichage.
- Toute nouvelle donnée visible chez un client passe par `Protocol.ts` (snapshot) ou un `SimEvent`, et `Mirror` ; **incrémente `PROTOCOL_VERSION`** si le format change. Un champ conditionnel de l'encodeur
  doit tester l'octet **écrit** (borné), pas la valeur brute.
- Lance `npm run typecheck` (racine) après chaque modification, et les harnais réseau concernés.
- **Ne déploie pas** (`npm run deploy`, FTP) et ne pousse rien sans que l'utilisateur le demande ; tu peux commiter. Ne touche pas aux fichiers non suivis (`DA/`, `docs/bench/runs/`).
- Les assets provisoires (placeholders) se notent dans `docs/ASSETS_PROCEDURAUX.md` (règle permanente de `CLAUDE.md`) : sans objet pour le netcode, sauf si tu ajoutes un visuel de debug.
- Le dev joue avec ses amis après chaque déploiement : ne casse pas la compatibilité de session en cours de route sans le dire (le protocole est strict : hôte et clients doivent avoir la même version).

## Contraintes de méthode

- Pas de refactor large « pour faire propre » : chaque changement doit être justifié par un bug, un risque ou un gain mesuré.
- Sépare clairement ce que tu as **vérifié** (code lu, test lancé, mesure) de ce que tu **supposes**.
- Si tu as besoin d'un test en réel (plusieurs navigateurs, vraie latence), dis précisément quoi tester et quoi observer plutôt que de conclure sans.
