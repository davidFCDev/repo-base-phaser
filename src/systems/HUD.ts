import GameSettings from "../config/GameSettings";
import type { BloodSystem } from "./BloodSystem";
import type { DayNightCycle } from "./DayNightCycle";

export class HUD {
  private scene: Phaser.Scene;
  private blood: BloodSystem;
  private dayNight: DayNightCycle;

  // Blood bar (centered, gothic)
  private barContainer: Phaser.GameObjects.Graphics;
  private barFillGfx: Phaser.GameObjects.Graphics;

  // Day/Night badge (circular)
  private badgeGfx: Phaser.GameObjects.Graphics;
  private badgeIcon: Phaser.GameObjects.Graphics;

  // Kills + Coins row
  private killsText: Phaser.GameObjects.Text;
  private coinText: Phaser.GameObjects.Text;

  // Day counter
  private dayText: Phaser.GameObjects.Text;

  // Phase timer (below badge)
  private phaseTimerText: Phaser.GameObjects.Text;

  // Castle compass
  private compassGfx: Phaser.GameObjects.Graphics;
  private compassArrow: Phaser.GameObjects.Graphics;
  private compassDist: Phaser.GameObjects.Text;

  // Warning flash
  private warningOverlay: Phaser.GameObjects.Rectangle;
  private warningTween?: Phaser.Tweens.Tween;

  // Day warning text
  private dayWarningText: Phaser.GameObjects.Text;

  // Blood bar dimensions — centered
  private barW = 280;
  private barH = 36;
  private barX: number;
  private barY: number;

  // Badge dimensions
  private badgeR = 32;
  private badgeCx: number;
  private badgeCy: number;

