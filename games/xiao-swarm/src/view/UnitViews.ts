import Phaser from 'phaser';
import { lerp, sprites } from '@xiao/engine';
import { BURIED, DEPTH, FREEZE, RECRUIT, RELOCATE } from '../config';
import { FX } from '../fxParams';
import { TICK_RATE } from '../net/Session';
import { createEnragedFlames, ENRAGED_TINT } from './EnragedFx';
import { iceLook } from './IceBlockFx';
import { soldierSpriteId } from '../art/playerVariants';
import { hasComposedRecruit, recruitSpriteId, RECRUIT_STAR } from '../art/recruits';
import type { AlienState, RecruitState, SoldierState } from '../sim/entities';

/**
 * Représentations visuelles des entités de la simulation. Elles lisent l'état
 * (jamais l'inverse), interpolent entre deux ticks (`alpha`) et gèrent
 * l'animation purement cosmétique.
 *
 * Les visuels viennent du catalogue `sprites` : planche fournie (avec ses
 * animations idle / walk / shoot) ou dessin procédural (bob, squash).
 */
/** Particules de soin sur un soldat soigné : durée (s) pendant laquelle elles le suivent, et délai entre deux « + ». */
const HEAL_FX_TIME = 1;
const HEAL_FX_EVERY = 0.12;
/** Après un flash de touche, l'unité reste sans flash au moins ce temps (s, ≈ 4 images à 60 fps) : sous un tir continu elle clignote au lieu de rester blanche. */
const FLASH_REST = 0.07;
/** Apparition d'un alien (les aliens sont enterrés dans la carte) : durée (s) où le trou se creuse, où l'alien en sort, puis où le trou s'efface. */
const EMERGE_OPEN = 0.4;
const EMERGE_POP = 0.3;
const EMERGE_FADE = 0.4;
/** Ligne de sol d'un sprite enfoncé (`AlienView.groundCut`) : px sous le point d'ancrage (centre de l'ombre portée et du trou). */
const GROUND_CUT_DY = 3;

/**
 * Point d'origine (bouche du canon, de la langue…) en monde d'un sprite de planche : le point de la frame jouée (placé dans la
 * visionneuse d'unités, `muzzles` / `muzzle` du catalogue), retourné avec le sprite. null sans planche animée ni point défini.
 */
function muzzleOf(b: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, id: string, defaultAnim: string): { x: number; y: number } | null {
  const anims = (b as Partial<Phaser.GameObjects.Sprite>).anims;
  if (!anims) return null; // visuel statique (dessin procédural / image) : pas de point par frame
  const key = anims.currentAnim?.key;
  const anim = key?.startsWith(id + ':') ? key.slice(id.length + 1) : defaultAnim;
  const frame = anims.currentFrame ? anims.currentFrame.index - 1 : 0;
  const m = sprites.muzzleFor(id, anim, frame);
  if (!m) return null;
  const fx = b.flipX ? 1 - m[0] : m[0];
  return { x: b.x + (fx - b.originX) * b.displayWidth, y: b.y + (m[1] - b.originY) * b.displayHeight };
}

export class SoldierView {
  /** Glaçon du soldat gelé (`SoldierState.frozen`) : créé au premier gel, fissures par étages, éclats à chaque coup (`onIceHit`). */
  private ice?: Phaser.GameObjects.Sprite;
  private iceCracks?: Phaser.GameObjects.Image;
  private lastIce = 0;
  /** Posé par la vue du monde (qui sait si c'est à l'écran) : éclats de glace à chaque coup allié sur la glace. */
  onIceHit?: (x: number, y: number) => void;
  /** Position affichée (interpolée), utilisée par l'overlay et la caméra. */
  rx = 0;
  ry = 0;
  /** Durée restante (s) du flash de touche ; voir `hit` pour le déclencher. */
  flash = 0;
  private rest = 0;
  seen = true;
  private walk = 0;
  /** Soin : PV vus à la frame précédente, durée restante des particules de soin (s) et cadence d'émission. */
  private lastHp: number;
  private lastMaxHp: number;
  private healT = 0;
  private healAcc = 0;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly bodyId: string;
  private readonly gunId: string;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly gun: Phaser.GameObjects.Sprite;
  private readonly hasGun: boolean;
  private readonly animated: boolean;

