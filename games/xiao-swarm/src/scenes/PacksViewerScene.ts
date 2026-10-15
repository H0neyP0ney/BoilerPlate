import Phaser from 'phaser';
import type { AssetEntry } from '@xiao/engine';
import { proceduralKey } from '../art/aliens';
import { fileFallback, sheetFallback, textureFallback } from '../art/fallbackRegistry';
import { ASSETS } from '../assets/manifest';
import { PACK_OF, type Pack } from '../assets/packTable';
import { launchTextureKeys } from '../art/launchTextures';
import { texturePriority, textureWorkshop } from '../art/textureWorkshop';
import { AT_LAUNCH, AT_PACK_2B } from '../art/textureModes';
import { SCENES } from '../config';
import { saveToCode } from '../dev/devSave';
import { SFX, type SfxId } from '../settings';

/**
 * Vue Paquets (dev uniquement) : tous les assets du jeu rangés par paquet. À gauche le paquet 1 (chargé / fabriqué avant l'affichage), à droite le paquet 2a (premières
 * minutes) puis le 2b (ce qui arrive ensuite, enchaîné après 2a). Deux sortes de lignes, avec la même liste déroulante :
 *  - **fichiers** (visuels de `ASSETS`, bruitages de `SFX`), fond bleu : le paquet où ils sont téléchargés, avec leur poids. Save réécrit la table `assets/packTable.ts` ;
 *  - **textures procédurales** (dessinées par le code, atelier `art/textureWorkshop.ts`), fond ROSE : le paquet pendant lequel elles sont fabriquées, avec leur mémoire
 *    estimée (largeur × hauteur × 4). Save réécrit `art/textureModes.ts` (`AT_LAUNCH` = paquet 1, `AT_PACK_2B` = paquet 2b, le reste = paquet 2a).
 * Un seul Save, effectif au rechargement ; Reset revient à la dernière sauvegarde ; un asset modifié depuis la dernière sauvegarde est cerclé d'orange. Règles : `docs/CHARGEMENT.md`.
 */
interface Item {
  /** Clé de la table `PACK_OF` : adresse du fichier d'un visuel, `sfx:<id>` pour un bruitage, `tex:<clé>` pour une texture procédurale. */
  key: string;
  label: string;
  file: string;
  /** Adresse à télécharger pour mesurer le fichier (vide pour une texture procédurale). */
  href: string;
  /** Image affichée (visuels seulement). */
  thumb?: string;
  /** Paquet de la dernière sauvegarde (`PACK_OF`, ou le paquet 1 si l'asset n'y figure pas encore ; `AT_LAUNCH` / `AT_PACK_2B` pour une texture procédurale). */
  base: Pack;
  /** Ce qui s'affiche quand ce fichier n'est pas encore là (dessin procédural, emoji, texte) ; absent = rien (l'objet n'est pas dessiné). Pastille rouge. */
  fallback?: string;
  /** Paquet courant (modifié par la liste déroulante). */
  pack: Pack;
  /** Poids du fichier en octets (inconnu tant que la requête n'est pas revenue) ; mémoire estimée pour une texture procédurale. */
  size?: number;
  /** Rang de chargement ou de fabrication : bruitages d'abord (ordre de `SFX`), puis visuels (ordre de `ASSETS`), puis textures procédurales (priorité, puis ordre de déclaration) ; tri « ordre de chargement ». */
  order: number;
  /** Présent = texture procédurale (fond rose). */
  proc?: { w: number; h: number; img?: HTMLCanvasElement; pending: boolean; group: string; lock?: string };
}

const PACKS: { id: Pack; title: string; note: string }[] = [
  { id: 'core', title: 'Paquet 1', note: 'chargé / fabriqué avant l’affichage' },
  { id: '2a', title: 'Paquet 2a', note: 'premières minutes, dès la scène de jeu' },
  { id: '2b', title: 'Paquet 2b', note: 'enchaîné après 2a (aliens tardifs, boss suivants)' },
];
const SHORT: Record<Pack, string> = { core: '1', '2a': '2a', '2b': '2b' };

