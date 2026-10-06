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
| Partie | `run/survival/start` · `fail` · `complete` | premier input · mort · victoire | `RunFlow` |
| Tutoriel | `tutorial/all/start` · `complete` | début · fin du tutoriel entier | `GameScene.onEvent` |
| Tutoriel | `tutorial/<étape>/start` · `complete` | chaque étape (`move1`, `wave1`…) s'ouvre puis se ferme à la suivante | `GameScene.onEvent` |
| Rétention | `retention/game-<2,3,5,10>/reached` | début de la N-ième partie (compteur mémorisé d'une session à l'autre) | `GameScene.beginRun`, paliers dans `data/analytics.ts` |
| Progression | `time/<60,120,180,300,420,600>s/reached` | une fois par partie | `GameScene.trackProgress` |
| Progression | `level/<1-9>/reached` | niveau de vague atteint, une fois par partie | `GameScene.trackProgress` |
| Boss | `boss/<alien>/start` · `complete` · `fail` | apparition · mort · squad tombée avec ce boss vivant | `GameScene.onEvent` / `endRun` |
| Mort | `death/level-<n>/reached` | niveau de vague de la mort (hors connexion perdue) | `GameScene.endRun` |
| Build | `upgrade/<id>/picked` ou `prism` | upgrade choisie par le joueur local | `GameScene.onEvent` |
| Build | `upgrade/reroll/interact` | clic sur Relancer | `GameScene.rerollUpgrade` |
| Build | `recruit/<classe>/complete` | recrue ramassée | `GameScene.onEvent` |
| Revive | `reward/revive/visible` · `interact` · `complete` | bouton affiché · cliqué · pub vue | `GameOverScene`, `RunFlow.revive` |
| Revive offert | `reward/free_revive/visible` · `interact` · `complete` | même chose pour le Free Revive du tutoriel | `GameOverScene`, `RunFlow.reviveFree` |
| Rejouer | `game/retry/interact` | clic sur Rejouer | `GameScene.retry` |

Le tutoriel n'envoie pas d'événements `time` / `level` (sa timeline de vagues est différente).

## Lire les résultats
- **Où on décroche dans le tutoriel** : entonnoir `tutorial/<étape>` (start sans complete = abandon à cette étape).
- **Difficulté** : `death/level-N` (où meurent les joueurs), `boss/<alien>` (taux de victoire = `complete` / `start`), `time/…` (jusqu'où ils tiennent).
- **Builds** : `upgrade/<id>/picked` ; une upgrade jamais prise est peu attractive, une upgrade prise partout est trop forte.
- **Monétisation** : `reward/revive` (`interact` / `visible` = taux de clic sur la pub), puis `game/retry`.
- **Rétention** : `retention/game-N` ; plus la part qui atteint la partie 3, 5, 10 est élevée, mieux le jeu retient.

## Ajouter un événement
Appeler `poki.measure(...)` (ou `measureOnce` pour un palier) depuis la vue (`GameScene`, scènes), jamais depuis `sim/` (pur, sans effets de bord). Ajouter la ligne au catalogue ci-dessus.
