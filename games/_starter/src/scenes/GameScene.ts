import Phaser from 'phaser';
import { Button, device, MoveInput, RunFlow, storage, theme } from '@xiao/engine';
import { COLORS, SAFE_SIZE, SCENES } from '../config';
import { t } from '../i18n';

const PLAYER_SPEED = 360;

/**
 * Jeu d'exemple minimal : ramasser des pièces en évitant les ennemis.
 * Montre le branchement type d'un jeu sur l'engine : RunFlow (events Poki),
 * MoveInput (clavier + joystick), overlays Pause / GameOver, layout responsive.
 */
export class GameScene extends Phaser.Scene {
  readonly flow = new RunFlow('endless');
  private score = 0;
  private revived = false;
  private elapsed = 0;
  private invulnerableUntil = 0;

  private player!: Phaser.Physics.Arcade.Image;
  private coins!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private move!: MoveInput;
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private pauseButton!: Button;

  constructor() {
    super(SCENES.game);
  }

  init(): void {
    this.score = 0;
    this.revived = false;
    this.elapsed = 0;
    this.invulnerableUntil = 0;
  }

  create(): void {
    const { width, height } = this.scale;

    this.player = this.physics.add.image(width / 2, height / 2, 'player').setCollideWorldBounds(true);
    this.player.setCircle(26);
    this.coins = this.physics.add.group();
    this.enemies = this.physics.add.group({ bounceX: 1, bounceY: 1, collideWorldBounds: true });
    this.physics.add.overlap(this.player, this.coins, (_p, coin) => this.collectCoin(coin as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemies, () => this.onHit());

    this.scoreText = this.add
      .text(0, 24, '', { fontFamily: theme.font, fontSize: '34px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.hintText = this.add
      .text(0, 0, device.isTouch ? t('hintTouch') : t('hintKeyboard'), {
        fontFamily: theme.font,
        fontSize: '24px',
        color: COLORS.textDim,
        align: 'center',
        wordWrap: { width: SAFE_SIZE - 80 },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.pauseButton = new Button(this, 0, 0, {
      label: 'II',
      variant: 'secondary',
      width: 72,
      height: 72,
      onClick: () => this.pauseGame(),
    }).setDepth(10);

    this.move = new MoveInput(this);
    this.input.keyboard!.on('keydown-ESC', this.pauseGame);
    this.input.keyboard!.on('keydown-P', this.pauseGame);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pauseGame);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pauseGame);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout);
    });

    this.layout();
    this.updateScore();
    for (let i = 0; i < 5; i++) this.spawnCoin();
  }

  update(_time: number, delta: number): void {
    const dir = this.move.update();
    if (this.flow.state === 'ready' && this.move.active) this.startRun();
    if (!this.flow.isPlaying) return;

    this.player.setVelocity(dir.x * PLAYER_SPEED, dir.y * PLAYER_SPEED);
    this.elapsed += delta;
    this.player.setAlpha(this.time.now < this.invulnerableUntil ? 0.4 + 0.3 * Math.sin(this.time.now / 60) : 1);
  }

  /** Au premier input du joueur (ou direct après "Rejouer"). */
  private startRun(): void {
    this.flow.begin();
    this.hintText.setVisible(false);
    this.scheduleEnemy();
  }

  readonly pauseGame = (): void => {
    if (!this.scene.isActive() || !this.flow.interrupt()) return;
    this.scene.pause();
    this.scene.launch(SCENES.pause);
  };

  /** Appelé par PauseScene. */
  async resumeGame(): Promise<void> {
    await this.flow.resume({ ad: true });
    this.scene.resume();
  }

  private onHit(): void {
    if (!this.flow.isPlaying || this.time.now < this.invulnerableUntil) return;
    this.flow.fail();
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(200, 0.01);
    const best = Math.max(this.score, storage.get('best', 0));
    storage.set('best', best);
    this.scene.pause();
    this.scene.launch(SCENES.gameOver, { score: this.score, best, canRevive: !this.revived });
  }

  /** Appelé par GameOverScene. Retourne false si la pub n'a pas été vue. */
  async revive(): Promise<boolean> {
    if (!(await this.flow.revive())) return false;
    this.revived = true;
    this.invulnerableUntil = this.time.now + 2000;
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (Phaser.Math.Distance.BetweenPoints(e, this.player) < 260) e.destroy();
    }
    this.scene.resume();
    return true;
  }

  /** Appelé par GameOverScene. */
  async retry(): Promise<void> {
    await this.flow.restart();
    this.scene.restart();
    // "Rejouer" est un input du joueur : le gameplay démarre directement.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.startRun());
  }

  private scheduleEnemy(): void {
    this.spawnEnemy();
    this.time.delayedCall(Math.max(600, 1800 - this.elapsed / 25), () => this.scheduleEnemy());
  }

  private collectCoin(coin: Phaser.Physics.Arcade.Image): void {
    coin.destroy();
    this.score += 1;
    this.updateScore();
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.25, to: 1 }, duration: 150 });
    this.spawnCoin();
  }

  private spawnCoin(): void {
    const { width, height } = this.scale;
    this.coins.create(Phaser.Math.Between(60, width - 60), Phaser.Math.Between(120, height - 60), 'coin');
  }

  private spawnEnemy(): void {
    const { width, height } = this.scale;
    const side = Phaser.Math.Between(0, 3);
    const x = side === 0 ? 30 : side === 1 ? width - 30 : Phaser.Math.Between(30, width - 30);
    const y = side === 2 ? 30 : side === 3 ? height - 30 : Phaser.Math.Between(30, height - 30);
    const enemy = this.enemies.create(x, y, 'enemy') as Phaser.Physics.Arcade.Image;
    enemy.setCircle(20);
    const speed = 160 + Math.min(200, this.elapsed / 150);
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y) + Phaser.Math.FloatBetween(-0.4, 0.4);
    this.physics.velocityFromRotation(angle, speed, enemy.body!.velocity);
  }

  private updateScore(): void {
    this.scoreText.setText(t('score', { value: this.score }));
  }

  private readonly layout = (): void => {
    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setSize(width, height);
    this.scoreText.setX(width / 2);
    this.pauseButton.setPosition(width - 56, 56);
    this.hintText.setPosition(width / 2, height / 2 + 110);
    if (this.flow.state === 'ready') this.player.setPosition(width / 2, height / 2);
  };
}
