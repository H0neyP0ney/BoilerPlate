import { ALIENS, type AlienId } from '../data/aliens';
import type { UpgradeId } from '../data/progression';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';

/**
 * Points de saut dans la timeline (outil de test) : juste APRÈS la mort d'un boss (`after`, combat de `fight` s), ou `before` s AVANT son
 * apparition ; niveau atteint à ce moment. Le niveau 20 après le Scarab est calé sur une partie enregistrée (niveau 20-21 vers 5:40), les
 * autres sont estimés.
 */
export const JUMPS = {
  gling: { boss: 'boss_gling', label: 'Après Gling Mère', level: 6, after: true, fight: 15 },
  rhino: { boss: 'boss_rhino', label: 'Après Alpha Rhino', level: 11, after: true, fight: 20 },
  scarab: { boss: 'boss_scarab', label: 'Après Scarab', level: 20, after: true, fight: 40 },
  crab: { boss: 'boss_crab', label: 'Avant Giant Crab', level: 30, after: false, fight: 30 },
} as const satisfies Record<string, { boss: AlienId; label: string; level: number; after: boolean; fight: number }>;
export type JumpId = keyof typeof JUMPS;

/**
 * Préférences du joueur entre les 3 cartes proposées (% des upgrades prises dans les parties enregistrées, docs/bench/runs, 291 choix) :
 * la carte retenue à chaque niveau de la partie avancée est tirée avec ces poids.
 */
const PICK_WEIGHTS: Record<UpgradeId, number> = { damage: 17.9, crit: 12, hp: 11, fireRate: 10.7, maxSquad: 9.3, speed: 8.6, range: 7.9, reinforce: 6.5, magnet: 6.5, recruit: 5.2, xpGain: 4.5 };

/**
 * Partie avancée (outil de test, hors ligne), au point `id` de `JUMPS` : terrain vidé, timeline des vagues reprise juste après l'apparition
 * du boss (ou `fight` s avant), temps de partie ajusté, boss précédents comptés pour l'escalade, niveau du point de saut avec une upgrade par
 * niveau choisie comme un joueur (vraie offre de 3, `PICK_WEIGHTS`), renforts compris, squad pleine (taille max après upgrades) de Gunners
 * seulement (les classes spéciales reviendront avec le système de pièces).
 * Boutons du panneau Triche (dev) et `?jump=gling|rhino|scarab|crab` (build déployé compris). Renvoie le compte rendu à afficher.
 */
export function jumpAhead(sim: Sim, me: PlayerId, id: JumpId = 'scarab'): string {
  if (sim.tutorial?.active) return 'Indisponible pendant le tutoriel';
  const script = sim.config.mode.waves;
  const bosses = (script.timeline ?? [])
    .filter((e) => e.config !== undefined)
    .map((e) => ({ at: e.at, type: script.levels?.[e.level]?.[e.config! - 1]?.groups[0]?.type }))
    .filter((b) => b.type && ALIENS[b.type].boss)
    .sort((a, b) => a.at - b.at);
  const J = JUMPS[id];
  const boss = bosses.find((b) => b.type === J.boss);
  if (!boss) return `Pas de ${J.boss} dans la timeline de ce mode`;
  // après le boss : il est compté comme tué, la timeline reprend juste après lui ; avant : `fight` s plus tôt, lui pas encore tué
  const kills = bosses.filter((b) => (J.after ? b.at <= boss.at : b.at < boss.at)).length;
  const cursor = J.after ? boss.at + 0.01 : Math.max(0, boss.at - J.fight);
  sim.fastForward(cursor + (J.after ? J.fight : 0), cursor, kills); // temps de partie : + la durée du combat qu'on vient de « jouer »
  const sq = sim.squadOf(me);
  if (!sq) return '';
  const reinforcements = sq.fastForward(J.level, (u) => PICK_WEIGHTS[u]);
  // Gunners seulement (classes spéciales retirées du jeu en attendant les pièces) ; les renforts dépassent la taille max, comme en jeu
  sim.respawnSquad(me, Array.from({ length: sq.maxSize + reinforcements }, () => 'trooper'), 2);
  const picks = Object.entries(sq.picked).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([id, n]) => `${id} ×${n}`).join(', ');
  return `${J.label} (${kills} boss tués) — niveau ${sq.level}, ${sq.size} soldats\n${picks}`;
}
