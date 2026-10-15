import type Phaser from 'phaser';
import { canvasTexture, captureCanvasTextures } from './canvasTexture';

/**
 * Atelier de textures dessinées par le code : au lieu de tout fabriquer au lancement, on DÉCLARE les textures (clé, taille, dessin) et l'atelier les fabrique
 * en tâche de fond, par petites tranches de temps (quelques ms toutes les 16 ms), dans un ordre de priorité. Une texture demandée avant d'être prête est fabriquée
 * tout de suite (priorité absolue) : `install()` fait passer `textures.get / exists / getFrame` par l'atelier, donc aucun code d'affichage n'a à le savoir.
 *
 * `declare(fn)` exécute `fn` (qui appelle `canvasTexture` comme avant) en mode « déclaration » : les dessins sont mémorisés, pas exécutés. `declareLazy` déclare une
 * texture fabriquée par une fonction à soi (assemblage de plusieurs images, recoloration…).
 */
interface Entry {
  key: string;
  width: number;
  height: number;
  priority: number;
  order: number;
  build: () => void;
}

type TextureManagerHooks = {
  get: (key: string, ...rest: unknown[]) => unknown;
  exists: (key: string) => boolean;
  getFrame: (key: string, ...rest: unknown[]) => unknown;
};

export class TextureFactory {
  private readonly pending = new Map<string, Entry>();
  private readonly declared = new Map<string, { width: number; height: number }>();
  private sorted: Entry[] | null = null;
  private order = 0;
  private timer = 0;
  private readonly rawExists: (key: string) => boolean;
  /** Textures fabriquées à la demande (avant leur tour en tâche de fond) : clé, durée (ms), instant (ms depuis le chargement de la page). */
  readonly onDemand: { key: string; ms: number; at: number }[] = [];
  /** Temps de calcul cumulé (ms) de toutes les fabrications de l'atelier. */
  busyMs = 0;
  /** Filtre de préfabrication : une texture pour laquelle il répond faux n'est jamais fabriquée en tâche de fond (seulement à la demande). Absent : toutes le sont. */
  prefetch?: (key: string) => boolean;
  /** Appelé quand la file est vide (fabrication en tâche de fond terminée). */
  onDone?: () => void;
  /** Appelé après chaque fabrication À LA DEMANDE (avant son tour) : clé et durée en ms (une saccade possible si la durée dépasse quelques ms). */
  onDemandBuilt?: (key: string, ms: number) => void;

  constructor(private readonly scene: Phaser.Scene) {
    const tm = scene.textures;
    const exists = tm.exists.bind(tm); // l'original : `install()` le remplace ensuite
    this.rawExists = (key) => exists(key);
  }

  /** Déclare les textures que `fn` créerait avec `canvasTexture` (non dessinées). `priority(key)` : plus petit = fabriquée plus tôt. `skip(key)` vrai : la texture n'est pas déclarée. Renvoie les clés déclarées. */
  declare(fn: () => void, priority: (key: string) => number = () => 0, skip: (key: string) => boolean = () => false): string[] {
    const keys: string[] = [];
    for (const t of captureCanvasTextures(fn)) {
      if (skip(t.key)) continue; // pas besoin de cette texture (ex. repli d'un visuel dont le fichier est déjà chargé) : jamais fabriquée
      const added = this.add({ key: t.key, width: t.width, height: t.height, priority: priority(t.key), order: 0, build: () => canvasTexture(this.scene, t.key, t.width, t.height, t.draw) });
      if (added) keys.push(t.key);
    }
    return keys;
  }

  /** Déclare une texture que `build` fabrique elle-même (elle doit créer la texture `key`). `width` × `height` : taille attendue (estimation de mémoire). */
  declareLazy(key: string, width: number, height: number, build: () => void, priority = 0): void {
    this.add({ key, width, height, priority, order: 0, build });
  }

  private add(e: Entry): boolean {
    if (this.rawExists(e.key) || this.pending.has(e.key)) return false;
    e.order = this.order++;
    this.pending.set(e.key, e);
    this.declared.set(e.key, { width: e.width, height: e.height });
    this.sorted = null;
    return true;
  }

  /** Cette texture est déclarée et pas encore fabriquée. */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /** Taille déclarée d'une texture de l'atelier (fabriquée ou non). */
  declaredSize(key: string): { width: number; height: number } | undefined {
    return this.declared.get(key);
  }

