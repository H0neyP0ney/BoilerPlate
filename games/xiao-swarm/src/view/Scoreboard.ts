import Phaser from 'phaser';
import { theme } from '@xiao/engine';
import { PALETTE } from '../config';
import { t } from '../i18n';
import type { Squad } from '../sim/Squad';

/** Une ligne du scoreboard de fin de partie : un joueur, ses aliens tués et ses dégâts totaux (sans overkill). */
export interface ScoreRow {
  label: string;
  kills: number;
  dealt: number;
  local: boolean;
}

/** Hauteur d'une ligne (px) et de l'en-tête. */
export const SCORE_ROW_H = 26;
export const SCORE_HEAD_H = 28;

/** Hauteur totale du scoreboard pour `n` joueurs. */
export const scoreboardHeight = (n: number): number => SCORE_HEAD_H + n * SCORE_ROW_H;

/** Lignes du scoreboard : le joueur local est « You », les autres « Player n » (dans l'ordre des squads). */
export function scoreRows(squads: readonly Squad[], localOwner: string): ScoreRow[] {
  return squads.map((sq, i) => ({
    label: sq.owner === localOwner ? t('scoreYou') : t('scorePlayer', { value: i + 1 }),
    kills: sq.kills,
    dealt: sq.dealt,
    local: sq.owner === localOwner,
  }));
}

/** Construit le scoreboard (conteneur centré en x, `top` = haut de l'en-tête) : joueur, aliens tués, dégâts infligés. */
export function buildScoreboard(scene: Phaser.Scene, cx: number, top: number, rows: readonly ScoreRow[], width = 440): Phaser.GameObjects.Container {
  const c = scene.add.container(cx, top);
  const colName = -width / 2 + 14;
  const colKills = width / 2 - 170;
  const colDmg = width / 2 - 14;
  const style = (color: string, size = 18): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: theme.font, fontSize: `${size}px`, fontStyle: 'bold', color });
  const bg = scene.add.graphics();
  bg.fillStyle(0x0a1422, 0.55).fillRoundedRect(-width / 2, 0, width, scoreboardHeight(rows.length) + 6, 10);
  bg.lineStyle(1.5, 0xffffff, 0.2).lineBetween(-width / 2 + 10, SCORE_HEAD_H, width / 2 - 10, SCORE_HEAD_H);
  c.add(bg);
  c.add(scene.add.text(colName, SCORE_HEAD_H / 2, t('scorePlayerHead'), style(PALETTE.textDim, 15)).setOrigin(0, 0.5));
  c.add(scene.add.text(colKills, SCORE_HEAD_H / 2, t('scoreAliens'), style(PALETTE.textDim, 15)).setOrigin(1, 0.5));
  c.add(scene.add.text(colDmg, SCORE_HEAD_H / 2, t('scoreDamage'), style(PALETTE.textDim, 15)).setOrigin(1, 0.5));
  rows.forEach((r, i) => {
    const y = SCORE_HEAD_H + i * SCORE_ROW_H + SCORE_ROW_H / 2 + 2;
    const color = r.local ? '#ffe066' : '#ffffff';
    c.add(scene.add.text(colName, y, r.label, style(color)).setOrigin(0, 0.5));
    c.add(scene.add.text(colKills, y, String(r.kills), style(color)).setOrigin(1, 0.5));
    c.add(scene.add.text(colDmg, y, Math.round(r.dealt).toLocaleString('en-US'), style(color)).setOrigin(1, 0.5));
  });
  return c;
}
