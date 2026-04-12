import GameSettings from "../config/GameSettings";

export class Arrow {
  sprite: Phaser.Physics.Arcade.Sprite;
  private scene: Phaser.Scene;
  private alive: boolean = true;
  private lifeTimer: number = 3; // seconds before auto-destroy

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
  ) {
    this.scene = scene;

    Arrow.generateTexture(scene);

    this.sprite = scene.physics.add.sprite(x, y, "__arrow__");
    this.sprite.setDepth(y);

    // Calculate direction and set velocity
    const dx = targetX - x;
    const dy = targetY - y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = GameSettings.archers.arrowSpeed;
    this.sprite.setVelocity((dx / dist) * speed, (dy / dist) * speed);

    // Rotate arrow to face direction
    this.sprite.setRotation(Math.atan2(dy, dx));
  }

  static generateTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists("__arrow__")) return;

    const gfx = scene.add.graphics();
    // Arrow shaft
    gfx.fillStyle(0x8b6914);
    gfx.fillRect(2, 5, 18, 2);
    // Arrow head
    gfx.fillStyle(0xaaaaaa);
    gfx.fillTriangle(20, 2, 26, 6, 20, 10);
    // Fletching
    gfx.fillStyle(0xcc3333);
    gfx.fillTriangle(0, 3, 4, 6, 0, 9);
    gfx.generateTexture("__arrow__", 28, 12);
    gfx.destroy();
  }

  update(dt: number): void {
    if (!this.alive) return;

    this.lifeTimer -= dt;
    if (this.lifeTimer <= 0) {
      this.destroy();
      return;
    }

    this.sprite.setDepth(this.sprite.y);
  }

  isAlive(): boolean {
    return this.alive;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.destroy();
  }
}
