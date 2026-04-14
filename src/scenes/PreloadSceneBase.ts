const Phaser = (window as any).Phaser;

export abstract class PreloadSceneBase extends Phaser.Scene {
  protected assetsLoaded: boolean = false;
  protected nextSceneKey: string;

  // Loading bar elements
  private loadBarBg!: Phaser.GameObjects.Graphics;
  private loadBarFill!: Phaser.GameObjects.Graphics;
  private loadText!: Phaser.GameObjects.Text;
  private loadPercent!: Phaser.GameObjects.Text;

  constructor(key: string, nextSceneKey: string = "StartScene") {
    super({ key });
    this.nextSceneKey = nextSceneKey;
  }

  init(): void {
    this.cameras.main.setBackgroundColor("#0a0008");
  }

  preload(): void {
    // No boot sprite needed — we use a gothic loading bar instead
  }

  create(): void {
    const { width, height } = this.scale;

    // Title text
    const title = this.add
      .text(width / 2, height * 0.35, "BEFORE DAWN", {
        fontFamily: "'Creepster', cursive",
        fontSize: "60px",
        color: "#aa0015",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(width / 2, height * 0.35 + 68, "Survive. Hunt. Endure.", {
        fontFamily: "'Creepster', cursive",
        fontSize: "24px",
        color: "#666688",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Pulsing title
    this.tweens.add({
      targets: title,
      alpha: { from: 0.7, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Loading bar dimensions
    const barW = 320;
    const barH = 32;
    const barX = (width - barW) / 2;
    const barY = height * 0.55;

    // Bar background + frame
    this.loadBarBg = this.add.graphics();
    const bg = this.loadBarBg;
    // Outer glow
    bg.fillStyle(0x330011, 0.5);
    bg.fillRoundedRect(barX - 6, barY - 6, barW + 12, barH + 12, 8);
    // Dark inner
    bg.fillStyle(0x0a0008, 0.95);
    bg.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 6);
    bg.fillStyle(0x1a0010, 1);
    bg.fillRoundedRect(barX, barY, barW, barH, 4);
    // Gothic border
    bg.lineStyle(2, 0x660022, 1);
    bg.strokeRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 6);
    bg.lineStyle(1, 0x884433, 0.6);
    bg.strokeRoundedRect(barX - 4, barY - 4, barW + 8, barH + 8, 8);
    // Fangs
    bg.fillStyle(0x660022, 0.8);
    bg.fillTriangle(
      barX - 4,
      barY + barH / 2 - 6,
      barX + 6,
      barY + barH / 2,
      barX - 4,
      barY + barH / 2 + 6,
    );
    bg.fillTriangle(
      barX + barW + 4,
      barY + barH / 2 - 6,
      barX + barW - 6,
      barY + barH / 2,
      barX + barW + 4,
      barY + barH / 2 + 6,
    );

    // Fill graphics (redrawn on progress)
    this.loadBarFill = this.add.graphics();

    // "Loading..." text
    this.loadText = this.add
      .text(width / 2, barY + barH + 20, "Loading...", {
        fontFamily: "'Creepster', cursive",
        fontSize: "22px",
        color: "#aa4444",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    // Percent text
    this.loadPercent = this.add
      .text(width / 2, barY + barH / 2, "0%", {
        fontFamily: "'Creepster', cursive",
        fontSize: "18px",
        color: "#ddcccc",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Progress callback
    this.load.on("progress", (value: number) => {
      this.drawLoadFill(value, barX, barY, barW, barH);
      this.loadPercent.setText(`${Math.round(value * 100)}%`);
    });

    // Complete callback
    this.load.on("complete", () => {
      this.onAssetsLoaded();
      this.assetsLoaded = true;
      this.loadText.setText("Ready!");
      this.loadPercent.setText("100%");
      // Brief delay then transition
      this.time.delayedCall(400, () => {
        this.scene.start(this.nextSceneKey);
      });
    });

    // Load project assets
    this.loadProjectAssets();

    // Start loading
    this.load.start();
  }

  private drawLoadFill(
    percent: number,
    barX: number,
    barY: number,
    barW: number,
    barH: number,
  ): void {
    const g = this.loadBarFill;
    g.clear();

    const x = barX + 2;
    const y = barY + 2;
    const maxW = barW - 4;
    const h = barH - 4;
    const fillW = maxW * percent;
    if (fillW <= 0) return;

    // Blood-red gradient fill
    g.fillStyle(0xaa0015, 0.5);
    g.fillRoundedRect(x, y, fillW, h, 3);
    g.fillStyle(0xaa0015, 1);
    g.fillRoundedRect(x, y, fillW, h * 0.6, 3);

    // Drip at edge
    if (fillW > 8) {
      const edgeX = x + fillW;
      const dripH = Math.sin(Date.now() * 0.003) * 3 + 4;
      g.fillStyle(0xaa0015, 0.7);
      g.fillRect(edgeX - 3, y + h - 1, 3, dripH);
    }
  }

  protected abstract loadProjectAssets(): void;

  protected onAssetsLoaded(): void {}
}
