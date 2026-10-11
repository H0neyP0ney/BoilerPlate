# À réappliquer — travail fait après le commit `8cb0f16`

> **Mise à jour** : les chantiers **A** (Gunner seul), **B** (sprites Gunner), **C** (sol), **D** (obstacles : voir la remarque) et **F** (eau + slime seul)
> ont été **réappliqués** (non commités), puis **E** (menu debug de foule, défauts plus réactifs, bouton engrenage dans le HUD, config de travail F8 / F9).
> Il ne reste à récupérer que **G** (hitboxes, pas de moi). Le stash `stash@{0}` est toujours là.
> Remarque D : au moment du stash, `data/maps.ts` avait été modifié après ma version — **seuls des rochers font obstacle** (11 rochers, ni étangs ni troncs) ;
> c'est cet état qui est revenu.

Le dépôt a été remis **exactement au commit `8cb0f16`** (« Multijoueur P2P PvPvE (Netlib) + HUD minimal + scripts »).
Tout ce qui suit a été mis de côté, rien n'est perdu. Ce dossier n'est pas commité (à supprimer quand tu n'en as plus besoin).

## Où est le code

| Quoi | Où |
|---|---|
| **Tout** (fichiers modifiés + nouveaux + images) | `git stash list` → `stash@{0}` « travail apres multijoueur… » |
| Restaurer tout | `git stash pop` (ou `git stash apply` pour le garder) |
| Un fichier suivi | `git checkout stash@{0} -- chemin/du/fichier` |
| Un fichier NOUVEAU (non suivi) ou une image | `git checkout stash@{0}^3 -- chemin/du/fichier` |
| Voir le contenu du stash | `git stash show -p stash@{0}` (suivis) / `git ls-tree -r --name-only stash@{0}^3` (nouveaux) |
| Patch des fichiers modifiés (sans images) | [fichiers-modifies.patch](fichiers-modifies.patch) — `git apply --3way docs/a-reappliquer/fichiers-modifies.patch` |
| Copies des nouveaux fichiers de code | [nouveaux-fichiers/](nouveaux-fichiers/) (mêmes chemins que dans le dépôt) |

Les **images** ne sont que dans le stash (`stash@{0}^3`) : `art-src/ground.png`, `gunner_idle|walk|death.png`,
`sprite--9px-frames-16-rows-4-cols-4 (1).png` (slime, 8,8 Mo), et les assets générés `public/assets/ground/ground.webp`,
`public/assets/aliens/slime.png`. `public/assets/soldiers/gunner.png` (planche assemblée) est dans le patch en tant que fichier suivi modifié (binaire : passer par `git checkout stash@{0} -- …`).

> Ordre conseillé si tu réappliques plusieurs chantiers : A → B → C → D → E → F (ils se recouvrent sur `manifest.ts`, `ArenaView.ts`, `GameScene.ts`, `modes.ts`).

---

## A. Une seule classe : le Gunner
- `src/data/classes.ts` : `ACTIVE_CLASSES = ['gunner']` ; `START_SQUADS` = un seul tirage `['gunner' ×4]`. Les autres classes restent définies (données, textures, réseau).
- `src/sim/Recruits.ts` : `chooseClass` tire parmi `ACTIVE_CLASSES` (avant : toutes les clés de `TARGET_MIX`, ce qui laissait passer les autres avec le `+0.04` de base).
- `src/scenes/GameScene.ts` : la triche `R` (drop recruit) tire dans `ACTIVE_CLASSES`.
- `scripts/net-headless.mjs` : la vérif « le client reçoit les événements » attend `hit` au lieu de `beam` (le beam = Sniper) ; la réapparition accepte `size >= 4` (une recrue peut être ramassée avant le comptage).
- Effet de jeu : plus de Medic, donc plus de soin à l'arrêt.

## B. Sprites du Gunner (tes 3 planches idle / walk / death)
- **Nouvel outil** `tools/pack-grids.mjs` : assemble plusieurs planches en GRILLE en une seule (un sprite du catalogue n'a qu'une texture) ; pieds alignés d'une planche à l'autre ; réduction par moyenne pondérée. Config : `art-src/gunner.pack.json` (`scale: 0.6`, 3 planches 4×4). Commande : `node tools/pack-grids.mjs games/xiao-swarm/art-src/gunner.pack.json`.
- Résultat : `public/assets/soldiers/gunner.png` = 48 cases de **64×74** (idle 0-15, walk 16-31, death 32-47), + `gunner.json` (ancrage).
- `src/assets/manifest.ts` : entrée `soldier_gunner` — `originX 0.402`, `originY 0.894`, `scale 1`, anims `idle` (0-15, 8 fps), `walk` (16-31, 16 fps), `die` (32-47, 12 fps, `repeat: 0`) ; `gun_gunner: { hidden: true }` ; plus de `portrait_gunner` (HUD retiré).
- Supprimés : `art-src/gunner.slice.json` (pointait vers `gunner_sheet.png` que tu avais retiré) et `art-src/gunner_sheet.png`. L'outil `tools/slice-sheet.mjs` reste.
- Pas d'animation de tir : le Gunner reste en idle / walk en tirant ; l'arme est dans le dessin.
- `ASSETS.md` : section « Planches déjà en grille ».

## C. Sol = ta texture répétée
- `art-src/ground.png` (1254 px, tileable) → `public/assets/ground/ground.webp` **1024 px, 217 Ko** (réduction qui respecte le raccord : tuile 3×3 → réduction → recadrage du centre, avec Pillow, WebP qualité 90).
- `manifest.ts` : `{ type: 'image', id: 'ground_tile', url: 'ground/ground.webp' }`.
- `src/view/ArenaView.ts` : un seul `TileSprite` (`GROUND_TEXTURE = 'ground_tile'`, `GROUND_SCALE = 0.73`) ; `update()` ne fait plus rien pour le sol ; **repli** sur l'ancien sol procédural découpé en morceaux si la texture manque.

## D. Suppression des obstacles
- `src/data/maps.ts` : `JUNGLE_ARENA` avec `ponds: [] / rocks: [] / logs: []` ; `makeRoyaleMap(seed, size = 4800)` réduit à une carte vide (`border: 220`) ; import `Rng` retiré. Les tableaux et la collision restent dans `MapDef` / `Arena`.
- `ArenaView.ts` : buissons fleuris de l'arène retirés.

## E. Menu debug + mouvement de foule plus réactif
- `src/config.ts` : `SQUAD` ne garde que `startSize` / `baseMaxSize` ; nouveaux `CROWD_DEFAULTS` / `CROWD` (objet mutable) / type `CrowdKey` : `speed 210`, `spacing 50`, `leash 70`, `leashPerRoot 6`, `gainMin`, `gainSpread`, `velDamp`, `maxSpeedMul`, `separation 0.5`, `knockDamp 5`, `stillDelay 0.5`.
- **Nouveaux défauts « réactifs »** : `gainMin 8` (avant 4), `gainSpread 3` (2), `velDamp 18` (10), `maxSpeedMul 1.8` (1.6). Mesuré (`crowd-headless`) : 90 % de la vitesse en **0,23 s** (avant 0,43), reformation à l'arrêt **0,23 s** (avant 0,5), étirement en marche 18 px (43). « Très réactif » (12 / 4 / 26 / 2.2) = 10 px mais trop rigide.
- `src/sim/Squad.ts` : lit `CROWD` partout (vitesse, laisse `leash + √n × leashPerRoot`, gain par soldat `gainMin + s.gain × gainSpread`, `damp` de vitesse, vitesse max, séparation, amorti du knockback, espacement/rayon, délai de soin) ; recalcul des slots si l'espacement change (`slotSpacing`).
- `src/sim/entities.ts` : `SoldierState.gain` = aléa 0→1 (avant : 4 + aléa×2 directement). `Squad.add` : `gain: rng.next()` (même consommation de rng). `src/net/Mirror.ts` : `CROWD.stillDelay`.
- `packages/engine/src/debug/DebugOverlay.ts` : nouveaux `slider()`, `button()`, `section()`, `syncSliders()` (panneau DOM à droite, affiché avec la touche `²` / F2 ; le focus est rendu au jeu après chaque réglage pour que les flèches déplacent la squad).
- **Nouveau** `src/debugCrowd.ts` : 11 sliders (plages dans `SPECS`), mémorisation dans `localStorage['xiao-debug-crowd']`, boutons « Réinitialiser » et « Copier (JSON) ». `GameScene` : `loadSavedCrowd()` avant la création de la session, `addCrowdMenu(this.debug)` dans `setupDebug`.
- **Nouveau** `scripts/crowd-headless.mjs` + script npm `sim:crowd` (`games/xiao-swarm/package.json`) ; ligne ajoutée dans `CLAUDE.md`.

## F. Eau autour de la carte + un seul ennemi (le slime)
**Eau**
- `src/art/environment.ts` : texture procédurale `water` (128 px tileable, vaguelettes claires/sombres, dessinées aussi de l'autre côté du bord), créée dans `makeEnvironmentTextures`.
- `ArenaView.ts` : `TileSprite` d'eau sur toute la carte (profondeur `ground − 1`, défile via `setTilePosition(t×0.012, t×0.006)`), sol seulement sur la zone jouable (bords = `Arena.bounds` = `map.border`), frange d'écume (`strokeRect` blanc 5 px + halo 16 px). Bordure de palmiers/buissons **seulement** dans le repli procédural.
**Slime**
- `src/data/aliens.ts` : `WAVES` renommé `WAVE_SCRIPT` ; `ACTIVE_ALIENS = ['slime']` ; `onlyActive(waves)` ; `WAVES = onlyActive(WAVE_SCRIPT)`. Les autres aliens restent définis.
- `src/data/modes.ts` : `VERSUS_WAVES = onlyActive([...WAVE_SCRIPT (to 300 → 36000), crabe /60 s])` ; import `onlyActive, WAVE_SCRIPT`.
- `GameScene.ts` : triche `B` = « spawn 5 aliens » (`ACTIVE_ALIENS[0]`).
- Sprite : `art-src/sprite--9px-frames-16-rows-4-cols-4 (1).png` (4096², 4×4, cycle de marche, regarde à GAUCHE) → `art-src/slime.pack.json` (`scale: 0.0625`) → `public/assets/aliens/slime.png` (16 cases **64×64**, 89 Ko) + `slime.json`. `manifest.ts` : `alien_slime` — `originX 0.516`, `originY 0.948`, `scale 0.9`, `facesLeft: true`, `idle` et `walk` = frames 0-15 (5 et 12 fps).
- Effet de jeu : ~24 slimes simultanés sur 60 s en solo (pression plus faible qu'avec les 5 types).

## G. Pas écrit par moi (apparu pendant la session)
- `src/view/DebugHitboxes.ts` (nouveau) : hitboxes de debug (obstacles, unités, ancre, slots, projectiles), touche `H` ou bouton du menu, mémorisé dans `localStorage['xiao-debug-hitboxes']`.
- Dans `DebugOverlay.ts` : méthode `toggle(label, { get, set })` ; dans `CLAUDE.md` : la phrase sur les hitboxes ; branchements probables dans `GameScene.ts`.
- Ils sont dans le stash / le patch avec le reste. À relire avant de réappliquer si tu ne t'en souviens pas.

## H. Docs touchées
- `CLAUDE.md` : phrase sur les sliders de foule / `sim:crowd` / hitboxes.
- `games/xiao-swarm/ASSETS.md` : planches en grille, slime, ennemis actifs, sol en texture répétée, eau, obstacles vides.

---

## Ce qui n'a PAS été touché depuis le commit
Le multijoueur (Netlib, `HostSession` / `ClientSession` / `Mirror` / `Protocol`), la réapparition automatique, le HUD réduit, `build-poki.sh` / `.bat`, `start-game.bat`, `launch.json` : tout cela est déjà dans `8cb0f16`.

## Vérifications faites avant le revert (tout passait)
`npm run typecheck`, `npm run sim:net` (16 vérifs hôte + client), `npm run sim:headless`, `npm run sim:crowd`, rendu dans le navigateur (Gunners + sol + eau + slimes, menu debug). L'animation de marche/mort n'a pas pu être vue en mouvement (navigateur de test trop lent), seulement idle et un cadavre en cours de chute.
