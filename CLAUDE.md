# CLAUDE.md

Monorepo de jeux web pour Poki (Phaser 4 + TypeScript + Vite, npm workspaces). L'utilisateur parle français :
répondre, commenter et documenter en français.

- `packages/engine` (`@xiao/engine`) : briques réutilisables. N'importe jamais un jeu.
- `games/xiao-swarm` : jeu en cours. `games/_starter` : boilerplate minimal des futurs jeux.
- État et prochaines étapes : `docs/ROADMAP.md`. Game design : `docs/Xiao_Swarm_Attack_Game_Design.md`. Outils de dev : `docs/OUTILS_DEV.md`.

## Commandes
- `npm run dev` (Xiao Swarm, port 5173), `npm run dev:starter`
- `npm run typecheck` — tout le monorepo + pureté des simulations. À lancer après chaque modification.
- `npm run sim:headless -- royale 9 300` — simulation dans Node (sans navigateur)
- `npm run sim:net` — test réseau hôte + client sans navigateur. En ligne : `?net=host`, `?net=join&room=CODE`, `?net=auto` (voir `docs/MULTIJOUEUR.md`)
- `npm run zip` — build + zip Poki
- `node tools/slice-sheet.mjs games/xiao-swarm/art-src/<nom>.slice.json` — découpe une planche de sprites

Outils de dev (détail : `docs/OUTILS_DEV.md`). Visionneuses (boutons en haut à gauche du jeu, ou `?viewer` / `?particles` / `?obstacles` / `?misc`) : **unités**
(animations, ancrage par séquence / direction, bouche du canon par frame), **particules** (`fxParams.ts`), **obstacles**
(hitbox en cercles, jeu de taches, taille : `data/obstacles.ts`) et **divers** (projectiles, bonus, interface, terrain).
Une croix en haut à droite du panneau de chaque vue ramène au jeu ; pour changer de vue, repasser par le jeu (boutons du HUD).
Elles mémorisent leurs réglages dans le navigateur et « Copier le code » donne quoi coller dans les fichiers de données.

Test en navigateur : `?mode=royale&bots=9`, `?lang=en` ; en dev `window.__game`, le **menu Réglages** (touche `²`/F2 ou
bouton à curseurs en haut à gauche du HUD : zoom du jeu, réglages visuels, stats) et deux panneaux dédiés ouverts par des boutons du HUD (ces trois menus s'ouvrent toujours à gauche, côte à côte dans l'ordre d'ouverture) :
**Foule** (sliders du mouvement de foule `CROWD` dans `config.ts`, mémorisés dans le navigateur ; **F8 / F9** = sauvegarder /
charger une config de travail) et **Triche** (ajouter / retirer des soldats par classe, faire apparaître ou tuer des aliens,
recrues, vagues, vitesse du jeu, invincibilité ; hors ligne seulement). `npm run sim:crowd` mesure la réactivité,
`npm run sim:recruit` où une recrue s'insère dans la formation.

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
Chaque visuel a un id (`soldier_gunner`, `alien_crab`…) résolu par le catalogue `sprites` : planche déclarée dans
`games/xiao-swarm/src/assets/manifest.ts`, sinon dessin procédural (`src/art/`). Conventions et ids :
`games/xiao-swarm/ASSETS.md`. Planches sources dans `art-src/` (non livrées).

## Poki
**Pubs désactivées pour le moment** (`ADS_ENABLED = false` dans `packages/engine/src/poki/poki.ts`) : aucune pub n'est demandée,
le revive « rewarded » est gratuit. À réactiver avant la soumission ; les règles ci-dessous valent alors.
Pas de requête externe hors SDK, pas d'écran titre, `gameplayStart` au premier input, pas de timer de pub maison,
bouton rewarded jamais vert et jamais plus gros que l'option standard, jouable en incognito et avec adblock.
