export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private isActive: boolean = false;
  private direction: { x: number; y: number } = { x: 0, y: 0 };
  private basePosition: { x: number; y: number } = { x: 0, y: 0 };
  private maxRadius: number = 50;
  private pointerId: number = -1;

  // Keyboard support (desktop dev)
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Joystick visuals
    this.base = scene.add
      .circle(0, 0, 55, 0xffffff, 0.12)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(false);

    this.knob = scene.add
      .circle(0, 0, 22, 0xffffff, 0.35)
      .setScrollFactor(0)
      .setDepth(2001)
      .setVisible(false);

    // Touch input
    scene.input.on("pointerdown", this.onPointerDown, this);
    scene.input.on("pointermove", this.onPointerMove, this);
    scene.input.on("pointerup", this.onPointerUp, this);

    // Keyboard input (desktop)
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey("W"),
        A: scene.input.keyboard.addKey("A"),
        S: scene.input.keyboard.addKey("S"),
        D: scene.input.keyboard.addKey("D"),
      };
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Only use left ~60% of screen for joystick
    const cam = this.scene.cameras.main;
    if (pointer.x > cam.width * 0.6) return;
    if (this.isActive) return;

    this.isActive = true;
    this.pointerId = pointer.id;
    this.basePosition = { x: pointer.x, y: pointer.y };

    this.base.setPosition(pointer.x, pointer.y).setVisible(true);
    this.knob.setPosition(pointer.x, pointer.y).setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isActive || pointer.id !== this.pointerId) return;

    const dx = pointer.x - this.basePosition.x;
    const dy = pointer.y - this.basePosition.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const clampedDist = Math.min(dist, this.maxRadius);
      const nx = dx / dist;
      const ny = dy / dist;

      this.knob.setPosition(
        this.basePosition.x + nx * clampedDist,
        this.basePosition.y + ny * clampedDist,
      );

      const strength = Math.min(dist / this.maxRadius, 1);
      this.direction = { x: nx * strength, y: ny * strength };
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;

    this.isActive = false;
    this.pointerId = -1;
    this.direction = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }

  getDirection(): { x: number; y: number } {
    // Keyboard overrides touch if pressed
    if (this.cursors || this.wasd) {
      let kx = 0;
      let ky = 0;

      if (this.cursors?.left.isDown || this.wasd?.A.isDown) kx = -1;
      if (this.cursors?.right.isDown || this.wasd?.D.isDown) kx = 1;
      if (this.cursors?.up.isDown || this.wasd?.W.isDown) ky = -1;
      if (this.cursors?.down.isDown || this.wasd?.S.isDown) ky = 1;

      if (kx !== 0 || ky !== 0) {
        // Normalize diagonal
        const len = Math.sqrt(kx * kx + ky * ky);
        return { x: kx / len, y: ky / len };
      }
    }

    return this.direction;
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return [this.base, this.knob];
  }

  destroy(): void {
    this.scene.input.off("pointerdown", this.onPointerDown, this);
    this.scene.input.off("pointermove", this.onPointerMove, this);
    this.scene.input.off("pointerup", this.onPointerUp, this);
    this.base.destroy();
    this.knob.destroy();
  }
}
