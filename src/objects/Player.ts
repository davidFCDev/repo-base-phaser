import GameSettings from "../config/GameSettings";
import type { Villager } from "./Villager";

const SPRITE_SCALE = 0.22;

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private isAttacking: boolean = false;
  private attackTimer: number = 0;
  private currentTargets: Villager[] = [];
  private shadow: Phaser.GameObjects.Ellipse;
  private facing: string = "down";

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    Player.createAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, "dracula-idle-down");
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.setCollideWorldBounds(true);
    // Anchor feet to position: body at bottom portion of 256px frame
    this.sprite.setSize(120, 60);
    this.sprite.setOffset(68, 185);

    // Shadow under player (aligned to feet)
    this.shadow = scene.add.ellipse(x, y + 16, 28, 12, 0x000000, 0.3);
    this.shadow.setDepth(0);

    this.sprite.play("dracula-idle-down");
  }

  static createAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists("dracula-idle-down")) return;

    const defs = [
      { key: "dracula-idle-right", tex: "dracula-idle-right", end: 7, rate: 8 },
      { key: "dracula-idle-down", tex: "dracula-idle-down", end: 7, rate: 8 },
      { key: "dracula-idle-up", tex: "dracula-idle-up", end: 6, rate: 8 },
      {
        key: "dracula-walk-right",
        tex: "dracula-walk-right",
        end: 9,
        rate: 10,
      },
      { key: "dracula-walk-down", tex: "dracula-walk-down", end: 7, rate: 10 },
      { key: "dracula-walk-up", tex: "dracula-walk-up", end: 9, rate: 10 },
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

  private isChainAttacking: boolean = false;

  update(
    dt: number,
    direction: { x: number; y: number },
    villagers: Villager[],
  ): { hunted: boolean; killCount: number } {
    let hunted = false;

    // Update shadow position (feet level)
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 16);
    this.shadow.setDepth(this.sprite.y - 1);

    // Y-sort depth
    this.sprite.setDepth(this.sprite.y);

    // During chain attack, everything is handled by the tween sequence
    if (this.isChainAttacking) {
      this.sprite.setVelocity(0, 0);
      return { hunted: false, killCount: 0 };
    }

    if (this.isAttacking) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        let killCount = 0;
        for (const t of this.currentTargets) {
          if (t.isAlive()) {
            t.die();
            killCount++;
          }
        }
        if (killCount > 0) {
          hunted = true;
          this.lastKillCount = killCount;
          this.showBiteEffect();
        }
        this.currentTargets = [];
        this.sprite.clearTint();
      }
      this.sprite.setVelocity(0, 0);
      return { hunted, killCount: this.lastKillCount };
    }

    // Movement
    const speed = GameSettings.player.speed;
    this.sprite.setVelocity(direction.x * speed, direction.y * speed);

    // Animation based on direction
    const isMoving = direction.x !== 0 || direction.y !== 0;
    if (isMoving) {
      const ax = Math.abs(direction.x);
      const ay = Math.abs(direction.y);
      if (ax > ay) {
        this.sprite.play("dracula-walk-right", true);
        this.sprite.setFlipX(direction.x < 0);
        this.facing = direction.x > 0 ? "right" : "left";
      } else if (direction.y > 0) {
        this.sprite.play("dracula-walk-down", true);
        this.sprite.setFlipX(false);
        this.facing = "down";
      } else {
        this.sprite.play("dracula-walk-up", true);
        this.sprite.setFlipX(false);
        this.facing = "up";
      }
    } else {
      const idleKey =
        this.facing === "left" || this.facing === "right"
          ? "dracula-idle-right"
          : `dracula-idle-${this.facing}`;
      this.sprite.play(idleKey, true);
      this.sprite.setFlipX(this.facing === "left");
    }

    // Auto-attack nearest villager in range
    const range = GameSettings.player.attackRange;
    const chainRange = GameSettings.blood.multiHuntRange;
    let nearestDist = Infinity;
    let nearest: Villager | null = null;

    for (const v of villagers) {
      if (!v.isAlive()) continue;
      const dist = Phaser.Math.Distance.Between(
        this.sprite.x,
        this.sprite.y,
        v.sprite.x,
        v.sprite.y,
      );
      if (dist < range && dist < nearestDist) {
        nearestDist = dist;
        nearest = v;
      }
    }

    if (nearest) {
      // Find other villagers within chain range of the player
      const targets: Villager[] = [nearest];
      for (const v of villagers) {
        if (v === nearest || !v.isAlive()) continue;
        const distToPlayer = Phaser.Math.Distance.Between(
          this.sprite.x,
          this.sprite.y,
          v.sprite.x,
          v.sprite.y,
        );
        if (distToPlayer < chainRange) {
          targets.push(v);
          if (targets.length >= 3) break;
        }
      }

      if (targets.length >= 2) {
        this.startChainAttack(targets);
      } else {
        this.startAttack(targets);
      }
    }

    return { hunted, killCount: 0 };
  }

  private lastKillCount: number = 0;

  private startAttack(targets: Villager[]): void {
    this.isAttacking = true;
    this.attackTimer = GameSettings.player.attackDuration / 1000;
    this.currentTargets = targets;
    this.sprite.setVelocity(0, 0);

    for (const t of targets) {
      t.freeze();
    }

    this.sprite.setTint(0xff4444);

    // Lunge toward first target
    this.scene.tweens.add({
      targets: this.sprite,
      x: targets[0].sprite.x,
      y: targets[0].sprite.y,
      duration: 150,
      ease: "Power2",
    });
  }

  /** Chain teleport attack — freeze screen, dash between 2-3 villagers in sequence. */
  private startChainAttack(targets: Villager[]): void {
    this.isChainAttacking = true;
    this.sprite.setVelocity(0, 0);

    // Freeze all targets
    for (const t of targets) {
      t.freeze();
    }

    // Pause physics for the freeze effect
    this.scene.physics.pause();

    // Dark vignette flash overlay
    const cam = this.scene.cameras.main;
    cam.flash(80, 20, 0, 0, true); // brief red flash

    this.sprite.setTint(0xff0000);

    // Build chain sequence: teleport to each target, pause, kill, next
    let chainIndex = 0;
    const DASH_DURATION = 100; // ms per dash
    const FREEZE_DURATION = 150; // ms freeze between kills

    const dashToNext = () => {
      if (chainIndex >= targets.length) {
        // Chain complete — resume
        this.finishChainAttack(targets);
        return;
      }

      const target = targets[chainIndex];
      const tx = target.sprite.x;
      const ty = target.sprite.y;

      // Leave ghost trail + slash marks toward target
      this.spawnDashTrail();
      this.spawnSlashTrail(this.sprite.x, this.sprite.y, tx, ty);

      // Dash tween to target
      this.scene.tweens.add({
        targets: this.sprite,
        x: tx,
        y: ty,
        duration: DASH_DURATION,
        ease: "Power3",
        onComplete: () => {
          // Kill this target
          if (target.isAlive()) {
            target.die();
          }
          // Blood particles at kill point
          this.spawnChainKillFX(tx, ty);

          // Camera micro-shake on each kill
          cam.shake(60, 0.008);

          chainIndex++;

          // Brief freeze before next dash
          this.scene.time.delayedCall(FREEZE_DURATION, () => {
            dashToNext();
          });
        },
      });
    };

    // Start the chain after a tiny initial freeze
    this.scene.time.delayedCall(120, () => {
      dashToNext();
    });
  }

  private finishChainAttack(targets: Villager[]): void {
    const killCount = targets.length;
    this.lastKillCount = killCount;

    // Resume physics
    this.scene.physics.resume();
    this.isChainAttacking = false;
    this.sprite.clearTint();

    // Show multi-kill effect
    this.showMultiKillEffect(killCount);

    // Notify GameScene of the kills via a flag
    this._chainKillPending = killCount;
  }

  /** Pending chain kills to be picked up by GameScene update. */
  _chainKillPending: number = 0;

  private spawnDashTrail(): void {
    // Semi-transparent ghost of Dracula at current pos
    const ghost = this.scene.add.sprite(
      this.sprite.x,
      this.sprite.y,
      this.sprite.texture.key,
      this.sprite.frame.name,
    );
    ghost.setScale(this.sprite.scaleX, this.sprite.scaleY);
    ghost.setFlipX(this.sprite.flipX);
    ghost.setAlpha(0.7);
    ghost.setTint(0x8800ff);
    ghost.setDepth(this.sprite.y - 1);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: ghost.scaleX * 0.6,
      scaleY: ghost.scaleY * 0.6,
      duration: 600,
      ease: "Power2",
      onComplete: () => ghost.destroy(),
    });
  }

  /** Spawn directional slash marks between two points. */
  private spawnSlashTrail(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const angle = Math.atan2(dy, dx);
    const perpAngle = angle + Math.PI / 2;
    const STEPS = Math.max(3, Math.floor(dist / 20));

    for (let i = 0; i < STEPS; i++) {
      const t = (i + 0.5) / STEPS;
      const cx = fromX + dx * t;
      const cy = fromY + dy * t;

      // Slash line (rotated thin rectangle simulated with 2 circles + line graphic)
      const perpOff = (Math.random() - 0.5) * 12;
      const sx = cx + Math.cos(perpAngle) * perpOff;
      const sy = cy + Math.sin(perpAngle) * perpOff;

      // Small slash mark
      const slashLen = 8 + Math.random() * 10;
      const gfx = this.scene.add.graphics();
      gfx.lineStyle(2, 0xcc44ff, 0.8);
      gfx.beginPath();
      gfx.moveTo(
        sx - Math.cos(perpAngle) * slashLen,
        sy - Math.sin(perpAngle) * slashLen,
      );
      gfx.lineTo(
        sx + Math.cos(perpAngle) * slashLen,
        sy + Math.sin(perpAngle) * slashLen,
      );
      gfx.strokePath();
      gfx.setDepth(this.sprite.y + 2);

      this.scene.tweens.add({
        targets: gfx,
        alpha: 0,
        duration: 500 + Math.random() * 300,
        delay: i * 30,
        ease: "Power2",
        onComplete: () => gfx.destroy(),
      });
    }

    // Main dash line — bright trail from source to destination
    const lineGfx = this.scene.add.graphics();
    lineGfx.lineStyle(3, 0xaa22ff, 0.6);
    lineGfx.beginPath();
    lineGfx.moveTo(fromX, fromY);
    lineGfx.lineTo(toX, toY);
    lineGfx.strokePath();
    lineGfx.setDepth(this.sprite.y + 1);

    this.scene.tweens.add({
      targets: lineGfx,
      alpha: 0,
      duration: 700,
      ease: "Power2",
      onComplete: () => lineGfx.destroy(),
    });
  }

  private spawnChainKillFX(x: number, y: number): void {
    // Blood burst at kill point
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = Phaser.Math.Between(10, 30);
      const p = this.scene.add.circle(
        x,
        y,
        Phaser.Math.Between(2, 5),
        i % 2 === 0 ? 0xff0000 : 0x8800ff,
        0.9,
      );
      p.setDepth(this.sprite.y + 1);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 400,
        ease: "Power2",
        onComplete: () => p.destroy(),
      });
    }
  }

  private showBiteEffect(): void {
    // Red particles burst
    const x = this.sprite.x;
    const y = this.sprite.y - 10;

    for (let i = 0; i < 6; i++) {
      const particle = this.scene.add.circle(
        x,
        y,
        Phaser.Math.Between(2, 4),
        0xff0000,
        0.8,
      );
      particle.setDepth(this.sprite.y + 1);

      this.scene.tweens.add({
        targets: particle,
        x: x + Phaser.Math.Between(-30, 30),
        y: y + Phaser.Math.Between(-30, 10),
        alpha: 0,
        scale: 0.3,
        duration: 400,
        ease: "Power2",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private showMultiKillEffect(count: number): void {
    const x = this.sprite.x;
    const y = this.sprite.y - 10;

    // More intense blood burst in a ring
    for (let i = 0; i < count * 6; i++) {
      const angle = (i / (count * 6)) * Math.PI * 2;
      const dist = Phaser.Math.Between(15, 40);
      const particle = this.scene.add.circle(
        x,
        y,
        Phaser.Math.Between(2, 5),
        i % 3 === 0 ? 0xff4400 : 0xff0000,
        0.9,
      );
      particle.setDepth(this.sprite.y + 1);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 500,
        ease: "Power2",
        onComplete: () => particle.destroy(),
      });
    }

    // Camera shake for impact
    this.scene.cameras.main.shake(200, 0.012);
  }

  isInCastle(): boolean {
    const c = GameSettings.castle;
    const dist = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      c.x,
      c.y,
    );
    return dist < c.safeRadius;
  }

  isInShadow(): boolean {
    // Check buildings
    for (const b of GameSettings.buildings) {
      const dist = Phaser.Math.Distance.Between(
        this.sprite.x,
        this.sprite.y,
        b.x,
        b.y,
      );
      if (dist < GameSettings.shadow.buildingRadius) return true;
    }
    // Check church
    const ch = GameSettings.church;
    const chDist = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      ch.x,
      ch.y,
    );
    if (chDist < GameSettings.shadow.buildingRadius + 20) return true;

    // Check trees
    for (const t of GameSettings.trees) {
      const dist = Phaser.Math.Distance.Between(
        this.sprite.x,
        this.sprite.y,
        t.x,
        t.y,
      );
      if (dist < GameSettings.shadow.treeRadius) return true;
    }
    return false;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Position at feet level (where body is) for tile checks. */
  getFeetPosition(): { x: number; y: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return { x: body.center.x, y: body.center.y };
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