const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

const PINK = '#3a1830';
const BLUE = '#101c30';

/** Groupes d'origine des textures procédurales (affichés sur la 2e ligne de chaque rangée). */
const GROUPS: [RegExp, string][] = [
  [/^fx_/, 'effets et projectiles'],
  [/^alien_|^spider|^boss_/, 'repli procédural d’alien'],
  [/^soldier_|^gun_|^recruit_/, 'soldats et recrues'],
  [/^ui_card_|^ui_slot_/, 'cartes d’upgrade et slots dérivés'],
  [/^globe_|^star_|^upgrade_orb_/, 'globes au sol recolorés'],
];

export class PacksViewerScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private items: Item[] = [];
  private cols = new Map<Pack, HTMLDivElement>();
  private heads = new Map<Pack, HTMLElement>();
  private status!: HTMLSpanElement;
  private alive = true;
  /** Tri des listes : par poids décroissant, ou par ordre de chargement (fichiers : bruitages puis visuels dans l'ordre du manifeste ; textures : ordre de fabrication de l'atelier). */
  private sortBy: 'size' | 'load' = 'size';
  /** Dernière sauvegarde des textures procédurales (`art/textureModes.ts`). */
  private launchSaved = new Set<string>(AT_LAUNCH);
  private pack2bSaved = new Set<string>(AT_PACK_2B);

  constructor() {
    super(SCENES.packs);
  }

  create(): void {
    this.alive = true;
    this.launchSaved = new Set<string>(AT_LAUNCH);
    this.pack2bSaved = new Set<string>(AT_PACK_2B);
    this.cameras.main.setBackgroundColor(0x0b1422);
    this.items = [...this.collect(), ...this.collectProcedural()];
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
      this.button('↻ Actualiser les textures', () => this.refreshProcedural()),
      this.sortSelect(),
      this.button('✕ Retour au jeu', () => this.scene.start(SCENES.game)),
      this.status,
    );
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:10px';
    hint.textContent =
      "La liste déroulante de chaque ligne la déplace dans le paquet choisi. Fond bleu = fichier à télécharger (poids du fichier) ; fond ROSE = texture procédurale dessinée par le code (mémoire estimée, aucun fichier) : son paquet est celui pendant lequel elle est fabriquée (paquet 1 = avant l'affichage, paquet 2a = en tâche de fond pendant le téléchargement du 2a (défaut), paquet 2b = pendant celui du 2b ; une texture demandée avant son tour est fabriquée à l'instant : saccade possible si elle est lourde, une carte prismatique coûte ~27 ms, un petit effet 1 à 2 ms). Save réécrit assets/packTable.ts et art/textureModes.ts (pris en compte au rechargement) ; cerclé d'orange = modifié depuis la dernière sauvegarde. 🔒 = obligatoire au paquet 1 ; ⏳ = pas encore fabriquée ; « Actualiser » relit l'avancement de l'atelier ; la liste « Tri » classe chaque colonne par poids ou par ordre de chargement (bruitages, visuels dans l'ordre du manifeste, puis textures dans l'ordre de fabrication), avec le rang devant chaque nom. ● rouge (paquets 2a et 2b : fichiers, et fonds de cartes d’upgrade) = cet asset a un repli (dessin procédural, emoji ou texte) tant qu'il n'est pas chargé : survoler la pastille pour le détail ; sans pastille, l'objet n'est pas dessiné avant l'arrivée du fichier. Un asset du paquet 1 n'a jamais de pastille : il est chargé avant le premier affichage.";
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start';
    const left = document.createElement('div');
    const right = document.createElement('div');
    for (const p of PACKS) {
      const sec = document.createElement('div');
      sec.style.marginBottom = '14px';
      const h = document.createElement('div');
      h.style.cssText = 'position:sticky;top:-12px;z-index:1;background:#13233a;padding:6px 10px;border-radius:6px;font-weight:bold;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap';
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:4px';
      sec.append(h, list);
      (p.id === 'core' ? left : right).append(sec);
      this.heads.set(p.id, h);
      this.cols.set(p.id, list);
    }
    grid.append(left, right);
    root.append(head, hint, grid, this.dynamicNote());
    document.body.append(root);
    this.root = root;
    this.render();
    void this.fetchSizes();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.root?.remove();
    });
  }

  /** Textures qui ne se préfabriquent pas (créées au besoin par l'interface) : listées pour mémoire sous les colonnes. */
  private dynamicNote(): HTMLElement {
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
    dyn.style.cssText = 'margin-top:12px';
    const dsum = document.createElement('summary');
    dsum.style.cssText = 'cursor:pointer;background:#13233a;padding:5px 10px;border-radius:6px;font-weight:bold';
    dsum.textContent = `Créées à la demande par nature (non préfabricables, pas de paquet) — ${DYNAMIC.length} familles`;
    dyn.append(dsum);
    for (const [name, note] of DYNAMIC) {
      const r = document.createElement('div');
      r.style.cssText = `padding:4px 8px;margin-top:3px;border-radius:5px;background:${PINK}`;
      const n = document.createElement('div');
      n.textContent = name;
      n.style.fontWeight = '600';
      const d = document.createElement('div');
      d.textContent = note;
      d.style.cssText = 'font-size:11px;color:#c9a';
      r.append(n, d);
      dyn.append(r);
    }
    return dyn;
  }

  /** Liste déroulante du tri des trois colonnes. */
  private sortSelect(): HTMLElement {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:6px;align-items:center';
    const sel = document.createElement('select');
    sel.style.cssText = 'padding:3px 4px;font:inherit;cursor:pointer';
    sel.title = 'Ordre de chargement : bruitages, puis visuels dans l’ordre du manifeste (téléchargement), puis textures procédurales dans l’ordre de fabrication de l’atelier (priorité, puis déclaration). Le rang s’affiche devant chaque nom.';
    for (const [v, t] of [['size', 'Poids (décroissant)'], ['load', 'Ordre de chargement']] as const) sel.append(new Option(t, v, false, v === this.sortBy));
    sel.addEventListener('change', () => {
      this.sortBy = sel.value as 'size' | 'load';
      this.render();
    });
    label.append('Tri :', sel);
    return label;
  }

  /** Textures dessinées par le code (atelier + celles fabriquées au lancement), une ligne rose chacune. Le paquet courant d'une ligne déjà connue est conservé. */
  private collectProcedural(): Item[] {
    const workshop = textureWorkshop();
    const fileKeys = new Set<string>();
    for (const e of ASSETS) fileKeys.add(e.type === 'image' ? e.id : `asset:${e.url}`);
    const previous = new Map(this.items.filter((it) => it.proc).map((it) => [it.key, it]));
    const out: Item[] = [];
    const prio = texturePriority();
    const declared = workshop?.declaredKeys() ?? [];
    const keys = new Set<string>([...launchTextureKeys(), ...(workshop?.declaredKeys() ?? [])]);
    for (const key of keys) {
      if (key.startsWith('__') || fileKeys.has(key)) continue;
      let proc: NonNullable<Item['proc']>;
      const group = GROUPS.find(([re]) => re.test(key))?.[1] ?? 'autres';
      if (workshop?.isPending(key)) {
        const d = workshop.declaredSize(key)!; // pas encore fabriquée : on ne la force pas (`textures.get` la fabriquerait), taille déclarée
        proc = { w: d.width, h: d.height, pending: true, group };
      } else {
        if (!this.textures.exists(key)) continue;
        const img = this.textures.get(key).getSourceImage();
        if (!(img instanceof HTMLCanvasElement)) continue;
        proc = { w: img.width, h: img.height, img, pending: false, group };
      }
      if (!workshop?.declaredSize(key)) proc.lock = 'fabriquée au lancement par son propre code (hors atelier)';
      const base: Pack = proc.lock || this.launchSaved.has(key) ? 'core' : this.pack2bSaved.has(key) ? '2b' : '2a';
      const id = `tex:${key}`;
      const fallback = textureFallback(key);
      out.push({ key: id, label: key, file: '', href: '', base, pack: proc.lock ? 'core' : (previous.get(id)?.pack ?? base), size: proc.w * proc.h * 4, fallback, proc, order: 1e6 + prio(key) * 1e4 + Math.max(0, declared.indexOf(key)) });
    }
    return out;
  }

  /** Relit l'avancement de l'atelier (⏳ → fabriquée) sans perdre les paquets choisis. */
  private refreshProcedural(): void {
    this.items = [...this.items.filter((it) => !it.proc), ...this.collectProcedural()];
    this.render();
  }

  /** Visuels (`ASSETS`) et bruitages (`SFX`), un par fichier. */
  private collect(): Item[] {
    const byKey = new Map<string, Item>();
    for (const [idx, e] of ASSETS.entries()) {
      const base = PACK_OF[e.url] ?? 'core';
      const names = e.type === 'image' ? [e.id] : Object.keys(e.sprites);
      const label = names.length > 4 ? `${names.slice(0, 4).join(', ')} … (+${names.length - 4})` : names.join(', ');
      const prev = byKey.get(e.url);
      if (prev) {
        prev.label += ` · ${label}`;
        continue;
      }
      byKey.set(e.url, { key: e.url, label, file: e.url, href: `assets/${e.url}`, thumb: `assets/${e.url}`, fallback: this.fallbackOf(e), base, pack: base, order: 1000 + idx });
    }
    for (const [i, id] of (Object.keys(SFX) as SfxId[]).entries()) {
      const key = `sfx:${id}`;
      const base = PACK_OF[key] ?? 'core';
      byKey.set(key, { key, label: `🔊 ${id}`, file: SFX[id].url[0], href: SFX[id].url[0], base, pack: base, order: i });
    }
    return [...byKey.values()];
  }

  /** Repli de ce fichier tant qu'il n'est pas chargé (registre : `art/fallbackRegistry.ts`) ; undefined = rien n'est affiché. */
  private fallbackOf(e: AssetEntry): string | undefined {
    if (e.type !== 'image') return sheetFallback(Object.keys(e.sprites), (id) => this.textures.exists(proceduralKey(id)));
    return fileFallback(e.id);
  }

  /** Poids de chaque fichier (téléchargé, quelques-uns à la fois) : la liste est retriée à chaque réponse groupée. */
  private async fetchSizes(): Promise<void> {
    const queue = this.items.filter((it) => !it.proc && it.size === undefined);
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

  private row(it: Item, rank?: number): HTMLDivElement {
    const r = document.createElement('div');
    const moved = it.pack !== it.base;
    const proc = it.proc;
    r.style.cssText = `display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:5px;background:${proc ? PINK : BLUE};${moved ? 'outline:1px solid #ffb02a;' : ''}`;
    const thumb = document.createElement('div');
    thumb.style.cssText = `width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;background:${proc ? '#1d0f19' : '#0b1422'};border-radius:4px;overflow:hidden`;
    if (proc?.img) {
      const cv = document.createElement('canvas');
      const k = Math.min(1, 36 / proc.w, 36 / proc.h);
      cv.width = Math.max(1, Math.round(proc.w * k));
      cv.height = Math.max(1, Math.round(proc.h * k));
      cv.getContext('2d')?.drawImage(proc.img, 0, 0, cv.width, cv.height);
      thumb.append(cv);
    } else if (proc) thumb.textContent = proc.lock ? '🔒' : '⏳';
    else if (it.thumb) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = it.thumb;
      img.style.cssText = 'max-width:36px;max-height:36px;object-fit:contain';
      thumb.append(img);
    } else thumb.textContent = '🔊';
    const text = document.createElement('div');
    text.style.cssText = 'flex:1;min-width:0';
    const name = document.createElement('div');
    name.textContent = rank === undefined ? it.label : `#${rank} ${it.label}`;
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
    const info = proc ? `${proc.w} × ${proc.h} px · ${proc.group} · ${proc.lock ? '🔒 obligatoire' : proc.pending ? '⏳ pas encore fabriquée' : 'fabriquée'}` : it.file;
    file.textContent = moved ? `${info}  ·  modifié (sauvegardé : ${SHORT[it.base]})` : info;
    file.title = proc?.lock ?? '';
    file.style.cssText = `font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${moved ? '#ffb02a' : proc ? '#c9a' : '#8aa'}`;
    text.append(name, file);
    const size = document.createElement('span');
    size.textContent = it.size === undefined ? '…' : it.size ? kb(it.size) : '?';
    if (proc) size.title = 'mémoire estimée (largeur × hauteur × 4 octets)';
    size.style.cssText = 'flex:none;width:64px;text-align:right;opacity:0.85';
    r.append(thumb, text, size);
    // liste déroulante du paquet : le choix déplace la ligne
    const pick = document.createElement('select');
    pick.style.cssText = 'flex:none;padding:2px 4px;font:inherit;font-size:12px;cursor:pointer';
    pick.title = proc
      ? proc.lock ?? 'Paquet pendant lequel cette texture est fabriquée (1 : avant l’affichage ; 2a : en tâche de fond pendant le téléchargement du 2a ; 2b : pendant celui du 2b)'
      : 'Paquet de chargement de cet asset';
    for (const p of PACKS) pick.append(new Option(p.title, p.id, false, p.id === it.pack));
    if (proc?.lock) pick.disabled = true;
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
      const mine = this.items.filter((it) => it.pack === p.id).sort(this.sortBy === 'load' ? (a, b) => a.order - b.order || a.label.localeCompare(b.label) : (a, b) => (b.size ?? 0) - (a.size ?? 0) || a.label.localeCompare(b.label));
      mine.forEach((it, i) => list.append(this.row(it, this.sortBy === 'load' ? i + 1 : undefined)));
      const files = mine.filter((it) => !it.proc);
      const procs = mine.filter((it) => it.proc);
      const total = files.reduce((s, it) => s + (it.size ?? 0), 0);
      const mem = procs.reduce((s, it) => s + (it.size ?? 0), 0);
      const pending = files.some((it) => it.size === undefined);
      const h = this.heads.get(p.id)!;
      h.replaceChildren();
      const t = document.createElement('span');
      t.textContent = `${p.title} — ${p.note}`;
      const n = document.createElement('span');
      n.textContent = `${files.length} fichiers · ${kb(total)}${pending ? '…' : ''} · ${procs.length} textures procédurales · ${kb(mem)} en mémoire`;
      n.style.fontWeight = 'normal';
      h.append(t, n);
    }
  }

  /** Écrit dans le code la table des paquets de fichiers (`assets/packTable.ts`) et le moment de fabrication des textures (`art/textureModes.ts`). */
  private async save(): Promise<void> {
    const files = this.items.filter((it) => !it.proc);
    const lines = [...files]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((it) => `  '${it.key}': '${it.pack}',`);
    const code = `export const PACK_OF: Record<string, Pack> = {\n${lines.join('\n')}\n};`;
    const free = this.items.filter((it) => it.proc && !it.proc.lock);
    const launch = free.filter((it) => it.pack === 'core').map((it) => it.label);
    const pack2b = free.filter((it) => it.pack === '2b').map((it) => it.label);
    this.status.textContent = 'Save…';
    const msgFiles = await saveToCode('packs', { code });
    const msgTex = await saveToCode('texturemodes', { pack2b, launch });
    this.status.textContent = `${msgFiles} · ${msgTex}`;
    if (msgFiles.startsWith('✔') && msgTex.startsWith('✔')) {
      for (const it of this.items) it.base = it.pack; // sauvegardé : plus rien d'orange
      this.launchSaved = new Set(launch);
      this.pack2bSaved = new Set(pack2b);
      this.render();
    }
  }
}
