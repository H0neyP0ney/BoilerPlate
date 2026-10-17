# Idées pour les unités (soldats) — notées le 17/10

Idées de l'utilisateur, **pas encore faites** (rien dans le code). Les classes sont dans `games/xiao-swarm/src/data/classes.ts` ; seul le Trooper est actif aujourd'hui (`ACTIVE_CLASSES`).
Les capacités passives / actives iront en données (comme `heal` ou `deathBlast` aujourd'hui) avec des systèmes génériques, pas du code par classe. Les upgrades « achetables dans la boutique » viennent avec le tableau plus bas (à remplir).

Noms : « gunner » = le Trooper (la planche `gunner.png`). « Briseur » = le Bruiser. « Flammeur » = le Flammer. « Bombardier » = le Bomber. « Médecin / médic » = le Medic.

## État d'implémentation (17/10)

**Fait** : monnaie **pièces d'or** (lâchées par les aliens tués, solo : `COINS` de `config.ts`, `sim/Gems.ts`, compteur du HUD sous le bouton pause), écran **Armurerie** (bouton « Armory » à gauche de l'écran Solo, `scenes/ArmoryScene.ts`, données `data/armory.ts`) : **déblocage des unités** (Medic 300, Bruiser 400, Flamer 500, Bomber 500, Sniper 600 pièces : elles entrent dans le tirage des recrues du joueur) et trois **upgrades permanentes** (« tu l'as ou tu l'as pas ») : *Lunettes de précision* (Trooper, 250 : critiques +25 %), *Aura de soins élargie* (Medic, 250, demande le Medic : +2 unités de portée), *Munitions lourdes* (Sniper, 400, demande le Sniper : +25 % de dégâts). Annoncées à l'hôte dans le `hello` (protocole v63, validées), donc valables en multi. **Pas encore fait** : les capacités de base des unités listées plus bas (résurrection, mines, parade, etc.), l'équilibrage des prix. Les pièces d'or tombent aussi en multi (protocole v64) ; une unité débloquée arrive par les **recrues spéciales** (désactivées le 17/10 : `SPECIAL_RECRUIT_CHANCE` = 0 ; avant, 20 % des bonus recrue, type tiré à égalité parmi les unités débloquées).

## Idées par unité

### Medic
- **Résurrection** : toutes les X secondes, il peut ressusciter une unité alliée morte ; un cooldown s'enclenche après chaque résurrection.
- **Aura de soins continue** : soigne en permanence les soldats proches (c'est déjà `heal: { radius, perSecond }`).
- **Upgrade de portée de l'aura** : l'aura ne soigne plus seulement autour de lui mais **deux unités autour de lui** (portée augmentée).
- **Bombe de soins à sa mort** : quand il meurt, une explosion de soins qui soigne **toutes les squads**.

### Flammer
- **Mort explosive = mini clear screen** : quand il explose (`deathBlast` existe déjà : rayon 120, 80 dégâts), l'explosion devient un mini clear screen (zone / dégâts bien plus grands, à régler).

### Bomber
- **Mines** : il pose une mine toutes les X secondes.

### Bruiser (« briseur »)
- **Parade** : ~20 % de chance de bloquer une attaque et de ne prendre que 10 % des dégâts. *(Le mot dicté était « pari » : compris comme « parade » / blocage, à confirmer.)*

### Gunner (Trooper)
- **Immobile = cadence +25 %** : quand la squad / le soldat est immobile, il tire 25 % plus vite.
- **Vitesse selon la vie** : le gunner gagne de la vitesse de déplacement quand sa vie change. *(La dictée disait « quand ils ont plus de vie » : à préciser — **moins de vie** = il court plus vite pour fuir (plus logique), ou **plus de vie** = récompense ?)*
- **Upgrade « lunettes de précision »** : +25 % de dégâts des coups critiques (s'ajoute au système existant : chance de critique `crit`, dégâts × `CRIT_MUL`).

### Sniper
- **Critique doublé** : son score (chance) de critique vaut **le double** de celui de la squad (`crit` de la squad × 2 pour ses tirs).
- **Dégâts selon la vie max** : une partie de ses dégâts dépend de la **vie maximale de la cible** (dégâts en % des PV max, utile contre les boss). *(Dicté « un dégât en fonction de la vie max » : lecture à confirmer.)*
- **Critique amplifié** : ses coups critiques font plus de dégâts que ceux des autres (multiplicateur `CRIT_MUL` augmenté pour lui). *(Dicté « dégât d'écho critique amplifié » : compris comme dégâts de critique amplifiés, à confirmer.)*
- **Upgrade de boutique** : une upgrade qui augmente ses dégâts (palier(s) à définir).

## Tableau à construire : upgrades de boutique par unité

À faire ensemble : pour chaque unité, la liste des upgrades qu'on pourra **acheter dans la boutique** (diamants verts, voir `CLAUDE.md` § Diamants verts et boutique de skins ; aujourd'hui elle vend des skins et des trails). Les idées ci-dessus sont des candidats (en particulier les upgrades « portée de l'aura », « lunettes de précision »).

| Unité | Capacité de base (idées) | Upgrades achetables en boutique | Prix / rang |
|---|---|---|---|
| Gunner (Trooper) | Cadence +25 % à l'arrêt ; vitesse selon la vie | Lunettes de précision (+25 % dégâts critiques) | à définir |
| Medic | Résurrection (cooldown) ; aura de soins ; bombe de soins à la mort | Portée de l'aura (+2 unités) | à définir |
| Flammer | Mort = mini clear screen | à définir | à définir |
| Bomber | Pose une mine toutes les X s | à définir | à définir |
| Bruiser | Parade : 20 % de blocage, 10 % des dégâts | à définir | à définir |
| Sniper | Critique ×2 vs squad ; dégâts selon vie max de la cible ; critique amplifié | Upgrade de dégâts | à définir |

**Règles décidées (17/10, utilisateur)** :
- Toute upgrade achetée en boutique est **permanente** (active à chaque partie, pour toujours).
- Elle **s'applique en multi pour le joueur qui l'a achetée** : il y aura donc des joueurs plus forts que d'autres. C'est voulu : donner envie de farmer les diamants pour atteindre le late game.
- Conséquence technique : comme le skin et la trail, ses effets doivent être connus de l'hôte (qui fait tourner la simulation) : annoncés dans le `hello` et diffusés (protocole), **validés par l'hôte** (une upgrade annoncée mais non plausible ne doit pas casser la partie ; la sauvegarde reste locale, donc un joueur peut tricher en modifiant son stockage : à garder en tête si ça devient un enjeu). Les bonus se rangent dans les stats de la squad du joueur (`Squad.stats`, comme les upgrades de niveau).

Questions ouvertes pour le tableau : les upgrades se prennent-elles **par paliers** (rangs de prix) ou en une fois ? Combien par unité ? Prix de base (les skins sont à 50 / 125 / 250 diamants, les trails à 40 / 100 / 200) ?
