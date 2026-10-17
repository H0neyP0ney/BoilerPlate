# Écrans d'interface : noms et enchaînement

Vocabulaire commun (à utiliser dans les discussions, le code et les commentaires). Chaque écran est une scène Phaser (`SCENES` de `config.ts`) ; les écrans d'entrée sont des **overlays** de `GameScene` (le monde reste affiché derrière, figé : `GameScene.titleOpen` / `inLobby`).

| Nom | Scène | Fichier | Contenu |
|---|---|---|---|
| **TitleScreen** (écran titre) | `Title` | `scenes/TitleScene.ts` | Deux gros boutons côte à côte : **Solo** (gauche) et **Multiplayer** (droite) ; au milieu de la hauteur, **Armory** (gauche) et **Skins** (droite), sans icône (même chose sur la SoloScreen et la MultiplayerScreen) ; leur Back revient à l'écran d'où l'on vient (`registry.menuFrom`). |
| **SoloScreen** (écran Solo) | `SoloSetup` | `scenes/SoloScene.ts` | Trois boutons de difficulté (la dernière difficulté choisie est présélectionnée, `settings.difficulty`) et un gros bouton **Play** en bas ; Back → TitleScreen ; **Armory** et **Skins** de chaque côté, comme sur l'écran titre. |
| **MultiplayerScreen** (menu multijoueur) | `Multiplayer` | `scenes/MultiplayerScene.ts` | Simplifié le 17/10 : Quick Play (gros), au-dessus Create game (crée une partie publique et ouvre la LobbyScreen) et Join game (ouvre la JoinScreen) ; Back → TitleScreen. |
| **JoinScreen** (rejoindre une partie) | `JoinGame` | `scenes/JoinScene.ts` | Liste des parties publiques (8 visibles, défilement), champ du code de salle et bouton Join en dessous, messages d'erreur au-dessus de Back ; Back → MultiplayerScreen. |
| **LobbyScreen** (salle d'attente) | `Lobby` | `scenes/LobbyScene.ts` | Tableau des joueurs : en-tête « Public game: » (ou « Private game: ») suivi du code de la salle en jaune et de l'effectif « Players 1/4 » à droite ; pied : boutons Copy code / Invite link (cadre blanc comme Refresh) à gauche et case « Private » à droite (l'hôte la coche / décoche : `HostSession.setPublic` → `Transport.setPublic` → `setLobbySettings` de Netlib, possible après la création) ; hôte : bots, difficulté, Play. Revient aussi après chaque partie en ligne. |
| **GameHud** (HUD de jeu) | `Hud` | `scenes/HudScene.ts` | Timeline, barre d'XP, boutons, indice des commandes (`hint`). |
| **PauseScreen** | `Pause` | `scenes/PauseScene.ts` | Solo : Resume / **Restart** (relance directe de la run) / Options / **Quit** (→ SoloScreen), le jeu est en pause. **En ligne** : titre « Menu », Resume / Options / **Quit** (pas de Replay), le jeu **continue** derrière (squad sans ordre) ; Quit : l'hôte ramène tout le monde à la LobbyScreen, un joueur quitte la salle et arrive sur la MultiplayerScreen. ESC / P ouvrent et ferment le menu. |
| **OptionsScreen** | `Options` | `scenes/OptionsScene.ts` | Volumes, hotkeys, langue. |
| **LevelUpScreen** (choix d'upgrade) | `LevelUp` | `scenes/LevelUpScene.ts` | Cartes d'upgrade. |
| **GameOverScreen** (fin de partie solo) | `GameOver` | `scenes/GameOverScene.ts` | Revive, Rejouer (direct, sans TitleScreen). |
| **EndingScreen** (fin du solo) | `Ending` | `scenes/EndingScene.ts` | Fusée, « Congratulations! ». |

## Enchaînement
- **FTUE** (première partie : tutoriel actif) : arrivée **directement** sur la scène de jeu, indice des commandes affiché. Pas d'écran titre.
- **Hors FTUE** : TitleScreen → **Solo** → SoloScreen → **Play** → jeu (indice des commandes visible ; la partie démarre au premier input) ; ou TitleScreen → **Multiplayer** → MultiplayerScreen → LobbyScreen → jeu.
- Pas d'indice des commandes, pas de pause et pas de déplacement tant qu'un écran d'entrée est ouvert.
- « Quit » du menu pause ramène au **SoloScreen** (`registry 'openScreen'`), la fin du solo au TitleScreen ; « Restart » du menu pause et « Rejouer » de GameOverScreen relancent directement (`registry 'skipTitle'`).
- **Noms affichés des niveaux** : Normal / **Hard** / **Expert** (ids internes `normal` / `expert` / `impossible` : le « Hard » affiché est l'id `expert`, le « Expert » affiché est l'id `impossible` ; seuls les libellés `difficulty*` de `locales/*.json` ont changé).
- **Difficultés à débloquer** (`settings.unlocked`, mémorisé) : Normal dès le départ ; finir Normal (boss final tué, solo ou en ligne) débloque Expert, finir Expert débloque Impossible. Un niveau verrouillé est grisé avec un cadenas (SoloScreen, LobbyScreen) ; `?unlockall=1` les débloque tous pour tester.
- Les URL de test (`?jump=`, `?endtest=1`, `?net=…`, tests d'alien) n'affichent pas d'écran titre.

## Détails ajoutés le 17/10
- **Bouton en haut à droite** : bouton pause en jeu ; sur les écrans titre, une roue crantée à la même place ouvre l'écran Options (qui passe par-dessus tout, y compris le HUD).
- **LobbyScreen (17/10)** : bloc du bas aux mêmes positions que SoloScreen (Play, Back dessous, difficulté au-dessus), le tableau se cale juste au-dessus et est **opaque** ; en-tête « Public game: » + code **en jaune** ; pièces d'or, diamants et roue crantée du HUD restent affichés. **En jeu en ligne**, les infos de la room sont en **bas à gauche sur 2 lignes** (« Room CODE » puis « n player(s) » ; la difficulté est déjà en bas à droite). Les joueurs qui rejoignent apparaissent **au-dessus de l'hôte** (1er en haut à droite, 2e en haut à gauche, 3e plus haut…, `Sim.placeBeside`), aussi au retour au lobby.
- **Back** : bouton rectangulaire sous Play sur le SoloScreen, tout en bas sur le MultiplayerScreen et le LobbyScreen (même largeur que la colonne de 420 px).
- **Confirmations** : Restart et Quit du menu pause demandent « Yes / No » (texte propre à l'hôte, au joueur et au solo).
- **Écran de fin** : « Game over », temps de survie, tableau joueurs / aliens tués / dégâts (en k) avec barres de part (bleu clair, orange) ; « Play again » ramène au SoloScreen.
- **Compteurs du bas à droite** (niveau, aliens, FPS) et indice des commandes : cachés sur les écrans titre, la salle d'attente et pendant la pause / les Options.
