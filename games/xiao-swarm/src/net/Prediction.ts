import type { Circle } from '@xiao/engine/sim';
import { stepAnchor } from '../sim/Squad';
import type { Arena } from '../sim/Arena';

/** Au-delà de cet écart (px) entre prédiction et hôte (réapparition, téléportation), on recale d'un coup. */
const SNAP = 80;
/** Part de l'écart résiduel corrigée à chaque snapshot (0.4 : les petites erreurs de prédiction se fondent sans à-coup). */
const BLEND = 0.4;
/** Historique d'inputs conservé (ticks) : 4 s à 30 Hz, bien plus que n'importe quel aller-retour jouable. */
const HISTORY = 120;

interface Frame {
  n: number;
  mx: number;
  my: number;
}

/**
 * Prédiction de l'ancre de la squad locale d'un client.
 *
 * Chaque tick, le client applique tout de suite son input à une copie de l'ancre (`stepAnchor`, le même code que l'hôte) :
 * le joystick répond sans attendre l'aller-retour. À chaque snapshot, l'hôte donne son ancre et le numéro du dernier input
 * qu'il a pris en compte (`ack`) : on repart de l'ancre de l'hôte et on rejoue les inputs pas encore acquittés
 * (réconciliation). L'écart résiduel est fondu progressivement dans la prédiction.
 */
export class AnchorPredictor {
  /** Ancre prédite, à l'instant client courant. */
  readonly anchor: Circle = { x: 0, y: 0, radius: 18 };
  /** Ancre de l'hôte au dernier snapshot : les positions des soldats reçus s'y rapportent. */
  readonly base = { x: 0, y: 0 };
  private speed = 0;
  private ready = false;
  private readonly history: Frame[] = [];
  /** Dernier input (numéro) que l'hôte jouera avant sa pause de choix d'upgrade : au-delà, la prédiction s'arrête (l'hôte les jettera). Infinity = pas de pause en vue. */
  limitN = Infinity;
  private readonly scratch: Circle = { x: 0, y: 0, radius: 18 };
  /** Ancre après chacun des inputs rejoués au dernier snapshot (de l'input suivant l'ack au tick courant) : les soldats la suivent avec leur inertie (`Mirror`). */
  readonly path: { x: number; y: number }[] = [];
  /** Vitesse de l'ancre au dernier snapshot (px/s). */
  get anchorSpeed(): number {
    return this.speed;
  }

  /** Vrai dès qu'un premier snapshot a calé la prédiction. */
  get active(): boolean {
    return this.ready;
  }

  /** Décalage à ajouter aux positions reçues de l'hôte pour obtenir la position prédite. */
  get dx(): number {
    return this.anchor.x - this.base.x;
  }
  get dy(): number {
    return this.anchor.y - this.base.y;
  }

  /** Un tick client : mémorise l'input du tick `n` et avance l'ancre prédite. `frozen` : monde en pause (choix d'upgrade). */
  step(arena: Arena, n: number, mx: number, my: number, dt: number, frozen: boolean): void {
    this.history.push({ n, mx, my });
    if (this.history.length > HISTORY) this.history.shift();
    if (!this.ready || frozen || n > this.limitN) return;
    stepAnchor(arena, this.anchor, mx, my, this.speed, dt);
  }

  /** Un snapshot : ancre de l'hôte, vitesse de l'ancre, dernier input acquitté. `alive` faux : on suit simplement l'hôte. */
  reconcile(arena: Arena, hostX: number, hostY: number, speed: number, ack: number, dt: number, alive: boolean, frozen: boolean, limitN = Infinity): void {
    this.speed = speed;
    this.limitN = limitN;
    this.base.x = hostX;
    this.base.y = hostY;
    while (this.history.length > 0 && this.history[0].n <= ack) this.history.shift();
    const t = this.scratch;
    t.x = hostX;
    t.y = hostY;
    this.path.length = 0;
    if (alive && !frozen) {
      for (const f of this.history) {
        if (f.n > this.limitN) break;
        stepAnchor(arena, t, f.mx, f.my, speed, dt);
        this.path.push({ x: t.x, y: t.y });
      }
    }
    const ex = t.x - this.anchor.x;
    const ey = t.y - this.anchor.y;
    if (!this.ready || !alive || ex * ex + ey * ey > SNAP * SNAP) {
      this.anchor.x = t.x;
      this.anchor.y = t.y;
      this.ready = alive;
      return;
    }
    this.anchor.x += ex * BLEND;
    this.anchor.y += ey * BLEND;
  }

  /** Squad changée (relance de partie) : repart de zéro. */
  reset(): void {
    this.ready = false;
    this.history.length = 0;
  }
}
