# Roadmap — Xiao Swarm Attack & engine

État au 30/09/2026 (fin de session). Outils de dev : [OUTILS_DEV.md](OUTILS_DEV.md). Référence design : [Xiao_Swarm_Attack_Game_Design.md](Xiao_Swarm_Attack_Game_Design.md),
DA : [xiao-swarm-da-ref.png](xiao-swarm-da-ref.png).

## Fait

| Étape | Contenu |
|---|---|
| **M0 — Monorepo** | `@xiao/engine` + `games/_starter` + `games/xiao-swarm`, workspaces npm, typecheck global |
| **Boilerplate Poki** | SDK sûr (adblock, pas de double event, mute/input off pendant les pubs), `RunFlow`, responsive `Scale.EXPAND` (16:9 desktop, plein écran mobile), incognito, i18n, zip + budgets de taille |
| **M1 — Squad** | ancre réactive + formation tournesol organique, laisse, séparation, obstacles, caméra robuste |
| **M2 — Horde** | 5 aliens en données (slime, araignée, calmar, bête qui charge, crabe à slam), ciblage par préférence, vagues scriptées 5 min |
| **M3 — Combat** | 5 classes (Gunner, Medic, Flammeur, Sniper, Tank), tir auto indépendant du déplacement, soin à l'arrêt, explosion du Flammeur, knockback spécial |
| **Recrutement** | drop selon taille de squad + composition cible, cap de squad |
| **Réseau-ready** | simulation pure (`sim/`, sans Phaser/DOM, vérifiée par tsconfig), pas fixe 30 Hz + interpolation, inputs par joueur, événements, ids, RNG seedé, multi-squads + PvP, modes/cartes en données, sol en morceaux, bots, simulation headless dans Node |
| **Multijoueur P2P** | mode `versus` PvPvE 2–4 joueurs : `HostSession` / `ClientSession` derrière une interface `Transport` (Netlib branché), rejoindre en cours de partie, respawn, `npm run sim:net` — voir [MULTIJOUEUR.md](MULTIJOUEUR.md) |
| **Pipeline sprites** | catalogue de sprites + manifeste (grille, Aseprite, atlas, PNG), animations directionnelles, repli procédural, outils `tools/slice-sheet.mjs` (planche libre) et `tools/pack-grids.mjs` (planches en grille → une planche) |
| **Contenu actuel (30/09)** | **Gunner + Grenadier violet** (`ACTIVE_CLASSES`) et **slime vert seul** (`ACTIVE_ALIENS`) ; Medic, Flammeur, Sniper, Tank et les autres aliens sont définis mais désactivés. Le Gunner tire un blaster bleu en ligne droite ; le Grenadier (recrue, pas dans l'escouade de départ) lance une grenade en cloche (tir lent, petite zone, explosion au sol). Sol = texture répétée, eau animée, **8 obstacles volcaniques** (images `obstacle_N`, hitbox en cercles multiples, taches sombres dessous, taille ±10 %) |
| **Outils de dev (30/09)** | menu Réglages, panneaux Foule et Triche, visionneuses Unités (ancrage par séquence / direction, canon par frame), Particules, Obstacles, Divers — voir [OUTILS_DEV.md](OUTILS_DEV.md) |
| **Divers (30/09)** | joystick flottant qui suit le doigt au-delà d'une marge, bouton « Recommencer » dans le menu pause, pubs Poki désactivées (`ADS_ENABLED = false`) |
| **Mouvement de foule réglable** | `CROWD` dans `config.ts` (défauts plus réactifs), panneau Foule avec sliders (bouton du HUD), menu Réglages (bouton curseurs du HUD ou `²`/F2), config de travail F8 / F9, `npm run sim:crowd` |
| **Insertion des recrues** | une recrue prend dans la formation la place la plus proche de son point de ramassage (`Squad.recruit`), affectation optimale des places (`assignSlotsOptimal`), `npm run sim:recruit` |

## À faire

0. **Panneau Équilibrage (balance)** : créer le panneau dev qui regroupe les réglages d'équilibrage (délai de soin `CROWD.stillDelay`, dégâts, PV, cadences, vagues…), puis y traiter M5.
   **Muzzle flash** : le jeu ne joue encore aucun flash de tir ; brancher les points de canon réglés dans la visionneuse d'unités (`sprites.muzzleFor`) sur un effet au tir, à la place du décalage fixe de `Combat.fire`.
   **Pubs Poki** : remettre `ADS_ENABLED = true` (`packages/engine/src/poki/poki.ts`) avant la soumission ; le revive « rewarded » est gratuit tant que c'est désactivé.
   **Obstacles** : affiner hitbox et taches dans la visionneuse puis coller le code dans `data/obstacles.ts` (valeurs de départ = estimations) ; le zoom du jeu n'est plus un réglage joueur (menu Réglages, dev).

1. **Contenu** : réactiver les autres classes (Medic, Flammeur, Sniper, Tank) et aliens (araignée, calmar, bête, crabe) avec leurs sprites (même pipeline `pack-grids`), décor. Avec un seul ennemi, la pression est plus faible qu'avant.
2. **M4 — Progression** : cristaux d'XP + aimant, level-up avec 3 choix, upgrades (Damage/Fire Rate/Health +10 %, Max Squad +3, bonus conditionnels) — `Stats` par squad déjà en place.
3. **M5 — Équilibrage** : une squad immobile survit aujourd'hui aux 5 min (soin du Medic trop fort) ; début plus facile, montée de pression, boss final.
4. **M6 — Onboarding & polish Poki** : tuto intégré, écran de fin, audio, traductions EN/FR/IT/DE/ES/TR, Poki Inspector, miniatures.
5. **Battle royale** : zone qui rétrécit, UI de fin (classement), puis serveur Node autoritaire pour ~10 joueurs (snapshots delta, interest management, prédiction de l'ancre) — le P2P 2–4 joueurs est fait.
6. **Boilerplate** : faire évoluer `games/_starter` avec les modules génériques, script `npm run new-game`.

## Points d'attention

- **Protocole réseau v2** : le snapshot des projectiles porte un indicateur de grenade (`lob`) ; hôte et client de versions différentes se refusent. Les cartes (obstacles, tailles ±10 %) viennent de la seed et des données : mêmes fichiers `data/` chez tous les joueurs.
- **Projectiles recyclés** (`Pool`) : un champ ajouté à `Projectile` doit être remis à zéro à la libération (`Combat`), sinon un tir hérite du comportement du précédent (bug grenade → balle de Gunner corrigé).
- **Navigateur du panneau de test** : boucle de jeu très lente, voir [OUTILS_DEV.md](OUTILS_DEV.md).

- **Phaser 4 / WebGL** : au-delà de ~5 grandes textures distinctes dans un même lot, certaines s'affichent en noir →
  sol en morceaux de 2048 px + masquage hors caméra (`view/ArenaView.ts`).
- **Windows PowerShell** : `npm` peut être bloqué par la politique d'exécution → utiliser `npm.cmd`.
- **Poki** : toute requête externe (serveur multi, analytics) doit être approuvée (Settings → CSP).
