import GameSettings from "../config/GameSettings";

export type Phase = "night" | "dawn" | "day" | "dusk";

export class DayNightCycle {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private vignette: Phaser.GameObjects.Image;
  private elapsed: number = 0;
  private currentPhase: Phase = "night";
  private cycleCount: number = 0;
  private onPhaseChange?: (phase: Phase) => void;

  // Phase boundaries (cumulative ms)
  private nightEnd: number;
  private dawnEnd: number;
  private dayEnd: number;
  private cycleLength: number;

  constructor(scene: Phaser.Scene, onPhaseChange?: (phase: Phase) => void) {
    this.scene = scene;
    this.onPhaseChange = onPhaseChange;

    const cfg = GameSettings.dayNight;
    this.nightEnd = cfg.nightDuration;
    this.dawnEnd = this.nightEnd + cfg.dawnDuration;
    this.dayEnd = this.dawnEnd + cfg.dayDuration;
    this.cycleLength = this.dayEnd + cfg.duskDuration;

    // Full-screen overlay (fixed to camera) — must be large enough for zoom
    const cam = scene.cameras.main;
    this.overlay = scene.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width * 2,
      cam.height * 2,
      0x050520,
      0.7,
    );
    this.overlay.setScrollFactor(0);
    this.overlay.setDepth(900);

    // Vignette — radial gradient texture
    this.vignette = this.createVignette(cam.width, cam.height);
    this.vignette.setScrollFactor(0);
    this.vignette.setDepth(901);
  }

  /** Create a radial vignette canvas texture (transparent center → opaque edges). */
  private createVignette(w: number, h: number): Phaser.GameObjects.Image {
    const key = "__vignette__";
    if (!this.scene.textures.exists(key)) {
      const canvas = this.scene.textures.createCanvas(key, w, h)!;
      const ctx = canvas.context;

      // Radial gradient: clear center → black edges
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.max(w, h) * 0.55;

      const grad = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.35,
        cx,
        cy,
        radius,
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.15)");
      grad.addColorStop(0.75, "rgba(0,0,0,0.5)");
      grad.addColorStop(1, "rgba(0,0,0,0.9)");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      canvas.refresh();
    }

    const img = this.scene.add.image(w / 2, h / 2, key);
    img.setOrigin(0.5);
    return img;
  }

  update(delta: number): void {
    this.elapsed += delta;

    if (this.elapsed >= this.cycleLength) {
      this.elapsed -= this.cycleLength;
      this.cycleCount++;
    }

    // Determine phase
    let newPhase: Phase;
    if (this.elapsed < this.nightEnd) {
      newPhase = "night";
    } else if (this.elapsed < this.dawnEnd) {
      newPhase = "dawn";
    } else if (this.elapsed < this.dayEnd) {
      newPhase = "day";
    } else {
      newPhase = "dusk";
    }

    if (newPhase !== this.currentPhase) {
      this.currentPhase = newPhase;
      this.onPhaseChange?.(newPhase);
    }

    this.updateVisual();
  }

  private updateVisual(): void {
    const cfg = GameSettings.dayNight;
    let color: number;
    let alpha: number;

    switch (this.currentPhase) {
      case "night":
        color = 0x050520;
        alpha = 0.7;
        break;

      case "dawn": {
        const p = (this.elapsed - this.nightEnd) / cfg.dawnDuration;
        // Dark blue → fiery orange warning
        const r = Math.round(5 + p * 240);
        const g = Math.round(5 + p * 80);
        const b = Math.round(32 - p * 32);
        color = (r << 16) | (g << 8) | b;
        alpha = 0.7 - p * 0.55;
        break;
      }

      case "day":
        color = 0xffffcc;
        alpha = 0.12;
        break;

      case "dusk": {
        const p = (this.elapsed - this.dayEnd) / cfg.duskDuration;
        // Warm light → deep night blue
        const r = Math.round(255 - p * 250);
        const g = Math.round(255 - p * 250);
        const b = Math.round(204 - p * 172);
        color = (r << 16) | (g << 8) | b;
        alpha = 0.12 + p * 0.58;
        break;
      }
    }

    this.overlay.setFillStyle(color, alpha);

    // Vignette intensity: stronger at night, subtle during day
    let vigAlpha: number;
    switch (this.currentPhase) {
      case "night":
        vigAlpha = 0.95;
        this.vignette.setTint(0x050520);
        break;
      case "dawn": {
        const dp = (this.elapsed - this.nightEnd) / cfg.dawnDuration;
        vigAlpha = 0.95 - dp * 0.6;
        // Shift tint from blue-dark to warm orange
        const vr = Math.round(5 + dp * 200);
        const vg = Math.round(5 + dp * 80);
        const vb = Math.round(32 - dp * 20);
        this.vignette.setTint((vr << 16) | (vg << 8) | vb);
        break;
      }
      case "day":
        vigAlpha = 0.3;
        this.vignette.setTint(0xffffcc);
        break;
      case "dusk": {
        const dp = (this.elapsed - this.dayEnd) / cfg.duskDuration;
        vigAlpha = 0.3 + dp * 0.65;
        const vr = Math.round(255 - dp * 250);
        const vg = Math.round(255 - dp * 250);
        const vb = Math.round(204 - dp * 172);
        this.vignette.setTint((vr << 16) | (vg << 8) | vb);
        break;
      }
    }
    this.vignette.setAlpha(vigAlpha);
  }

  getPhase(): Phase {
    return this.currentPhase;
  }

  getCycleCount(): number {
    return this.cycleCount;
  }

  getPhaseProgress(): number {
    const cfg = GameSettings.dayNight;
    switch (this.currentPhase) {
      case "night":
        return this.elapsed / this.nightEnd;
      case "dawn":
        return (this.elapsed - this.nightEnd) / cfg.dawnDuration;
      case "day":
        return (this.elapsed - this.dawnEnd) / cfg.dayDuration;
      case "dusk":
        return (this.elapsed - this.dayEnd) / cfg.duskDuration;
    }
  }

  getCycleProgress(): number {
    return this.elapsed / this.cycleLength;
  }

  isDangerous(): boolean {
    return this.currentPhase === "day" || this.currentPhase === "dawn";
  }

  getOverlay(): Phaser.GameObjects.Rectangle {
    return this.overlay;
  }

  getVignette(): Phaser.GameObjects.Image {
    return this.vignette;
  }

  /** Reset to the start of a new night (cycle 0). */
  reset(): void {
    this.elapsed = 0;
    this.cycleCount = 0;
    this.currentPhase = "night";
    this.onPhaseChange?.("night");
    this.updateVisual();
  }

  destroy(): void {
    this.overlay.destroy();
    this.vignette.destroy();
  }
}
