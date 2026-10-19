import type { Circle } from '@xiao/engine/sim';
import { stepAnchor } from '../sim/Squad';
import type { Arena } from '../sim/Arena';
import type { LeashSnap } from './Protocol';

/** Au-delà de cet écart (px) entre prédiction et hôte (réapparition, téléportation), on recale d'un coup. */
const SNAP = 80;
/** Part de l'écart résiduel corrigée à chaque snapshot (0.4 : les petites erreurs de prédiction se fondent sans à-coup). */
const BLEND = 0.4;
/** Historique d'inputs conservé (ticks) : 4 s à 30 Hz, bien plus que n'importe quel aller-retour jouable. */
const HISTORY = 120;
/** Cœur de la laisse extrapolé sur ce nombre de ticks au plus (snapshots perdus : il ne file pas indéfiniment). */
const LEASH_HORIZON = 15;
/**
 * Rappel de la laisse dans le pas client : l'ancre ne s'écarte pas de plus de ce nombre de px par tick de son pas libre. Quand la horde commence à retenir la
 * squad, l'invité ne le sait qu'un aller-retour plus tard : l'écart (jusqu'à ~120 px) se fond en quelques ticks au lieu d'un saut de 80 px.
 */
const LEASH_PULL = 16;

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
  /**
   * Laisse annoncée par l'hôte au tick de l'ack (`Squad.leashed`, dès que l'ancre est à plus de `LEASH_WARN` × rayon du cœur), ou rien : la prédiction la
   * rejoue (même formule que `Squad.update` § 2) sur le cœur de l'hôte, au lieu d'un cœur calculé sur les soldats simulés ici (ils ignorent la poussée des
   * aliens : faux de ~130 px dans une horde). Le cœur est extrapolé à sa vitesse quand il avance vers l'ancre (la squad suit), figé quand la horde le
   * repousse (l'extrapoler alors dépassait l'hôte) : docs/AUDIT_NETCODE.md § 2.1.
   */
  private leash?: LeashSnap;
  /** Extrapoler le cœur de la laisse (il avance vers l'ancre) ou le garder figé. */
  private leashMoves = false;
  /** Ticks écoulés depuis l'ack (rejeu compris) : âge du cœur de la laisse. */
  private leashAge = 0;
  /** Ancre après chacun des inputs rejoués au dernier snapshot (de l'input suivant l'ack au tick courant) : les soldats la suivent avec leur inertie (`Mirror`). */
  readonly path: { x: number; y: number }[] = [];
  /** Vitesse de l'ancre au dernier snapshot (px/s). */
  get anchorSpeed(): number {
    return this.speed;
  }

  /** Inputs envoyés que l'hôte n'a pas encore joués (d'après le dernier `ack` reçu). */
  get unacked(): number {
    return this.history.length;
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

  /**
   * Un tick client : mémorise l'input du tick `n` et avance l'ancre prédite. `frozen` : monde figé chez l'hôte (choix d'upgrade, écran de fin, salle d'attente).
   * Renvoie vrai si l'input est TENU (monde figé, ou après la dernière input jouée avant une pause annoncée) : l'ancre prédite ne bouge pas, et le client envoie
   * alors un input nul à l'hôte (`ClientSession.sendInput`). Sans cela, l'hôte jouait à la reprise les inputs tenus pendant que le client attendait la nouvelle
   * (un aller simple) : la squad de l'invité restait figée puis sautait de 20 px par tick (mesure `sim:netloss -- resume`).
   */
  step(arena: Arena, n: number, mx: number, my: number, dt: number, frozen: boolean): boolean {
    const held = frozen || n > this.limitN;
    this.history.push({ n, mx: held ? 0 : mx, my: held ? 0 : my });
    if (this.history.length > HISTORY) this.history.shift();
    if (!this.ready || held) return held;
    stepAnchor(arena, this.anchor, mx, my, this.speed, dt);
    this.leashAge++;
    const fx = this.anchor.x;
    const fy = this.anchor.y;
    if (this.applyLeash(this.anchor, dt)) {
      // rappel limité (voir `LEASH_PULL`)
      const ex = this.anchor.x - fx;
      const ey = this.anchor.y - fy;
      const e = Math.hypot(ex, ey);
      if (e > LEASH_PULL) {
        this.anchor.x = fx + (ex / e) * LEASH_PULL;
        this.anchor.y = fy + (ey / e) * LEASH_PULL;
      }
    }
    return false;
  }

  /** Retient l'ancre `a` dans la laisse annoncée par l'hôte (cœur à l'âge `leashAge`). Vrai si elle a été retenue. */
  private applyLeash(a: Circle, dt: number): boolean {
    const l = this.leash;
    if (!l) return false;
    const t = this.leashMoves ? Math.min(this.leashAge, LEASH_HORIZON) * dt : 0;
    const cx = l.x + l.vx * t;
    const cy = l.y + l.vy * t;
    const dx = a.x - cx;
    const dy = a.y - cy;
    const d = Math.hypot(dx, dy);
    if (d <= l.r) return false;
    a.x = cx + (dx / d) * l.r;
    a.y = cy + (dy / d) * l.r;
    return true;
  }

  /** Un snapshot : ancre de l'hôte, vitesse de l'ancre, dernier input acquitté, laisse annoncée. `alive` faux : on suit simplement l'hôte. */
  reconcile(arena: Arena, hostX: number, hostY: number, speed: number, ack: number, dt: number, alive: boolean, frozen: boolean, limitN = Infinity, leash?: LeashSnap): void {
    this.speed = speed;
    this.leash = leash;
    this.leashAge = 0;
    this.leashMoves = !!leash && (hostX - leash.x) * leash.vx + (hostY - leash.y) * leash.vy > 0;
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
        this.leashAge++;
        this.applyLeash(t, dt);
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
    this.leash = undefined;
    this.history.length = 0;
  }
}
