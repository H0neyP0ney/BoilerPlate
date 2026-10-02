# CLAUDE.md

Monorepo de jeux web pour Poki (Phaser 4 + TypeScript + Vite, npm workspaces). L'utilisateur parle français :
répondre, commenter et documenter en français.

- `packages/engine` (`@xiao/engine`) : briques réutilisables. N'importe jamais un jeu.
- `games/xiao-swarm` : jeu en cours. `games/_starter` : boilerplate minimal des futurs jeux.
- **But final : un boilerplate pour produire d'autres jeux facilement.** Tout code générique (outils de dev, vagues, XP / upgrades, collisions…) va dans `packages/engine` et `_starter`, pas dans `games/xiao-swarm` (voir `docs/ROADMAP.md` § À faire 0).
- État et prochaines étapes : `docs/ROADMAP.md`. Game design : `docs/Xiao_Swarm_Attack_Game_Design.md`. Outils de dev : `docs/OUTILS_DEV.md`.

## Commandes
- `npm run dev` (Xiao Swarm, port 5173), `npm run dev:starter`
- `npm run typecheck` — tout le monorepo + pureté des simulations. À lancer après chaque modification.
- `npm run sim:headless -- royale 9 300` — simulation dans Node (sans navigateur)
- `npm run sim:net` — test réseau hôte + client sans navigateur. En ligne : `?net=host`, `?net=join&room=CODE`, `?net=auto` (voir `docs/MULTIJOUEUR.md`)
- `npm run sim:predict -- 4` — prédiction de la squad locale d'un client avec latence simulée (4 ticks par sens).
- `npm run sim:net` couvre aussi le coop (friendly fire, difficulté ×2, XP partagée et pause de choix d'upgrade, spectateur, relance).
- `npm run zip` — build + zip Poki
- `deploy.bat` (racine) — double-clic : lance `npm run deploy` (vérifie `.env.deploy`) ; accepte `--bump` / `--force`
- `npm run deploy` — build + upload FTP vers `REMOTE_DIR/<version>/` (identifiants dans `.env.deploy`, modèle `.env.deploy.example`) ; `-- --bump` incrémente la version, `-- --force` écrase
- `node tools/slice-sheet.mjs games/xiao-swarm/art-src/<nom>.slice.json` — découpe une planche de sprites

**Son dans le HUD** (haut gauche, `scenes/HudScene.ts`) : haut-parleur (bruitages) et note (musique) côte à côte, chacun ouvre sous lui une réglette **verticale** à 10 crans (icône barrée à 0) ; compteur de FPS en bas à droite. Menu **Options** (écran Pause, `scenes/OptionsScene.ts`, plus de roue crantée dans le HUD) : mêmes volumes (`settings.ts`, lecture via `music` de l'engine) et, en dev, **mode debug** qui affiche les boutons des outils de dev en haut à gauche. Les réglages (musique, bruitages, zoom, FPS, fond étoilé, debug) sont mémorisés d'une session à l'autre (`localStorage`, préfixe `xiao-swarm:` posé en tête de `settings.ts`). Par défaut : musique à 2/10 (20 %) ; en dev, mode debug activé.
Outils de dev (détail : `docs/OUTILS_DEV.md`). Visionneuses (boutons **en bas à gauche** du jeu en mode debug, contour **vert** pour ceux qui ouvrent une vue plein écran, ou `?viewer` / `?particles` / `?obstacles` / `?misc` / `?bonus` / `?upgrades` / `?waves` / `?mapedit`) : **unités**
(animations, ancrage par séquence / direction, bouche du canon par frame), **particules** (`fxParams.ts`), **obstacles**
(hitbox en cercles, jeu de taches, taille : `data/obstacles.ts`) **vagues** (Gestionnaire de vagues : 9 niveaux de configurations tirées au hasard + timeline : `data/waves.ts`) **divers** (projectiles, bonus, interface, terrain) et **carte** (zones d'obstacles de l'arène solo / coop : `data/mapZones.ts`, un obstacle tiré au hasard par zone à chaque partie avec la seed, donc identique chez tous les joueurs).
Une croix en haut à droite du panneau de chaque vue ramène au jeu ; pour changer de vue, repasser par le jeu (boutons du HUD).
**Convention de toute vue avec des valeurs réglables : boutons Save et Reset.** Save écrit les valeurs comme valeurs par défaut dans le code
(plugin Vite `games/xiao-swarm/dev-save.ts` : `config.ts`, `fxParams.ts`, `assets/manifest.ts`, `data/obstacles.ts`, `data/waves.ts`, `data/mapZones.ts`) ; Reset revient à la dernière
sauvegarde. Toute nouvelle vue de réglage doit suivre cette règle. Elles mémorisent aussi leurs réglages dans le navigateur (localStorage) : après
une modification du code par défaut, faire Reset pour les voir.

Test en navigateur : `?mode=royale&bots=9` ; en dev `window.__game`, le **menu Réglages** (touche `²`/F2 ou
bouton à curseurs en haut à gauche du HUD : zoom du jeu, réglages visuels, stats) et deux panneaux dédiés ouverts par des boutons du HUD (ces trois menus s'ouvrent toujours à gauche, côte à côte dans l'ordre d'ouverture) :
**Foule** (sliders du mouvement de foule `CROWD` dans `config.ts`, mémorisés dans le navigateur ; **F8 / F9** = sauvegarder /
charger une config de travail) et **Triche** (ajouter / retirer des soldats par classe, faire apparaître ou tuer des aliens,
recrues, vagues, vitesse du jeu, invincibilité ; hors ligne seulement). `npm run sim:crowd` mesure la réactivité,
`npm run sim:recruit` où une recrue s'insère dans la formation.

## Jeu : structure actuelle
- Carte solo / coop : `makeJungleMap(seed)` (`data/maps.ts`) tire les obstacles dans les zones de `data/mapZones.ts` (éditeur : vue Carte). Modes (`data/modes.ts`) : `survival` (solo, 10 min, boss final obligatoire), `royale` (bots), `versus` (PvP), **`coop`** (multijoueur par défaut : pas de tir ami, difficulté dynamique, spectateur, relance).
- Vagues : `data/waves.ts` (niveaux 1-9 → configurations tirées au hasard, timeline, boss via `config` forcée), exécutées par `sim/WaveRunner.ts`.
- Progression : à chaque niveau, le jeu se met en PAUSE pour tous les joueurs (`Sim.choiceT`, passé dans le snapshot). En ligne, 5 s (`UPGRADE_CHOICE_TIME`, option `choiceTimeout` de la Sim) puis choix au hasard ; en solo, pas de limite. En coop, une seule barre d'XP pour tous (seuil × nombre de joueurs).
- Ennemis : `data/aliens.ts` (capacités en données : `lob`, `tongue`, `rush`, `leap`, `spray`, `deathBlast`, `revive`, `capture`, `trail`, `wall`, `lurk`, `dash`, `boss`). XP / upgrades : `data/progression.ts`, `sim/Xp.ts`.
- Difficulté globale : `DIFFICULTY` dans `config.ts` ; power-ups : `sim/PowerUps.ts` ; zones de réanimation (coop) : `Sim.reviveZones`. Les cailloux (éléments des murs du `thrower`, télégraphe jaune dans `Sim.walls`), flaques, power-ups et zones passent par le **snapshot** (pas seulement des événements, qui sont non fiables).
- Réseau : toute nouvelle donnée visible chez un client doit passer par `net/Protocol.ts` (snapshot) ou un `SimEvent`, et `Mirror` ; incrémenter `PROTOCOL_VERSION` si le format change. Un champ conditionnel de l'encodeur binaire doit tester l'octet **écrit** (borné), pas la valeur brute : sinon le décodeur se décale et tout le snapshot est faux (voir `docs/MULTIJOUEUR.md` § Pièges). La squad locale d'un client est prédite (`net/Prediction.ts`).

## Règles d'architecture (multijoueur battle royale ~10 joueurs prévu)
1. `games/*/src/sim/`, `data/`, `net/`, `config.ts` sont **purs** : pas de Phaser ni DOM, imports depuis
   `@xiao/engine/sim` uniquement (vérifié par `tsconfig.sim.json`).
2. Tout l'aléatoire de la simulation passe par `sim.rng` (seedé). Jamais `Math.random` dans `sim/`.
3. La simulation émet des `SimEvent` et ne touche jamais l'affichage ; `view/` lit l'état, interpole, joue les effets.
4. Toute action d'un joueur passe par `PlayerInput` ; une `Session` fait avancer la simulation (pas fixe 30 Hz).
5. Contenu = données (`data/`), logique = systèmes génériques. Code générique → engine.
6. `data/obstacles.ts` (visuel + hitbox + taches) est pur et partagé sim / affichage ; `fxParams.ts`, `settings.ts`, `debug*.ts`, `dev/` et les visionneuses sont côté affichage / dev.
7. Un champ ajouté à un objet recyclé par `Pool` (ex. `Projectile`) doit être remis à zéro à la libération.

## Visuels
Chaque visuel a un id (`soldier_trooper`, `alien_boss_crab`…) résolu par le catalogue `sprites` : planche déclarée dans
`games/xiao-swarm/src/assets/manifest.ts`, sinon dessin procédural (`src/art/`). Conventions et ids :
`games/xiao-swarm/ASSETS.md`. Planches sources dans `art-src/` (non livrées).

## Poki
**Pubs désactivées pour le moment** (`ADS_ENABLED = false` dans `packages/engine/src/poki/poki.ts`) : aucune pub n'est demandée,
le revive « rewarded » est gratuit. À réactiver avant la soumission ; les règles ci-dessous valent alors.
Événements SDK obligatoires (https://developers.poki.com/guide/requirements-quality), tous passent par `RunFlow` / `poki` (le moteur filtre les doublons et les appels pendant une pub) :
- `gameLoadingFinished()` : une fois, quand les assets essentiels sont chargés (`BootScene`).
- `gameplayStart()` : au **premier input du joueur** (jamais au chargement), puis à chaque retour en jeu (sortie de pause, fin du choix d'upgrade, relance).
- `gameplayStop()` : à **toute interruption** : pause, menu Options, mort, fin de partie (y compris l'écran de fin coop `gameEnd`), connexion perdue. Jamais deux de suite, jamais pendant une pub. **Le choix d'upgrade n'est PAS une interruption** : c'est du gameplay, pas de `gameplayStop`.
- `commercialBreak()` : uniquement en **sortant d'une pause** vers le jeu, ou entre deux parties (retry, relance coop) ; jamais pendant une pub. Pas de timer de pub maison.
- `rewardedBreak()` : uniquement sur choix explicite du joueur (revive solo).
- Non obligatoires mais utiles : `poki.measure(...)` (déjà envoyé : run start / fail / complete, revive, recrues).
En ligne la partie ne se met jamais en pause (l'hôte gèlerait tout le monde) : seuls l'écran de fin et la perte de connexion émettent `gameplayStop`. Le menu Options en ligne n'arrête pas le jeu, donc pas de `gameplayStop`.
Pas de requête externe hors SDK, pas d'écran titre, `gameplayStart` au premier input, pas de timer de pub maison,
bouton rewarded jamais vert et jamais plus gros que l'option standard, jouable en incognito et avec adblock.
