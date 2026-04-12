import GameSettings from "../config/GameSettings";

const SPRITE_SCALE = 0.22;

export class Villager {
  sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private alive: boolean = true;
  private frozen: boolean = false;
  private shadow: Phaser.GameObjects.Ellipse;
  private homePosition: { x: number; y: number };
  private wanderTarget: { x: number; y: number };
  private wanderTimer: number = 0;
  private isSafeZone: (x: number, y: number) => boolean;
  private hasGround: (x: number, y: number) => boolean;
  private facing: string = "down";
  private isFleeing: boolean = false;
  private scaredIcon: Phaser.GameObjects.Text | null = null;
  private scaredTween: Phaser.Tweens.Tween | null = null;

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

    Villager.createAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, "villager-walk-down", 0);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setSize(120, 60);
    this.sprite.setOffset(68, 185);

    this.shadow = scene.add.ellipse(x, y + 16, 22, 10, 0x000000, 0.25);
    this.shadow.setDepth(0);

    // Start with a random wander timer
    this.wanderTimer = Math.random() * 3;
    this.pickNewWanderTarget();

    this.sprite.play("villager-walk-down");
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists("villager-walk-down")) return;

    const defs = [
      {
        key: "villager-walk-right",
        tex: "villager-walk-right",
        end: 8,
        rate: 10,
      },
      {
        key: "villager-walk-down",
        tex: "villager-walk-down",
        end: 9,
        rate: 10,
      },
      { key: "villager-walk-up", tex: "villager-walk-up", end: 11, rate: 10 },
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
    if (!this.alive || this.frozen) {
      this.sprite.setVelocity(0, 0);
      this.hideScared();
      return;
    }

    // Shadow and depth
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 16);
    this.shadow.setDepth(this.sprite.y - 1);
    this.sprite.setDepth(this.sprite.y);

    // Check if player is near → flee
    const distToPlayer = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      playerPos.x,
      playerPos.y,
    );

    // Avoid safe zones — if inside one, move away
    if (this.isSafeZone(this.sprite.x, this.sprite.y)) {
      const awayX = this.sprite.x - this.homePosition.x;
      const awayY = this.sprite.y - this.homePosition.y;
      const aDist = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      const speed = GameSettings.villagers.fleeSpeed;
      const vx = (awayX / aDist) * speed;
      const vy = (awayY / aDist) * speed;
      if (this.canMoveTo(this.sprite.x + vx * dt, this.sprite.y + vy * dt)) {
        this.sprite.setVelocity(vx, vy);
      } else {
        this.sprite.setVelocity(0, 0);
      }
      this.updateFacing(awayX, awayY);
      this.hideScared();
      return;
    }

    if (distToPlayer < GameSettings.villagers.fleeDetectRange) {
      this.flee(playerPos, dt);
      this.showScared();
      return;
    }

    // Not fleeing anymore
    this.hideScared();

    // Wander
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.pickNewWanderTarget();
      this.wanderTimer = 2 + Math.random() * 4;
    }

    // Move toward wander target
    const dx = this.wanderTarget.x - this.sprite.x;
    const dy = this.wanderTarget.y - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8) {
      const speed = GameSettings.villagers.speed;
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      // Predictive ground check
      const nextX = this.sprite.x + vx * dt;
      const nextY = this.sprite.y + vy * dt;
      if (this.canMoveTo(nextX, nextY)) {
        this.sprite.setVelocity(vx, vy);
        this.updateFacing(dx, dy);
      } else {
        // Can't go there — pick a new target
        this.sprite.setVelocity(0, 0);
        this.pickNewWanderTarget();
      }
    } else {
      this.sprite.setVelocity(0, 0);
    }
  }

  /** Check if a world position has ground and is not in safe zone. */
  private canMoveTo(x: number, y: number): boolean {
    return this.hasGround(x, y) && !this.isSafeZone(x, y);
  }

  private updateFacing(dx: number, dy: number): void {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    let newFacing = this.facing;

    if (absDx > absDy) {
      newFacing = "right";
      this.sprite.setFlipX(dx < 0);
    } else if (dy < 0) {
      newFacing = "up";
      this.sprite.setFlipX(false);
    } else {
      newFacing = "down";
      this.sprite.setFlipX(false);
    }

    if (newFacing !== this.facing) {
      this.facing = newFacing;
      const animKey = `villager-walk-${this.facing}`;
      if (this.sprite.anims.currentAnim?.key !== animKey) {
        this.sprite.play(animKey, true);
      }
    }
  }

  private flee(playerPos: { x: number; y: number }, dt: number): void {
    const dx = this.sprite.x - playerPos.x;
    const dy = this.sprite.y - playerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const speed = GameSettings.villagers.fleeSpeed;
    let vx = (dx / dist) * speed;
    let vy = (dy / dist) * speed;

    // Predictive ground check — try alternate directions if blocked
    const nextX = this.sprite.x + vx * dt;
    const nextY = this.sprite.y + vy * dt;
    if (!this.canMoveTo(nextX, nextY)) {
      // Try perpendicular directions
      const canX = this.canMoveTo(this.sprite.x + vx * dt, this.sprite.y);
      const canY = this.canMoveTo(this.sprite.x, this.sprite.y + vy * dt);
      vx = canX ? vx : 0;
      vy = canY ? vy : 0;
    }

    this.sprite.setVelocity(vx, vy);
    this.updateFacing(dx, dy);

    // Speed up animation when fleeing
    if (this.sprite.anims.currentAnim) {
      this.sprite.anims.timeScale = 1.6;
    }
  }

  private showScared(): void {
    if (this.isFleeing) {
      // Update position of existing icon
      if (this.scaredIcon) {
        this.scaredIcon.setPosition(this.sprite.x, this.sprite.y - 30);
        this.scaredIcon.setDepth(this.sprite.y + 1);
      }
      return;
    }
    this.isFleeing = true;

    // "!" floating icon above head
    this.scaredIcon = this.scene.add
      .text(this.sprite.x, this.sprite.y - 30, "!", {
        fontFamily: "'Creepster', cursive",
        fontSize: "24px",
        color: "#ffcc00",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(this.sprite.y + 1);

    // Bobbing tween
    this.scaredTween = this.scene.tweens.add({
      targets: this.scaredIcon,
      y: "-=6",
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private hideScared(): void {
    if (!this.isFleeing) return;
    this.isFleeing = false;

    if (this.scaredTween) {
      this.scaredTween.destroy();
      this.scaredTween = null;
    }
    if (this.scaredIcon) {
      this.scaredIcon.destroy();
      this.scaredIcon = null;
    }

    // Reset animation speed
    if (this.sprite.anims.currentAnim) {
      this.sprite.anims.timeScale = 1;
    }
  }

  freeze(): void {
    this.frozen = true;
    this.sprite.setVelocity(0, 0);
    // Visual: tint when being bitten
    this.sprite.setTint(0xff6666);
  }

  isAlive(): boolean {
    return this.alive;
  }

  die(): void {
    this.alive = false;
    this.sprite.setVelocity(0, 0);
    this.sprite.clearTint();
    this.hideScared();

    // Fade out animation
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        this.sprite.setVisible(false);
        this.sprite.setActive(false);
        if (this.sprite.body) {
          (this.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
        }
        this.shadow.setVisible(false);
      },
    });

    // Respawn after timer
    this.scene.time.delayedCall(GameSettings.villagers.respawnTime, () => {
      this.respawn();
    });
  }

  private respawn(): void {
    let newX = this.homePosition.x;
    let newY = this.homePosition.y;
    for (let attempt = 0; attempt < 15; attempt++) {
      const offX = (Math.random() - 0.5) * 200;
      const offY = (Math.random() - 0.5) * 200;
      newX = Phaser.Math.Clamp(
        this.homePosition.x + offX,
        50,
        GameSettings.world.width - 50,
      );
      newY = Phaser.Math.Clamp(
        this.homePosition.y + offY,
        50,
        GameSettings.world.height - 50,
      );
      if (!this.isSafeZone(newX, newY) && this.hasGround(newX, newY)) break;
    }

    this.sprite.setPosition(newX, newY);
    this.alive = true;
    this.frozen = false;
    this.sprite.setAlpha(1);
    this.sprite.setVisible(true);
    this.sprite.setActive(true);
    this.sprite.clearTint();
    if (this.sprite.body) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
    }
    this.shadow.setAlpha(1);
    this.shadow.setVisible(true);
    this.wanderTimer = 0;
  }

  private pickNewWanderTarget(): void {
    const radius = GameSettings.villagers.wanderRadius;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = Phaser.Math.Clamp(
        this.homePosition.x + (Math.random() - 0.5) * radius * 2,
        50,
        GameSettings.world.width - 50,
      );
      const ty = Phaser.Math.Clamp(
        this.homePosition.y + (Math.random() - 0.5) * radius * 2,
        50,
        GameSettings.world.height - 50,
      );
      if (!this.isSafeZone(tx, ty) && this.hasGround(tx, ty)) {
        this.wanderTarget = { x: tx, y: ty };
        return;
      }
    }
    // Fallback: stay put
    this.wanderTarget = { x: this.sprite.x, y: this.sprite.y };
  }

  destroy(): void {
    this.hideScared();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
