import Phaser from 'phaser';
import { ALIENS, type AlienId } from '../data/aliens';
import { DEFAULT_WAVE_MODEL, generateTimeline, simulatePressure, targetAt, type TargetPoint, type WaveModel } from '../data/waveModel';
import { entryTimes, WAVE_LEVELS, WAVE_SCRIPT, WAVE_SCRIPT_END, type TimelineEntry, type WaveConfig } from '../data/waves';
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
  private curveBox!: HTMLDivElement;
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
    this.curveBox = el('div');
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
      ),
      section(
        'Courbe de pression (estimation)',
        "PV d'aliens vivants au fil du run : chaque envoi ajoute les PV de sa vague (moyenne des configurations du niveau ; boss : configuration exacte, avec les multiplicateurs de difficulté), la squad en retire un DPS qui croît avec le temps. " +
          "« Retard » = secondes qu'il faudrait pour tout nettoyer. Estimation grossière (un seul tas de PV, ni portée ni déplacements, ni soin des aliens) : sert à comparer des scripts, pas à prédire le jeu.",
        this.buildModelRow(),
        el(
          'div',
          'font-size:11px;color:#9cf',
          'Cible (pointillés bleus) : glisser un point pour le déplacer, clic droit (ou double-clic) dans la courbe pour en ajouter un, clic droit sur un point pour le supprimer. ' +
            "« Générer » recompose la timeline (pas les configurations) pour suivre la cible : boss gardés à leur heure, chaque niveau n'arrive qu'à partir de sa première apparition actuelle.",
        ),
        this.buildTargetRow(),
        this.curveBox,
      ),
      section('Envois', 'Une ligne par entrée de la timeline (survol : ses barres sont mises en évidence).', this.tableBox),
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
    this.renderCurve();
    this.syncModelInputs();
    this.renderTable();
    this.renderLevels();
    this.renderConfigs();
  }

  private commit(): void {
    saveWaves();
    this.renderCurve();
  }

  // ---------- Courbe de pression ----------

  private modelInputs: Partial<Record<keyof WaveModel, HTMLInputElement>> = {};

  private model(): WaveModel {
    return (WAVE_SCRIPT.model ??= { ...DEFAULT_WAVE_MODEL });
  }

  private buildModelRow(): HTMLElement {
    const field = (key: keyof WaveModel, label: string, hint: string, o: { min: number; max?: number; step: number }): HTMLElement => {
      const input = numInput(this.model()[key], { min: o.min, step: o.step, width: 70 }, (v) => {
        if (v === undefined) return;
        this.model()[key] = o.max !== undefined ? Math.min(o.max, Math.max(o.min, v)) : Math.max(o.min, v);
        this.commit();
      });
      this.modelInputs[key] = input;
      const row = el('label', 'display:flex;gap:5px;align-items:center', label, input);
      row.title = hint;
      return row;
    };
    return el(
      'div',
      'display:flex;gap:16px;flex-wrap:wrap;align-items:center',
      field('dpsStart', 'DPS de départ', '4 gunners : 4 × 10 dégâts / 0,32 s ≈ 125', { min: 1, step: 5 }),
      field('growthPerMin', 'Croissance / min', 'Hausse du DPS par minute (upgrades, recrues) : 0,35 = +35 % du DPS de départ par minute', { min: 0, step: 0.05 }),
      field('efficiency', 'Efficacité', "Part du DPS réellement utile (portée, déplacements, overkill) : 0,05 → 1", { min: 0.05, max: 1, step: 0.05 }),
      field('bossWeight', 'Poids des boss', "Part des PV d'un boss comptée dans la pression (0 → 1) : un gros boss seul est facile à gérer, ses escortes comptent normalement", { min: 0, max: 1, step: 0.05 }),
    );
  }

  private syncModelInputs(): void {
    const m = this.model();
    for (const key of Object.keys(this.modelInputs) as (keyof WaveModel)[]) this.modelInputs[key]!.value = String(m[key]);
  }

  /** Timeline d'avant la dernière génération (bouton « Annuler la génération »). */
  private beforeGenerate: TimelineEntry[] | null = null;

  private buildTargetRow(): HTMLElement {
    return el(
      'div',
      'display:flex;gap:8px;flex-wrap:wrap;align-items:center',
      btn('Cible = courbe actuelle', () => {
        const end = this.timelineEnd();
        const sim = simulatePressure(WAVE_SCRIPT, this.model(), end, 0.5);
        const points: TargetPoint[] = [];
        for (let t = 0; t <= end; t += 20) points.push({ t, hp: Math.round(sim.hp[Math.round(t / sim.dt)] ?? 0) });
        WAVE_SCRIPT.target = points;
        this.commit();
        this.say('Cible copiée depuis la courbe actuelle (un point toutes les 20 s) : déplace les points puis « Générer ».');
      }),
      btn(
        'Générer',
        () => {
          const target = WAVE_SCRIPT.target;
          if (!target || target.length < 2) {
            this.say("Pas de cible : clique d'abord « Cible = courbe actuelle », puis déplace ses points.");
            return;
          }
          this.beforeGenerate = JSON.parse(JSON.stringify(WAVE_SCRIPT.timeline)) as TimelineEntry[];
          const res = generateTimeline(WAVE_SCRIPT, this.model(), target, this.timelineEnd());
          WAVE_SCRIPT.timeline = res.timeline;
          this.hot = -1;
          this.commit();
          this.renderTimeline();
          this.renderTable();
          this.say(
            `Timeline générée : ${res.timeline.length} entrées · écart moyen ${Math.round(res.meanError).toLocaleString('fr-FR')} PV ` +
              `(${Math.round(res.relError * 100)} % du pic de la cible) · écart max ${Math.round(res.maxError).toLocaleString('fr-FR')} PV. « Annuler la génération » pour revenir.`,
          );
        },
        'font-weight:bold',
      ),
      btn('Annuler la génération', () => {
        if (!this.beforeGenerate) {
          this.say('Rien à annuler.');
          return;
        }
        WAVE_SCRIPT.timeline = this.beforeGenerate;
        this.beforeGenerate = null;
        this.hot = -1;
        this.commit();
        this.renderTimeline();
        this.renderTable();
        this.say('Timeline d\'avant la génération restaurée.');
      }),
      btn('Effacer la cible', () => {
        WAVE_SCRIPT.target = undefined;
        this.commit();
        this.say('Cible effacée.');
      }),
    );
  }

  private renderCurve(): void {
    const end = this.timelineEnd();
    const sim = simulatePressure(WAVE_SCRIPT, this.model(), end, 0.5);
    const n = sim.hp.length;
    const target = WAVE_SCRIPT.target && WAVE_SCRIPT.target.length >= 2 ? WAVE_SCRIPT.target : null;
    const peak = Math.max(1, ...sim.hp);
    const scale = Math.max(peak, ...(target ?? []).map((p) => p.hp)) * 1.08;
    const peakBacklog = Math.max(...sim.backlog);
    const avgBacklog = sim.backlog.reduce((a, b) => a + b, 0) / n;
    const W = 1000;
    const H = 170; // hauteur du tracé en px (= unités du viewBox) ; 14 px de graduations dessous
    const pts = sim.hp.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (v / scale) * H).toFixed(1)}`);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0 0 14px 0;width:100%;height:calc(100% - 14px)';
    const add = (tag: string, attrs: Record<string, string>): void => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      svg.append(e);
    };
    for (let t = 0; t <= end; t += 30) {
      const x = (t / end) * W;
      add('line', { x1: String(x), x2: String(x), y1: '0', y2: String(H), stroke: 'rgba(255,255,255,0.12)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' });
    }
    add('polygon', { points: `0,${H} ${pts.join(' ')} ${W},${H}`, fill: 'rgba(255,110,80,0.28)' });
    add('polyline', { points: pts.join(' '), fill: 'none', stroke: '#ff7a55', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' });

    const area = el('div', `position:relative;height:${H + 14}px;background:#10161c;border-radius:4px;overflow:hidden;user-select:none`);
    area.append(svg);
    for (let t = 0; t <= end; t += 30) {
      area.append(el('div', `position:absolute;left:${(t / end) * 100}%;bottom:0;font-size:10px;color:#889;transform:translateX(${t === 0 ? 2 : -50}%);pointer-events:none`, clock(t)));
    }
    area.append(el('div', 'position:absolute;left:4px;top:2px;font-size:10px;color:#889;pointer-events:none', `échelle : ${Math.round(scale).toLocaleString('fr-FR')} PV`));

    // Cible : pointillés bleus + poignées déplaçables (même échelle que la courbe estimée).
    const toPoint = (ev: MouseEvent): TargetPoint => {
      const r = area.getBoundingClientRect();
      const kx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const ky = Math.min(1, Math.max(0, (ev.clientY - r.top) / H));
      return { t: Math.round(kx * end * 2) / 2, hp: Math.round((1 - ky) * scale) };
    };
    if (target) {
      const line = document.createElementNS(NS, 'polyline');
      const linePoints = (): string => target.map((p) => `${((p.t / end) * W).toFixed(1)},${(H - (p.hp / scale) * H).toFixed(1)}`).join(' ');
      line.setAttribute('points', linePoints());
      for (const [k, v] of Object.entries({ fill: 'none', stroke: '#5ab0ff', 'stroke-width': '2', 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke' })) line.setAttribute(k, v);
      svg.append(line);
      target.forEach((p, i) => {
        const handle = el(
          'div',
          'position:absolute;width:10px;height:10px;margin:-7px 0 0 -7px;border-radius:50%;background:#5ab0ff;border:2px solid #fff;cursor:grab;z-index:2',
        );
        const place = (): void => {
          handle.style.left = `${(p.t / end) * 100}%`;
          handle.style.top = `${H - (p.hp / scale) * H}px`;
        };
        place();
        handle.title = 'Glisser pour déplacer · clic droit pour supprimer';
        handle.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          handle.setPointerCapture(ev.pointerId);
          handle.style.cursor = 'grabbing';
        });
        handle.addEventListener('pointermove', (ev) => {
          if (!handle.hasPointerCapture(ev.pointerId)) return;
          const q = toPoint(ev);
          const lo = i > 0 ? target[i - 1].t + 0.5 : 0;
          const hi = i < target.length - 1 ? target[i + 1].t - 0.5 : end;
          p.t = Math.min(hi, Math.max(lo, q.t));
          p.hp = q.hp;
          place();
          line.setAttribute('points', linePoints());
        });
        handle.addEventListener('pointerup', (ev) => {
          if (!handle.hasPointerCapture(ev.pointerId)) return;
          handle.releasePointerCapture(ev.pointerId);
          this.commit();
        });
        handle.addEventListener('dblclick', (ev) => ev.stopPropagation());
        handle.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (target.length <= 2) {
            this.say('La cible garde au moins 2 points.');
            return;
          }
          target.splice(i, 1);
          this.commit();
        });
        area.append(handle);
      });
      const addPoint = (ev: MouseEvent): void => {
        const q = toPoint(ev);
        target.push(q);
        target.sort((a, b) => a.t - b.t);
        this.commit();
      };
      area.addEventListener('dblclick', addPoint);
      // clic droit dans la courbe (hors d'un point) = ajouter un point ; sur un point, le clic droit le supprime
      area.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        addPoint(ev);
      });
    }
    const cursor = el('div', 'position:absolute;top:0;bottom:14px;width:1px;background:#fff;opacity:0.6;display:none;pointer-events:none');
    const tip = el('div', 'position:absolute;top:14px;padding:3px 6px;font-size:11px;background:rgba(0,0,0,0.85);border:1px solid #556;border-radius:3px;white-space:nowrap;display:none;pointer-events:none');
    area.append(cursor, tip);
    area.addEventListener('mousemove', (ev) => {
      const r = area.getBoundingClientRect();
      const k = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const i = Math.round(k * (n - 1));
      cursor.style.cssText += `;display:block;left:${k * 100}%`;
      tip.textContent =
        `${clock(i * sim.dt)} · ${Math.round(sim.hp[i]).toLocaleString('fr-FR')} PV vivants` +
        (target ? ` (cible ${Math.round(targetAt(target, i * sim.dt)).toLocaleString('fr-FR')})` : '') +
        ` · retard ${sim.backlog[i].toFixed(1)} s · DPS ${Math.round(sim.dps[i])}`;
      tip.style.display = 'block';
      tip.style.left = k > 0.6 ? '' : `${k * 100 + 1}%`;
      tip.style.right = k > 0.6 ? `${(1 - k) * 100 + 1}%` : '';
    });
    area.addEventListener('mouseleave', () => {
      cursor.style.display = 'none';
      tip.style.display = 'none';
    });
    const summary = el(
      'div',
      'font-size:12px;color:#cdd',
      `Pic : ${Math.round(peak).toLocaleString('fr-FR')} PV · retard max ${peakBacklog.toFixed(1)} s · retard moyen ${avgBacklog.toFixed(1)} s`,
    );
    this.curveBox.replaceChildren(summary, area);
  }

  // ---------- Timeline ----------

  /** Zoom sur les 10 minutes de jeu : les envois en boucle après le boss final (jusqu'à 36000 s) ne sont pas dessinés. */
  private timelineEnd(): number {
    return WAVE_SCRIPT_END;
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
        if (t > end) break;
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
