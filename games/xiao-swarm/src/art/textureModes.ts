/**
 * À quel moment l'atelier de textures (`art/textureWorkshop.ts`) fabrique chaque texture dessinée par le code. Trois étapes, calées sur le chargement des paquets de
 * fichiers, réglées par la liste déroulante de la 3e colonne de la vue Paquets (`?packs`, Save réécrit ce fichier, effectif au rechargement) :
 *  - **paquet 1** (`AT_LAUNCH`) : fabriquée pendant le chargement, avant l'affichage du jeu, avec le paquet 1 (elle rallonge le chargement) ;
 *  - **paquet 2a** (état par défaut, absente des deux listes) : fabriquée en tâche de fond par petites tranches pendant que le paquet 2a se télécharge, donc dès l'affichage du jeu (replis des aliens, effets…) ;
 *  - **paquet 2b** (`AT_PACK_2B`) : fabriquée de la même façon pendant que le paquet 2b se télécharge, donc quand le 2a est arrivé.
 * Une texture demandée avant son tour est de toute façon fabriquée à l'instant (filet de sécurité de l'atelier, signalé dans le journal `[textures]` si elle est lourde).
 */
export const AT_LAUNCH: string[] = [
  'fx_blaster_blue',
  'fx_column',
  'fx_dot',
  'fx_glow',
  'fx_puddle',
  'fx_ring',
  'globe_heal',
  'recruit_trooper',
];

export const AT_PACK_2B: string[] = [
];
