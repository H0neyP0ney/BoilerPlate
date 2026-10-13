import Phaser from 'phaser';
import { sfx } from '@xiao/engine';
import { SCENES } from '../config';
import { SFX_INFO as BASE_INFO, type SfxInfo } from '../sfxInfo';
import { addNewSfx, ensureSfxLoaded, refreshSfxVariants, reloadChangedVariants, uploadSfxVariant, resetSfxTuning, saveSfxTuningToCode, selectSfxVariant, setSfxField, sfxTuning, type SfxField } from '../debugSfx';
import { SFX, type SfxId } from '../settings';

/**
 * Page de test des bruitages (dev / `?debug=1`, ouverte par `?sounds`) : un bouton par son, avec QUAND il joue dans le jeu.
 * Pour remplacer un son : écraser `public/assets/audio/sfx/<nom>.mp3` puis recharger la page (F5). Voir `docs/SONS.md`.
 * Par son : un curseur de volume de base et trois champs (variation de hauteur, délai minimal entre deux lectures, voix simultanées ; 0 = illimité) réglés DANS le jeu
 * (mémorisés dans le navigateur) ; Save les écrit dans `data/sfxTuning.ts`, Reset revient à cette sauvegarde. Compteur « joué / ignoré » : combien de fois chaque son
 * a été joué (ou refusé par sa limite) depuis le début de la partie : à lire après avoir joué, pour repérer les sons qui reviennent trop.
 * **Variantes** : chaque son a une liste déroulante. `<nom>.mp3` est la base ; tout fichier `<nom>--<variante>.mp3` du même dossier devient un choix (liste complétée
 * à l'ouverture en dev). Le choix est celui joué dans le jeu ; Save le garde dans le code, Reset revient au son validé.
 */
/** Colonnes de la page (mêmes largeurs pour l'en-tête et chaque ligne) : son, volume, valeur, hauteur, écart, voix, variante, compteur, description. */
const COLUMNS = '190px 150px 40px 72px 72px 56px 168px 84px minmax(220px, 1fr)';
const COLUMN_TITLES = ['Son', 'Volume', '', 'Hauteur ±', 'Écart ms', 'Voix', 'Variante', 'Joué (−ignoré)', 'Quand'];