  /** Icône de tourbillon au-dessus d'un soldat étourdi (créée à la demande). */
  private stunIcon?: Phaser.GameObjects.Image;
  /** Montée de niveau : copies blanches du corps et de l'arme posées par-dessus (`levelFlash`), et temps écoulé depuis le flash (ms). */
  private whiteBody?: Phaser.GameObjects.Image;
  private whiteGun?: Phaser.GameObjects.Image;
  private whiteMs = Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly state: SoldierState,
    readonly ringColor: number,
    slot = 0,
  ) {
    this.lastHp = state.hp;
    this.lastMaxHp = state.maxHp;
    this.bodyId = soldierSpriteId(state.def.id, slot); // soldat à la couleur du joueur
    this.gunId = `gun_${state.def.id}`;
    this.body = sprites.add(scene, this.bodyId, state.x, state.y);
    this.gun = sprites.add(scene, this.gunId, state.x, state.y);
    this.hasGun = !sprites.get(this.gunId).hidden;
    this.animated = sprites.hasAnim(this.bodyId, 'walk') || sprites.hasAnim(this.bodyId, 'idle');
  }

  /**
   * À appeler chaque frame : vrai quand il faut émettre une particule de soin sur ce soldat. Dès que ses PV montent (soin de toute
   * origine : soigneur, globe, recrue…) à PV max constants, les particules le suivent pendant `HEAL_FX_TIME` s.
   */
  healTick(dt: number): boolean {
    const s = this.state;
    if (s.maxHp === this.lastMaxHp && s.hp > this.lastHp + 0.01) this.healT = HEAL_FX_TIME;
    this.lastHp = s.hp;
    this.lastMaxHp = s.maxHp;
    if (this.healT <= 0 || !s.alive) return false;
    this.healT -= dt;
    this.healAcc += dt;
    if (this.healAcc < HEAL_FX_EVERY) return false;
    this.healAcc = 0;
    return true;
  }

  /** Touché : flash de `duration` s, sauf s'il est déjà en cours ou en repos (le flash n'est jamais prolongé : sous un tir continu l'unité clignote). */
  hit(duration: number): void {
    if (this.flash <= 0 && this.rest <= 0) this.flash = duration;
  }

  sync(alpha: number, dt: number, time: number): void {
    const s = this.state;
    this.rx = lerp(s.px, s.x, alpha);
    this.ry = lerp(s.py, s.y, alpha);
    const moving = Math.hypot(s.vx, s.vy) > 20;
    const depth = DEPTH.actors + this.ry;

    let facing = s.facing;
    if (!s.target && Math.abs(s.vx) > 15) facing = s.vx > 0 ? 1 : -1;

    // Animation : planche si dispo (tir vers la cible > marche orientée > idle), sinon rebond procédural.
    let bob = 0;
    if (this.animated) {
      const id = this.bodyId;
      const b = this.body;
      // Avec une cible, le sprite regarde toujours vers elle (même en marchant dans l'autre sens) : direction du tir, pas du déplacement.
      const dirX = s.target ? Math.cos(s.aim) : s.vx;
      const dirY = s.target ? 0 : s.vy;
      const played =
        (s.target && sprites.playDirectional(b, id, 'shoot', Math.cos(s.aim), 0)) ||
        (moving && sprites.playDirectional(b, id, 'walk', dirX, dirY)) ||
        sprites.playDirectional(b, id, 'idle', facing, 0);
      if (!played) b.setFlipX(sprites.flipFor(id, facing));
    } else {
      this.walk += dt * (moving ? 14 : 0);
      bob = moving ? -Math.abs(Math.sin(this.walk)) * 3 : Math.sin(time * 2.2 + this.phase) * 0.8;
      this.body.setFlipX(sprites.flipFor(this.bodyId, facing));
    }
    sprites.place(this.body, this.bodyId); // ancrage propre à la séquence / direction (si défini)
    this.body.setPosition(this.rx, this.ry + bob).setDepth(depth).setScale(sprites.scaleOf(this.bodyId));
    if (s.stun > 0) {
      this.stunIcon ??= this.scene.add.image(0, 0, 'fx_stun').setScale(0.9);
      this.stunIcon.setVisible(true).setPosition(this.rx, this.ry - 44 + bob).setRotation(-time * 7).setDepth(DEPTH.actors + this.ry + 3);
    } else this.stunIcon?.setVisible(false);

    if (this.hasGun) {
      const aim = s.target ? s.aim : facing > 0 ? 0 : Math.PI;
      this.gun
        .setPosition(this.rx + facing * 4, this.ry - 17 * (s.def.id === 'bruiser' ? 1.15 : 1) + bob)
        .setRotation(aim)
        .setFlipY(Math.cos(aim) < 0)
        .setDepth(depth + 0.5);
    }

    if (this.rest > 0) this.rest -= dt;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.rest = FLASH_REST;
      this.body.setTint(0xff6a6a).setTintMode(Phaser.TintModes.FILL);
    } else if (s.frozen > 0) {
      this.body.setTint(0x9fd4ff).setTintMode(Phaser.TintModes.MULTIPLY); // gelé : bleu, vu à travers la glace
    } else if (s.capturedBy) {
      this.body.setTint(0xa8f0b8).setTintMode(Phaser.TintModes.MULTIPLY); // en cours de digestion par une bulle : vert
    } else {
      this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    const blink = s.invulnerable > 0 && Math.sin(time * 30) > 0;
    this.body.setAlpha(blink ? 0.45 : 1);
    this.gun.setAlpha(blink ? 0.45 : 1);
    this.syncIce(s.frozen);
    this.syncLevelFlash(dt);
  }

  /** Montée de niveau : le soldat devient tout blanc puis repasse à sa couleur en fondu (`FX.levelFlash`). */
  levelFlash(): void {
    this.whiteMs = 0;
  }

  /** Copie blanche (remplissage) de `src` posée exactement par-dessus, d'opacité `a` (créée au premier flash). */
  private whiteCopy(img: Phaser.GameObjects.Image | undefined, src: Phaser.GameObjects.Sprite, a: number): Phaser.GameObjects.Image {
    const w = img ?? this.scene.add.image(0, 0, src.texture.key, src.frame.name).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    return w
      .setTexture(src.texture.key, src.frame.name)
      .setOrigin(src.originX, src.originY)
      .setPosition(src.x, src.y)
      .setScale(src.scaleX, src.scaleY)
      .setRotation(src.rotation)
      .setFlip(src.flipX, src.flipY)
      .setDepth(src.depth + 0.05)
      .setVisible(src.visible)
      .setAlpha(a * src.alpha);
  }

  private syncLevelFlash(dt: number): void {
    const f = FX.levelFlash;
    this.whiteMs += dt * 1000;
    const a = this.whiteMs <= f.holdMs ? 1 : 1 - (this.whiteMs - f.holdMs) / Math.max(1, f.fadeMs);
    if (a <= 0) {
      this.whiteBody?.setVisible(false);
      this.whiteGun?.setVisible(false);
      return;
    }
    this.whiteBody = this.whiteCopy(this.whiteBody, this.body, a);
    if (this.hasGun) this.whiteGun = this.whiteCopy(this.whiteGun, this.gun, a);
  }

  /**
   * Glaçon : devant le soldat (qu'on voit à travers) tant qu'il est gelé ; pas de barre, il rétrécit et se fissure à mesure que les
   * tirs alliés retirent des PV de gel (`iceLook`), et crache des éclats à chaque coup.
   */
  private syncIce(frozen: number): void {
    if (frozen <= 0) {
      this.ice?.setVisible(false);
      this.iceCracks?.setVisible(false);
      this.lastIce = 0;
      return;
    }
    this.ice ??= sprites.add(this.scene, 'alien_iceblock', this.rx, this.ry);
    const look = iceLook(frozen / FREEZE.hp);
    const k = sprites.scaleOf('alien_iceblock') * look.scale;
    this.ice.setVisible(true).setPosition(this.rx, this.ry).setScale(k).setAlpha(0.82).setDepth(DEPTH.actors + this.ry + 1);
    sprites.place(this.ice, 'alien_iceblock');
    if (this.lastIce > 0 && frozen < this.lastIce) this.onIceHit?.(this.rx, this.ry - 8);
    this.lastIce = frozen;
    if (look.stage > 0) {
      this.iceCracks ??= this.scene.add.image(0, 0, 'alien_iceblock_cracks_1');
      this.iceCracks
        .setTexture(`alien_iceblock_cracks_${look.stage}`)
        .setVisible(true)
        .setOrigin(this.ice.originX, this.ice.originY)
        .setPosition(this.ice.x, this.ice.y)
        .setScale(k)
        .setDepth(this.ice.depth + 0.1);
    } else this.iceCracks?.setVisible(false);
  }

  /** Bouche du canon en monde (planche : point de la frame en cours, comme dans la visionneuse), sinon null. */
  muzzlePoint(): { x: number; y: number } | null {
    return muzzleOf(this.body, this.bodyId, 'shoot');
  }

  /** Orientation affichée (pour l'animation de mort). */
  get flipX(): boolean {
    return this.body.flipX;
  }

  destroy(): void {
    this.stunIcon?.destroy();
    this.whiteBody?.destroy();
    this.whiteGun?.destroy();
    this.ice?.destroy();
    this.iceCracks?.destroy();
    this.body.destroy();
    this.gun.destroy();
  }
}

