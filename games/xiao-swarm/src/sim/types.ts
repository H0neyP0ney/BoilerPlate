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
  | { t: 'alienDied'; id: number; x: number; y: number; alien: AlienId; killer: PlayerId | null }
  | { t: 'soldierDied'; id: number; x: number; y: number; cls: SoldierClassId; owner: PlayerId }
  | { t: 'shot'; id: number; cls: SoldierClassId; x: number; y: number; aim: number }
  | { t: 'impact'; x: number; y: number; texture: string }
  | { t: 'explosion'; x: number; y: number; r: number; style?: 'slime' | 'fire' }
  | { t: 'fuse'; x: number; y: number; r: number; delay: number; alien: AlienId }
  | { t: 'tongue'; alien: number; target: number; dur: number }
  | { t: 'gameEnd'; victory: boolean; delay: number }
  | { t: 'restart' }
  | { t: 'boss'; id: number; alien: AlienId; kind: 'mini' | 'final' }
  | { t: 'bossDown'; alien: AlienId; kind: 'mini' | 'final' }
  | { t: 'fire'; id: number; x: number; y: number; r: number; ttl: number }
  | { t: 'fireEnd'; id: number }
  | { t: 'capture'; alien: number; soldier: number }
  | { t: 'release'; soldier: number; x: number; y: number }
  | { t: 'corpse'; id: number; x: number; y: number; alien: AlienId; ttl: number }
  | { t: 'corpseEnd'; id: number; x: number; y: number; revived: boolean }
  | { t: 'rock'; id: number; x: number; y: number; r: number; ttl: number }
  | { t: 'rockEnd'; id: number }
  | { t: 'slam'; x: number; y: number; r: number }
  | { t: 'recruited'; owner: PlayerId; cls: SoldierClassId; x: number; y: number }
  | { t: 'heal'; x: number; y: number }
  | { t: 'levelUp'; owner: PlayerId; level: number }
  | { t: 'squadWiped'; owner: PlayerId }
  | { t: 'squadSpawned'; owner: PlayerId; x: number; y: number };
