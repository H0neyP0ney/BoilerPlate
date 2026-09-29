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
| `attack` | aliens | charge (bête) / slam (crabe) (optionnel) |

Sans animation, le jeu garde ses animations procédurales (rebond, squash).

## Ids des visuels

| Id | Taille procédurale actuelle (px) | Affiché à | Remarques |
|---|---|---|---|
| `soldier_gunner` `soldier_medic` `soldier_flammer` `soldier_sniper` `soldier_tank` | 64×72 | ×0.8 | corps, face à droite |
| `gun_gunner` … `gun_tank` | 64×20 | ×0.8 | arme séparée qui pivote vers la cible ; `hidden: true` si l'arme est dans la planche du soldat |
| `portrait_<classe>` | — | HUD | par défaut : haut du corps du soldat |
| `recruit_<classe>` | 56×60 | ×0.75 | recrue au sol à ramasser |
| `alien_slime` | 48×48 | ×1 | slime vert à un oeil |
| `alien_spider` | 36×32 | ×1 | petite araignée rouge (rapide) |
| `alien_squid` | 48×58 | ×1 | calmar violet flottant |
| `alien_beast` | 66×52 | ×1 | bête orange à cornes (charge) |
| `alien_crab` | 130×112 | ×1 | crabe géant (mini-boss) |
| `palm` `bush` `bush_flowers` `log` | 160×172, 112×78, 112×78, 150×44 | ×1 | décor de bordure |
| `rock_big` `rock_small` | 110×92, 56×46 | ×1 | obstacles (collision fixe, ne pas changer l'emprise) |
| `fx_bullet` `fx_bolt_green` `fx_flame` `fx_glow` `fx_dot` `fx_ring` `fx_plus` `hand` | variées | — | effets : PNG isolé (`image`) du même id |

Le sol (sable, herbe, étangs) est procédural et découpé en morceaux ; une texture de sol en tuiles
pourra être ajoutée plus tard.
