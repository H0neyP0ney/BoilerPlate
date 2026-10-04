import type { UpgradeId } from './progression';

/**
 * Coéquipier IA du coop (données pures, lues par `sim/CoopBot.ts`) : deux niveaux de difficulté.
 *  - standard : réagit avec retard, ne voit que les menaces proches, ne prévoit rien ;
 *  - expert : décide à chaque tick, voit loin, anticipe charges / sauts / grenades, garde ses distances et choisit ses upgrades.
 */
export type BotLevel = 'standard' | 'expert';

export const BOT_LEVEL_IDS: readonly BotLevel[] = ['standard', 'expert'];

export interface BotLevelDef {
  /** Délai (s) entre deux décisions : le vecteur de déplacement est gardé entre-temps. */
  decisionEvery: number;
  /** Lissage (s) du vecteur de déplacement : plus grand = virages plus mous. */
  smooth: number;
  /** Rayon (px) dans lequel les aliens sont pris en compte. */
  sight: number;
  /** Vision lointaine (px) : densité d'aliens par secteur, pour fuir un encerclement bien avant le contact (0 = désactivée). */
  farSight: number;
  /** Poids de cette densité lointaine face au danger proche. */
  farWeight: number;
  /** Distance (px) à laquelle il cherche à garder les aliens (expert : adaptée à la portée de ses armes). */
  keepDist: number;
  /** Anticipation (s) : position future des aliens (`v × lead`) utilisée pour fuir. */
  lead: number;
  /** Instants (s) où il évalue l'endroit où ses déplacements candidats l'amènent (plus loin = voit venir plus tôt). */
  probes: readonly number[];
  /** Esquive les projectiles, grenades en cloche (zone d'impact) et télégraphes (charge, saut, slam, kamikaze). */
  dodge: boolean;
  /** Rayon (px) dans lequel il ramasse globes d'XP, recrues et power-ups. */
  gather: number;
  /** Poids du ramassage face à la fuite. */
  gatherWeight: number;
  /** Ramasse aussi les power-ups (standard : globes d'XP et recrues seulement). */
  powerups: boolean;
  /** Distance (px) au-delà de laquelle il rejoint ses équipiers. */
  leash: number;
  /** Rayon (px) dans lequel il va relever un équipier à terre. */
  reviveRange: number;
  /** S'arrête pour se faire soigner par un Medic quand le calme revient et que ses soldats sont blessés. */
  medicStops: boolean;
  /** Choisit ses upgrades par priorités (standard : au hasard). */
  smartUpgrades: boolean;
}

export const BOT_LEVELS: Record<BotLevel, BotLevelDef> = {
  standard: {
    decisionEvery: 0.25,
    smooth: 0.35,
    sight: 260,
    farSight: 0,
    farWeight: 0,
    keepDist: 90,
    lead: 0,
    probes: [0.5],
    dodge: false,
    gather: 220,
    gatherWeight: 0.8,
    powerups: false,
    leash: 700,
    reviveRange: 450,
    medicStops: false,
    smartUpgrades: false,
  },
  expert: {
    decisionEvery: 0,
    smooth: 0.12,
    sight: 520,
    farSight: 900,
    farWeight: 0.5,
    keepDist: 110,
    lead: 1,
    probes: [0.35, 0.8, 1.5],
    dodge: true,
    gather: 520,
    gatherWeight: 1.3,
    powerups: true,
    leash: 480,
    reviveRange: 1100,
    medicStops: true,
    smartUpgrades: true,
  },
};

/** Priorité de chaque upgrade pour le bot expert (plus grand = préféré ; ×2 si prismatique). */
export const BOT_UPGRADE_PRIORITY: Record<UpgradeId, number> = {
  damage: 10,
  fireRate: 9,
  hp: 8,
  reinforce: 7,
  maxSquad: 6,
  xpGain: 5,
  speed: 5,
  range: 4,
  crit: 6,
  magnet: 4,
  recruit: 3,
};

/** Plafond de bots dans une partie coop (avec l'hôte et les clients : `MAX_PLAYERS` au total). */
export const MAX_BOTS = 3;
