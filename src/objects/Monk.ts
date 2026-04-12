import GameSettings from "../config/GameSettings";

const SPRITE_SCALE = 0.22;

export class Monk {
  sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private shadow: Phaser.GameObjects.Ellipse;
  private auraGfx: Phaser.GameObjects.Graphics;
  private homePosition: { x: number; y: number };
  private wanderTarget: { x: number; y: number };
  private wanderTimer: number = 0;
  private facing: string = "down";
  private isChasing: boolean = false;
  private isSafeZone: (x: number, y: number) => boolean;
  private hasGround: (x: number, y: number) => boolean;
  private auraPulse: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    isSafeZone?: (x: number, y: number) => boolean,
    hasGround?: (x: number, y: number) => boolean,
  ) {
    this.scene = scene;
    this.homePosition = { x, y };
    this.wanderTarget = { x, y };
    this.isSafeZone = isSafeZone ?? (() => false);
    this.hasGround = hasGround ?? (() => true);

    Monk.createAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, "monk-walk-down", 0);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setSize(120, 60);
    this.sprite.setOffset(68, 185);

    this.shadow = scene.add.ellipse(x, y + 12, 22, 10, 0x000000, 0.25);
    this.shadow.setDepth(0);

    // Light aura graphic (drawn each frame)
    this.auraGfx = scene.add.graphics();
    this.auraGfx.setDepth(0);

    this.wanderTimer = Math.random() * 3;
    this.pickNewWanderTarget();
    this.sprite.play("monk-walk-down");
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists("monk-walk-down")) return;

    const defs = [
      { key: "monk-walk-right", tex: "monk-walk-right", end: 12, rate: 10 },
      { key: "monk-walk-down", tex: "monk-walk-down", end: 8, rate: 10 },
      { key: "monk-walk-up", tex: "monk-walk-up", end: 10, rate: 10 },
    ];
    for (const d of defs) {
      scene.anims.create({
        key: d.key,
        frames: scene.anims.generateFrameNumbers(d.tex, {
          start: 0,
          end: d.end,
        }),
        frameRate: d.rate,
        repeat: -1,
      });
    }
  }

  update(dt: number, playerPos: { x: number; y: number }): void {
    // Shadow and depth
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 12);
    this.shadow.setDepth(this.sprite.y - 1);
    this.sprite.setDepth(this.sprite.y);

    // Aura pulse animation
    this.auraPulse += dt * 3;
    this.drawAura();

    // Avoid safe zones
    if (this.isSafeZone(this.sprite.x, this.sprite.y)) {
      const awayX = this.sprite.x - this.homePosition.x;
      const awayY = this.sprite.y - this.homePosition.y;
      const aDist = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      const speed = GameSettings.monks.chaseSpeed;
      this.sprite.setVelocity((awayX / aDist) * speed, (awayY / aDist) * speed);
      this.playWalkAnim(awayX, awayY);
      return;
    }

    const distToPlayer = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      playerPos.x,
      playerPos.y,
    );

    // Detect player → chase
    if (distToPlayer < GameSettings.monks.detectRange) {
      this.isChasing = true;
      const dx = playerPos.x - this.sprite.x;
      const dy = playerPos.y - this.sprite.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = GameSettings.monks.chaseSpeed;
      const vx = (dx / d) * speed;
      const vy = (dy / d) * speed;

      // Check if next position is valid
      const nextX = this.sprite.x + vx * dt;
      const nextY = this.sprite.y + vy * dt;
      if (this.hasGround(nextX, nextY) && !this.isSafeZone(nextX, nextY)) {
        this.sprite.setVelocity(vx, vy);
      } else {
        this.sprite.setVelocity(0, 0);
      }
      this.playWalkAnim(dx, dy);
      return;
    }

    this.isChasing = false;

    // Wander
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.pickNewWanderTarget();
      this.wanderTimer = 2 + Math.random() * 4;
    }

    const dx = this.wanderTarget.x - this.sprite.x;
    const dy = this.wanderTarget.y - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8) {
      const speed = GameSettings.monks.speed;
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      const nextX = this.sprite.x + vx * dt;
      const nextY = this.sprite.y + vy * dt;
      if (this.hasGround(nextX, nextY) && !this.isSafeZone(nextX, nextY)) {
        this.sprite.setVelocity(vx, vy);
        this.playWalkAnim(dx, dy);
      } else {
        this.sprite.setVelocity(0, 0);
        this.pickNewWanderTarget();
      }
    } else {
      this.sprite.setVelocity(0, 0);
    }
  }

  /** Returns distance to player for aura damage calculation. */
  getDistanceToPlayer(playerPos: { x: number; y: number }): number {
    return Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      playerPos.x,
      playerPos.y,
    );
  }

  private drawAura(): void {
    this.auraGfx.clear();
    this.auraGfx.setPosition(this.sprite.x, this.sprite.y);
    const r = GameSettings.monks.auraRadius;
    const pulse = Math.sin(this.auraPulse) * 0.12 + 0.88;
    const radius = r * pulse;

    // Outer soft glow
    this.auraGfx.fillStyle(0xffffaa, 0.08);
    this.auraGfx.fillCircle(0, 0, radius * 1.3);

    // Middle glow
    this.auraGfx.fillStyle(0xffdd66, 0.12);
    this.auraGfx.fillCircle(0, 0, radius);

    // Inner bright core
    this.auraGfx.fillStyle(0xffeeaa, 0.18);
    this.auraGfx.fillCircle(0, 0, radius * 0.5);

    this.auraGfx.setDepth(this.sprite.y - 2);
  }

  private playWalkAnim(dx: number, dy: number): void {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > ay) {
      this.sprite.play("monk-walk-right", true);
      this.sprite.setFlipX(dx < 0);
      this.facing = dx > 0 ? "right" : "left";
    } else if (dy > 0) {
      this.sprite.play("monk-walk-down", true);
      this.sprite.setFlipX(false);
      this.facing = "down";
    } else {
      this.sprite.play("monk-walk-up", true);
      this.sprite.setFlipX(false);
      this.facing = "up";
    }
  }

  private pickNewWanderTarget(): void {
    const radius = GameSettings.monks.wanderRadius;
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const x = this.homePosition.x + Math.cos(angle) * dist;
      const y = this.homePosition.y + Math.sin(angle) * dist;
      if (this.hasGround(x, y) && !this.isSafeZone(x, y)) {
        this.wanderTarget = { x, y };
        return;
      }
    }
    this.wanderTarget = { x: this.homePosition.x, y: this.homePosition.y };
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.auraGfx.destroy();
  }
}
