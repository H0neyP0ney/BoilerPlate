# Roadmap — Xiao Swarm Attack & engine

État au 30/09/2026 (fin de session). Outils de dev : [OUTILS_DEV.md](OUTILS_DEV.md). Multijoueur : [MULTIJOUEUR.md](MULTIJOUEUR.md). Référence design :
[Xiao_Swarm_Attack_Game_Design.md](Xiao_Swarm_Attack_Game_Design.md), DA : [xiao-swarm-da-ref.png](xiao-swarm-da-ref.png).

## Fait

| Étape | Contenu |
|---|---|
| **M0 — Monorepo** | `@xiao/engine` + `games/_starter` + `games/xiao-swarm`, workspaces npm, typecheck global |
| **Boilerplate Poki** | SDK sûr (adblock, pas de double event, mute/input off pendant les pubs), `RunFlow`, responsive `Scale.EXPAND`, incognito, i18n, zip + budgets de taille |
| **M1 — Squad** | ancre réactive + formation tournesol organique, laisse, séparation, obstacles, caméra robuste |
| **M2 — Horde** | 16 aliens en données (voir ci-dessous), ciblage par préférence, **script de vagues** (niveaux 1-9 + timeline, `data/waves.ts`) |
| **M3 — Combat** | 6 classes en données (5 + Grenadier), tir auto indépendant du déplacement, muzzle flash du Gunner qui suit le canon, impacts, knockback |
| **Recrutement** | drop selon taille de squad + composition cible (modulé par l'upgrade « Appel aux armes »), cap de squad |
| **M4 — Progression (30/09)** | globes d'XP (3 tailles) laissés par les aliens, aimant, niveaux (`data/progression.ts`), **choix de 3 upgrades sans pause** (9 upgrades), barre d'XP, fonctionne solo, bots et coop en ligne |
| **Ennemis (30/09)** | slime vert (55 PV), rose (rapide), bleu (lance des boules en cloche, zone rouge télégraphiée), kamikaze (corps + mèche + explosion), grenouille (langue qui tire un soldat), rhinocéros (charge télégraphiée), cracheur (spray qui repousse), lanceur de cailloux (obstacles temporaires), chaman (ressuscite les slimes depuis leur flaque), bulle (capture et digère un soldat), slime de feu (traînée de flammes) ; **boss** : Rhinocéros Alpha (2:00), Crabe géant (5:00), Roi Crabe (10:00, boss final) avec bandeau, flèche et barre de vie |
| **Partie de 10 min (30/09)** | timeline en dents de scie (montée ~90 s → pic → creux à ~60 %), mini-boss à 2:00 et 5:00, boss final à 10:00 obligatoire pour gagner, vagues continues tant qu'il vit |
| **Réseau-ready** | simulation pure (`sim/`, vérifiée par tsconfig), pas fixe 30 Hz + interpolation, inputs par joueur, événements, ids, RNG seedé, multi-squads, modes/cartes en données, bots, simulation headless dans Node |
| **Multijoueur P2P (30/09)** | mode **coop** 2–4 joueurs par défaut (`pvp: false`, difficulté dynamique selon les squads vivantes, boss unique à PV × joueurs, spectateur, fin + relance automatique `Sim.restart`) ; mode `versus` PvP conservé ; XP / level up / globes / ennemis spéciaux répliqués (protocole v3) ; `HostSession` / `ClientSession` derrière `Transport` (Netlib) ; `npm run sim:net` |
| **Décor et mouvement (30/09)** | bordure de **lave** animée, obstacles en cercles rangés dans une **grille** (`Arena`), **zone douce** autour des hitbox (les unités glissent : `wallMargin` / `wallPush` / `wallNudge`, panneau Foule), cailloux temporaires |
| **Pipeline sprites** | catalogue de sprites + manifeste, animations directionnelles, repli procédural, `tools/slice-sheet.mjs`, `tools/pack-grids.mjs`, `tools/hue-shift.mjs` (recolorer une planche) ; Gunner = planches « gunner 2 » (idle + walk, pas de mort) |
| **Outils de dev** | menu Réglages, panneaux Foule et Triche (XP, niveau de vague), visionneuses Unités (+ échelle et ombre par unité), Particules, Obstacles, Divers, **Gestionnaire de vagues** (`?waves`) ; **Save / Reset** dans chaque vue (plugin Vite `dev-save.ts` qui réécrit les valeurs par défaut dans le code) — voir [OUTILS_DEV.md](OUTILS_DEV.md) |
| **Divers** | déplacement flèches / ZQSD / WASD / pavé numérique, joystick flottant, barres de vie masquées à pleine vie, Grenadier désactivé du recrutement, pubs Poki désactivées (`ADS_ENABLED = false`) |

## À faire

0. **Boilerplate (priorité)** : extraire dans `@xiao/engine` les briques génériques nées dans Xiao Swarm — plugin dev-save + outils de dev (`devUi`, panneaux), moteur de vagues (`WaveRunner` + éditeur), XP / upgrades / `LevelUpScene`, grille d'obstacles + glisse (`Arena`) — puis compléter `games/_starter` (exemple de chaque brique), écrire `docs/NOUVEAU_JEU.md`, vérifier en CI que le starter compile avec l'engine seul, script `npm run new-game`.
1. **Équilibrage** : la difficulté (PV des ennemis, effectifs par niveau ×1,15 → ×2,3, boss) a été réglée avec un bot ; à affiner en jeu, puis panneau **Équilibrage** dev (`CROWD.stillDelay`, dégâts, PV, cadences). Le Rhinocéros Alpha (45 PV par soldat touché) est à surveiller.
2. **Test à deux joueurs** en vrai (latence réelle, 3-4 joueurs) : seul le test automatique en mémoire (`sim:net`) a été exécuté.
3. **Contenu** : réactiver Medic, Flammeur, Sniper, Tank, Grenadier ; aliens araignée / calmar / bête (définis, hors vagues) ; sprites dédiés pour les nouveaux ennemis (aujourd'hui recolorés du slime, ou procéduraux pour rhinocéros et crabes).
4. **Perf rendu** : Phaser n'écarte pas les sprites hors caméra ; ajouter un culling dans `WorldView` (aliens, décor, flaques) puis mesurer les fps avec 300-600 aliens.
5. **Pubs Poki** : remettre `ADS_ENABLED = true` (`packages/engine/src/poki/poki.ts`) avant la soumission.
6. **M6 — Onboarding & polish Poki** : tuto, écran de fin hors ligne, audio, traductions EN/FR/IT/DE/ES/TR, Poki Inspector, miniatures.
7. **Battle royale** : zone qui rétrécit, UI de fin, puis serveur Node autoritaire pour ~10 joueurs (snapshots delta, interest management).
8. **Obstacles** : affiner hitbox et taches dans la visionneuse (puis Save).

## Points d'attention

- **Protocole réseau v3** : le snapshot porte XP / niveau / propositions / upgrades par squad, globes d'XP, état des charges, chaman et bulle ; hôte et client de versions différentes se refusent. Les cartes viennent de la seed et des données : mêmes fichiers `data/` chez tous.
- **Projectiles recyclés** (`Pool`) : un champ ajouté à `Projectile` doit être remis à zéro à la libération (`Combat`).
- **Script de vagues en dev** : le navigateur mémorise le script édité (localStorage) ; après une modification de `data/waves.ts`, faire **Reset** dans le Gestionnaire de vagues.
- **Navigateur du panneau de test** : boucle de jeu très lente ; `window.__game.step(t, dt)` pour avancer à la main, voir [OUTILS_DEV.md](OUTILS_DEV.md).
- **Phaser 4 / WebGL** : au-delà de ~5 grandes textures distinctes dans un même lot, certaines s'affichent en noir → sol en morceaux de 2048 px + masquage hors caméra (`view/ArenaView.ts`).
- **Windows PowerShell** : `npm` peut être bloqué par la politique d'exécution → utiliser `npm.cmd`.
- **Poki** : toute requête externe (serveur multi, analytics) doit être approuvée (Settings → CSP).
