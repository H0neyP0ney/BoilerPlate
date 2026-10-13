import type { SfxId } from './settings';

/** Catalogue des bruitages pour la page de test (`?sounds`) et `docs/SONS.md` : groupe, et QUAND le son joue dans le jeu. */
export interface SfxInfo {
  id: SfxId;
  group: string;
  when: string;
}

export const SFX_INFO: SfxInfo[] = [
  { id: 'blaster', group: 'Armes (fournis)', when: 'Tir de chaque soldat (cadence limitée, hauteur variable)' },
  { id: 'blast', group: 'Armes (fournis)', when: 'Explosions : grenades, kamikaze, boules des aliens, mort du Giant Crab' },
  { id: 'ui_click', group: 'Interface', when: 'Clic sur un bouton (menus, HUD, pause, options)' },
  { id: 'ui_hover', group: 'Interface', when: "Survol d'une carte d'upgrade" },
  { id: 'ui_open', group: 'Interface', when: "Ouverture de l'écran de choix d'upgrade" },
  { id: 'ui_claim', group: 'Interface', when: 'Upgrade choisie (la mienne)' },
  { id: 'ui_claim_prism', group: 'Interface', when: 'Upgrade prismatique choisie' },
  { id: 'ui_reroll', group: 'Interface', when: "Relance des cartes d'upgrade" },
  { id: 'levelup', group: 'Interface', when: 'Montée de niveau (« LEVEL UP! »)' },
  { id: 'defeat', group: 'Interface', when: 'Écran de défaite (« Squad wiped out »)' },
  { id: 'victory', group: 'Interface', when: 'Fin du jeu (« Congratulations! »)' },
  { id: 'xp', group: 'Ramassages', when: "Globe d'XP ramassé (très fréquent : très court)" },
  { id: 'recruit', group: 'Ramassages', when: 'Recrue qui rejoint la squad (le « +1 »)' },
  { id: 'pu_stim', group: 'Ramassages', when: 'Power-up Stimpack ramassé' },
  { id: 'pu_magnet', group: 'Ramassages', when: 'Power-up Aimant ramassé' },
  { id: 'pu_heal', group: 'Ramassages', when: 'Power-up Globe de soin ramassé' },
  { id: 'pu_stasis', group: 'Ramassages', when: 'Power-up Globe de stase ramassé' },
  { id: 'pu_rockets', group: 'Ramassages', when: 'Power-up Rafale de roquettes ramassé' },
  { id: 'pu_reroll', group: 'Ramassages', when: 'Dé de relance (loot rose) ramassé' },
  { id: 'pu_prism', group: 'Ramassages', when: 'Booster prismatique (loot doré) ramassé' },
  { id: 'egg_break', group: 'Ramassages', when: "Œuf de boss détruit (les globes d'upgrade en sortent)" },
  { id: 'alien_die_s', group: 'Combat', when: "Mort d'un petit alien (moins de 100 PV : gling, slime, kamikaze…)" },
  { id: 'alien_die_m', group: 'Combat', when: "Mort d'un alien moyen (100 à 300 PV : cracheur, burner, bâtisseur)" },
  { id: 'alien_die_l', group: 'Combat', when: "Mort d'un gros alien ou d'un boss (chargeur, lurker, bulle, boss)" },
  { id: 'soldier_die', group: 'Combat', when: "Mort d'un soldat" },
  { id: 'crit', group: 'Combat', when: 'Coup critique (la bulle jaune)' },
  { id: 'alien_shot', group: 'Combat', when: "Tir d'un alien (shooter, cracheur, crabe, slime de glace)" },
  { id: 'tongue', group: 'Combat', when: 'Coup de langue du crapaud' },
  { id: 'fuse', group: 'Combat', when: "Mèche du kamikaze qui s'allume" },
  { id: 'cleave', group: 'Combat', when: 'Mêlée en zone (chargeur) et slam' },
  { id: 'stalactite', group: 'Combat', when: 'Stalactite du Scarab qui tombe' },
  { id: 'freeze', group: 'Combat', when: 'Un soldat est gelé dans un glaçon' },
  { id: 'thaw', group: 'Combat', when: 'Un glaçon se brise (soldat libéré)' },
  { id: 'capture', group: 'Combat', when: 'Une bulle avale un soldat' },
  { id: 'release', group: 'Combat', when: 'Un soldat est libéré d’une bulle' },
  { id: 'rock_break', group: 'Combat', when: 'Un rocher de mur est fracassé par une charge' },
  { id: 'heal', group: 'Combat', when: 'Un soldat est soigné (Medic / soin)' },
  { id: 'boss_arrive', group: 'Boss', when: "Arrivée d'un boss (bannière « MINI-BOSS! » / « FINAL BOSS »)" },
  { id: 'boss_down', group: 'Boss', when: 'Boss tué (bannière « defeated! »)' },
  { id: 'boss_enrage', group: 'Boss', when: 'Boss enragé (un cran toutes les 45 s)' },
];
