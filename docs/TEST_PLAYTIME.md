# Version « test playtime » (21/10)

**Objectif** : refaire un Web Fit Test Poki en allongeant le temps de jeu moyen. Résultat du premier test : conversion 64,2 % (seuil ~60,2 %, OK), **temps de jeu 4:46 (seuil ~6:37)**, CTR depuis les catégories 0,14 %.
On retire donc ce qui n'aide pas la rétention des premières minutes et on rend le début plus indulgent.

## Comment ça marche (et comment revenir en arrière)

Tout passe par **un seul objet** : `PLAYTIME_TEST` dans `games/xiao-swarm/src/config.ts` (avec les aides `ptOn`, `ptMul`, `ptFreeRevives`).

- **Tout désactiver d'un coup** : `PLAYTIME_TEST.enabled = false`. Le jeu redevient exactement comme avant (aucun des autres réglages ne s'applique).
- **Désactiver un seul réglage** : le passer à `false` (booléens) ou à `1` (multiplicateurs, `freeRevives: 1`) dans le même objet.
- **Essai ponctuel dans le navigateur** (dev ou build déployé) : `?ptest=0` joue le jeu complet, `?ptest=1` remet la version test.
- Les scripts de test (`sim:combat`, `sim:net`, `sim:tutorial`, `sim:waves`…) coupent la version test au lancement (`PLAYTIME_TEST.enabled = false` juste après la création du serveur Vite) pour tester le jeu complet ; `sim:combat` la rallume le temps d'un bloc de tests (« test playtime »).
- Pour retirer définitivement la version test : supprimer `PLAYTIME_TEST` et ses aides de `config.ts`, les appels `ptOn` / `ptMul` / `ptFreeRevives` (listés ci-dessous), la ligne ajoutée aux scripts, le bloc de tests « version test playtime » de `combat-headless.mjs` et ce fichier.

## Changements

| # | Demande | Réglage | Où |
|---|---|---|---|
| 1 | Plus de menus, la partie démarre toujours directement ; toujours le niveau Normal (« easy ») | `menusOff`, `forceNormal` | `GameScene.create` (`titleOpen`), `difficultyStart.ts` (`startDifficulty`, ignore même `?difficulty=`) |
| 2 | Tous les boss en « easy » | `forceNormal` | Conséquence du niveau Normal : aucune capacité réservée à Hard / Expert (cercle d'araignées et toiles de la Gling Mère, croix du Rhino Alpha, stalactites et murs du Scarab, orbes des jumeaux, boucliers) |
| 2b | Timeline complète (tous les boss) en jouant en Normal | `fullTimeline` | `data/difficultyLevels.ts` (`finalBossesOf`) : en Normal la run ne se termine plus au Scarab (4:30) mais au **Giant Crab (10:00)**, après les rhinos jumeaux (7:00) ; le Scarab et les jumeaux laissent un œuf (2 globes d'upgrade), le Crab clôt la run (séquence de fin) ; `?endtest=1` fait apparaître le Crab |
| 3 | Plus de pièces ni de diamants, plus d'upgrade Jackpot | `noEconomy` | `sim/Gems.ts` (`dropCoins`, `dropCoinsAt`, `dropGemsAt`), `sim/Horde.ts` (`updateGoldenSpawns` : plus d'alien doré), `sim/Squad.ts` (`upgradeDisabled` : Jackpot jamais proposée, ni par choix de niveau, ni par globe d'œuf, ni en rattrapage) |
| 4 | PV de base des soldats × 2 | `soldierHpMul: 2` | `sim/Squad.ts` (3 endroits où `maxHp` est calculé) |
| 5 | Compteurs de pièces et de diamants du HUD cachés | `hideEconomyHud` | `scenes/HudScene.ts` (`placeGems`) |
| 6 | PV des boss ÷ 2 | `bossHpMul: 0.5` | `sim/Horde.ts` (`create`, seulement `def.boss` : l'œuf et les autres aliens sont inchangés) |
| 7 | Plus de coffre à diamants (ni la salve du boss final) | `noEconomy` | `sim/Gems.ts` (`spawnChest`, `spawnFinalBurst`) |
| 8 | 2 Free Revive après le tutoriel (1 avant) | `freeRevives: 2` | `scenes/GameScene.ts` (`freeRevives`, compteur décrémenté à chaque revive offert ; la revive par pub redevient impossible une fois les offerts épuisés, comme avant) |

## Remarque sur la durée de la run

Sans `fullTimeline`, la victoire au Scarab (4:30) plafonnait la durée d'une partie gagnée sous le seuil Poki (~6:37). Avec `fullTimeline`, une partie complète dure ~10 min.

## Ce qui n'est PAS touché

- Le tutoriel (ses PV de soldats sont doublés comme le reste, ses scripts sont inchangés).
- Le protocole réseau (v82) et le multijoueur : les menus du multi ne sont plus accessibles, mais `?net=host|join|auto` marche toujours ; en ligne les PV des boss ÷ 2 et ceux des soldats × 2 viennent de l'hôte.
- Les données sauvegardées (pièces / diamants déjà gagnés restent dans `localStorage`, simplement invisibles).
- Les boutiques / l'Armurerie / les skins : le code reste, il n'y a juste plus de chemin pour y arriver.
- `SAVE_VERSION` n'a pas été incrémenté : pour que les testeurs rejouent le tutoriel, l'augmenter (voir `CLAUDE.md`).

## Tests

`npm run sim:combat` (dans `games/xiao-swarm`), bloc « test playtime » : soldats × 2, boss ÷ 2, aucune pièce ni aucun diamant sur 300 aliens tués, pas de coffre ni d'alien doré, Jackpot jamais proposée sur 80 tirages.
Vérifié à la main dans le navigateur : `?notuto=1` arrive directement dans la partie (pas d'écran titre, pas de compteurs d'or / diamants, niveau Normal) ; `?ptest=0` ramène l'écran titre et les compteurs.
