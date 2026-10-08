import type { AlienId } from '../data/aliens';
import type { SoldierClassId } from '../data/classes';

/** Identifiant de joueur (local : 'p1' ; réseau : id de peer / de session). */
export type PlayerId = string;

/** Équipe : chaque squad a la sienne (= son PlayerId) ; les aliens sont 'aliens'. */
export type Team = PlayerId | 'aliens';

/**
 * Tout ce qu'un joueur envoie à la simulation à chaque tick.
 * En réseau, c'est exactement ce qui transite client → serveur/hôte.
 */
export interface PlayerInput {
  /** Direction de déplacement, longueur 0 → 1. */
  mx: number;
  my: number;
}

export const NO_INPUT: Readonly<PlayerInput> = { mx: 0, my: 0 };

/**
 * Événements émis par la simulation : l'affichage en fait des effets,
 * le réseau les diffusera aux clients. Uniquement des données sérialisables.
 */
export type SimEvent =
  | { t: 'beam'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'hit'; id: number }
  /** Coup critique d'un soldat allié en (x, y) (impact du tir), `dmg` = dégâts infligés : l'affichage montre un « ! » rouge et ce nombre. */
  | { t: 'crit'; x: number; y: number; dmg: number }
  | { t: 'alienDied'; id: number; x: number; y: number; alien: AlienId; killer: PlayerId | null }
  | { t: 'soldierDied'; id: number; x: number; y: number; cls: SoldierClassId; owner: PlayerId }
  | { t: 'shot'; id: number; cls: SoldierClassId; x: number; y: number; aim: number }
  | { t: 'impact'; x: number; y: number; texture: string }
  /** Un alien lance sa volée de boules en cloche (shooter, spitter, crabe) depuis (x, y), son point d'origine simulé : l'affichage y pose un flash au canon. */
  | { t: 'alienShot'; id: number; alien: AlienId; x: number; y: number }
  /** Onboarding : une étape commence (`phase`, voir `sim/Tutorial.ts`) ; 'done' = fin, le gestionnaire de vagues normal prend le relai. */
  | { t: 'tutorial'; phase: string }
  | { t: 'explosion'; x: number; y: number; r: number; style?: 'slime' | 'fire' | 'spit' | 'acid' }
  | { t: 'fuse'; x: number; y: number; r: number; delay: number; alien: AlienId }
  | { t: 'tongue'; alien: number; target: number; dur: number }
  | { t: 'gameEnd'; victory: boolean; delay: number }
  | { t: 'restart' }
  | { t: 'boss'; id: number; alien: AlienId; kind: 'mini' | 'final' }
  | { t: 'freeze'; x: number; y: number; r: number }
  /** Un soldat sort de la glace (dégelé par ses alliés, ou mort dedans) : éclats. */
  | { t: 'thaw'; soldier: number; x: number; y: number }
  /** Mêlée en zone d'un alien (`def.cleave`, chargeur) : anneau rouge discret. */
  | { t: 'cleave'; x: number; y: number; r: number }
  | { t: 'bossEnrage'; id: number; alien: AlienId; level: number }
  | { t: 'bossDown'; alien: AlienId; kind: 'mini' | 'final' }
  | { t: 'capture'; alien: number; soldier: number }
  | { t: 'release'; soldier: number; x: number; y: number }
  | { t: 'corpse'; id: number; x: number; y: number; alien: AlienId; ttl: number }
  | { t: 'corpseEnd'; id: number; x: number; y: number; revived: boolean }
  | { t: 'rock'; id: number; x: number; y: number; r: number; ttl: number }
  | { t: 'rockEnd'; id: number }
  | { t: 'slam'; x: number; y: number; r: number }
  /** Une stalactite du Scarab s'écrase (effet : éclats, petite secousse ; les dégâts sont déjà appliqués). */
  | { t: 'stalactite'; x: number; y: number; r: number }
  | { t: 'recruited'; owner: PlayerId; cls: SoldierClassId; x: number; y: number }
  | { t: 'upgradePicked'; owner: PlayerId; x: number; y: number; id: string; prism: boolean }
  | { t: 'powerup'; owner: PlayerId; kind: string; x: number; y: number }
  | { t: 'heal'; x: number; y: number }
  | { t: 'levelUp'; owner: PlayerId; level: number }
  /** Onde de choc qui repousse les aliens sans montée de niveau (relance de la squad en solo) : l'affichage joue les ondes, sans le texte « LEVEL UP! ». */
  | { t: 'repel'; x: number; y: number }
  | { t: 'squadWiped'; owner: PlayerId }
  | { t: 'squadSpawned'; owner: PlayerId; x: number; y: number };