/** Silhouettes fantômes de la charge (chargeur, rhinocéros) : intervalle (s), durée d'effacement (s), opacité de départ, teinte. */
const GHOST = { every: 0.05, life: 0.25, alpha: 0.5, color: 0x7fb8ff };

export class AlienView {
  /** La séquence « attack » de l'action en cours a déjà été lancée (elle n'est pas relancée en boucle). */
  private attackStarted = false;
  rx = 0;
  ry = 0;
  /** Durée restante (s) du flash de touche ; voir `hit` pour le déclencher. */
  flash = 0;
  private rest = 0;
  seen = true;
  private facing = 1;
  private spawnT = 0;
  /** Temps écoulé depuis l'apparition (s) ; au-delà de la durée totale, plus de trou (0 pour les aliens présents d'emblée : ils n'en ont pas). */
  private emergeT: number;
  /** Appelé une fois quand l'unité jaillit du sol (poussière) : posé par la vue du monde, qui sait si elle est à l'écran. */
  onPop?: (x: number, y: number, radius: number) => void;
  private prevPhase = 0;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly id: string;
  private readonly animated: boolean;
  readonly body: Phaser.GameObjects.Sprite;

  /** Enragé (ressuscité par un chaman) : flammes rouges qui montent du corps. */
  private zombieFx?: Phaser.GameObjects.Particles.ParticleEmitter;
  private flameLevel = 0;
  /** Charge (chargeur, rhinocéros) : délai avant la prochaine silhouette fantôme laissée derrière lui. */
  private ghostT = 0;
  /** Abscisse vers laquelle il regarde, quoi qu'il fasse (lurker enterré : sa proie, posée par `WorldView`) ; null : il regarde où il va. */
  lookAt: number | null = null;
  /** Part de l'alien sortie du sol (0 = enterré / pas encore sorti de son trou, 1 = dehors) : opacité de son ombre portée (fondu). */
  outOfGround = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly state: AlienState,
    emerge = false,
  ) {
    // lurker (il creuse son propre trou) et ressuscité (il sort de sa flaque) n'ont pas de trou d'apparition
    this.emergeT = emerge && !state.def.lurk && !state.revived && !state.def.projectile ? 0 : EMERGE_OPEN + EMERGE_POP + EMERGE_FADE; // un projectile n'a pas de trou
    // sort d'un trou d'apparition : il monte hors du sol (sprite rogné de 0 à 100 %, `groundCut`) au lieu de surgir en grossissant
    if (this.emergeT === 0) this.spawnT = 1;
    this.id = `alien_${state.def.id}`;
    this.body = sprites.add(scene, this.id, state.x, state.y);
    this.animated = sprites.hasAnim(this.id, 'walk') || sprites.hasAnim(this.id, 'idle');
    this.body.setScale(0.01);
  }

  /** Touché : flash de `duration` s, sauf s'il est déjà en cours ou en repos (le flash n'est jamais prolongé : sous un tir continu l'unité clignote). */
  hit(duration: number): void {
    if (this.flash <= 0 && this.rest <= 0) this.flash = duration;
  }

  /** Point d'origine des tirs / de la langue en monde (point de la frame jouée, placé dans la visionneuse), sinon null. */
  muzzlePoint(): { x: number; y: number } | null {
    return muzzleOf(this.body, this.id, 'walk');
  }

  /** Silhouette fantôme : copie de la frame affichée, teintée en bleu uni, qui s'efface sur place. */
  private spawnGhost(): void {
    const b = this.body;
    const g = this.scene.add
      .image(b.x, b.y, b.texture.key, b.frame.name)
      .setOrigin(b.originX, b.originY)
      .setScale(b.scaleX, b.scaleY)
      .setFlipX(b.flipX)
      .setTint(GHOST.color)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(GHOST.alpha)
      .setDepth(b.depth - 0.5);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: GHOST.life * 1000, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  }

  /** Le sprite est rogné par le bas (`setCrop`). */
  private cut = false;

  /**
   * Ne montre que le haut du sprite (part `show`, 0 → 1, en partant du haut) : il s'enfonce dans le sol. La ligne de coupe glisse du bas de
   * l'image jusqu'au sol (point d'ancrage = centre de l'ombre portée et du trou) pendant le premier quart de l'enfoncement, puis y reste :
   * semi-enterré, le haut du sprite dépasse du trou au lieu de flotter sous le sol. 1 = entier, 0 = invisible.
   */
  private groundCut(show: number): void {
    const b = this.body;
    if (show >= 0.999) {
      if (this.cut) b.setCrop();
      this.cut = false;
      return;
    }
    if (show <= 0.01) {
      b.setVisible(false);
      return;
    }
    const dh = b.displayHeight;
    const top = b.y - b.originY * dh;
    const cutY = top + show * dh; // ligne de coupe avant décalage
    const ground = this.ry + GROUND_CUT_DY; // fond du trou, juste sous le centre de l'ombre
    const k = Math.min(1, (1 - show) / 0.25);
    b.setCrop(0, 0, b.frame.width, b.frame.height * show);
    b.setY(b.y + (ground - cutY) * k);
    this.cut = true;
  }

  /** Trou d'apparition sous l'alien (null : aucun) : `open` 0 → 1 pendant qu'il se creuse, `alpha` qui tombe à 0 quand l'alien en est sorti. */
  hole(): { x: number; y: number; radius: number; open: number; alpha: number } | null {
    // s'enterre (recyclage des traînards) : le trou s'ouvre sous lui pendant qu'il s'enfonce
    if (this.state.sinkT > 0) return { x: this.rx, y: this.ry, radius: this.state.radius * 1.3, open: Math.min(1, (1 - this.state.sinkT / RELOCATE.sink) * 2.5), alpha: 1 };
    const total = EMERGE_OPEN + EMERGE_POP + EMERGE_FADE;
    if (this.emergeT >= total) return null;
    const alpha = this.emergeT < EMERGE_OPEN + EMERGE_POP ? 1 : 1 - (this.emergeT - EMERGE_OPEN - EMERGE_POP) / EMERGE_FADE;
    return { x: this.rx, y: this.ry, radius: this.state.radius * 1.3, open: Math.min(1, this.emergeT / EMERGE_OPEN), alpha };
  }

  sync(alpha: number, dt: number, time: number): void {
    const a = this.state;
    this.rx = lerp(a.px, a.x, alpha);
    this.ry = lerp(a.py, a.y, alpha);
    const hidden = this.emergeT < EMERGE_OPEN; // le trou se creuse : l'alien n'est pas encore sorti
    this.emergeT += dt;
    if (hidden && this.emergeT >= EMERGE_OPEN) this.onPop?.(this.rx, this.ry, a.radius * 1.3); // sort de son trou d'apparition
    // lurker (phase 5) et Scarab (phase 3) : ressortent de terre
    if (a.lurkPhase !== this.prevPhase) {
      if ((a.def.lurk && a.lurkPhase === 5) || (a.def.burrow && a.lurkPhase === 3)) this.onPop?.(this.rx, this.ry, a.radius * 1.4);
      this.prevPhase = a.lurkPhase;
    }
    if (a.def.lurk && (a.lurkPhase === 3 || a.lurkPhase === 4)) this.facing = Math.cos(a.spikeAng) >= 0 ? 1 : -1; // vise / lance ses pics : face à la ligne
    else if (this.lookAt !== null) {
      if (Math.abs(this.lookAt - this.rx) > 6) this.facing = this.lookAt > this.rx ? 1 : -1; // enterré : face à sa proie (soldat le plus proche)
    } else if (Math.abs(a.vx) > 8) this.facing = a.vx > 0 ? 1 : -1;

    // Squash / lévitation procéduraux seulement sans planche animée.
    const t = time * 7 + this.phase;
    const squash = this.animated || a.def.floats ? 0 : Math.sin(t) * 0.06;
    const lift = a.def.floats ? Math.sin(time * 3 + this.phase) * 5 : 0;
    const wind = a.slamWind > 0 ? 1 - a.slamWind * 1.2 : 0;
    if (this.animated) {
      // attaque (slam, charge, saut) : la séquence « attack » est lancée UNE fois puis reste sur sa dernière frame jusqu'à la fin de l'action
      const attackNow = a.slamWind > 0 || a.leapT > 0;
      if (!attackNow) this.attackStarted = false;
      else if (!this.attackStarted) this.attackStarted = sprites.play(this.body, this.id, 'attack');
      if (!(attackNow && this.attackStarted)) sprites.play(this.body, this.id, 'walk') || sprites.play(this.body, this.id, 'idle'); // pas d'idle dédié : toujours la marche (l'idle n'est qu'un repli)
    }
    if (!hidden) this.spawnT = Math.min(1, this.spawnT + dt * 4);
    const pop = Phaser.Math.Easing.Back.Out(this.spawnT) * sprites.scaleOf(this.id); // relue chaque frame : réglable dans la visionneuse
    this.body.setScale(pop * (1 + squash + wind * 0.12), pop * (1 - squash - wind * 0.1));
    // Procédural : seule la bête a un côté ; une planche fournie se retourne toujours.
    const flips = this.animated || a.def.id === 'charger' || a.def.id === 'boss_rhino';
    this.body
      .setPosition(this.rx, this.ry + lift)
      .setFlipX(flips ? sprites.flipFor(this.id, this.facing) : false)
      .setDepth(DEPTH.actors + this.ry);
    sprites.place(this.body, this.id);
    // Charge : silhouettes fantômes bleutées derrière lui (une toutes les `GHOST.every` s, chacune s'efface en `GHOST.life` s : ~5 visibles)
    if (a.def.rush && a.rushT > 0 && this.body.visible) {
      if ((this.ghostT -= dt) <= 0) {
        this.ghostT = GHOST.every;
        this.spawnGhost();
      }
    } else this.ghostT = 0;
    this.outOfGround = hidden ? 0 : this.spawnT; // trou d'apparition : dehors une fois sorti (pop terminé)
    if (a.def.capture) {
      // bulle : au-dessus du soldat qu'elle porte (qu'on voit à travers), elle palpite quand elle digère
      this.body.setDepth(DEPTH.actors + this.ry + 1).setAlpha(a.captive ? 0.85 : 0.95);
      if (a.captive) this.body.setScale(this.body.scaleX * (1 + Math.sin(time * 8) * 0.05), this.body.scaleY * (1 + Math.sin(time * 8 + 1) * 0.05));
    }

    this.body.setVisible(!hidden);
    // enfouissement : `show` = part du sprite au-dessus du sol, en partant du haut (BURIED). Lurker : s'enfonce (1) jusqu'à n'en laisser
    // dépasser que le haut, semi-enterré (2-4), ressort (5). Scarab : s'enfonce (1), totalement enterré (2), ressort (3). Recyclage : s'enfonce.
    let show = 1;
    if (a.def.lurk) {
      const L = a.def.lurk;
      const semi = BURIED.semiShow;
      if (a.lurkPhase === 1) show = semi + (1 - semi) * Math.max(0, a.lurkT / L.digTime);
      else if (a.lurkPhase >= 2 && a.lurkPhase <= 4) show = semi;
      else if (a.lurkPhase === 5) show = semi + (1 - semi) * (1 - Math.max(0, a.lurkT / L.rise));
    }
    if (a.def.burrow) {
      const B = a.def.burrow;
      if (a.lurkPhase === 1) show = Math.max(0, a.lurkT / B.dig);
      else if (a.lurkPhase === 2) show = 0;
      else if (a.lurkPhase === 3) show = 1 - Math.max(0, a.lurkT / B.rise);
    }
    if (a.sinkT > 0) show = Math.min(show, a.sinkT / RELOCATE.sink);
    // trou d'apparition : le trou se creuse (invisible), puis il monte hors du sol en `EMERGE_POP` s (0 → 100 % du sprite)
    if (this.emergeT < EMERGE_OPEN + EMERGE_POP) show = Math.min(show, Math.max(0, (this.emergeT - EMERGE_OPEN) / EMERGE_POP));
    this.groundCut(show);
    // ombre portée : s'efface en douceur pendant qu'il s'enfonce (nulle une fois semi-enterré) et revient pendant qu'il ressort
    this.outOfGround = Math.min(this.outOfGround, Math.max(0, Math.min(1, (show - BURIED.semiShow) / (1 - BURIED.semiShow))));
    if (a.revived || a.enraged) this.syncZombieFx();

    if (this.rest > 0) this.rest -= dt;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.rest = FLASH_REST;
      this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    } else if (a.rushWind > 0) {
      this.body.setTint(0xffb0a0).setTintMode(Phaser.TintModes.MULTIPLY);
    } else if (a.revived || a.enraged) {
      this.body.setTint(ENRAGED_TINT).setTintMode(Phaser.TintModes.MULTIPLY); // teinte rouge de l'enragé
    } else if (a.def.tint !== undefined) {
      this.body.setTint(a.def.tint).setTintMode(Phaser.TintModes.MULTIPLY); // teinte propre à l'espèce (gling géant rose)
    } else {
      this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  /** Flammes d'enragé qui suivent l'alien ; créé à la première frame où il est ressuscité. */
  private syncZombieFx(): void {
    const a = this.state;
    if (!this.zombieFx) {
      this.zombieFx = createEnragedFlames(this.scene, a.radius);
    }
    // boss enragé une 2e fois : flammes beaucoup plus denses et plus grosses
    const level = a.enraged >= 2 ? 2 : 1;
    if (level !== this.flameLevel) {
      this.flameLevel = level;
      this.zombieFx.frequency = level === 2 ? 9 : 28;
      this.zombieFx.setScale(level === 2 ? 1.5 : 1);
    }
    this.zombieFx.setPosition(this.rx, this.ry - a.radius * 0.4);
  }

  destroy(): void {
    this.body.destroy();
    this.zombieFx?.destroy();
  }
}

