import Phaser from 'phaser';
import { ALIENS, type AlienId } from '../data/aliens';
import { entryTimes, WAVE_LEVELS, WAVE_SCRIPT, type TimelineEntry, type WaveConfig } from '../data/waves';
import { SCENES } from '../config';
import { resetWaves, saveWaves, saveWavesToCode, waveSnippet } from '../debugWaves';
import { header } from '../dev/devUi';

/**
 * Gestionnaire de vagues (dev uniquement) : écrit le script de vagues du jeu (data/waves.ts).
 *  - 9 niveaux de vague ; chaque niveau a plusieurs configurations (compositions d'aliens), dont une est tirée au hasard
 *    à chaque envoi de ce niveau ;
 *  - une timeline : à quel moment (s) quel niveau est envoyé, éventuellement en boucle (répéter toutes les X s jusqu'à Y s).
 * Les modifications sont mémorisées dans le navigateur (debugWaves.ts) et jouées telles quelles par le jeu ; « Copier le
 * code » donne le bloc à coller dans DEFAULT_WAVE_SCRIPT. Ouverture : `?waves` dans l'URL, ou bouton du HUD.
 */
const ALIEN_IDS = Object.keys(ALIENS) as AlienId[];
const levelColor = (level: number): string => `hsl(${Math.round(120 * (1 - (level - 1) / 8))} 75% 52%)`;
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const STYLE_INPUT = 'width:62px;padding:2px 3px;font:inherit';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  e.append(...children);
  return e;
}

function btn(label: string, fn: () => void, css = ''): HTMLButtonElement {
  const b = el('button', `padding:3px 8px;font:inherit;cursor:pointer;${css}`, label);
  b.addEventListener('click', () => {
    fn();
    b.blur();
  });
  return b;
}

function numInput(value: number | undefined, o: { min?: number; step?: number; width?: number }, onInput: (v: number | undefined) => void, onChange?: () => void): HTMLInputElement {
  const i = el('input', `${STYLE_INPUT};width:${o.width ?? 62}px`);
  i.type = 'number';
  if (o.min !== undefined) i.min = String(o.min);
  i.step = String(o.step ?? 1);
  i.value = value === undefined ? '' : String(value);
  i.addEventListener('input', () => onInput(Number.isFinite(i.valueAsNumber) ? i.valueAsNumber : undefined));
  i.addEventListener('change', () => {
    onChange?.();
  });
  return i;
}