  /** Clés de toutes les textures déclarées à l'atelier. */
  declaredKeys(): string[] {
    return [...this.declared.keys()];
  }

  /** Renonce à une texture en attente (elle sera fournie autrement : image chargée à sa place). */
  discard(key: string): void {
    this.pending.delete(key);
  }

  get remaining(): number {
    return this.pending.size;
  }

  /** Fabrique la texture tout de suite si elle est en attente (priorité absolue). Renvoie vrai si elle vient d'être fabriquée. */
  ensure(key: string): boolean {
    const e = this.pending.get(key);
    if (!e) return false;
    this.buildEntry(e, true);
    return true;
  }

  private buildEntry(e: Entry, onDemand: boolean): void {
    this.pending.delete(e.key); // avant de dessiner : `canvasTexture` interroge `textures.exists`, qui repasserait par l'atelier
    const t = performance.now();
    e.build();
    const ms = performance.now() - t;
    this.busyMs += ms;
    if (onDemand) {
      this.onDemand.push({ key: e.key, ms, at: performance.now() });
      this.onDemandBuilt?.(e.key, ms);
    }
  }

  private next(): Entry | undefined {
    if (!this.sorted) this.sorted = [...this.pending.values()].sort((a, b) => a.priority - b.priority || a.order - b.order);
    while (this.sorted.length > 0) {
      const e = this.sorted.shift()!;
      if (this.pending.get(e.key) === e && this.wanted(e.key)) return e;
    }
    return undefined;
  }

  private wanted(key: string): boolean {
    return !this.prefetch || this.prefetch(key);
  }

  /** Reste-t-il une texture à fabriquer en tâche de fond ? (les textures « à la demande seulement » ne comptent pas) */
  private hasWanted(): boolean {
    for (const key of this.pending.keys()) if (this.wanted(key)) return true;
    return false;
  }

  /** Fait passer `textures.get / exists / getFrame` par l'atelier : une clé en attente est fabriquée à l'instant où on la demande. À appeler une fois. */
  install(): void {
    const tm = this.scene.textures as unknown as TextureManagerHooks;
    const wrap = <A extends unknown[], R>(orig: (key: string, ...rest: A) => R): ((key: string, ...rest: A) => R) => {
      return (key, ...rest) => {
        if (typeof key === 'string' && this.pending.has(key)) this.ensure(key);
        return orig.call(tm, key, ...rest);
      };
    };
    tm.get = wrap(tm.get) as TextureManagerHooks['get'];
    tm.exists = wrap(tm.exists) as TextureManagerHooks['exists'];
    tm.getFrame = wrap(tm.getFrame) as TextureManagerHooks['getFrame'];
  }

  /**
   * Lance la fabrication en tâche de fond : `budgetMs` de calcul au plus toutes les `everyMs` ms (une texture n'est jamais coupée en deux : la tranche peut un peu dépasser).
   * Sans effet si elle tourne déjà.
   */
  start(budgetMs = 4, everyMs = 16): void {
    if (this.timer || !this.hasWanted()) return;
    const tick = (): void => {
      this.timer = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < budgetMs) {
        const e = this.next();
        if (!e) break;
        this.buildEntry(e, false);
      }
      if (this.hasWanted()) this.timer = window.setTimeout(tick, everyMs);
      else this.onDone?.();
    };
    this.timer = window.setTimeout(tick, everyMs);
  }

  /** Fabrique tout ce qui reste, tout de suite (outils de dev), y compris les textures « à la demande seulement ». */
  buildAll(): void {
    const keep = this.prefetch;
    this.prefetch = undefined;
    this.sorted = null;
    for (let e = this.next(); e; e = this.next()) this.buildEntry(e, false);
    this.prefetch = keep;
  }
}

/**
 * Une clé de texture absente affiche par défaut le carré vert « __MISSING » de Phaser : on le remplace par une texture transparente (rien n'est dessiné tant que
 * l'image n'est pas chargée ou fabriquée, sauf si un repli existe sous cette clé). À appeler une fois au démarrage.
 */
export function hideMissingTexture(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (tm.exists('__MISSING')) tm.remove('__MISSING');
  tm.createCanvas('__MISSING', 32, 32); // canvas vide = transparent
}
