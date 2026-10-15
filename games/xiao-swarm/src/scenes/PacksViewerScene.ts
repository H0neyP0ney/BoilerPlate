import Phaser from 'phaser';
import type { AssetEntry } from '@xiao/engine';
import { proceduralKey } from '../art/aliens';
import { ASSETS } from '../assets/manifest';
import { PACK_OF, type Pack } from '../assets/packTable';
import { launchTextureKeys } from '../art/launchTextures';
import { textureWorkshop } from '../art/textureWorkshop';
import { AT_LAUNCH, AT_PACK_2B } from '../art/textureModes';
import { SCENES } from '../config';
import { saveToCode } from '../dev/devSave';
import { SFX, type SfxId } from '../settings';

/**
 * Vue Paquets (dev uniquement) : tous les assets du jeu rangés par paquet de chargement, avec leur poids. À gauche le paquet 1 (chargé au démarrage), à droite
 * le paquet 2a (premières minutes) puis le 2b (ce qui arrive ensuite, enchaîné après 2a). Chaque asset a deux boutons pour passer dans l'un des deux autres paquets.
 * Les visuels viennent de `ASSETS` (`assets/manifest.ts`), les bruitages de `SFX` (`settings.ts`). Save réécrit la table complète
 * `assets/packTable.ts` (effective après rechargement : le jeu la lit au démarrage), Reset revient à cette sauvegarde. Un asset modifié depuis la dernière sauvegarde est surligné en orange. Un visuel du paquet 2 qui n'est pas
 * encore arrivé est remplacé par son dessin procédural (ou absent s'il n'en a pas) : ne pas y mettre ce qui sert dès les premières secondes.
 */
/** Étape de fabrication d'une texture procédurale : avec le paquet 1, à l'arrivée du 2a ou du 2b (`art/textureModes.ts`). */
type TexStage = 'p1' | '2a' | '2b';

interface Item {
  /** Clé de la table `PACK_OF` : adresse du fichier d'un visuel, `sfx:<id>` pour un bruitage. */
  key: string;
  label: string;
  file: string;
  /** Adresse à télécharger pour mesurer le fichier. */
  href: string;
  /** Image affichée (visuels seulement). */
  thumb?: string;
  /** Paquet de la dernière sauvegarde (`PACK_OF`, ou le paquet 1 si l'asset n'y figure pas encore). */
  base: Pack;
  /** Ce qui s'affiche quand ce fichier n'est pas encore là (dessin procédural, emoji, texte) ; absent = rien (l'objet n'est pas dessiné). Pastille rouge. */
  fallback?: string;
  /** Paquet courant (modifié par les boutons). */
  pack: Pack;
  /** Poids du fichier en octets (inconnu tant que la requête n'est pas revenue). */
  size?: number;
}

const PACKS: { id: Pack; title: string; note: string }[] = [
  { id: 'core', title: 'Paquet 1', note: 'chargé au démarrage' },
  { id: '2a', title: 'Paquet 2a', note: 'premières minutes, dès la scène de jeu' },
  { id: '2b', title: 'Paquet 2b', note: 'enchaîné après 2a (aliens tardifs, boss suivants)' },
];
const SHORT: Record<Pack, string> = { core: '1', '2a': '2a', '2b': '2b' };

const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