export class WaveEditorScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private level = 1;
  /** Entrée de la timeline survolée dans le tableau (ses envois sont mis en évidence). */
  private hot = -1;
  private timelineBox!: HTMLDivElement;
  private tableBox!: HTMLDivElement;
  private levelsBox!: HTMLDivElement;
  private configsBox!: HTMLDivElement;
  private status!: HTMLDivElement;

  constructor() {
    super(SCENES.waves);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x1d2733);
    this.buildUi();
    this.renderAll();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.root?.remove());
  }

  // ---------- Interface ----------

  private buildUi(): void {
    const root = el(
      'div',
      'position:fixed;inset:8px;z-index:99999;overflow:auto;padding:10px 14px;background:rgba(0,0,0,0.88);color:#dfe;' +
        'font:13px system-ui,sans-serif;border-radius:6px;display:flex;flex-direction:column;gap:10px',
    );
    const head = header('Gestionnaire de vagues', () => this.back());
    this.status = el('div', 'font-size:12px;color:#9fe;min-height:1.4em;white-space:pre-wrap');
    const actions = el(
      'div',
      'display:flex;gap:8px;flex-wrap:wrap;align-items:center',
      btn('Copier le code', () => {
        const code = waveSnippet();
        void navigator.clipboard?.writeText(code).catch(() => {});
        this.say('Copié — à coller dans DEFAULT_WAVE_SCRIPT (data/waves.ts).');
      }),
      btn('Save', () => void saveWavesToCode().then((msg) => this.say(msg))),
      btn('Reset', () => {
        resetWaves();
        this.renderAll();
        this.say('Retour à la dernière sauvegarde (valeurs par défaut du code).');
      }),
      btn('Jouer ▶', () => this.back(), 'font-weight:bold'),
      this.status,
    );

    this.timelineBox = el('div');
    this.tableBox = el('div', 'display:flex;flex-direction:column;gap:4px');
    this.levelsBox = el('div', 'display:flex;gap:6px;flex-wrap:wrap');
    this.configsBox = el('div', 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start');

    const section = (text: string, hint: string, ...body: HTMLElement[]) =>
      el(
        'div',
        'display:flex;flex-direction:column;gap:6px;border-top:1px solid #444;padding-top:8px',
        el('b', 'color:#ffd166', text),
        el('div', 'font-size:11px;color:#aab', hint),
        ...body,
      );

    root.append(
      head,
      actions,
      section(
        'Timeline',
        'Quel niveau de vague est envoyé à quel moment. Hauteur et couleur = niveau. Clic dans la timeline : ajoute un envoi du niveau sélectionné plus bas.',
        this.timelineBox,
        this.tableBox,
      ),
      section(
        'Niveaux de vague',
        "Chaque niveau regroupe plusieurs configurations ; quand un niveau est envoyé (timeline, ou bouton « Envoyer » du panneau Triche), l'une d'elles est tirée au hasard.",
        this.levelsBox,
        this.configsBox,
      ),
    );
    document.body.append(root);
    this.root = root;
  }

  private say(msg: string): void {
    this.status.textContent = msg;
  }

  private back(): void {
    this.scene.start(SCENES.game);
  }

  private renderAll(): void {
    this.renderTimeline();
    this.renderTable();
    this.renderLevels();
    this.renderConfigs();
  }

  private commit(): void {
    saveWaves();
  }

  // ---------- Timeline ----------

  private timelineEnd(): number {
    let max = 300;
    for (const e of WAVE_SCRIPT.timeline) for (const t of entryTimes(e)) max = Math.max(max, t);
    return Math.ceil((max + 10) / 30) * 30;
  }

  private renderTimeline(): void {
    const end = this.timelineEnd();
    const area = el('div', 'position:relative;height:130px;background:#10161c;border-radius:4px;cursor:crosshair;overflow:hidden');
    for (let t = 0; t <= end; t += 30) {
      const left = `${(t / end) * 100}%`;
      area.append(
        el('div', `position:absolute;left:${left};top:0;bottom:14px;width:1px;background:rgba(255,255,255,0.12);pointer-events:none`),
        el('div', `position:absolute;left:${left};bottom:0;font-size:10px;color:#889;transform:translateX(${t === 0 ? 2 : -50}%);pointer-events:none`, clock(t)),
      );
    }
    WAVE_SCRIPT.timeline.forEach((e, i) => {
      for (const t of entryTimes(e)) {
        const bar = el(
          'div',
          `position:absolute;left:${(t / end) * 100}%;bottom:14px;width:5px;margin-left:-2px;height:${(e.level / 9) * 100}px;` +
            `background:${levelColor(e.level)};border-radius:2px 2px 0 0;opacity:${this.hot < 0 || this.hot === i ? 1 : 0.3};` +
            (this.hot === i ? 'outline:1px solid #fff;z-index:1;' : ''),
        );
        bar.title = `${clock(t)} (${Math.round(t)} s) : niveau ${e.level}`;
        bar.addEventListener('click', (ev) => ev.stopPropagation());
        area.append(bar);
      }
    });
    area.addEventListener('click', (ev) => {
      const r = area.getBoundingClientRect();
      const at = Math.max(0, Math.round(((ev.clientX - r.left) / r.width) * end));
      WAVE_SCRIPT.timeline.push({ at, level: this.level });
      this.sortTimeline();
      this.commit();
      this.say(`Envoi du niveau ${this.level} ajouté à ${clock(at)}.`);
      this.renderTimeline();
      this.renderTable();
    });
    this.timelineBox.replaceChildren(area);
  }

  private sortTimeline(): void {
    WAVE_SCRIPT.timeline.sort((a, b) => a.at - b.at || a.level - b.level);
  }

  private renderTable(): void {
    const cols = 'display:grid;grid-template-columns:70px 90px 110px 100px 90px 70px 28px;gap:6px;align-items:center';
    const headRow = el('div', `${cols};font-size:11px;color:#aab`, ...['Début (s)', 'Niveau', 'Répéter toutes les (s)', "Jusqu'à (s)", 'Configuration', 'Envois', ''].map((t) => el('span', '', t)));
    const rows = WAVE_SCRIPT.timeline.map((e, i) => this.entryRow(e, i, cols));
    const add = btn('+ Ajouter un envoi', () => {
      WAVE_SCRIPT.timeline.push({ at: Math.max(0, ...WAVE_SCRIPT.timeline.map((e) => e.at)) + 10, level: this.level });
      this.sortTimeline();
      this.commit();
      this.renderTimeline();
      this.renderTable();
    });
    this.tableBox.replaceChildren(headRow, ...rows, el('div', '', add));
  }

  private entryRow(e: TimelineEntry, i: number, cols: string): HTMLElement {
    const row = el('div', cols);
    row.addEventListener('mouseenter', () => {
      this.hot = i;
      this.renderTimeline();
    });
    row.addEventListener('mouseleave', () => {
      this.hot = -1;
      this.renderTimeline();
    });
    const count = el('span', 'font-size:12px;color:#ffd166');
    const refresh = () => {
      count.textContent = `× ${entryTimes(e).length}`;
      this.commit();
      this.renderTimeline();
    };
    const at = numInput(e.at, { min: 0, step: 1 }, (v) => {
      if (v !== undefined) e.at = Math.max(0, v);
      refresh();
    }, () => {
      this.sortTimeline();
      this.renderTable();
    });
    const level = el('select', 'padding:2px;font:inherit');
    for (const n of WAVE_LEVELS) level.append(new Option(`Niveau ${n}`, String(n), false, n === e.level));
    level.style.borderLeft = `6px solid ${levelColor(e.level)}`;
    level.addEventListener('change', () => {
      e.level = Number(level.value);
      level.style.borderLeft = `6px solid ${levelColor(e.level)}`;
      refresh();
      level.blur();
    });
    const every = numInput(e.every, { min: 0, step: 0.5, width: 90 }, (v) => {
      if (v && v >= 0.5) {
        e.every = v;
        if (e.until === undefined || e.until < e.at) e.until = Math.max(e.at, 300);
      } else {
        delete e.every;
        delete e.until;
      }
      refresh();
    }, () => this.renderTable());
    every.placeholder = 'une fois';
    const until = numInput(e.until, { min: 0, step: 1, width: 80 }, (v) => {
      if (e.every && v !== undefined) e.until = Math.max(e.at, v);
      refresh();
    });
    until.disabled = !e.every;
    until.placeholder = '—';
    const del = btn('×', () => {
      WAVE_SCRIPT.timeline.splice(i, 1);
      this.hot = -1;
      this.commit();
      this.renderTimeline();
      this.renderTable();
    }, 'padding:0 6px');
    count.textContent = `× ${entryTimes(e).length}`;
    const config = el('select', 'padding:2px;font:inherit');
    config.title = 'Configuration envoyée : au hasard parmi celles du niveau, ou une précise (boss)';
    config.append(new Option('Au hasard', ''));
    for (let k = 1; k <= 8; k++) config.append(new Option(String(k), String(k), false, e.config === k));
    if (e.config === undefined) config.value = '';
    config.addEventListener('change', () => {
      if (config.value) e.config = Number(config.value);
      else delete e.config;
      refresh();
      config.blur();
    });
    row.append(at, level, every, until, config, count, del);
    return row;
  }

  // ---------- Niveaux et configurations ----------

  private configsOf(level: number): WaveConfig[] {
    return (WAVE_SCRIPT.levels[level] ??= []);
  }

  private power(c: WaveConfig): { hp: number; units: number } {
    let hp = 0;
    let units = 0;
    for (const g of c.groups) {
      hp += g.count * ALIENS[g.type].hp;
      units += g.count;
    }
    return { hp, units };
  }

  private renderLevels(): void {
    this.levelsBox.replaceChildren(
      ...WAVE_LEVELS.map((n) => {
        const configs = this.configsOf(n);
        const avg = configs.length ? Math.round(configs.reduce((s, c) => s + this.power(c).hp, 0) / configs.length) : 0;
        const b = el(
          'button',
          `padding:4px 10px;font:inherit;cursor:pointer;border:2px solid ${levelColor(n)};border-radius:6px;` +
            `background:${n === this.level ? levelColor(n) : 'transparent'};color:${n === this.level ? '#111' : '#dfe'};text-align:left`,
          el('b', '', `Niveau ${n}`),
          el('div', 'font-size:10px;opacity:0.85', `${configs.length} config · ≈ ${avg} PV`),
        );
        b.addEventListener('click', () => {
          this.level = n;
          b.blur();
          this.renderLevels();
          this.renderConfigs();
        });
        return b;
      }),
    );
  }

  private renderConfigs(): void {
    const configs = this.configsOf(this.level);
    const cards = configs.map((c, i) => this.configCard(c, i, configs));
    const add = btn('+ Nouvelle configuration', () => {
      configs.push({ name: '', groups: [{ type: 'slime', count: 3 }] });
      this.commit();
      this.renderLevels();
      this.renderConfigs();
    }, 'align-self:flex-start');
    const note = el(
      'div',
      'font-size:12px;color:#ffd166;width:100%',
      configs.length
        ? `Niveau ${this.level} : ${configs.length} configuration${configs.length > 1 ? 's' : ''}, tirée${configs.length > 1 ? 's' : ''} au hasard (équiprobables).`
        : `Niveau ${this.level} : aucune configuration — l'envoyer ne ferait rien.`,
    );
    this.configsBox.replaceChildren(note, ...cards, add);
  }

  private configCard(c: WaveConfig, index: number, configs: WaveConfig[]): HTMLElement {
    const card = el('div', `display:flex;flex-direction:column;gap:5px;padding:8px;min-width:250px;background:#151d27;border-radius:6px;border-left:5px solid ${levelColor(this.level)}`);
    const name = el('input', 'padding:2px 4px;font:inherit;width:100%;box-sizing:border-box');
    name.placeholder = `Configuration ${index + 1}`;
    name.value = c.name ?? '';
    name.addEventListener('input', () => {
      c.name = name.value || undefined;
      this.commit();
    });
    const summary = el('div', 'font-size:12px;color:#ffd166');
    const refresh = () => {
      const p = this.power(c);
      summary.textContent = `${p.units} ennemi${p.units > 1 ? 's' : ''} · ≈ ${p.hp} PV au total`;
      this.commit();
      this.renderLevelsKeepingFocus();
    };
    const groups = el('div', 'display:flex;flex-direction:column;gap:4px');
    const fillGroups = () => {
      groups.replaceChildren(
        ...c.groups.map((g, gi) => {
          const type = el('select', 'padding:2px;font:inherit;flex:1');
          for (const id of ALIEN_IDS) type.append(new Option(`${id} (${ALIENS[id].hp} PV)`, id, false, id === g.type));
          type.addEventListener('change', () => {
            g.type = type.value as AlienId;
            refresh();
            type.blur();
          });
          const count = numInput(g.count, { min: 0, step: 1, width: 54 }, (v) => {
            g.count = Math.max(0, Math.round(v ?? 0));
            refresh();
          });
          const del = btn('×', () => {
            c.groups.splice(gi, 1);
            fillGroups();
            refresh();
          }, 'padding:0 6px');
          return el('div', 'display:flex;gap:5px;align-items:center', el('span', 'color:#aab', '×'), count, type, del);
        }),
      );
    };
    fillGroups();
    refresh();
    const addGroup = btn('+ ennemi', () => {
      c.groups.push({ type: 'slime', count: 1 });
      fillGroups();
      refresh();
    });
    const dup = btn('Dupliquer', () => {
      configs.splice(index + 1, 0, JSON.parse(JSON.stringify(c)) as WaveConfig);
      this.commit();
      this.renderLevels();
      this.renderConfigs();
    });
    const del = btn('Supprimer', () => {
      configs.splice(index, 1);
      this.commit();
      this.renderLevels();
      this.renderConfigs();
    });
    card.append(name, groups, el('div', 'display:flex;gap:6px;flex-wrap:wrap', addGroup, dup, del), summary);
    return card;
  }

  /** Met à jour les étiquettes de niveaux (puissance moyenne) sans reconstruire les cartes en cours d'édition. */
  private renderLevelsKeepingFocus(): void {
    this.renderLevels();
  }
}
