# Xiao Games — monorepo Poki (Phaser 4 + TypeScript + Vite)

```
packages/engine/     @xiao/engine : briques réutilisables (ne dépend d'aucun jeu)
games/_starter/      boilerplate minimal branché sur l'engine → base des futurs jeux
games/xiao-swarm/    Xiao Swarm Attack (premier jeu)
docs/                game design, référence DA, ROADMAP.md (état + prochaines étapes)
scripts/zip.mjs      zip du build pour Poki + contrôle des budgets de taille
tools/slice-sheet.mjs  découpe une planche de sprites "de présentation" en planche de jeu (voir games/xiao-swarm/ASSETS.md)
```

## Commandes

Sous Windows PowerShell, utiliser `npm.cmd` si `npm` est bloqué par la politique d'exécution.

```bash
npm install
npm run dev             # Xiao Swarm → http://localhost:5173
npm run dev:starter     # boilerplate
npm run typecheck       # tout le monorepo + pureté des simulations
npm run zip             # build + zip Xiao Swarm pour Poki
npm run sim:headless -- royale 9 300   # simule une partie dans Node (sans navigateur)
```

Paramètres d'URL de test : `?lang=en`, `?mode=royale&bots=9`.
Debug (dev) : touche `²` / `F2` → FPS + stats + triches (`K` tuer les aliens, `R` recrue, `T` +30 s, `B` crabe).

## Architecture (pensée pour le multijoueur)

```
             inputs {mx,my} par joueur                 événements (tir, mort, recrue…)
 MoveInput ──────────────┐                    ┌──────────────────────▶ WorldView → effets / sons
 Bot / réseau ───────────┤                    │
                         ▼                    │
                 Session.advance()  ──▶  Sim.step(dt, inputs)  @30 Hz (FixedStep)
                 (Local / Host / Client)      │
                                              └── état (entités à id) ──▶ WorldView interpole (alpha)
```

- **`src/sim/` est pur** : aucun import Phaser ni DOM (vérifié par `tsconfig.sim.json`). La même simulation
  tourne en solo, chez un hôte Netlib, ou sur un serveur Node (`npm run sim:headless` le prouve).
- **Pas de temps fixe** (30 Hz) + interpolation à l'affichage.
- **Tout l'aléatoire de la simulation passe par `sim.rng` (seedé)**. Jamais `Math.random` dans `sim/`.
- **Plusieurs squads** (une par joueur), stats par joueur, PvP activable par mode, kills attribués.
- **Modes et cartes en données** (`data/modes.ts`, `data/maps.ts`) : `survival` (arène compacte) et
  `royale` (carte 4800², départs dans les coins, PvP). Le sol est découpé en morceaux chargés autour de la caméra.
- **Sessions** (`net/Session.ts`) : `LocalSession` implémentée ; `HostSession` / `ClientSession` à venir.

### Règles pour garder le code réutilisable et réseau-compatible
1. L'engine n'importe jamais un jeu. La simulation d'un jeu n'importe que `@xiao/engine/sim`.
2. La simulation n'appelle jamais l'affichage : elle modifie son état et émet des événements.
3. L'affichage ne modifie jamais la simulation : il lit, interpole, et joue des effets.
4. Tout ce qui vient d'un joueur passe par `PlayerInput`.
5. Contenu = données (`data/`), logique = systèmes génériques.

## Engine (`@xiao/engine`)

| Module | Rôle |
|---|---|
| `poki`, `RunFlow`, `bootPokiGame` | SDK Poki sûr, cycle de vie d'une partie (gameplayStart/Stop, pubs, revive), démarrage responsive |
| `storage`, `i18n`, `device`, `log` | localStorage sûr (incognito), traductions, détection tactile, logs dev |
| `MoveInput`, `VirtualJoystick`, `Button`, `theme` | input unifié clavier/joystick, UI conforme Poki (bouton rewarded) |
| `sim/` : `FixedStep`, `EventQueue`, `IdGen`, `SpatialHash`, `Rng`, `geometry`, `WaveDirector`, `Stats`, `Pool` | briques de simulation sans Phaser |
| `sprites`, `loadAssets` / `applyAssets` | catalogue de visuels (planche en grille, Aseprite, atlas, PNG) avec animations directionnelles et repli procédural |
| `canvasTexture`, `DebugOverlay` | art procédural, panneau de debug |

## Visuels & planches de sprites
Chaque visuel a un id logique (`soldier_gunner`, `alien_crab`…). Une planche déclarée dans
`games/xiao-swarm/src/assets/manifest.ts` le remplace ; sinon le dessin procédural (`src/art/`) est utilisé.
Les planches "de présentation" (image générée, étiquettes) se découpent avec `tools/slice-sheet.mjs`.
Guide complet, ids et conventions : [games/xiao-swarm/ASSETS.md](games/xiao-swarm/ASSETS.md).

## Checklist Poki
Voir `docs/` et la doc Poki. Points clés : < 5 Mo au démarrage, aucune requête externe (sauf SDK),
desktop + mobile + tablette, Échap = pause, pas de chat / login, bouton rewarded jamais vert et jamais
plus gros que l'option standard, pas de timer de pub maison. Tester sur le [Poki Inspector](https://inspector.poki.dev/).

## Multijoueur : prochaines étapes
- `HostSession` (Netlib P2P, 2–4 joueurs) puis serveur Node autoritaire pour le battle royale à ~10.
- Snapshots delta + interest management (grille spatiale), prédiction de l'ancre locale, interpolation des autres.
- Zone qui rétrécit (battle royale), liste de salons (`network.list`), matchmaking.
