import type Phaser from 'phaser';
import { log } from '../core/log';

/**
 * Wrapper autour du SDK HTML5 Poki (https://developers.poki.com/guide/sdk-html5).
 *
 * Garanties apportées par ce wrapper (cf. requirements Poki) :
 *  - le jeu tourne même si le SDK est bloqué (adblock) ou absent ;
 *  - gameplayStart / gameplayStop ne partent jamais deux fois de suite ;
 *  - aucun event SDK n'est émis pendant une pub (midroll ou rewarded) ;
 *  - son coupé + inputs désactivés pendant les pubs ;
 *  - pas de récompense si la pub n'a pas été vue (adblock inclus).
 */

interface PokiSDKApi {
  init(): Promise<void>;
  setDebug?(debug: boolean): void;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
  measure?(category: string, what: string, action: string): void;
  shareableURL?(params: Record<string, string>): Promise<string>;
  getURLParam?(key: string): string | undefined;
  openExternalLink?(url: string): void;
  movePill?(topPercent: number, topPx: number): void;
}

/**
 * Interrupteur des pubs Poki. VRAI : le jeu demande au SDK les pubs récompensées (revive) et interstitielles (entre deux parties, voir la
 * règle du jeu). Mettre à `false` coupe toutes les pubs : une « pub » passe alors instantanément (pas de retard à la reprise / au
 * redémarrage) et la récompense est accordée tout de suite ; les events de gameplay (gameplayStart / Stop, measure) restent envoyés.
 * Règles pub : voir CLAUDE.md.
 */
export const ADS_ENABLED = true;

declare global {
  interface Window {
    PokiSDK?: PokiSDKApi;
  }
}

class Poki {
  private sdk: PokiSDKApi | undefined;
  private game: Phaser.Game | undefined;
  private loadingFinished = false;
  private inGameplay = false;
  private adPlaying = false;
  private mutedBeforeAd = false;

  /** À appeler avant de créer le jeu. Ne rejette jamais. */
  async init(): Promise<void> {
    const sdk = window.PokiSDK;
    if (!sdk) {
      log.warn('[poki] SDK absent (adblock ?) — le jeu continue sans.');
      return;
    }
    try {
      await sdk.init();
      log.info('[poki] SDK initialisé');
    } catch {
      log.warn('[poki] init en erreur — on charge le jeu quand même');
    }
    this.sdk = sdk;
    if (import.meta.env.DEV) sdk.setDebug?.(true);
  }

  attachGame(game: Phaser.Game): void {
    this.game = game;
  }

  get isGameplayActive(): boolean {
    return this.inGameplay;
  }

  get isAdPlaying(): boolean {
    return this.adPlaying;
  }

  /** Une seule fois, quand les assets essentiels sont chargés. */
  gameLoadingFinished(): void {
    if (this.loadingFinished) return;
    this.loadingFinished = true;
    this.call((s) => s.gameLoadingFinished());
  }

  /** Premier input du joueur, début de niveau, sortie de pause. */
  gameplayStart(): void {
    if (this.inGameplay || this.adPlaying) return;
    this.inGameplay = true;
    this.call((s) => s.gameplayStart());
  }

  /** Pause, menu, mort, fin de niveau, cutscene. */
  gameplayStop(): void {
    if (!this.inGameplay || this.adPlaying) return;
    this.inGameplay = false;
    this.call((s) => s.gameplayStop());
  }

  /**
   * Pub interstitielle, à placer aux pauses naturelles juste avant de
   * reprendre le gameplay (retry, niveau suivant, sortie de pause).
   * Poki gère la fréquence : ne jamais ajouter de timer maison.
   */
  async commercialBreak(): Promise<void> {
    if (!ADS_ENABLED || !this.sdk || this.adPlaying) return;
    this.gameplayStop();
    this.adPlaying = true;
    try {
      await this.sdk.commercialBreak(() => this.onAdStart());
    } catch {
      /* pub non dispo : on continue */
    } finally {
      this.onAdEnd();
    }
  }

  /**
   * Pub récompensée, uniquement sur choix explicite du joueur.
   * Retourne true seulement si la récompense doit être donnée.
   */
  async rewardedBreak(): Promise<boolean> {
    if (!ADS_ENABLED) return true; // pubs désactivées : récompense accordée sans pub
    if (!this.sdk) return true; // pas de SDK (développement, hébergement de test, adblock) : rien à montrer, la récompense est accordée (le jeu reste jouable)
    if (this.adPlaying) return false;
    this.gameplayStop();
    this.adPlaying = true;
    let success = false;
    try {
      success = await this.sdk.rewardedBreak(() => this.onAdStart());
    } catch {
      success = false;
    } finally {
      this.onAdEnd();
    }
    return success;
  }

  /** Events de jeu (https://developers.poki.com/guide/game-events). */
  measure(category: string, what: string | number, action: string): void {
    const clean = (v: string | number) => String(v).replace(/[/^]/g, '-');
    this.call((s) => s.measure?.(clean(category), clean(what), clean(action)));
  }

  /** Paramètre d'URL : passe par Poki en prod, fallback sur location.search en local. */
  getURLParam(key: string): string | undefined {
    const fromSdk = this.sdk?.getURLParam?.(key);
    if (fromSdk) return fromSdk;
    return new URLSearchParams(window.location.search).get(key) ?? undefined;
  }

  async shareableURL(params: Record<string, string>): Promise<string | undefined> {
    try {
      return await this.sdk?.shareableURL?.(params);
    } catch {
      return undefined;
    }
  }

  /** Obligatoire pour tout lien sortant (jamais de window.open direct). */
  openExternalLink(url: string): void {
    this.call((s) => s.openExternalLink?.(url));
  }

  /** Déplace la "pill" Poki sur mobile si elle gêne l'UI. topPercent : 0-50. */
  movePill(topPercent: number, topPx = 0): void {
    this.call((s) => s.movePill?.(topPercent, topPx));
  }

  private onAdStart(): void {
    const game = this.game;
    if (!game) return;
    this.mutedBeforeAd = game.sound.mute;
    game.sound.mute = true;
    game.input.enabled = false;
  }

  private onAdEnd(): void {
    this.adPlaying = false;
    const game = this.game;
    if (!game) return;
    game.sound.mute = this.mutedBeforeAd;
    game.input.enabled = true;
  }

  private call(fn: (sdk: PokiSDKApi) => void): void {
    if (!this.sdk) return;
    try {
      fn(this.sdk);
    } catch (e) {
      log.warn('[poki] appel SDK en erreur', e);
    }
  }
}

export const poki = new Poki();
