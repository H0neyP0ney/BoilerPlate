import { ALIENS } from '../data/aliens';
import type { UpgradeId } from '../data/progression';
import type { Sim } from '../sim/Sim';
import type { PlayerId } from '../sim/types';

/** Partie avancée (« Scarab tué ») : niveau atteint, durée du combat de boss (s). */
const JUMP = { level: 20, fight: 40 };

/**
 * Préférences du joueur entre les 3 cartes proposées (% des upgrades prises dans les parties enregistrées, docs/bench/runs, 291 choix) :
 * la carte retenue à chaque niveau de la partie avancée est tirée avec ces poids.
 */
const PICK_WEIGHTS: Record<UpgradeId, number> = { damage: 17.9, crit: 12, hp: 11, fireRate: 10.7, maxSquad: 9.3, speed: 8.6, range: 7.9, reinforce: 6.5, magnet: 6.5, recruit: 5.2, xpGain: 4.5 };

/**
 * Partie avancée (outil de test, hors ligne) : juste après la mort du Scarab (mini-boss de 5:00). Terrain vidé, timeline des vagues reprise
 * juste après son apparition (temps de partie : + `JUMP.fight` s de combat), boss précédents comptés pour l'escalade, niveau `JUMP.level`
 * avec une upgrade par niveau choisie comme un joueur (vraie offre de 3, `PICK_WEIGHTS`), renforts compris, squad pleine (taille max après
 * upgrades) de Gunners seulement (les classes spéciales reviendront avec le système de pièces). Calé sur une partie enregistrée (docs/bench/runs : niveau 20-21 et 12-14 soldats vers 5:40).
 * Bouton du panneau Triche (dev) et `?jump=scarab` (build déployé compris). Renvoie le compte rendu à afficher.
 */
export function jumpAhead(sim: Sim, me: PlayerId): string {
  if (sim.tutorial?.active) return 'Indisponible pendant le tutoriel';
  const script = sim.config.mode.waves;
  const bosses = (script.timeline ?? [])
    .filter((e) => e.config !== undefined)
    .map((e) => ({ at: e.at, type: script.levels?.[e.level]?.[e.config! - 1]?.groups[0]?.type }))
    .filter((b) => b.type && ALIENS[b.type].boss)
    .sort((a, b) => a.at - b.at);
  const scarab = bosses.find((b) => b.type === 'boss_scarab');
  if (!scarab) return 'Pas de Scarab dans la timeline de ce mode';
  const kills = bosses.filter((b) => b.at <= scarab.at).length;
  sim.fastForward(scarab.at + JUMP.fight, scarab.at + 0.01, kills);
  const sq = sim.squadOf(me);
  if (!sq) return '';
  const reinforcements = sq.fastForward(JUMP.level, (id) => PICK_WEIGHTS[id]);
  // Gunners seulement (classes spéciales retirées du jeu en attendant les pièces) ; les renforts dépassent la taille max, comme en jeu
  sim.respawnSquad(me, Array.from({ length: sq.maxSize + reinforcements }, () => 'trooper'), 2);
  const picks = Object.entries(sq.picked).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([id, n]) => `${id} ×${n}`).join(', ');
  return `Scarab tué (${kills} boss) — niveau ${sq.level}, ${sq.size} soldats\n${picks}`;
}