export class RecruitView {
  seen = true;
  /** Position au sol affichée (interpolée) et clignotement de fin de vie : `WorldView` y dessine le cercle qui pulse (comme sous les power-ups). */
  rx = 0;
  ry = 0;
  dim = false;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly stars?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    scene: Phaser.Scene,
    readonly state: RecruitState,
    /** Couleur de la classe (la zone au sol est jaune pour toutes les recrues : `RECRUIT_COLOR`). */
    readonly color: number,
    /** Emplacement du joueur local : la tête de la recrue a la couleur de ses soldats. */
    slot = 0,
  ) {
    this.rx = state.x;
    this.ry = state.y;
    const id = recruitSpriteId(state.cls, slot);
    this.img = sprites.add(scene, id, state.x, state.y);
    sprites.play(this.img, id, 'idle');
    // Étoiles qui scintillent autour d'une recrue composée : apparaissent, grossissent puis s'éteignent en tournant (FX.recruit).
    if (hasComposedRecruit(scene, state.cls) && scene.textures.exists(RECRUIT_STAR)) {
      const f = FX.recruit;
      const r = f.starRadius;
      this.stars = scene.add
        .particles(state.x, state.y, RECRUIT_STAR, {
          x: { min: -r, max: r },
          y: { min: -r * 1.2, max: r * 0.6 },
          speedY: { min: -f.starRise * 1.5, max: -f.starRise * 0.5 },
          scale: { values: [0, f.starScale, f.starScale * 0.6, 0], interpolation: 'catmull' }, // pop puis extinction
          alpha: { values: [0.4, 1, 1, 0], interpolation: 'linear' },
          rotate: { start: 0, end: 90 },
          lifespan: { min: f.starLifeMin, max: Math.max(f.starLifeMin, f.starLifeMax) },
          frequency: f.starEvery,
          blendMode: 'ADD',
        })
        .setDepth(DEPTH.actors + state.y + 1);
    }
  }

  sync(alpha: number, time: number): void {
    const r = this.state;
    const x = lerp(r.px, r.x, alpha);
    const y = lerp(r.py, r.y, alpha);
    // saut en cloche à l'apparition : l'arc se déduit de l'âge (la simulation ne décompte que `life`), le cercle au sol reste au sol
    // l'âge est interpolé comme la position (`life` ne change qu'à chaque tick de 30 Hz : sans ça l'arc avançait par à-coups)
    // recrue du tutoriel : `life` est quasi infinie (elle ne disparaît pas), l'âge est compté par la simulation (`age`) ; même lissage entre deux ticks
    const age = (r.age ?? RECRUIT.life - r.life) - (1 - alpha) / TICK_RATE;
    const k = age / RECRUIT.hopTime;
    const hop = k >= 0 && k < 1 ? 4 * RECRUIT.hopHeight * k * (1 - k) : 0;
    // après l'atterrissage, le léger balancement n'apparaît qu'en douceur (pas de saut de 4 px à la fin de l'arc)
    const idle = Math.min(1, Math.max(0, (age - RECRUIT.hopTime) / 0.3));
    const bob = k < 1 ? -hop : Math.sin(time * 5 + r.id) * 4 * idle;
    const blink = r.life < 4 && Math.sin(time * 20) > 0;
    this.img.setPosition(x, y + bob).setDepth(DEPTH.actors + y).setAlpha(blink ? 0.3 : 1);
    this.rx = x;
    this.ry = y;
    this.dim = blink;
    // centre du globe : l'image est ancrée vers son bas (originY 0.82)
    // centre du globe : l'image est ancrée sous lui (ses pieds)
    this.stars?.setPosition(x, y + bob - this.img.displayHeight * (this.img.originY - 0.5) + FX.recruit.starY).setDepth(DEPTH.actors + y + 1);
  }

  destroy(): void {
    this.img.destroy();
    this.stars?.destroy();
  }
}
