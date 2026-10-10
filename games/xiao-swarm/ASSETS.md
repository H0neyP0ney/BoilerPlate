# Assets graphiques — Xiao Swarm Attack

Déposer les planches de sprites (PNG, + JSON si export Aseprite / TexturePacker) dans `public/assets/`, rangées par
dossier : `soldiers/`, `aliens/`, `decor/`, `fx/`, `ui/`. Puis les déclarer dans
`src/assets/manifest.ts` (ou demander à Claude de le faire en lui donnant la planche).

Tout visuel non fourni garde son dessin procédural : on peut remplacer les visuels **un par un**.

## Formats acceptés

| Format | Quand l'utiliser |
|---|---|
| **Planche en grille** (`sheet`) | cases de taille fixe, frames numérotées 0, 1, 2… ligne par ligne |
| **Export Aseprite** (`aseprite`) | PNG + JSON (*Array*, avec *Tags*) : les tags `idle`, `walk`… deviennent les animations |
| **Atlas** (`atlas`) | PNG + JSON TexturePacker / Free Texture Packer, frames nommées |
| **PNG isolé** (`image`) | un visuel fixe (rocher, palmier, effet) |

## Planches "de présentation" (image générée, étiquettes, placement libre)

Les planches sources vont dans `art-src/` (non livré dans le jeu). Un fichier `<nom>.slice.json` y décrit
la zone de chaque animation et son nombre de frames ; l'outil retire les ombres au sol, isole chaque frame,
aligne les pieds et produit une planche en grille propre + un `.json` (taille de case, ancrage, frames) :

```bash
node tools/slice-sheet.mjs games/xiao-swarm/art-src/gunner.slice.json
```

Exemple : `art-src/gunner_sheet.png` → `public/assets/soldiers/gunner.png` (8 animations, 31 frames).

## Planches déjà en grille (une par animation)

Si chaque animation est une grille régulière (ex. `gunner_idle.png`, `gunner_walk.png`, `gunner_death.png`, 4×4 cases),
`tools/pack-grids.mjs` les assemble en UNE planche (un sprite n'a qu'une texture) : cases identiques, pieds alignés
d'une planche à l'autre, réduction finale (`scale`). Il affiche la taille de case et l'ancrage pour le manifeste.

```bash
node tools/pack-grids.mjs games/xiao-swarm/art-src/gunner.pack.json
```

Actuel : Gunner = `idle` (16 frames) + `walk` (16) + `die` (16) → `public/assets/soldiers/gunner.png`, 48 cases de 64×74.
Slime vert = 1 planche 4×4 de 1024 px (cycle de marche) réduite à 64 px → `public/assets/aliens/slime.png` (`art-src/slime.pack.json`) ;
il regarde vers la gauche (`facesLeft: true`) et `idle` réutilise le même cycle, plus lent.

