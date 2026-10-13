import Phaser from 'phaser';
import { sfx } from '@xiao/engine';
import { SCENES } from '../config';
import { SFX_INFO } from '../sfxInfo';
import { SFX, type SfxId } from '../settings';

/**
 * Page de test des bruitages (dev / `?debug=1`, ouverte par `?sounds`) : un bouton par son, avec QUAND il joue dans le jeu.
 * Pour remplacer un son : écraser `public/assets/audio/sfx/<nom>.mp3` puis recharger la page (F5). Voir `docs/SONS.md`.
 */
export class SoundTestScene extends Phaser.Scene {
  private root?: HTMLDivElement;

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
    close.style.marginLeft = 'auto';
    head.append(title, hint, all, close);
    root.append(head);
    const groups = [...new Set(SFX_INFO.map((s) => s.group))];
    for (const g of groups) {
      const h = document.createElement('h3');
      h.textContent = g;
      h.style.cssText = 'margin:18px 0 6px;color:#ffc83d';
      root.append(h);
      for (const s of SFX_INFO.filter((i) => i.group === g)) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:10px;align-items:center;margin:3px 0';
        const loaded = this.cache.audio.exists(SFX[s.id].key);
        const play = this.button(`▶ ${s.id}`, () => this.play(s.id));
        play.style.minWidth = '190px';
        play.style.textAlign = 'left';
        if (!loaded) play.style.opacity = '0.4';
        const when = document.createElement('span');
        when.textContent = loaded ? s.when : `${s.when} — fichier introuvable`;
        when.style.opacity = '0.8';
        row.append(play, when);
        root.append(row);
      }
    }
    document.body.append(root);
    this.root = root;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.root?.remove());
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
    for (const s of SFX_INFO) {
      this.play(s.id);
      await new Promise((r) => setTimeout(r, 1700));
    }
  }
}
