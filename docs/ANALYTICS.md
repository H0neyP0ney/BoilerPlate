# Analytics du comportement des joueurs (Poki)

Le seul outil d'analytics disponible est `PokiSDK.measure(category, what, action)`, enveloppé par `poki.measure` / `poki.measureOnce` (`packages/engine/src/poki/poki.ts`). Les données se lisent dans « Poki for Developers ». Poki bloque les requêtes externes : pas de Google Analytics ni équivalent. Aucune donnée personnelle n'est envoyée, seulement des événements anonymes.

Règles du SDK (https://developers.poki.com/guide/game-events) :
- `/` et `^` sont interdits dans les trois champs (nettoyés automatiquement).
- `start` → `complete` / `fail` forment un **entonnoir** de progression ; `visible` → `interact` un bouton affiché puis cliqué (même `category` et même `what`). Toute autre action = « % de parties qui l'ont atteint ».
- **Au plus 2 valeurs numériques en tout** dans `category` + `what` + `action` (sinon le SDK refuse l'événement : « accepts at most 2 numeric values ») : c'est pourquoi les événements de chargement s'appellent `late-assets-a` / `-b` et non `-2a` / `-2b` (15/10 : `late-assets-2a/0-1s` en comptait 3). Compter les chiffres de tout nouvel événement.
- `poki.measure` n'envoie rien pendant une pub ; `poki.measureOnce` n'envoie qu'une fois par partie (`RunFlow.begin` remet les paliers à zéro).
- En dev, chaque événement s'affiche dans la console (`[poki] measure category/what/action`) et le SDK est en `setDebug(true)`.
- Garder des valeurs **bornées** pour `what` (ids connus, paliers), jamais un nombre libre.

## Catalogue

| Thème | category / what / action | Quand | Code |
|---|---|---|---|
| Partie | `run/survival/start` · `fail` · `complete` | premier input · mort · victoire (`fail` part à **chaque** mort, même suivie d'un revive : essayé « seulement si le revive est refusé » le 15/10 puis annulé, car les joueurs qui ferment l'onglet à l'écran de mort devenaient des « Left ») | `RunFlow` |
| Tutoriel | `tutorial/all/start` · `complete` | début · fin du tutoriel entier | `GameScene.onEvent` |
| Tutoriel | `tutorial/<étape>/start` · `complete` | chaque étape (`move1`, `wave1`…) s'ouvre puis se ferme à la suivante | `GameScene.onEvent` |
| Rétention | `retention/game-<1,2,3,4,5,10>/reached` | début de la N-ième partie (compteur mémorisé d'une session à l'autre) | `GameScene.beginRun`, paliers dans `data/analytics.ts` |
| Performance | `perf/fps-<ok (≥ 50) / moyen (30-49) / mauvais (< 30)>/aliens-<0-49 / 50-99 / 100-149 / 150+>` | fin de chaque partie (mort, victoire ; un revive repart d'une nouvelle mesure) : un évènement par tranche d'aliens vivants jouée au moins 5 s, avec le FPS moyen réel dans cette tranche, hors pause ; pas en dev. Remplace (version suivant SWA12) l'ancien `fps-<par 5>/<N>min`. Lecture : filtrer `aliens-150+` pour savoir si la horde pleine rame | `GameScene.sendPerf` |
| Performance | `perf/late-assets-a/<0-1s / 1-3s / 3-6s / 6-10s / 10s+>` | une fois par partie, paquet **2a** chargé (premières minutes) : durée depuis le lancement du chargement. Remplace (15/10) `perf/late-assets/<N>ms` (une ligne par demi-seconde) | `assets/latePack.ts` |
| Performance | `perf/late-assets-b/<0-1s / 1-3s / 3-6s / 6-10s / 10s+>` | une fois par partie, paquet **2b** chargé (aliens tardifs et boss suivants) : durée TOTALE (2a + 2b) depuis le lancement du chargement | `assets/latePack.ts` |
| Performance | `perf/fallback/alien` | une fois par partie : un alien a été affiché avec son dessin procédural (planche du paquet 2 pas encore arrivée) | `UnitViews` (`AlienView`) |
| Performance | `perf/fallback/pickup` | une fois par partie : une icône de power-up a été remplacée par un emoji (images de `ui/powerups/`, paquet 2a). Les globes et étoiles ne comptent plus : recolorés au lancement depuis les pièces de la recrue (paquet 1), sans repli | `PickupViews` (`makePowerUpIcon`) |
| Performance | `perf/fallback/other` | une fois par partie : autre repli visible — drone de stase absent, ou partie lancée sans timeline (la barre d'XP est au paquet 1 depuis le 15/10) | `PickupViews.syncBots`, `WorldView`, `HudScene` |
| Progression | `time/<60,120,180,300,420,600>s/reached` | une fois par partie | `GameScene.trackProgress` |
| Progression | `level/<1-9>/reached` | niveau de vague atteint, une fois par partie | `GameScene.trackProgress` |
| Boss | `boss/<alien>/start` · `complete` · `fail` | apparition · mort · squad tombée avec ce boss vivant | `GameScene.onEvent` / `endRun` ; **rhinos jumeaux** : un seul nom, `boss/boss_rhino_twins/…` (`bossAnalyticsId`) : `start` à l'arrivée, `complete` une fois les DEUX morts, `fail` si la squad tombe avec l'un des deux vivant ; avant le 15/10 : `boss_rhino_fire` et `boss_rhino_ice` séparés, `complete` / `fail` seulement sous le dernier tombé / resté en vie |
| Mort | `death/level-<n>/reached` | niveau de vague de la mort (hors connexion perdue) | `GameScene.endRun` |
| Build | `upgrade/<id>/picked` | upgrade choisie par le joueur local (prismatique ou non : même ligne ; avant le 15/10, une prise prismatique allait dans `upgrade/<id>/prism`) | `GameScene.onEvent` |
| Build | `upgrade/reroll/interact` | clic sur Relancer | `GameScene.rerollUpgrade` |
| Revive | `reward/revive/visible` · `interact` · `complete` | bouton affiché · cliqué · pub vue | `GameOverScene`, `RunFlow.revive` |
| Pubs | `reward/<revive, reroll, gem_chest>/ad-shown` · `no-ad` | après chaque vidéo rewarded : une vidéo s'est vraiment affichée (`onAdStart` du SDK), ou aucune pub n'était disponible. Distingue « pas de pub » de « vidéo fermée avant la fin » (`interact` sans `complete`). Sans SDK (adblock), rien n'est envoyé du tout | `poki.rewardedBreak(placement)` (engine) |
| Revive | `reward/revive/survived-<0-30s, 30-60s, 1-2m, 2-5m, 5m+, win>` | mort suivante (ou victoire) après un revive vidéo : temps tenu ensuite. Le revive sert-il vraiment ? | `GameScene.endRun` / `startEnding` |
| Relance vidéo | `reward/reroll/visible` · `interact` · `complete` | solo, plus de relance en stock : bouton Relancer avec l'icône vidéo affiché · cliqué · vidéo vue (la relance a lieu sans rien consommer) | `LevelUpScene`, `GameScene.rerollUpgrade` |
| Coffre à diamants | `reward/gem_chest/visible` · `interact` · `complete` · `expired` | coffre apparu · jauge remplie (vidéo lancée) · vidéo vue · disparu sans avoir été pris (10 s) | `GameScene.trackChests` / `chestAd` |
| Boutique | `shop/open/visible` · `shop/<skin-id, trail-id>/buy` | boutique de skins ouverte · achat réussi (diamants). Les diamants (coffres rewarded) motivent-ils ? | `ShopScene` |
| Armurerie | `armory/open/visible` · `armory/<unit-id, perk-id>/buy` | armurerie ouverte · achat réussi (pièces d'or) | `ArmoryScene` |
| Revive offert | `reward/free_revive/visible` · `interact` · `complete` | même chose pour le Free Revive du tutoriel | `GameOverScene`, `RunFlow.reviveFree` |
| Équilibrage (solo) | `death-cause-<diff>/<source>/m<minute>` | mort de la squad : source qui a tué le plus de soldats dans les 15 dernières secondes (à défaut, qui a retiré le plus de PV) | `balanceAnalytics.ts` (`BalanceTracker.death`), appelé par `GameScene.endRun` |
| Équilibrage (solo) | `death-squad-<diff>/m<minute>/size-<xs, s, m, l, xl>-lv<niveau>` | mort de la squad : taille 3 s avant la mort (xs < 5, s 5-9, m 10-14, l 15-24, xl 25+) et niveau | `BalanceTracker.death` |
| Équilibrage (solo) | `crash-<diff>/<source>/m<minute>` | la squad perd ≥ 40 % de ses soldats en 10 s (≥ 5 au départ), mort ou non ; 1 par minute, 3 par partie au plus | `BalanceTracker.update`, appelé par `GameScene.trackProgress` |
| Équilibrage (solo) | `squad-<diff>/<60…600>s/size-<xs…xl>-lv<niveau>` | à chaque palier de `TIME_MILESTONES` : taille et niveau de la squad (référence pour lire `death-squad`) | `BalanceTracker.milestone` |
| Chargement | `game/loading` (**automatique**, produit par le SDK Poki jusqu'à `gameLoadingFinished`, pas par notre code) | début → fin du chargement ; « Left » = parti avant la fin | `BootScene` |

Le tutoriel n'envoie pas d'événements `time` / `level` (sa timeline de vagues est différente).

## Lire les résultats
- **Où on décroche dans le tutoriel** : entonnoir `tutorial/<étape>` (start sans complete = abandon à cette étape).
- **Difficulté** : `death/level-N` (où meurent les joueurs), `boss/<alien>` (taux de victoire = `complete` / `start`), `time/…` (jusqu'où ils tiennent).
- **Builds** : `upgrade/<id>/picked` ; une upgrade jamais prise est peu attractive, une upgrade prise partout est trop forte.
- **Monétisation** : `reward/revive` (`interact` / `visible` = taux de clic sur la pub). L'ancien `game/retry/interact` a été supprimé le 15/10 (redondant avec `retention/game-N` et invisible dans la première partie : le Free Revive remplace Rejouer).
- **Revenu des rewarded** : par emplacement (`revive`, `reroll`, `gem_chest`), taux d'acceptation = `interact` / `visible`, taux de vidéos vues = `complete` / `interact`, part sans pub disponible = `no-ad` / `interact`. Coffre : `expired` / `visible` élevé → coffre mal placé ou récompense peu attirante (croiser avec `shop/…/buy`). Revive : `survived-0-30s` majoritaire → le revive ne sauve pas, le joueur risque de ne plus le prendre.
- **Équilibrage** (solo ; réglages dans `BALANCE` de `data/analytics.ts`) : `<diff>` = `normal` / `hard` / `expert` (libellés affichés : ids internes `normal` / `expert` / `impossible`) ; `<source>` = clé `alien:capacité` de `Sim.blame` (ex. `boss_rhino:rush`, `burner:fire:burn`, `other`), **les mêmes que les parties enregistrées en dev** (`deathCause`, `takenBy` de `sim:calibrate`) : le dev donne le détail sur tes parties, Poki confirme en masse. Lecture : filtrer `death-cause-hard` sur une minute → la capacité qui tue ; comparer `death-squad-<diff>/m<n>` à `squad-<diff>/<n×60>s` → mort avec une squad plus petite ou un niveau plus bas que d'habitude (manque de recrues / d'XP avant ce passage) ou une squad normale débordée (passage trop fort) ; `crash-<diff>` montre les pics que les joueurs survivent.
- **Rétention** : `retention/game-N` ; plus la part qui atteint la partie 3, 5, 10 est élevée, mieux le jeu retient.

## Ajouter un événement
Appeler `poki.measure(...)` (ou `measureOnce` pour un palier) depuis la vue (`GameScene`, scènes), jamais depuis `sim/` (pur, sans effets de bord). Ajouter la ligne au catalogue ci-dessus.
