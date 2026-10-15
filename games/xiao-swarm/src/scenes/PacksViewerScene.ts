import Phaser from 'phaser';
import type { AssetEntry } from '@xiao/engine';
import { proceduralKey } from '../art/aliens';
import { hasImageFallback } from '../art/imageFallbacks';
import { ASSETS, defaultAssetPack } from '../assets/manifest';
import { defaultSfxPack } from '../assets/coreSfx';
import { PACK_OVERRIDES, type Pack } from '../assets/packOverrides';
import { SCENES } from '../config';
import { saveToCode } from '../dev/devSave';
import { SFX, type SfxId } from '../settings';

/**
 * Vue Paquets (dev uniquement) : tous les assets du jeu rangés par paquet de chargement, avec leur poids. À gauche le paquet 1 (chargé au démarrage), à droite
 * le paquet 2a (premières minutes) puis le 2b (ce qui arrive ensuite, enchaîné après 2a). Chaque asset a deux boutons pour passer dans l'un des deux autres paquets.
 * Les visuels viennent de `ASSETS` (`assets/manifest.ts`), les bruitages de `SFX` (`settings.ts`). Save écrit les exceptions aux règles par défaut dans
 * `assets/packOverrides.ts` (effectives après rechargement : le jeu les lit au démarrage), Reset revient à cette sauvegarde. Un visuel du paquet 2 qui n'est pas
 * encore arrivé est remplacé par son dessin procédural (ou absent s'il n'en a pas) : ne pas y mettre ce qui sert dès les premières secondes.
 */
interface Item {
  /** Clé de la table des exceptions : adresse du fichier d'un visuel, `sfx:<id>` pour un bruitage. */
  key: string;
  label: string;
  file: string;
  /** Adresse à télécharger pour mesurer le fichier. */
  href: string;
  /** Image affichée (visuels seulement). */
  thumb?: string;
  /** Paquet de la règle par défaut. */
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
        for (const it of this.items) it.pack = PACK_OVERRIDES[it.key] ?? it.base;
        this.status.textContent = 'Retour à la dernière sauvegarde.';
        this.render();
      }),
      this.button('✕ Retour au jeu', () => this.scene.start(SCENES.game)),
      this.status,
    );
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:10px';
    hint.textContent =
      "Un bouton déplace l'asset dans le paquet indiqué. Save écrit assets/packOverrides.ts (pris en compte au rechargement). Un asset du paquet 2 pas encore arrivé s'affiche en procédural : garder dans le paquet 1 ce qui sert dès les premières secondes. ● rouge = cet asset a un repli (dessin procédural, emoji ou texte) tant qu'il n'est pas chargé : survoler la pastille pour le détail ; sans pastille, l'objet n'est pas dessiné avant l'arrivée du fichier.";
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start';
    const left = document.createElement('div');
    const right = document.createElement('div');
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
    grid.append(left, right);
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

  /** Visuels (`ASSETS`) et bruitages (`SFX`), un par fichier. */
  private collect(): Item[] {
    const byKey = new Map<string, Item>();
    for (const e of ASSETS) {
      const base = defaultAssetPack(e);
      const names = e.type === 'image' ? [e.id] : Object.keys(e.sprites);
      const label = names.length > 4 ? `${names.slice(0, 4).join(', ')} … (+${names.length - 4})` : names.join(', ');
      const prev = byKey.get(e.url);
      if (prev) {
        prev.label += ` · ${label}`;
        continue;
      }
      byKey.set(e.url, { key: e.url, label, file: e.url, href: `assets/${e.url}`, thumb: `assets/${e.url}`, fallback: this.fallbackOf(e), base, pack: PACK_OVERRIDES[e.url] ?? base });
    }
    for (const id of Object.keys(SFX) as SfxId[]) {
      const key = `sfx:${id}`;
      const base = defaultSfxPack(id);
      byKey.set(key, { key, label: `🔊 ${id}`, file: SFX[id].url[0], href: SFX[id].url[0], base, pack: PACK_OVERRIDES[key] ?? base });
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
    if (hasImageFallback(e.id)) return 'forme simple de même taille (art/imageFallbacks.ts), redessinée avec le vrai fichier à son arrivée';
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
    if (it.fallback) {
      const dot = document.createElement('span');
      dot.textContent = '●';
      dot.title = `Repli : ${it.fallback}`;
      dot.style.cssText = 'color:#ff3b3b;margin-right:5px;font-size:11px;cursor:help';
      name.prepend(dot);
    }
    name.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    name.title = it.label;
    const file = document.createElement('div');
    file.textContent = moved ? `${it.file}  ·  déplacé (défaut : ${SHORT[it.base]})` : it.file;
    file.style.cssText = `font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${moved ? '#ffb02a' : '#8aa'}`;
    text.append(name, file);
    const size = document.createElement('span');
    size.textContent = it.size === undefined ? '…' : it.size ? kb(it.size) : '?';
    size.style.cssText = 'flex:none;width:64px;text-align:right;opacity:0.85';
    r.append(thumb, text, size);
    for (const p of PACKS) {
      if (p.id === it.pack) continue;
      const b = this.button(`→ ${SHORT[p.id]}`, () => {
        it.pack = p.id;
        this.render();
      }, true);
      b.title = `Passer dans le ${p.title.toLowerCase()} (${p.note})`;
      r.append(b);
    }
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
    const lines = this.items
      .filter((it) => it.pack !== it.base)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((it) => `  '${it.key}': '${it.pack}',`);
    const code = `export const PACK_OVERRIDES: Record<string, Pack> = {\n${lines.join('\n')}${lines.length ? '\n' : ''}};`;
    this.status.textContent = 'Save…';
    const msg = await saveToCode('packs', { code });
    this.status.textContent = msg;
  }
}