export class PacksViewerScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private items: Item[] = [];
  private cols = new Map<Pack, HTMLDivElement>();
  private heads = new Map<Pack, HTMLElement>();
  private status!: HTMLSpanElement;
  private alive = true;
  private generatedCol?: HTMLDivElement;

  constructor() {
    super(SCENES.packs);
  }

  create(): void {
    this.alive = true;
    this.cameras.main.setBackgroundColor(0x0b1422);
    this.items = this.collect();
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#0b1422;color:#dfe;font:13px system-ui,sans-serif;padding:12px 16px 40px';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px';
    const title = document.createElement('h2');
    title.textContent = 'Paquets de chargement';
    title.style.margin = '0';
    this.status = document.createElement('span');
    this.status.style.cssText = 'opacity:0.85';
    head.append(
      title,
      this.button('💾 Save', () => void this.save()),
      this.button('↺ Reset', () => {
        for (const it of this.items) it.pack = it.base;
        this.status.textContent = 'Retour à la dernière sauvegarde.';
        this.render();
      }),
      this.button('↻ Actualiser les textures générées', () => {
        this.refreshGenerated();
      }),
      this.button('✕ Retour au jeu', () => this.scene.start(SCENES.game)),
      this.status,
    );
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:10px';
    hint.textContent =
      "La liste déroulante de chaque asset le déplace dans le paquet choisi. Save réécrit assets/packTable.ts (pris en compte au rechargement) ; orange = modifié depuis la dernière sauvegarde. Un asset du paquet 2 pas encore arrivé s'affiche en procédural : garder dans le paquet 1 ce qui sert dès les premières secondes. Colonne de droite : TOUT ce que le code fabrique comme texture (aucun fichier à charger), avec leur mémoire estimée. La liste déroulante d'une texture choisit quand elle est fabriquée : paquet 1 = pendant le chargement (avant l'affichage), paquet 2a (défaut) = en tâche de fond pendant le téléchargement du 2a, paquet 2b = pendant celui du 2b (une texture demandée avant son tour est fabriquée à l'instant : saccade possible si elle est lourde, une carte prismatique coûte ~27 ms, un petit effet 1 à 2 ms) ; 🔒 = obligatoire au lancement ; ⏳ = pas encore fabriquée ; « Enregistrer les cases » réécrit art/textureModes.ts. « Actualiser » relit l'avancement. ● rouge (paquets 2a et 2b seulement) = cet asset a un repli (dessin procédural, emoji ou texte) tant qu'il n'est pas chargé : survoler la pastille pour le détail ; sans pastille, l'objet n'est pas dessiné avant l'arrivée du fichier. Un asset du paquet 1 n'a jamais de pastille : il est chargé avant le premier affichage, son repli ne sert à rien.";
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start';
    const left = document.createElement('div');
    const right = document.createElement('div');
    const generated = document.createElement('div');
    for (const p of PACKS) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '14px';
      const h = document.createElement('div');
      h.style.cssText = 'position:sticky;top:-12px;z-index:1;background:#13233a;padding:6px 10px;border-radius:6px;font-weight:bold;display:flex;justify-content:space-between;gap:8px';
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:4px';
      sec.append(h, list);
      (p.id === 'core' ? left : right).append(sec);
      this.heads.set(p.id, h);
      this.cols.set(p.id, list);
    }
    this.generatedCol = generated;
    this.buildGenerated(generated);
    grid.append(left, right, generated);
    root.append(head, hint, grid);
    document.body.append(root);
    this.root = root;
    this.render();
    void this.fetchSizes();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.root?.remove();
    });
  }

  /** Textures fabriquées à l'arrivée du paquet 2b (`AT_PACK_2B`) : état courant et dernière sauvegarde (`art/textureModes.ts`). */
  private pack2bSet = new Set<string>(AT_PACK_2B);
  private pack2bSaved = new Set<string>(AT_PACK_2B);
  /** Textures fabriquées pendant le chargement, avec le paquet 1 (`AT_LAUNCH`) : état courant et dernière sauvegarde. */
  private launchSet = new Set<string>(AT_LAUNCH);
  private launchSaved = new Set<string>(AT_LAUNCH);

  private modeOf(key: string): TexStage {
    return this.launchSet.has(key) ? 'p1' : this.pack2bSet.has(key) ? '2b' : '2a';
  }

  private setMode(key: string, mode: TexStage): void {
    this.launchSet.delete(key);
    this.pack2bSet.delete(key);
    if (mode === 'p1') this.launchSet.add(key);
    else if (mode === '2b') this.pack2bSet.add(key);
  }
  /** Groupes dépliés de la 3e colonne (conservés quand la colonne est reconstruite). */
  private readonly openGroups = new Set<string>();
  private genStatus?: HTMLSpanElement;

  /**
   * Troisième colonne : TOUT ce que le code fabrique comme texture. Trois sortes :
   *  1. **au lancement, obligatoires** : la recrue assemblée et les replis des images du paquet 2 (cadenas) ;
   *  2. **textures de l'atelier** (`art/textureWorkshop.ts`, rangées par origine) : une liste déroulante par texture (paquet 1 / 2a / 2b : quand elle est fabriquée). Save réécrit
   *     `art/textureModes.ts` (effectif au rechargement), Reset revient à la dernière sauvegarde ; ⏳ = pas encore fabriquée ;
   *  3. **à la demande par nature** (variantes de joueur, textures dynamiques de l'interface) : listées pour mémoire, sans case.
   * La mémoire est estimée en RGBA (largeur × hauteur × 4 octets). « Actualiser » relit l'avancement.
   */
  private buildGenerated(into: HTMLElement): void {
    const workshop = textureWorkshop();
    const fileKeys = new Set<string>();
    for (const e of ASSETS) fileKeys.add(e.type === 'image' ? e.id : `asset:${e.url}`);
    const GROUPS: [RegExp, string][] = [
      [/^fx_/, 'Effets et projectiles (art/fx.ts)'],
      [/^alien_|^spider|^boss_/, 'Aliens : repli procédural (art/alienFallbacks.ts)'],
      [/^soldier_|^gun_|^recruit_/, 'Soldats et recrues (art/soldiers.ts, art/recruits.ts)'],
      [/^ui_card_|^ui_slot_/, "Cartes d'upgrade et slots dérivés (art/cardTextures.ts)"],
      [/^globe_|^star_|^upgrade_orb_/, 'Globes au sol recolorés (art/upgradeOrbs.ts)'],
      [/^turret/, 'Tourelles (art/turret.ts)'],
    ];
    type Row = { key: string; w: number; h: number; img?: HTMLCanvasElement; pending: boolean; lock?: string };
    const byGroup = new Map<string, Row[]>();
    const keys = new Set<string>([...launchTextureKeys(), ...(workshop?.declaredKeys() ?? [])]);
    for (const key of keys) {
      if (key.startsWith('__') || fileKeys.has(key)) continue;
      let row: Row;
      if (workshop?.isPending(key)) {
        const d = workshop.declaredSize(key)!; // pas encore fabriquée : on ne la force pas (`textures.get` la fabriquerait), taille déclarée
        row = { key, w: d.width, h: d.height, pending: true };
      } else {
        if (!this.textures.exists(key)) continue;
        const img = this.textures.get(key).getSourceImage();
        if (!(img instanceof HTMLCanvasElement)) continue;
        row = { key, w: img.width, h: img.height, img, pending: false };
      }
      if (!workshop?.declaredSize(key)) row.lock = 'fabriquée au lancement par son propre code (recrue assemblée)';
      const group = GROUPS.find(([re]) => re.test(key))?.[1] ?? 'Autres (code)';
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(row);
    }

    let total = 0;
    let count = 0;
    let atLaunch = 0;
    let background = 0;
    let onDemand = 0;
    const body = document.createElement('div');

    const rowEl = (t: Row): HTMLDivElement => {
      const r = document.createElement('div');
      const mode: TexStage = t.lock ? 'p1' : this.modeOf(t.key);
      r.style.cssText = `display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:5px;background:#101c30`;
      // choix du moment de fabrication : avec le paquet 1 (avant l'affichage), à l'arrivée du paquet 2a ou à celle du paquet 2b
      const box = document.createElement('select');
      box.style.cssText = 'flex:none;padding:1px 2px;font:inherit;font-size:11px;cursor:pointer;max-width:92px';
      for (const [value, text] of [['p1', 'Paquet 1'], ['2a', 'Paquet 2a'], ['2b', 'Paquet 2b']] as const) box.append(new Option(text, value, false, value === mode));
      if (t.lock) {
        box.disabled = true;
        box.title = t.lock;
      } else {
        box.title = 'Paquet 1 : fabriquée pendant le chargement, avant l’affichage (rallonge le chargement). Paquet 2a (défaut) : en tâche de fond pendant le téléchargement du paquet 2a, dès l’affichage du jeu. Paquet 2b : en tâche de fond pendant le téléchargement du paquet 2b. Demandée avant son tour, elle est fabriquée à l’instant (saccade possible si elle est lourde).';
        box.addEventListener('change', () => {
          this.setMode(t.key, box.value as TexStage);
          this.refreshGenerated();
        });
      }
      const thumb = document.createElement('div');
      thumb.style.cssText = 'width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;background:#0b1422;border-radius:4px;overflow:hidden';
      if (t.img) {
        const cv = document.createElement('canvas');
        const k = Math.min(1, 36 / t.w, 36 / t.h);
        cv.width = Math.max(1, Math.round(t.w * k));
        cv.height = Math.max(1, Math.round(t.h * k));
        cv.getContext('2d')?.drawImage(t.img, 0, 0, cv.width, cv.height);
        thumb.append(cv);
      } else thumb.textContent = t.lock ? '🔒' : '⏳';
      const text = document.createElement('div');
      text.style.cssText = 'flex:1;min-width:0';
      const name = document.createElement('div');
      name.textContent = t.key;
      name.title = t.key;
      name.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const dim = document.createElement('div');
      const state = t.lock ? '🔒 ' + t.lock.split(':')[0] : mode === 'p1' ? 'paquet 1' : t.pending ? `en attente (paquet ${mode})` : 'fabriquée';
      dim.textContent = `${t.w} × ${t.h} px · ${state}`;
      dim.title = t.lock ?? '';
      dim.style.cssText = 'font-size:11px;color:#8aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      text.append(name, dim);
      const size = document.createElement('span');
      size.textContent = kb(t.w * t.h * 4);
      size.style.cssText = 'flex:none;width:64px;text-align:right;opacity:0.85';
      r.append(box, thumb, text, size);
      return r;
    };

    const section = (group: string, list: Row[], lockedOnly = false): void => {
      list.sort((a, b) => b.w * b.h - a.w * a.h || (a.key < b.key ? -1 : 1));
      const mem = list.reduce((s, t) => s + t.w * t.h * 4, 0);
      total += mem;
      count += list.length;
      const free = list.filter((t) => !t.lock);
      const la = lockedOnly ? 0 : free.filter((t) => this.modeOf(t.key) === 'p1').length;
      const od = lockedOnly ? 0 : free.filter((t) => this.modeOf(t.key) === '2b').length;
      const bg = lockedOnly ? 0 : free.length - la - od; // paquet 2a
      atLaunch += la + (lockedOnly ? list.length : 0);
      background += bg;
      onDemand += od;
      const det = document.createElement('details');
      det.style.marginBottom = '8px';
      det.open = this.openGroups.has(group) || (this.openGroups.size === 0 && list.length <= 12);
      det.addEventListener('toggle', () => {
        if (det.open) this.openGroups.add(group);
        else this.openGroups.delete(group);
      });
      const sum = document.createElement('summary');
      sum.style.cssText = 'cursor:pointer;background:#13233a;padding:5px 10px;border-radius:6px;font-weight:bold;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const label = document.createElement('span');
      const waiting = list.filter((t) => t.pending).length;
      label.textContent = `${group} — ${list.length} · ${kb(mem)}${waiting ? ` · ${waiting} ⏳` : ''}${lockedOnly ? '' : ` · ${la} paquet 1, ${bg} paquet 2a, ${od} paquet 2b`}`;
      sum.append(label);
      if (!lockedOnly && free.length > 0) {
        const all = (mode: TexStage, text: string, hint: string): HTMLButtonElement => {
          const b = this.button(text, () => {
            for (const t of free) this.setMode(t.key, mode);
            this.refreshGenerated();
          }, true);
          b.title = hint;
          b.addEventListener('click', (ev) => ev.stopPropagation());
          return b;
        };
        sum.append(
          all('p1', 'tout paquet 1', 'Toutes les textures du groupe : fabriquées pendant le chargement'),
          all('2a', 'tout paquet 2a', 'Toutes les textures du groupe : fabriquées à l’arrivée du paquet 2a'),
          all('2b', 'tout paquet 2b', 'Toutes les textures du groupe : fabriquées à l’arrivée du paquet 2b'),
        );
      }
      det.append(sum);
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:4px';
      for (const t of list) col.append(rowEl(t));
      det.append(col);
      body.append(det);
    };

    // 1. au lancement, obligatoires
    const launchRows = [...byGroup.entries()].flatMap(([, list]) => list.filter((t) => t.lock));
    for (const rows of byGroup.values()) rows.splice(0, rows.length, ...rows.filter((t) => !t.lock));
    if (launchRows.length > 0) section('Au lancement, obligatoires (recrue assemblée)', launchRows, true);
    // 2. atelier
    for (const [group, list] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) if (list.length > 0) section(group, list);

    // 3. à la demande par nature
    const DYNAMIC: [string, string][] = [
      ['Variantes de couleur d’un joueur (art/playerHue.ts)', 'soldier_ / gun_ / recruit_ + #N : recolorées à la première apparition d’une squad d’un autre emplacement (multijoueur seulement) ; rien en solo.'],
      ['Carte inclinée au survol (view/CardTilt.ts)', 'photo dynamique de la carte survolée, refaite à chaque survol dans l’écran de choix d’upgrade : dépend de l’interface.'],
      ['Lumière holographique de la carte prismatique (view/HoloLight.ts)', 'texture dynamique + masque, redessinés à chaque image tant que la carte est visible.'],
      ['Reflet du bouton Reroll (view/ButtonShine.ts)', 'canvas découpé à la silhouette du bouton, créé à l’ouverture de l’écran de choix.'],
      ['Déformation des ondes de choc (view/ShockDistort.ts)', 'textures de bord, d’anneau et de carte de déformation, créées à la première onde de choc.'],
      ['Jauge circulaire de la timeline (view/TimelineHud.ts)', 'ui_tl_ring_live : canvas redessiné à chaque changement d’angle, créé à la construction du HUD.'],
      ['Tronçons de sol (view/ArenaView.ts)', 'seulement sans l’image du sol (ground_tile) : jamais en pratique.'],
    ];
    const dyn = document.createElement('details');
    dyn.style.marginBottom = '8px';
    dyn.open = this.openGroups.has('dyn');
    dyn.addEventListener('toggle', () => (dyn.open ? this.openGroups.add('dyn') : this.openGroups.delete('dyn')));
    const dsum = document.createElement('summary');
    dsum.style.cssText = 'cursor:pointer;background:#13233a;padding:5px 10px;border-radius:6px;font-weight:bold';
    dsum.textContent = `À la demande par nature (non préfabricables) — ${DYNAMIC.length} familles`;
    dyn.append(dsum);
    for (const [name, note] of DYNAMIC) {
      const r = document.createElement('div');
      r.style.cssText = 'padding:4px 8px;margin-top:3px;border-radius:5px;background:#101c30';
      const n = document.createElement('div');
      n.textContent = name;
      n.style.fontWeight = '600';
      const d = document.createElement('div');
      d.textContent = note;
      d.style.cssText = 'font-size:11px;color:#8aa';
      r.append(n, d);
      dyn.append(r);
    }
    body.append(dyn);

    // en-tête : totaux, boutons Enregistrer / Reset des cases
    const h = document.createElement('div');
    h.style.cssText = 'position:sticky;top:-12px;z-index:1;background:#2a1f3a;padding:6px 10px;border-radius:6px;font-weight:bold;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px';
    const t1 = document.createElement('span');
    t1.textContent = 'Générés par le code';
    const t2 = document.createElement('span');
    t2.textContent = `${count} textures · ${kb(total)} · ${atLaunch} paquet 1 · ${background} paquet 2a · ${onDemand} paquet 2b`;
    t2.style.fontWeight = 'normal';
    const dirty = [...this.pack2bSet].sort().join() !== [...this.pack2bSaved].sort().join() || [...this.launchSet].sort().join() !== [...this.launchSaved].sort().join();
    const save = this.button('💾 Enregistrer les cases', () => void this.saveModes(), true);
    const reset = this.button('↺', () => {
      this.pack2bSet = new Set(this.pack2bSaved);
      this.launchSet = new Set(this.launchSaved);
      this.refreshGenerated();
    }, true);
    reset.title = 'Revenir aux cases de la dernière sauvegarde';
    this.genStatus = document.createElement('span');
    this.genStatus.style.cssText = 'font-weight:normal;font-size:11px;color:#9fe';
    this.genStatus.textContent = dirty ? 'modifié depuis la dernière sauvegarde' : '';
    h.append(t1, t2, save, reset, this.genStatus);
    into.append(h, body);
  }

  /** Reconstruit la 3e colonne (cases modifiées, ou « Actualiser »). */
  private refreshGenerated(): void {
    if (!this.generatedCol) return;
    this.generatedCol.replaceChildren();
    this.buildGenerated(this.generatedCol);
  }

  /** Écrit le moment de fabrication des textures (paquets 1 / 2b) dans `art/textureModes.ts`. */
  private async saveModes(): Promise<void> {
    if (this.genStatus) this.genStatus.textContent = 'Save…';
    const msg = await saveToCode('texturemodes', { pack2b: [...this.pack2bSet], launch: [...this.launchSet] });
    if (msg.startsWith('✔')) {
      this.pack2bSaved = new Set(this.pack2bSet);
      this.launchSaved = new Set(this.launchSet);
    }
    this.refreshGenerated();
    if (this.genStatus) this.genStatus.textContent = msg;
  }

  /** Visuels (`ASSETS`) et bruitages (`SFX`), un par fichier. */
  private collect(): Item[] {
    const byKey = new Map<string, Item>();
    for (const e of ASSETS) {
      const base = PACK_OF[e.url] ?? 'core';
      const names = e.type === 'image' ? [e.id] : Object.keys(e.sprites);
      const label = names.length > 4 ? `${names.slice(0, 4).join(', ')} … (+${names.length - 4})` : names.join(', ');
      const prev = byKey.get(e.url);
      if (prev) {
        prev.label += ` · ${label}`;
        continue;
      }
      byKey.set(e.url, { key: e.url, label, file: e.url, href: `assets/${e.url}`, thumb: `assets/${e.url}`, fallback: this.fallbackOf(e), base, pack: base });
    }
    for (const id of Object.keys(SFX) as SfxId[]) {
      const key = `sfx:${id}`;
      const base = PACK_OF[key] ?? 'core';
      byKey.set(key, { key, label: `🔊 ${id}`, file: SFX[id].url[0], href: SFX[id].url[0], base, pack: base });
    }
    return [...byKey.values()];
  }

  /**
   * Repli de ce fichier tant qu'il n'est pas chargé : planches d'unités = dessin procédural du même id (texture `proceduralKey` déjà fabriquée au démarrage) ;
   * quelques images isolées ont un repli connu (globe d'XP, fusée, œuf, sol, icônes de power-up en emoji, chiffres de critique en texte, pièces de la recrue).
   */
  private fallbackOf(e: AssetEntry): string | undefined {
    if (e.type !== 'image') {
      const ids = Object.keys(e.sprites).filter((id) => this.textures.exists(proceduralKey(id)));
      return ids.length ? `dessin procédural : ${ids.join(', ')}` : undefined;
    }
    if (e.id === 'alien_boss_egg') return 'dessin procédural : alien_boss_egg_proc';
    if (e.id === 'xp_orb') return 'dessin procédural : fx_xp';
    if (e.id === 'fx_rocket_png') return 'dessin procédural : fx_rocket';
    if (e.id === 'ground_tile') return 'sol dessiné par le code (drawGroundChunk)';
    if (e.id.startsWith('powerup_icon_')) return 'emoji du power-up';
    if (e.id.startsWith('crit_')) return 'texte « ! 123 » (chiffres de critique)';
    if (e.id.startsWith('recruit_part_')) return 'recrue dessinée par le code (art/recruits.ts)';
    return undefined;
  }

  /** Poids de chaque fichier (téléchargé, quelques-uns à la fois) : la liste est retriée à chaque réponse groupée. */
  private async fetchSizes(): Promise<void> {
    const queue = this.items.filter((it) => it.size === undefined);
    let done = 0;
    const worker = async (): Promise<void> => {
      for (let it = queue.shift(); it && this.alive; it = queue.shift()) {
        try {
          const res = await fetch(it.href);
          it.size = res.ok ? (await res.blob()).size : 0; // le serveur de dev n'envoie pas `content-length` aux requêtes HEAD : on mesure le fichier lui-même
        } catch {
          it.size = 0;
        }
        if (++done % 25 === 0 && this.alive) this.render();
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (this.alive) this.render();
  }

  private button(label: string, fn: () => void, small = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = small ? 'padding:1px 6px;font:inherit;font-size:12px;cursor:pointer' : 'padding:4px 10px;font:inherit;cursor:pointer';
    b.addEventListener('click', () => {
      fn();
      b.blur();
    });
    return b;
  }

  private row(it: Item): HTMLDivElement {
    const r = document.createElement('div');
    const moved = it.pack !== it.base;
    r.style.cssText = `display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:5px;background:${moved ? '#3a2a10' : '#101c30'};${moved ? 'outline:1px solid #ffb02a;' : ''}`;
    const thumb = document.createElement('div');
    thumb.style.cssText = 'width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;background:#0b1422;border-radius:4px;overflow:hidden';
    if (it.thumb) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = it.thumb;
      img.style.cssText = 'max-width:36px;max-height:36px;object-fit:contain';
      thumb.append(img);
    } else thumb.textContent = '🔊';
    const text = document.createElement('div');
    text.style.cssText = 'flex:1;min-width:0';
    const name = document.createElement('div');
    name.textContent = it.label;
    if (it.fallback && it.pack !== 'core') { // un asset du paquet 1 est chargé avant le premier affichage : son repli ne sert à rien, donc pas de pastille
      const dot = document.createElement('span');
      dot.textContent = '●';
      dot.title = `Repli : ${it.fallback}`;
      dot.style.cssText = 'color:#ff3b3b;margin-right:5px;font-size:11px;cursor:help';
      name.prepend(dot);
    }
    name.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    name.title = it.label;
    const file = document.createElement('div');
    file.textContent = moved ? `${it.file}  ·  modifié (sauvegardé : ${SHORT[it.base]})` : it.file;
    file.style.cssText = `font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${moved ? '#ffb02a' : '#8aa'}`;
    text.append(name, file);
    const size = document.createElement('span');
    size.textContent = it.size === undefined ? '…' : it.size ? kb(it.size) : '?';
    size.style.cssText = 'flex:none;width:64px;text-align:right;opacity:0.85';
    r.append(thumb, text, size);
    // liste déroulante du paquet : le choix déplace l'asset
    const pick = document.createElement('select');
    pick.style.cssText = 'flex:none;padding:2px 4px;font:inherit;font-size:12px;cursor:pointer';
    pick.title = 'Paquet de chargement de cet asset';
    for (const p of PACKS) pick.append(new Option(p.title, p.id, false, p.id === it.pack));
    pick.addEventListener('change', () => {
      it.pack = pick.value as Pack;
      this.render();
    });
    r.append(pick);
    return r;
  }

  /** (Re)dessine les trois listes et leurs totaux, triées par poids décroissant. */
  private render(): void {
    for (const p of PACKS) {
      const list = this.cols.get(p.id)!;
      list.replaceChildren();
      const mine = this.items.filter((it) => it.pack === p.id).sort((a, b) => (b.size ?? 0) - (a.size ?? 0) || a.label.localeCompare(b.label));
      for (const it of mine) list.append(this.row(it));
      const total = mine.reduce((s, it) => s + (it.size ?? 0), 0);
      const pending = mine.some((it) => it.size === undefined);
      const h = this.heads.get(p.id)!;
      h.replaceChildren();
      const t = document.createElement('span');
      t.textContent = `${p.title} — ${p.note}`;
      const n = document.createElement('span');
      n.textContent = `${mine.length} fichiers · ${kb(total)}${pending ? '…' : ''}`;
      n.style.fontWeight = 'normal';
      h.append(t, n);
    }
  }

  /** Écrit dans le code les assets qui ne sont pas dans leur paquet par défaut. */
  private async save(): Promise<void> {
    const lines = [...this.items]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((it) => `  '${it.key}': '${it.pack}',`);
    const code = `export const PACK_OF: Record<string, Pack> = {\n${lines.join('\n')}\n};`;
    this.status.textContent = 'Save…';
    const msg = await saveToCode('packs', { code });
    this.status.textContent = msg;
    if (msg.startsWith('✔')) {
      for (const it of this.items) it.base = it.pack; // sauvegardé : plus rien d'orange
      this.render();
    }
  }
}