  constructor(
    scene: Phaser.Scene,
    blood: BloodSystem,
    dayNight: DayNightCycle,
  ) {
    this.scene = scene;
    this.blood = blood;
    this.dayNight = dayNight;

    // Always push HUD to the top of the screen
    this.barY = 24;

    const dayFontSize = "34px";
    const compassFontSize = "16px";

    const depth = 1100;
    const W = GameSettings.canvas.width;

    // Center the bar
    this.barX = (W - this.barW) / 2;

    // Badge position (right side)
    this.badgeCx = W - 55;
    this.badgeCy = this.barY + this.barH / 2;

    // ─── Blood bar ───
    this.barContainer = scene.add.graphics();
    this.barContainer.setScrollFactor(0).setDepth(depth);
    this.drawBarFrame();

    this.barFillGfx = scene.add.graphics();
    this.barFillGfx.setScrollFactor(0).setDepth(depth + 1);

    // ─── Day/Night badge ───
    this.badgeGfx = scene.add.graphics();
    this.badgeGfx.setScrollFactor(0).setDepth(depth);

    this.badgeIcon = scene.add.graphics();
    this.badgeIcon.setScrollFactor(0).setDepth(depth + 1);

    // ─── Kills + Coins row below bar ───
    const rowY = this.barY + this.barH + 8;
    this.killsText = scene.add
      .text(W / 2 - 60, rowY, "💀 0", {
        fontFamily: "'Creepster', cursive",
        fontSize: "28px",
        color: "#dddddd",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    this.coinText = scene.add
      .text(W / 2 + 60, rowY, "🩸 0", {
        fontFamily: "'Creepster', cursive",
        fontSize: "28px",
        color: "#ff6666",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    // ─── Day counter ───
    this.dayText = scene.add
      .text(55, this.barY + this.barH / 2, "Day 1", {
        fontFamily: "'Creepster', cursive",
        fontSize: dayFontSize,
        color: "#ccccff",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(depth);

    // ─── Phase timer (below badge) ───
    this.phaseTimerText = scene.add
      .text(this.badgeCx, this.badgeCy + this.badgeR + 10, "", {
        fontFamily: "'Creepster', cursive",
        fontSize: "24px",
        color: "#aaaacc",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    // ─── Castle compass ───
    const compassCx = W - 55;
    const compassCy = this.barY + this.barH + 80;

    this.compassGfx = scene.add.graphics();
    this.compassGfx.setScrollFactor(0).setDepth(depth);

    this.compassArrow = scene.add.graphics();
    this.compassArrow.setScrollFactor(0).setDepth(depth + 1);

    this.compassDist = scene.add
      .text(compassCx, compassCy + 28, "", {
        fontFamily: "'Creepster', cursive",
        fontSize: compassFontSize,
        color: "#aaaacc",
        stroke: "#000000",
        strokeThickness: 3,
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    // ─── Warning overlay ───
    const H = scene.scale.height;
    this.warningOverlay = scene.add
      .rectangle(W / 2, H / 2, W, H, 0xff4400, 0)
      .setScrollFactor(0)
      .setDepth(899);

    // ─── Day warning text ───
    this.dayWarningText = scene.add
      .text(W / 2, H / 2, "Run home!", {
        fontFamily: "'Creepster', cursive",
        fontSize: "40px",
        color: "#ffcc44",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setAlpha(0);
  }

  /** Draw the gothic bar frame (ornamental border). */
  private drawBarFrame(): void {
    const g = this.barContainer;
    const x = this.barX;
    const y = this.barY;
    const w = this.barW;
    const h = this.barH;

    // Dark background with rounded edges
    g.fillStyle(0x0a0008, 0.9);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 6);

    // Inner dark
    g.fillStyle(0x1a0010, 1);
    g.fillRoundedRect(x, y, w, h, 4);

    // Gothic ornamental border
    g.lineStyle(2, 0x660022, 1);
    g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 6);

    // Outer thin gold trim
    g.lineStyle(1, 0x884433, 0.6);
    g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 8);

    // Small pointed ornaments at ends
    // Left fang
    g.fillStyle(0x660022, 0.8);
    g.fillTriangle(
      x - 4,
      y + h / 2 - 6,
      x + 6,
      y + h / 2,
      x - 4,
      y + h / 2 + 6,
    );
    // Right fang
    g.fillTriangle(
      x + w + 4,
      y + h / 2 - 6,
      x + w - 6,
      y + h / 2,
      x + w + 4,
      y + h / 2 + 6,
    );
  }

  /** Tell the HUD whether the player is currently burning in sunlight. */
  setBurning(burning: boolean): void {
    this._isBurning = burning;
  }
  private _isBurning = false;
  private _wasBurning = false;

  update(): void {
    // Blood bar fill
    const percent = this.blood.getPercent();
    this.drawBloodFill(percent);

    // Burning bar effect: pulsing orange/fire glow around the bar
    if (this._isBurning) {
      this.drawBurnBarEffect();
    } else if (this._wasBurning) {
      // Redraw normal frame to clear fire glow
      this.barContainer.clear();
      this.drawBarFrame();
      this.barContainer.setAlpha(1);
    }
    this._wasBurning = this._isBurning;

    // Phase badge
    this.drawDayBadge();

    // Phase timer
    const phase = this.dayNight.getPhase();
    const rem = this.dayNight.getPhaseRemainingMs();
    const secs = Math.max(0, Math.ceil(rem / 1000));
    let timerLabel = "";
    let timerColor = "#aaaacc";
    if (phase === "night") {
      timerLabel = `☽ ${secs}s`;
      timerColor = "#8888cc";
    } else if (phase === "dawn") {
      timerLabel = `☀ ${secs}s`;
      timerColor = "#ffaa44";
    } else if (phase === "day") {
      timerLabel = `☀ ${secs}s`;
      timerColor = "#ffdd44";
    } else {
      timerLabel = `☽ ${secs}s`;
      timerColor = "#aa88cc";
    }
    this.phaseTimerText.setText(timerLabel);
    this.phaseTimerText.setColor(timerColor);

    // Warning overlay during dawn
    if (phase === "dawn") {
      const p = this.dayNight.getPhaseProgress();
      const pulse = Math.sin(this.scene.time.now * 0.006) * 0.5 + 0.5;
      this.warningOverlay.setAlpha(0.05 + p * 0.1 * pulse);
    } else {
      this.warningOverlay.setAlpha(0);
    }
  }

  private drawBurnBarEffect(): void {
    const t = this.scene.time.now;
    const pulse = Math.sin(t * 0.008) * 0.4 + 0.6;

    // Redraw frame with fire tint
    this.barContainer.clear();
    const g = this.barContainer;
    const x = this.barX;
    const y = this.barY;
    const w = this.barW;
    const h = this.barH;

    // Outer fire glow
    g.fillStyle(0xff4400, 0.25 * pulse);
    g.fillRoundedRect(x - 8, y - 8, w + 16, h + 16, 10);
    g.fillStyle(0xff6600, 0.15 * pulse);
    g.fillRoundedRect(x - 12, y - 12, w + 24, h + 24, 14);

    // Normal bar bg
    g.fillStyle(0x0a0008, 0.9);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 6);
    g.fillStyle(0x1a0010, 1);
    g.fillRoundedRect(x, y, w, h, 4);

    // Fire border instead of gothic border
    const fireColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(255, 68, 0),
      new Phaser.Display.Color(255, 200, 0),
      1,
      pulse,
    );
    const fc = (fireColor.r << 16) | (fireColor.g << 8) | fireColor.b;
    g.lineStyle(2, fc, 0.9);
    g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 6);
    g.lineStyle(1, 0xff8833, 0.4 * pulse);
    g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 8);

    // Fangs
    g.fillStyle(fc, 0.8);
    g.fillTriangle(
      x - 4,
      y + h / 2 - 6,
      x + 6,
      y + h / 2,
      x - 4,
      y + h / 2 + 6,
    );
    g.fillTriangle(
      x + w + 4,
      y + h / 2 - 6,
      x + w - 6,
      y + h / 2,
      x + w + 4,
      y + h / 2 + 6,
    );
  }

  private drawBloodFill(percent: number): void {
    const g = this.barFillGfx;
    g.clear();

    const x = this.barX + 2;
    const y = this.barY + 2;
    const maxW = this.barW - 4;
    const h = this.barH - 4;
    const fillW = maxW * percent;
    if (fillW <= 0) return;

    // Blood color — shifts from deep red to orange to pulsing red when low
    let color: number;
    let alpha = 1;
    if (percent > 0.5) {
      color = 0xaa0015;
    } else if (percent > 0.25) {
      // Shift to darker/orange
      const t = (percent - 0.25) / 0.25;
      const r = Math.round(0xaa + (1 - t) * 0x55);
      const gr = Math.round(0x00 + (1 - t) * 0x33);
      color = (r << 16) | (gr << 8);
    } else {
      color = 0xff0000;
      alpha = Math.sin(this.scene.time.now * 0.008) * 0.3 + 0.7;
    }

    // Gradient-like fill: darker at bottom, lighter at top
    g.fillStyle(color, alpha * 0.5);
    g.fillRoundedRect(x, y, fillW, h, 3);
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x, y, fillW, h * 0.6, 3);

    // Blood drip effect at the edge
    if (fillW > 8) {
      const edgeX = x + fillW;
      const dripH = Math.sin(this.scene.time.now * 0.003) * 3 + 4;
      g.fillStyle(color, alpha * 0.7);
      g.fillRect(edgeX - 3, y + h - 1, 3, dripH);
    }
  }

  private drawDayBadge(): void {
    const g = this.badgeGfx;
    const icon = this.badgeIcon;
    g.clear();
    icon.clear();

    const cx = this.badgeCx;
    const cy = this.badgeCy;
    const r = this.badgeR;

    const phase = this.dayNight.getPhase();
    const progress = this.dayNight.getPhaseProgress();

    // Compute background color and celestial body based on phase
    let bgR: number, bgG: number, bgB: number;
    let bodyColor: number;
    let bodyAlpha = 1;
    let isMoon = true; // true = moon, false = sun

    switch (phase) {
      case "night":
        // Deep dark sky
        bgR = 8;
        bgG = 8;
        bgB = 25;
        bodyColor = 0xeeeeff;
        isMoon = true;
        break;
      case "dawn": {
        // Dark → warm sunrise (sky: dark blue → orange-blue)
        bgR = Math.round(8 + progress * 120);
        bgG = Math.round(8 + progress * 80);
        bgB = Math.round(25 + progress * 100);
        // Moon fades, sun appears
        if (progress < 0.5) {
          isMoon = true;
          bodyColor = 0xeeeeff;
          bodyAlpha = 1 - progress * 2;
        } else {
          isMoon = false;
          bodyColor = 0xffdd44;
          bodyAlpha = (progress - 0.5) * 2;
        }
        break;
      }
      case "day":
        // Bright sky blue
        bgR = 100;
        bgG = 160;
        bgB = 220;
        bodyColor = 0xffdd44;
        isMoon = false;
        break;
      case "dusk": {
        // Bright → dark (sky: blue → purple → dark)
        bgR = Math.round(100 - progress * 92);
        bgG = Math.round(160 - progress * 152);
        bgB = Math.round(220 - progress * 195);
        // Sun fades, moon appears
        if (progress < 0.5) {
          isMoon = false;
          bodyColor = 0xffaa33;
          bodyAlpha = 1 - progress * 2;
        } else {
          isMoon = true;
          bodyColor = 0xeeeeff;
          bodyAlpha = (progress - 0.5) * 2;
        }
        break;
      }
    }

    const bgColor = (bgR << 16) | (bgG << 8) | bgB;

    // Outer ring (dark border)
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx, cy, r + 3);

    // Badge background
    g.fillStyle(bgColor, 1);
    g.fillCircle(cx, cy, r);

    // Thin gold ring
    g.lineStyle(2, 0x886644, 0.7);
    g.strokeCircle(cx, cy, r + 2);

    // Stars during night/dawn-early/dusk-late
    const showStars =
      phase === "night" ||
      (phase === "dawn" && progress < 0.3) ||
      (phase === "dusk" && progress > 0.7);
    if (showStars) {
      const starAlpha =
        phase === "night"
          ? 0.8
          : phase === "dawn"
            ? ((0.3 - progress) / 0.3) * 0.8
            : ((progress - 0.7) / 0.3) * 0.8;
      icon.fillStyle(0xffffff, starAlpha);
      // Fixed star positions relative to badge
      icon.fillCircle(cx - 12, cy - 18, 1.5);
      icon.fillCircle(cx + 18, cy - 10, 1);
      icon.fillCircle(cx - 20, cy + 5, 1.2);
      icon.fillCircle(cx + 10, cy + 20, 1);
      icon.fillCircle(cx + 22, cy + 12, 1.3);
    }

    // Celestial body
    if (isMoon) {
      // Crescent moon
      icon.fillStyle(bodyColor, bodyAlpha);
      icon.fillCircle(cx, cy, r * 0.42);
      // Dark circle to create crescent
      icon.fillStyle(bgColor, bodyAlpha);
      icon.fillCircle(cx + r * 0.2, cy - r * 0.1, r * 0.36);
    } else {
      // Sun with rays
      icon.fillStyle(bodyColor, bodyAlpha);
      icon.fillCircle(cx, cy, r * 0.3);
      // Sun rays
      const rayLen = r * 0.18;
      const rayW = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + this.scene.time.now * 0.001;
        const rx = cx + Math.cos(angle) * (r * 0.38);
        const ry = cy + Math.sin(angle) * (r * 0.38);
        const ex = cx + Math.cos(angle) * (r * 0.38 + rayLen);
        const ey = cy + Math.sin(angle) * (r * 0.38 + rayLen);
        icon.lineStyle(rayW, bodyColor, bodyAlpha * 0.7);
        icon.lineBetween(rx, ry, ex, ey);
      }
      // Glow
      icon.fillStyle(0xffffaa, bodyAlpha * 0.2);
      icon.fillCircle(cx, cy, r * 0.5);
    }
  }

  /** Update the castle compass direction + distance indicator.
   *  Shows at screen edge only when castle is off-screen. */
  updateCompass(
    playerX: number,
    playerY: number,
    safeX: number,
    safeY: number,
    inSafe: boolean,
    castleScreenX: number,
    castleScreenY: number,
  ): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const r = 20;
    const margin = r + 8;

    // Is the castle visible on screen?
    const onScreen =
      castleScreenX >= -40 &&
      castleScreenX <= W + 40 &&
      castleScreenY >= -40 &&
      castleScreenY <= H + 40;

    const g = this.compassGfx;
    const a = this.compassArrow;
    g.clear();
    a.clear();

    if (inSafe || onScreen) {
      // Castle is visible or player is safe — hide compass
      this.compassDist.setVisible(false);
      return;
    }

    this.compassDist.setVisible(true);

    // Clamp position to screen edges
    const dx = safeX - playerX;
    const dy = safeY - playerY;
    const angle = Math.atan2(dy, dx);

    // Project from center of screen along the angle, clamped to edges
    const centerX = W / 2;
    const centerY = H / 2;

    // Find intersection with screen edge
    let cx = centerX + Math.cos(angle) * 600;
    let cy = centerY + Math.sin(angle) * 600;
    cx = Math.max(margin, Math.min(W - margin, cx));
    cy = Math.max(
      GameSettings.safeArea.top + 90,
      Math.min(H - margin - 60, cy),
    );

    // Background circle
    g.fillStyle(0x111122, 0.85);
    g.fillCircle(cx, cy, r + 2);
    g.lineStyle(2, 0x44ff88, 0.8);
    g.strokeCircle(cx, cy, r + 2);

    // House icon inside circle
    const s = r * 0.065; // scale factor based on radius
    // Roof
    g.fillStyle(0x44ff88, 0.9);
    g.fillTriangle(
      cx - 12 * s,
      cy - 2 * s,
      cx,
      cy - 12 * s,
      cx + 12 * s,
      cy - 2 * s,
    );
    // Body
    g.fillRect(cx - 9 * s, cy - 2 * s, 18 * s, 12 * s);
    // Door
    g.fillStyle(0x111122, 0.9);
    g.fillRect(cx - 3 * s, cy + 3 * s, 6 * s, 7 * s);
    // Window
    g.fillStyle(0xffffaa, 0.6);
    g.fillRect(cx + 3 * s, cy, 4 * s, 4 * s);

    // Distance text below the circle
    const dist = Math.sqrt(dx * dx + dy * dy);
    const meters = Math.round(dist / 10);
    this.compassDist.setText(`${meters}m`);
    this.compassDist.setColor(meters < 30 ? "#aaddaa" : "#aaaacc");
    this.compassDist.setPosition(cx, cy + r + 6);
  }

  showDawnWarning(): void {
    if (this.warningTween) return;

    this.warningTween = this.scene.tweens.add({
      targets: this.warningOverlay,
      alpha: { from: 0, to: 0.15 },
      duration: 500,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        this.warningTween = undefined;
        this.warningOverlay.setAlpha(0);
      },
    });
  }

