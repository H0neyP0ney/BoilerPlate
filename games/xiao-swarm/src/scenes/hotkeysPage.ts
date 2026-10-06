import Phaser from 'phaser';
import { Button, theme } from '@xiao/engine';
import { PALETTE } from '../config';
import { isReserved, keyLabel, labelFromEvent, nominalLabel, type HotkeyAction } from '../hotkeys';
import { t } from '../i18n';
import { settings } from '../settings';

/** Texte de chaque action (clés de `locales/*.json`). */
const ACTION_LABELS = {
  up: 'keyUp',
  down: 'keyDown',
  left: 'keyLeft',
  right: 'keyRight',
  pick1: 'keyPick1',
  pick2: 'keyPick2',
  pick3: 'keyPick3',
  reroll: 'keyReroll',
} as const satisfies Record<HotkeyAction, string>;

type Row = { section: 'hotkeysMove' | 'hotkeysLevelUp' } | { action: HotkeyAction };

const ROWS: Row[] = [
  { section: 'hotkeysMove' },
  { action: 'up' },
  { action: 'down' },
  { action: 'left' },
  { action: 'right' },
  { section: 'hotkeysLevelUp' },
  { action: 'pick1' },
  { action: 'pick2' },
  { action: 'pick3' },
  { action: 'reroll' },
];

/** Dimensions logiques du panneau (px, avant mise à l'échelle pour tenir à l'écran). */
const PW = 520;
const ROW_H = 44;
const SECTION_H = 30;
const CAP_W = 170;
const CAP_H = 36;

/**
 * Page « Hotkeys » du menu Options : une ligne par action (déplacement, choix d'upgrade, relance) avec sa touche ; un clic sur la touche puis
 * une touche du clavier la réassigne (Échap annule, les touches réservées sont refusées, une touche déjà prise est échangée). Les réglages sont
 * mémorisés tout de suite (`settings.setHotkey`). Construit dans la scène Options, qui n'a plus aucun gestionnaire de touches sur cette page.
 */
export function buildHotkeysPage(scene: Phaser.Scene, onBack: () => void): void {
  const dim = scene.add.rectangle(0, 0, 10, 10, 0x0a1422, 0.75).setOrigin(0).setInteractive();
  const box = scene.add.container(0, 0);
  const panel = scene.add.graphics();
  box.add(panel);

  const caps = new Map<HotkeyAction, { g: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }>();
  let waiting: HotkeyAction | null = null;
  let warnTimer: Phaser.Time.TimerEvent | undefined;

  const text = (x: number, y: number, value: string, size: number, color: string, origin: [number, number] = [0, 0.5]) =>
    scene.add.text(x, y, value, { fontFamily: theme.font, fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(origin[0], origin[1]);

  box.add(text(0, 40, t('hotkeys'), 40, '#ffffff', [0.5, 0.5]));

  // lignes : sections et touches
  let y = 84;
  for (const row of ROWS) {
    if ('section' in row) {
      y += row === ROWS[0] ? 0 : 8;
      box.add(text(-PW / 2 + 28, y + SECTION_H / 2, t(row.section), 22, '#ffd166'));
      y += SECTION_H;
      continue;
    }
    const cy = y + ROW_H / 2;
    box.add(text(-PW / 2 + 40, cy, t(ACTION_LABELS[row.action]), 22, '#ffffff'));
    const g = scene.add.graphics();
    const label = text(PW / 2 - 40 - CAP_W / 2, cy, '', 22, '#13233a', [0.5, 0.5]);
    const hit = scene.add.zone(PW / 2 - 40 - CAP_W / 2, cy, CAP_W, CAP_H).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      waiting = waiting === row.action ? null : row.action;
      refresh();
    });
    box.add([g, label, hit]);
    caps.set(row.action, { g, text: label });
    y += ROW_H;
  }

  const note = text(0, y + 26, t('keysNote'), 17, PALETTE.textDim, [0.5, 0.5]);
  box.add(note);
  const buttonsY = y + 82;
  const reset = new Button(scene, -128, buttonsY, {
    label: t('resetKeys'),
    variant: 'secondary',
    width: 236,
    height: 52,
    onClick: () => {
      settings.resetHotkeys();
      waiting = null;
      refresh();
    },
  });
  const back = new Button(scene, 128, buttonsY, { label: t('back'), width: 236, height: 52, onClick: onBack });
  box.add([reset, back]);
  const PH = buttonsY + 56;

  /** Redessine chaque touche : libellé courant, ou « Appuie sur une touche… » (surlignée) pour celle qu'on réassigne. */
  function refresh(): void {
    for (const [action, cap] of caps) {
      const active = waiting === action;
      const cx = PW / 2 - 40 - CAP_W / 2;
      const top = cap.text.y - CAP_H / 2;
      cap.g.clear();
      cap.g.fillStyle(0x0a1422, 0.55).fillRoundedRect(cx - CAP_W / 2, top + 3, CAP_W, CAP_H, 8);
      cap.g.fillStyle(active ? 0xffe066 : 0xf2f5fa, 1).fillRoundedRect(cx - CAP_W / 2, top, CAP_W, CAP_H, 8);
      cap.g.lineStyle(2, active ? 0xb88a00 : 0x13233a, 1).strokeRoundedRect(cx - CAP_W / 2, top, CAP_W, CAP_H, 8);
      cap.text.setText(active ? t('pressKey') : keyLabel(settings.hotkeys[action])).setFontSize(active ? 17 : 22);
    }
  }

  /** Message en rouge à la place de la note pendant un instant (touche réservée). */
  function warn(message: string): void {
    warnTimer?.remove();
    note.setText(message).setColor('#ff7a6a');
    warnTimer = scene.time.delayedCall(1800, () => note.setText(t('keysNote')).setColor(PALETTE.textDim));
  }

  scene.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (!waiting) {
      if (e.code === 'Escape') onBack();
      return;
    }
    e.preventDefault();
    if (e.code === 'Escape') {
      waiting = null;
      refresh();
      return;
    }
    if (isReserved(e.code)) {
      warn(t('keyReserved', { key: nominalLabel(e.code) }));
      return;
    }
    settings.setHotkey(waiting, e.code, labelFromEvent(e));
    waiting = null;
    refresh();
  });

  const layout = (): void => {
    const { width: w, height: h } = scene.scale;
    dim.setSize(w, h);
    const k = Math.min(1, (h - 24) / PH, (w - 24) / PW);
    box.setScale(k).setPosition(w / 2, Math.max(12, (h - PH * k) / 2));
    panel.clear();
    panel.fillStyle(PALETTE.panel, 0.96).fillRoundedRect(-PW / 2, 0, PW, PH, 18);
    panel.lineStyle(3, PALETTE.panelBorder, 1).strokeRoundedRect(-PW / 2, 0, PW, PH, 18);
  };
  refresh();
  layout();
  scene.scale.on(Phaser.Scale.Events.RESIZE, layout);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, layout);
    warnTimer?.remove();
  });
}
