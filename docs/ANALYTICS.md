# Analytics du comportement des joueurs (Poki)

Le seul outil d'analytics disponible est `PokiSDK.measure(category, what, action)`, enveloppé par `poki.measure` / `poki.measureOnce` (`packages/engine/src/poki/poki.ts`). Les données se lisent dans « Poki for Developers ». Poki bloque les requêtes externes : pas de Google Analytics ni équivalent. Aucune donnée personnelle n'est envoyée, seulement des événements anonymes.

Règles du SDK (https://developers.poki.com/guide/game-events) :
- `/` et `^` sont interdits dans les trois champs (nettoyés automatiquement).
- `start` → `complete` / `fail` forment un **entonnoir** de progression ; `visible` → `interact` un bouton affiché puis cliqué (même `category` et même `what`). Toute autre action = « % de parties qui l'ont atteint ».
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
| Performance | `perf/late-assets-2a/<0-1s / 1-3s / 3-6s / 6-10s / 10s+>` | une fois par partie, paquet **2a** chargé (premières minutes) : durée depuis le lancement du chargement. Remplace (15/10) `perf/late-assets/<N>ms` (une ligne par demi-seconde) | `assets/latePack.ts` |
| Performance | `perf/late-assets-2b/<0-1s / 1-3s / 3-6s / 6-10s / 10s+>` | une fois par partie, paquet **2b** chargé (aliens tardifs et boss suivants) : durée TOTALE (2a + 2b) depuis le lancement du chargement | `assets/latePack.ts` |
| Performance | `perf/fallback/alien` | une fois par partie : un alien a été affiché avec son dessin procédural (planche du paquet 2 pas encore arrivée) | `UnitViews` (`AlienView`) |
| Performance | `perf/fallback/pickup` | une fois par partie : une icône de power-up a été remplacée par un emoji (images de `ui/powerups/`, paquet 2a). Les globes et étoiles ne comptent plus : recolorés au lancement depuis les pièces de la recrue (paquet 1), sans repli | `PickupViews` (`makePowerUpIcon`) |
| Performance | `perf/fallback/other` | une fois par partie : autre repli visible — chiffres de critique, drone de stase, ou partie lancée sans timeline (la barre d'XP est au paquet 1 depuis le 15/10) | `Fx.crit`, `PickupViews.syncBots`, `WorldView`, `HudScene` |
| Progression | `time/<60,120,180,300,420,600>s/reached` | une fois par partie | `GameScene.trackProgress` |
| Progression | `level/<1-9>/reached` | niveau de vague atteint, une fois par partie | `GameScene.trackProgress` |
| Boss | `boss/<alien>/start` · `complete` · `fail` | apparition · mort · squad tombée avec ce boss vivant | `GameScene.onEvent` / `endRun` ; **rhinos jumeaux** : un seul nom, `boss/boss_rhino_twins/…` (`bossAnalyticsId`) : `start` à l'arrivée, `complete` une fois les DEUX morts, `fail` si la squad tombe avec l'un des deux vivant ; avant le 15/10 : `boss_rhino_fire` et `boss_rhino_ice` séparés, `complete` / `fail` seulement sous le dernier tombé / resté en vie |
| Mort | `death/level-<n>/reached` | niveau de vague de la mort (hors connexion perdue) | `GameScene.endRun` |
| Build | `upgrade/<id>/picked` | upgrade choisie par le joueur local (prismatique ou non : même ligne ; avant le 15/10, une prise prismatique allait dans `upgrade/<id>/prism`) | `GameScene.onEvent` |
| Build | `upgrade/reroll/interact` | clic sur Relancer | `GameScene.rerollUpgrade` |
| Revive | `reward/revive/visible` · `interact` · `complete` | bouton affiché · cliqué · pub vue | `GameOverScene`, `RunFlow.revive` |
| Revive offert | `reward/free_revive/visible` · `interact` · `complete` | même chose pour le Free Revive du tutoriel | `GameOverScene`, `RunFlow.reviveFree` |
| Chargement | `game/loading` (**automatique**, produit par le SDK Poki jusqu'à `gameLoadingFinished`, pas par notre code) | début → fin du chargement ; « Left » = parti avant la fin | `BootScene` |

Le tutoriel n'envoie pas d'événements `time` / `level` (sa timeline de vagues est différente).

## Lire les résultats
- **Où on décroche dans le tutoriel** : entonnoir `tutorial/<étape>` (start sans complete = abandon à cette étape).
- **Difficulté** : `death/level-N` (où meurent les joueurs), `boss/<alien>` (taux de victoire = `complete` / `start`), `time/…` (jusqu'où ils tiennent).
- **Builds** : `upgrade/<id>/picked` ; une upgrade jamais prise est peu attractive, une upgrade prise partout est trop forte.
- **Monétisation** : `reward/revive` (`interact` / `visible` = taux de clic sur la pub). L'ancien `game/retry/interact` a été supprimé le 15/10 (redondant avec `retention/game-N` et invisible dans la première partie : le Free Revive remplace Rejouer).
- **Rétention** : `retention/game-N` ; plus la part qui atteint la partie 3, 5, 10 est élevée, mieux le jeu retient.

## Ajouter un événement
Appeler `poki.measure(...)` (ou `measureOnce` pour un palier) depuis la vue (`GameScene`, scènes), jamais depuis `sim/` (pur, sans effets de bord). Ajouter la ligne au catalogue ci-dessus.
