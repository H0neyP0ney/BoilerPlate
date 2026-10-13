# Assets dessinés par le code (Xiao Swarm)

État au 10/10/2026. Deux sortes :

- **Textures dessinées en code** (`canvasTexture`, une fois au chargement) : elles ont une clé de texture, donc **un fichier du même nom déclaré dans `src/assets/manifest.ts` les remplace** sans toucher au code (même clé). Fichiers sources : `src/art/*.ts`.
- **Formes tracées à chaque frame** (`Graphics` : cercles, barres, ellipses) : pas de texture ; les remplacer par une image demande de modifier le code d'affichage.

Les recolorations au lancement (soldats et tête de recrue de chaque joueur) ne sont pas listées : elles partent de vraies planches.

## 1. Textures dessinées en code, visibles en jeu (à remplacer)

### Projectiles

| Clé | Ce que c'est | Fichier |
|---|---|---|
| `fx_blaster_blue`, `_green`, `_yellow`, `_orange`, `_purple`, `_red` | tir du Gunner, une couleur par palier de dégâts (`data/damageTiers.ts`) | `art/fx.ts` |
| `fx_slime_ball` | boule en cloche du slime (`lob`) | `art/fx.ts` |
| `fx_spit` | crachat du spitter (`spray`) | `art/fx.ts` |
| `fx_blob_red` | grosses boules rouges du Giant Crab | `art/fx.ts` |
| `fx_ice_ball` | flocon de glace (projectile et éclats de glace) | `art/fx.ts` |
| `alien_ice_orb` | orbe de glace (slime de glace, rhino de glace) | `art/aliens.ts` |
| `alien_fire_orb` | orbe de feu (rhino de feu) | `art/aliens.ts` |

### Effets et particules

| Clé | Ce que c'est | Fichier |
|---|---|---|
| `fx_glow` | halo lumineux (flashs, colonnes, impacts) | `art/fx.ts` |
| `fx_dot` | petite particule ronde (éclats, impacts) | `art/fx.ts` |
| `fx_ring` | anneau (ondes de choc, ramassage) | `art/fx.ts` |
| `fx_column` | colonne de lumière (gain d'un soldat, level up) | `art/fx.ts` |
| `fx_plus` | « + » du soin | `art/fx.ts` |
| `fx_flame` | flamme (flammes au sol, enragés, traînées de feu) | `art/fx.ts` |
| `fx_smoke` | fumée (explosions, roquettes) | `art/fx.ts` |
| `fx_puddle` | flaque au sol | `art/fx.ts` |
| `fx_cracks_0…n` | fissures noires au sol après une grosse explosion | `art/fx.ts` |
| `fx_scorch_0…n` | brûlures au sol | `art/fx.ts` |
| `fx_spike3_*` | pics du lurker et de la couronne du Giant Crab (une texture par direction) | `art/fx.ts` |
| `fx_rock` | cailloux des murs du `wall` | `art/fx.ts` |
| `fx_ice_chunk` | petits blocs de glace qui sautent quand on brise un glaçon | `art/fx.ts` |
| `fx_stun` | tourbillon au-dessus d'un soldat étourdi | `art/fx.ts` |
| `alien_iceblock`, `alien_iceblock_cracks_<étage>` | glaçon d'un soldat gelé et ses fissures | `art/aliens.ts` |

### Interface

| Clé | Ce que c'est | Fichier |
|---|---|---|
| `hand` | main du tutoriel (HUD) | `art/fx.ts` |

## 2. Dessinés en code mais cachés par une planche (rien à faire)

Le dessin existe encore comme repli si le fichier manque, mais le jeu affiche la planche :

- aliens : `alien_slime`, `alien_gling`, `alien_shooter`, `alien_kamikaze`, `alien_toad`, `alien_charger`, `alien_spitter`, `alien_shaman`, `alien_wall`, `alien_bubble`, `alien_burner`, `alien_lurker`, `alien_iceballer`, `alien_boss_rhino`, `alien_boss_scarab`, `alien_boss_crab` (`art/aliens.ts`) ;
- `soldier_trooper`, `gun_trooper` (`art/soldiers.ts`) ; `recruit_trooper` (globe composé : `art/recruits.ts`) ;
- `fx_rocket` (fichier `fx/rocket.png`), `fx_xp` (remplacé par `xp_orb`), `rock_big`.

## 3. Dessinés en code, pas affichés aujourd'hui

- **Classes de soldats désactivées** (`ACTIVE_CLASSES` = trooper seul) : `soldier_` / `gun_` / `recruit_` de `medic`, `flammer`, `sniper`, `bruiser`, `bomber`, et leurs projectiles `fx_bolt_green` (medic), `fx_grenade` (bomber), `fx_bullet` (bruiser). À dessiner seulement si ces classes reviennent.
- **Projectile sans utilisateur** : `fx_blob_green` (boule verte en cloche ; plus aucun alien ne la lance).
- **Décor de l'ancienne carte** : `palm`, `bush`, `bush_flowers` (bordure, seulement sans le sol en image), `log` (la carte actuelle n'a pas de troncs), `lava`, `rock_small`, `fx_rock_small` (`art/environment.ts`, `art/fx.ts`).

## 4. Formes tracées à chaque frame (Graphics)

Liste des principales (pas de texture : les remplacer par des images demande du code).

- **Unités** (`view/WorldView.ts`) : cercle d'équipe sous chaque soldat (couleur du joueur), barres de vie des soldats et des aliens, barre bleue de bouclier, barre bleue du glaçon, ombres portées (l'aura rouge de Dernier rempart a été retirée le 13/10).
- **Capsule d'effectif** « 14/14 » au-dessus de la squad (`view/PickupViews.ts`).
- **Télégraphes** des attaques d'aliens : zones rouges de charge, de saut, de pics, de stalactites, murs en jaune (`view/telegraph.ts`, `view/WorldView.ts`).
- **Au sol** : globes de soin et de stase (dômes, `drawField`), ronds sous les globes au sol (`drawPickupSpot`), zones de réanimation en coop.
- **Effets** : arcs électriques du chargeur et des soldats étourdis (`view/ElectricFx.ts`), flamme et ombre de la fusée de fin (`view/Ending.ts`), déformation des ondes de choc (`view/ShockDistort.ts`).
- **HUD** : flèches roses vers les globes d'upgrade hors champ (`scenes/HudScene.ts`).
- **Menus** : boutons des écrans Pause, Options, Hotkeys et Game Over (`Button` de l'engine : rectangles arrondis dessinés), joystick virtuel sur téléphone (`VirtualJoystick` de l'engine).
- **Repli** : globe d'upgrade dessiné si son image manque (`view/LootViews.ts`).

## Remplacer un asset

- **Texture (sections 1 à 3)** : poser le fichier dans `public/assets/…` et le déclarer dans `src/assets/manifest.ts` avec **la même clé** (ex. `{ type: 'image', id: 'fx_stun', url: 'fx/stun.png' }`). Le dessin en code n'est alors plus utilisé. Garder des proportions proches : plusieurs effets règlent leur échelle en pixels (visionneuse Particules, `fxParams.ts`).
- **Forme (section 4)** : à faire au cas par cas dans le code d'affichage.