export class SoundTestScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private readonly controls = new Map<SfxId, { volume: HTMLInputElement; value: HTMLSpanElement; fields: Record<Exclude<SfxField, 'volume'>, HTMLInputElement>; count: HTMLSpanElement; variant: HTMLSelectElement; play: HTMLButtonElement; when: HTMLSpanElement; info: string }>();
  private timer?: Phaser.Time.TimerEvent;
  private status!: HTMLSpanElement;
  /** Sons dont le chargement à l'ouverture est terminé (réussi ou non) : seuls ceux-là peuvent être déclarés « introuvables ». */
  private readonly settled = new Set<SfxId>();

  constructor() {
    super(SCENES.sounds);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0b1422);
    sfx.setVolume(1); // test : volume maximal (le volume de base de chaque son reste appliqué)
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#0b1422;color:#dfe;font:14px system-ui,sans-serif;padding:16px 20px 40px';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px';
    const title = document.createElement('h2');
    title.textContent = 'Bruitages';
    title.style.margin = '0';
    const hint = document.createElement('span');
    hint.textContent = 'Remplacer un son : écraser public/assets/audio/sfx/<nom>.mp3 puis F5.';
    hint.style.opacity = '0.7';
    const all = this.button('▶ Tout jouer à la suite', () => void this.playAll());
    const close = this.button('✕ Retour au jeu', () => {
      const url = new URL(location.href);
      url.searchParams.delete('sounds');
      location.href = url.toString();
    });
    const status = document.createElement('span');
    status.style.cssText = 'opacity:0.85';
    this.status = status;
    const save = this.button('💾 Save', () => {
      status.textContent = 'Save…';
      void saveSfxTuningToCode().then((m) => (status.textContent = m));
    });
    const reset = this.button('↺ Reset', () => {
      void resetSfxTuning(this).then(() => {
        this.refreshControls();
        status.textContent = 'Réglages et sons remis à la dernière sauvegarde';
      });
    });
    const newSound = this.button('＋ Nouveau son', () => newPicker.click());
    newSound.title = 'Ajouter un nouveau son depuis un fichier (mp3, wav, ogg…) : il rejoint le catalogue ; à brancher ensuite dans le code';
    const newPicker = document.createElement('input');
    newPicker.type = 'file';
    newPicker.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac';
    newPicker.style.display = 'none';
    newPicker.addEventListener('change', () => {
      const file = newPicker.files?.[0];
      newPicker.value = '';
      if (!file) return;
      const suggested = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24) || 'nouveau_son';
      void this.askName('Nom du nouveau son (minuscules, chiffres et _)', suggested).then((id) => {
        if (!id) return;
        status.textContent = 'Ajout…';
        void addNewSfx(this, file, id).then((r) => {
          status.textContent = r.ok ? `✔ ${r.message}` : `✖ ${r.message}`;
          if (r.ok) this.scene.restart(); // la page est reconstruite avec le nouveau son
        });
      });
    });
    const clear = this.button('0 Compteurs', () => {
      sfx.resetStats();
      this.refreshCounts();
    });
    close.style.marginLeft = 'auto';
    head.append(title, hint, all, newSound, newPicker, save, reset, clear, status, close);
    root.append(head);
    const titles = document.createElement('div');
    titles.style.cssText = `display:grid;grid-template-columns:${COLUMNS};gap:10px;align-items:end;position:sticky;top:-16px;z-index:1;background:#0b1422;padding:8px 0 4px;border-bottom:1px solid #2a4560;opacity:0.85;font-size:12px`;
    titles.append(...COLUMN_TITLES.map((t) => Object.assign(document.createElement('span'), { textContent: t })));
    root.append(titles);
    // sons ajoutés depuis cette page (dans le catalogue, mais pas dans `SFX_INFO`)
    const known = new Set<string>(BASE_INFO.map((i) => i.id));
    const extra: SfxInfo[] = Object.keys(SFX).filter((k) => !known.has(k)).map((k) => ({ id: k as SfxId, group: 'Ajoutés (non branchés au jeu)', when: 'Son ajouté depuis cette page : à jouer avec playSfx(scene, \'' + k + '\') depuis le code' }));
    const INFO = [...BASE_INFO, ...extra];
    const groups = [...new Set(INFO.map((s) => s.group))];
    for (const g of groups) {
      const h = document.createElement('h3');
      h.textContent = g;
      h.style.cssText = 'margin:18px 0 6px;color:#ffc83d';
      root.append(h);
      for (const s of INFO.filter((i) => i.group === g)) {
        const row = document.createElement('div');
        row.style.cssText = `display:grid;grid-template-columns:${COLUMNS};gap:10px;align-items:center;margin:3px 0`;
        const loaded = this.cache.audio.exists(SFX[s.id].key);
        const play = this.button(`▶ ${s.id}`, () => this.play(s.id));
        play.style.textAlign = 'left';
        play.style.overflow = 'hidden';
        play.style.textOverflow = 'ellipsis';
        if (!loaded) play.style.opacity = '0.4';
        const t = sfxTuning(s.id);
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = String(t.volume);
        slider.style.width = '100%';
        slider.style.margin = '0';
        const value = document.createElement('span');
        value.style.cssText = 'text-align:right;font-variant-numeric:tabular-nums';
        value.textContent = t.volume.toFixed(2);
        slider.addEventListener('input', () => {
          setSfxField(s.id, 'volume', Number(slider.value));
          value.textContent = sfxTuning(s.id).volume.toFixed(2);
        });
        slider.addEventListener('change', () => this.play(s.id)); // on relâche le curseur : on entend le nouveau volume
        const field = (key: Exclude<SfxField, 'volume'>, title: string): HTMLInputElement => {
          const lab = document.createElement('label');
          lab.title = title;
          lab.style.cssText = 'display:block';
          const input = document.createElement('input');
          input.type = 'number';
          input.min = '0';
          input.value = String(t[key]);
          input.style.cssText = 'width:100%;box-sizing:border-box;background:#13233a;color:#dfe;border:1px solid #3a5a7a;border-radius:4px;padding:2px 4px;font:inherit';
          input.addEventListener('change', () => {
            setSfxField(s.id, key, Number(input.value));
            input.value = String(sfxTuning(s.id)[key]);
          });
          lab.append(input);
          row.append(lab);
          return input;
        };
        row.append(slider, value);
        const fields = {
          detune: field('detune', 'Variation de hauteur au hasard (± cents) : évite l’effet mitraillette'),
          minGapMs: field('minGapMs', 'Délai minimal (ms) entre deux lectures de ce son'),
          maxVoices: field('maxVoices', 'Voix simultanées maximum (0 = illimité)'),
        };
        const variant = document.createElement('select');
        variant.title = 'Son joué dans le jeu : la base ou une variante (fichier <nom>--<variante>.mp3)';
        variant.style.cssText = 'width:100%;box-sizing:border-box;background:#13233a;color:#dfe;border:1px solid #3a5a7a;border-radius:4px;padding:2px 4px;font:inherit';
        variant.addEventListener('change', () => {
          variant.disabled = true;
          void selectSfxVariant(this, s.id, variant.value).then(() => {
            variant.disabled = false;
            this.play(s.id); // on entend tout de suite le son choisi
          });
        });
        // « ＋ » : ajoute un fichier son de ton ordinateur (ex. un son du dossier du jeu) comme nouvelle variante de ce son, puis la sélectionne
        const add = this.button('＋', () => picker.click());
        add.title = 'Ajouter un son depuis un fichier (mp3, wav, ogg…) comme variante de ce son';
        add.style.padding = '2px 8px';
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac';
        picker.style.display = 'none';
        picker.addEventListener('change', () => {
          const file = picker.files?.[0];
          picker.value = '';
          if (!file) return;
          const suggested = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24) || 'v2';
          void this.askName(`Nom de la variante de « ${s.id} » (lettres, chiffres, - et _)`, suggested).then((name) => {
            if (!name) return;
            add.disabled = true;
            this.status.textContent = 'Ajout…';
            void uploadSfxVariant(s.id, file, name).then(async (r) => {
              add.disabled = false;
              this.status.textContent = r.ok ? `✔ ${r.message}` : `✖ ${r.message}`;
              if (!r.ok) return;
              this.fillVariants(s.id);
              await selectSfxVariant(this, s.id, r.name); // la nouvelle variante devient le son actif, et on l'entend
              this.fillVariants(s.id);
              this.play(s.id);
            });
          });
        });
        const cell = document.createElement('div');
        cell.style.cssText = 'display:flex;gap:4px;align-items:center';
        variant.style.flex = '1';
        variant.style.minWidth = '0';
        cell.append(variant, add, picker);
        row.append(cell);
        const count = document.createElement('span');
        count.style.cssText = 'font-variant-numeric:tabular-nums;color:#9fd3ff';
        row.append(count);
        const when = document.createElement('span');
        when.textContent = loaded ? s.when : `${s.when} — chargement…`;
        when.style.opacity = '0.8';
        this.controls.set(s.id, { volume: slider, value, fields, count, variant, play, when, info: s.when });
        this.fillVariants(s.id);
        row.prepend(play);
        row.append(when);
        root.append(row);
      }
    }
    document.body.append(root);
    this.root = root;
    void refreshSfxVariants().then(() => {
      reloadChangedVariants(this); // une variante dont le fichier a disparu est retombée sur la base : on recharge le bon fichier
      for (const id of this.controls.keys()) this.fillVariants(id); // variantes trouvées sur le disque
    });
    for (const id of this.controls.keys()) void ensureSfxLoaded(this, id).then(() => this.settled.add(id)); // un son absent du cache (variante choisie avant le chargement…) est chargé maintenant
    this.refreshCounts();
    this.timer = this.time.addEvent({ delay: 500, loop: true, callback: () => this.refreshCounts() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.timer?.remove();
      this.root?.remove();
    });
  }

  /**
   * Petite fenêtre de saisie d'un nom (à la place de `window.prompt`, absent de certaines vues intégrées comme celle de l'appli de bureau) : renvoie le nom, ou null si annulé.
   */
  private askName(label: string, suggested: string): Promise<string | null> {
    return new Promise((resolve) => {
      const veil = document.createElement('div');
      veil.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center';
      const box = document.createElement('div');
      box.style.cssText = 'background:#13233a;border:1px solid #3fb6e8;border-radius:8px;padding:16px 18px;min-width:320px;display:flex;flex-direction:column;gap:10px;color:#dfe;font:14px system-ui,sans-serif';
      const text = document.createElement('div');
      text.textContent = label;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = suggested;
      input.style.cssText = 'background:#0b1422;color:#dfe;border:1px solid #3a5a7a;border-radius:4px;padding:6px 8px;font:inherit';
      const buttons = document.createElement('div');
      buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      const done = (value: string | null): void => {
        veil.remove();
        resolve(value);
      };
      const cancel = this.button('Annuler', () => done(null));
      const ok = this.button('Ajouter', () => done(input.value.trim() || null));
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(input.value.trim() || null);
        else if (e.key === 'Escape') done(null);
      });
      buttons.append(cancel, ok);
      box.append(text, input, buttons);
      veil.append(box);
      document.body.append(veil);
      input.focus();
      input.select();
    });
  }

  /** Remet les curseurs et champs sur les réglages courants (après un Reset). */
  private refreshControls(): void {
    for (const [id, c] of this.controls) {
      const t = sfxTuning(id);
      c.volume.value = String(t.volume);
      c.value.textContent = t.volume.toFixed(2);
      c.fields.detune.value = String(t.detune);
      c.fields.minGapMs.value = String(t.minGapMs);
      c.fields.maxVoices.value = String(t.maxVoices);
      this.fillVariants(id);
    }
  }

  /** Remplit la liste déroulante d'un son : la base, puis ses variantes connues ; sélectionne celle jouée dans le jeu. */
  private fillVariants(id: SfxId): void {
    const c = this.controls.get(id);
    if (!c) return;
    const t = sfxTuning(id);
    c.variant.replaceChildren(new Option('base', '', false, t.variant === ''), ...t.variants.map((v) => new Option(v, v, false, v === t.variant)));
    c.variant.value = t.variant;
  }

  /** Compteurs « joué / ignoré par la limite » de chaque son. */
  private refreshCounts(): void {
    const stats = sfx.stats();
    for (const [id, c] of this.controls) {
      const n = stats.get(SFX[id].key);
      c.count.textContent = n ? `×${n.played}${n.limited ? ` (−${n.limited})` : ''}` : '×0';
      const ok = this.cache.audio.exists(SFX[id].key);
      c.play.style.opacity = ok ? '1' : '0.4';
      c.when.textContent = ok ? c.info : `${c.info} — ${this.settled.has(id) ? 'fichier introuvable' : 'chargement…'}`;
    }
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:5px 12px;font:inherit;cursor:pointer;background:#13233a;color:#dfe;border:1px solid #3fb6e8;border-radius:6px';
    b.addEventListener('click', onClick);
    return b;
  }

  /** Joue un son sans la limite de cadence ni de voix (on veut l'entendre à chaque clic). */
  private play(id: SfxId): void {
    const d = SFX[id];
    sfx.play(this, d.key, { ...d, minGapMs: 0, maxVoices: undefined });
  }

  private async playAll(): Promise<void> {
    for (const id of this.controls.keys()) {
      this.play(id);
      await new Promise((r) => setTimeout(r, 1700));
    }
  }
}
