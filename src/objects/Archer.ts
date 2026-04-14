import GameSettings from "../config/GameSettings";
import { Arrow } from "./Arrow";

const SPRITE_SCALE = 0.22;

export class Archer {
  sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private alive: boolean = true;
  private shadow: Phaser.GameObjects.Ellipse;
  private homePosition: { x: number; y: number };
  private wanderTarget: { x: number; y: number };
  private wanderTimer: number = 0;
  private shotCooldown: number = 0;
  private isShooting: boolean = false;
  private shootTimer: number = 0;
  private facing: string = "down";
  private arrows: Arrow[] = [];
  private isSafeZone: (x: number, y: number) => boolean;
  private hasGround: (x: number, y: number) => boolean;

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

    Archer.createAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, "archer-walk-down", 0);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setSize(120, 60);
    this.sprite.setOffset(68, 185);

    this.shadow = scene.add.ellipse(x, y + 12, 22, 10, 0x000000, 0.25);
    this.shadow.setDepth(0);

    this.wanderTimer = Math.random() * 3;
    this.pickNewWanderTarget();

    this.sprite.play("archer-walk-down");
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists("archer-walk-down")) return;

    const defs = [
      { key: "archer-walk-right", tex: "archer-walk-right", end: 9, rate: 10 },
      { key: "archer-walk-down", tex: "archer-walk-down", end: 8, rate: 10 },
      { key: "archer-walk-up", tex: "archer-walk-up", end: 9, rate: 10 },
      { key: "archer-shot-up", tex: "archer-shot-up", end: 11, rate: 14 },
      { key: "archer-shot-down", tex: "archer-shot-down", end: 9, rate: 14 },
    ];
    for (const d of defs) {
      scene.anims.create({
        key: d.key,
        frames: scene.anims.generateFrameNumbers(d.tex, {
          start: 0,
          end: d.end,
        }),
        frameRate: d.rate,
        repeat: d.key.includes("shot") ? 0 : -1,
      });
    }
  }

  update(
    dt: number,
    playerPos: { x: number; y: number },
    playerInSafe: boolean = false,
  ): void {
    if (!this.alive) return;

    // Update arrows
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.update(dt);
      if (!a.isAlive()) {
        this.arrows.splice(i, 1);
      }
    }

    // Shadow and depth
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 12);
    this.shadow.setDepth(this.sprite.y - 1);
    this.sprite.setDepth(this.sprite.y);

    // If currently shooting, wait for anim to finish
    if (this.isShooting) {
      this.shootTimer -= dt;
      this.sprite.setVelocity(0, 0);
      if (this.shootTimer <= 0) {
        this.isShooting = false;
      }
      return;
    }

    // Cooldown
    if (this.shotCooldown > 0) {
      this.shotCooldown -= dt;
    }

    // Avoid safe zones
    if (this.isSafeZone(this.sprite.x, this.sprite.y)) {
      const awayX = this.sprite.x - this.homePosition.x;
      const awayY = this.sprite.y - this.homePosition.y;
      const aDist = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      const speed = GameSettings.archers.speed * 1.5;
      const vx = (awayX / aDist) * speed;
      const vy = (awayY / aDist) * speed;
      if (this.canMoveTo(this.sprite.x + vx * dt, this.sprite.y + vy * dt)) {
        this.sprite.setVelocity(vx, vy);
      } else {
        this.sprite.setVelocity(0, 0);
      }
      this.playWalkAnim(awayX, awayY);
      return;
    }

    // If player is in safe zone, don’t engage — just wander
    if (playerInSafe) {
      this.doWander(dt);
      return;
    }

    const distToPlayer = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      playerPos.x,
      playerPos.y,
    );

    // In attack range → shoot
    if (
      distToPlayer < GameSettings.archers.attackRange &&
      this.shotCooldown <= 0
    ) {
      this.shoot(playerPos);
      return;
    }

    // In detect range → approach player (keep distance)
    if (distToPlayer < GameSettings.archers.detectRange) {
      const idealDist = GameSettings.archers.attackRange * 0.8;
      if (distToPlayer < idealDist - 20) {
        // Too close, back away
        const dx = this.sprite.x - playerPos.x;
        const dy = this.sprite.y - playerPos.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = GameSettings.archers.speed;
        const vx = (dx / d) * speed;
        const vy = (dy / d) * speed;
        if (this.canMoveTo(this.sprite.x + vx * dt, this.sprite.y + vy * dt)) {
          this.sprite.setVelocity(vx, vy);
        } else {
          this.sprite.setVelocity(0, 0);
        }
        this.playWalkAnim(dx, dy);
      } else if (distToPlayer > idealDist + 20) {
        // Too far, approach
        const dx = playerPos.x - this.sprite.x;
        const dy = playerPos.y - this.sprite.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = GameSettings.archers.speed;
        const vx = (dx / d) * speed;
        const vy = (dy / d) * speed;
        if (this.canMoveTo(this.sprite.x + vx * dt, this.sprite.y + vy * dt)) {
          this.sprite.setVelocity(vx, vy);
        } else {
          this.sprite.setVelocity(0, 0);
        }
        this.playWalkAnim(dx, dy);
      } else {
        // Good range, stop and face player
        this.sprite.setVelocity(0, 0);
        this.faceDirection(
          playerPos.x - this.sprite.x,
          playerPos.y - this.sprite.y,
        );
      }
      return;
    }

    // Wander
    this.doWander(dt);
  }

  /** Check ground with margin so NPCs stay away from water edges. */
  private canMoveTo(x: number, y: number): boolean {
    const m = 28;
    return (
      this.hasGround(x, y) &&
      this.hasGround(x - m, y) &&
      this.hasGround(x + m, y) &&
      this.hasGround(x, y - m) &&
      this.hasGround(x, y + m) &&
      !this.isSafeZone(x, y)
    );
  }

  private doWander(dt: number): void {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.pickNewWanderTarget();
      this.wanderTimer = 2 + Math.random() * 4;
    }

    const dx = this.wanderTarget.x - this.sprite.x;
    const dy = this.wanderTarget.y - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8) {
      const speed = GameSettings.archers.speed;
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      const nextX = this.sprite.x + vx * dt;
      const nextY = this.sprite.y + vy * dt;
      if (this.canMoveTo(nextX, nextY)) {
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

  private shoot(playerPos: { x: number; y: number }): void {
    this.isShooting = true;
    this.shootTimer = 0.7; // Duration of shot animation
    this.shotCooldown = GameSettings.archers.shotCooldown / 1000;
    this.sprite.setVelocity(0, 0);

    // Face player
    const dx = playerPos.x - this.sprite.x;
    const dy = playerPos.y - this.sprite.y;
    this.faceDirection(dx, dy);

    // Play shot animation
    if (dy < -Math.abs(dx) * 0.5) {
      this.sprite.play("archer-shot-up", true);
    } else {
      this.sprite.play("archer-shot-down", true);
      this.sprite.setFlipX(dx < 0);
    }

    // Spawn arrow after a short delay (mid-animation)
    this.scene.time.delayedCall(350, () => {
      if (!this.alive) return;
      const arrow = new Arrow(
        this.scene,
        this.sprite.x,
        this.sprite.y - 10,
        playerPos.x,
        playerPos.y,
      );
      this.arrows.push(arrow);
    });
  }

  private playWalkAnim(dx: number, dy: number): void {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > ay) {
      this.sprite.play("archer-walk-right", true);
      this.sprite.setFlipX(dx < 0);
      this.facing = dx > 0 ? "right" : "left";
    } else if (dy > 0) {
      this.sprite.play("archer-walk-down", true);
      this.sprite.setFlipX(false);
      this.facing = "down";
    } else {
      this.sprite.play("archer-walk-up", true);
      this.sprite.setFlipX(false);
      this.facing = "up";
    }
  }

  private faceDirection(dx: number, dy: number): void {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? "right" : "left";
    } else {
      this.facing = dy > 0 ? "down" : "up";
    }
  }

  getArrows(): Arrow[] {
    return this.arrows;
  }

  isAlive(): boolean {
    return this.alive;
  }

  die(): void {
    this.alive = false;
    this.sprite.setVelocity(0, 0);

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

    this.scene.time.delayedCall(GameSettings.archers.respawnTime, () => {
      this.respawn();
    });
  }

  private respawn(): void {
    let newX = this.homePosition.x;
    let newY = this.homePosition.y;
    for (let attempt = 0; attempt < 15; attempt++) {
      const offX = (Math.random() - 0.5) * 300;
      const offY = (Math.random() - 0.5) * 300;
      newX = this.homePosition.x + offX;
      newY = this.homePosition.y + offY;
      if (!this.isSafeZone(newX, newY) && this.hasGround(newX, newY)) break;
    }

    this.sprite.setPosition(newX, newY);
    this.alive = true;
    this.isShooting = false;
    this.shootTimer = 0;
    this.shotCooldown = 1;
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
    const radius = GameSettings.archers.wanderRadius;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = this.homePosition.x + (Math.random() - 0.5) * radius * 2;
      const ty = this.homePosition.y + (Math.random() - 0.5) * radius * 2;
      if (this.canMoveTo(tx, ty)) {
        this.wanderTarget = { x: tx, y: ty };
        return;
      }
    }
    this.wanderTarget = { x: this.sprite.x, y: this.sprite.y };
  }

  destroy(): void {
    for (const a of this.arrows) {
      a.destroy();
    }
    this.arrows = [];
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