**Aliens (03/10)** : `slime`, `gling`, `shooter`, `toad`, `charger`, `kamikaze`, `spitter`, `wall`, `burner`, `lurker`, `bubble` ont chacun une planche 3×3 (9 frames, cycle de marche, face à gauche) dans `art-src/<nom>_walk.png`, assemblée par `node tools/pack-grids.mjs games/xiao-swarm/art-src/<nom>.pack.json` → `public/assets/aliens/<nom>.png` (option `"cleanShadow": true` : retire l'ombre brune peinte, utilisée pour `shooter`). Après une mise à jour d'une planche : relancer la commande puis vérifier la taille / l'ancrage dans la visionneuse (`?viewer`). `shaman` n'a pas encore de planche : dessin procédural (`src/art/aliens.ts`).

**Ennemis actifs** : seul le slime (`ACTIVE_ALIENS` dans `data/aliens.ts`) ; les vagues des autres sont filtrées.
**Bordure de carte** : de la lave animée (texture procédurale `lava`) avec un liseré incandescent, plus de palmiers.

## Conventions

- **Vue** : top-down légèrement inclinée (~60–70°), personnages vus de trois-quarts face.
- **Orientation** : personnages **tournés vers la droite** (le jeu retourne l'image pour la gauche).
  Sinon préciser `facesLeft: true`.
- **Pivot** = les pieds (bas-centre). Laisser un peu de marge sous les pieds est OK, on règle `originY`.
- **Fond transparent**, PNG 32 bits. Pas d'ombre au sol (le jeu la dessine).
- **Taille** : dessiner net à ~2× la taille d'affichage ; l'échelle se règle avec `scale`.
- **Budget Poki** : < 5 Mo au démarrage pour tout le jeu → PNG optimisés, planches compactes.

## Animations reconnues

| Nom | Utilisé par | Quand |
|---|---|---|
| `idle` | soldats, aliens, recrues, décor | à l'arrêt (et par défaut) |
| `walk` | soldats, aliens | en déplacement |
| `shoot` | soldats | quand il a une cible (optionnel) |
| `attack` | aliens | slam (crabe) (optionnel) |

Sans animation, le jeu garde ses animations procédurales (rebond, squash).

## Ids des visuels

| Id | Taille procédurale actuelle (px) | Affiché à | Remarques |
|---|---|---|---|
| `soldier_trooper` `soldier_medic` `soldier_flammer` `soldier_sniper` `soldier_bruiser` `soldier_bomber` | 64×72 | ×0.8 | corps, face à droite |
| `gun_trooper` … `gun_bomber` | 64×20 | ×0.8 | arme séparée qui pivote vers la cible ; `hidden: true` si l'arme est dans la planche du soldat |
| `portrait_<classe>` | — | HUD | par défaut : haut du corps du soldat |
| `recruit_<classe>` | 56×60 | ×0.75 | recrue au sol à ramasser |
| `alien_slime` | 48×48 | ×1 | slime vert à un oeil |
| `alien_gling` `alien_shooter` `alien_kamikaze` `alien_toad` `alien_charger` `alien_spitter` `alien_shaman` `alien_wall` `alien_lurker` `alien_bubble` `alien_burner` | 48×48 → 72×72 | ×1 | aliens (ids renommés le 02/10) |
| `alien_boss_rhino` `alien_boss_scarab` `alien_boss_crab` | 119×94 → 182×157 | ×1 | boss : rhinocéros (mini, 2:00), scarabée (mini, 5:00, réutilise la marche du crabe en attendant son dessin), crabe géant (**final**, 10:00) |
| `palm` `bush` `bush_flowers` `log` | 160×172, 112×78, 112×78, 150×44 | ×1 | décor de bordure |
| `obstacle_1` … `obstacle_8` | 111×107 → 260×189 (WebP) | voir `data/obstacles.ts` | obstacles volcaniques (lave, rochers, cristaux) : `public/assets/decor/`, sources `art-src/obstacle_N.png` |
| `tache_1` … `tache_4` | 235×203 → 260×237 (WebP) | voir `data/obstacles.ts` | taches sombres sous les obstacles : chaque obstacle a son jeu de variantes (image, position, largeur, échelle Y, miroir), une tirée au hasard par obstacle posé (seed de la carte) ; `ArenaView.stain`, sources `art-src/tache_N.png` |
| `fx_bullet` `fx_blaster_blue` `fx_bolt_green` `fx_grenade` `fx_flame` `fx_glow` `fx_dot` `fx_ring` `fx_plus` `hand` | variées | — | effets : PNG isolé (`image`) du même id |

**Sol** : une texture qui se raccorde (`ground_tile`, `public/assets/ground/ground.webp`, 1024 px — puissance de 2)
est répétée sur toute la carte par un seul `TileSprite` (`view/ArenaView.ts`, échelle `GROUND_SCALE`). Source :
`art-src/ground.png` (1024 px, déjà une puissance de 2 : conversion directe en WebP qualité 90 avec Pillow). Si une nouvelle texture n'est pas en 1024 px,
la réduire en gardant le raccord (tuile 3×3, réduction, recadrage du centre).
Sans cette texture, le sol procédural (sable, herbe, étangs) sert de repli.

**Obstacles** : 8 images `obstacle_N` (WebP dans `public/assets/decor/`, déclarées dans `src/assets/manifest.ts`). Échelle,
ancrage et **hitbox** (cercles relatifs à l'ancrage) de chacun : `src/data/obstacles.ts` — c'est la seule source, partagée
par la simulation (`Arena`) et l'affichage (`ArenaView`). Placement sur la carte : `obstacles` dans `src/data/maps.ts`, où chaque obstacle posé reçoit une taille aléatoire de ±10 %
(`OBSTACLE_SIZE_JITTER`, tirée avec la seed de la carte) qui s'applique au sprite, à la hitbox et à la tache. L'échelle d'un obstacle
(champ « Taille » de la vue d'obstacles) redimensionne sprite, hitbox et taches ensemble.
Réglage des hitbox et des taches : bouton « hitbox » en haut à gauche du jeu (dev) ou `?obstacles` (liste « Édition » : hitbox / taches), puis « Copier le code » → coller
l'entrée dans `OBSTACLES`. Opacité des taches : menu Réglages, section « Visuel » ; leur taille (largeur, échelle Y) se règle par variante dans la vue Obstacles. Les réglages du navigateur (`localStorage`) ne servent qu'à tester en local.

## Rhinos jumeaux (mini-boss de 7:30)

Ids `boss_rhino_fire` et `boss_rhino_ice` : planches `public/assets/aliens/boss_rhino_fire.png` / `boss_rhino_ice.png`, la planche du Rhino Alpha recolorée par `node tools/hue-shift.mjs` (feu : `165 1.15 160 270`, glace : `-12 0.45 160 270 0.35` ; mêmes cases, ancrages, échelle et ombre que l'Alpha). L'orbe de feu (`alien_fire_orb`) est dessiné (`src/art/aliens.ts`). Les globes au sol (power-ups, globe d'upgrade) et leurs étoiles sont des images à retoucher : `public/assets/globes/globe_<sorte>.png` / `star_<sorte>.png` (générées une fois par `python tools/bake-globes.py`, `src/art/upgradeOrbs.ts`).