  showDayWarning(): void {
    this.dayWarningText.setAlpha(0).setScale(0.6);
    this.scene.tweens.add({
      targets: this.dayWarningText,
      alpha: 1,
      scale: 1,
      duration: 400,
      ease: "Back.easeOut",
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.dayWarningText,
          alpha: 0,
          scale: 1.1,
          duration: 600,
          delay: 1200,
          ease: "Sine.easeIn",
        });
      },
    });
  }

  /** Update coin counter. */
  setCoins(amount: number): void {
    this.coinText.setText(`🩸 ${amount}`);
  }

  /** Update kills counter. */
  setKills(amount: number): void {
    this.killsText.setText(`💀 ${amount}`);
  }

  /** Update the day counter display. */
  setDay(dayNumber: number, phase: string): void {
    const isNight = phase === "night" || phase === "dusk";
    this.dayText.setText(`Day ${dayNumber}`);
    this.dayText.setColor(isNight ? "#ccccff" : "#ffddaa");
  }

  /** Return all HUD game objects so they can be assigned to a UI camera. */
  getElements(): Phaser.GameObjects.GameObject[] {
    return [
      this.barContainer,
      this.barFillGfx,
      this.badgeGfx,
      this.badgeIcon,
      this.killsText,
      this.coinText,
      this.dayText,
      this.phaseTimerText,
      this.compassGfx,
      this.compassArrow,
      this.compassDist,
      this.warningOverlay,
      this.dayWarningText,
    ];
  }

  destroy(): void {
    this.barContainer.destroy();
    this.barFillGfx.destroy();
    this.badgeGfx.destroy();
    this.badgeIcon.destroy();
    this.killsText.destroy();
    this.coinText.destroy();
    this.dayText.destroy();
    this.phaseTimerText.destroy();
    this.compassGfx.destroy();
    this.compassArrow.destroy();
    this.dayWarningText.destroy();
    this.compassDist.destroy();
    this.warningOverlay.destroy();
  }
}
