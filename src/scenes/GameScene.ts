import GameSettings from "../config/GameSettings";
import { Archer } from "../objects/Archer";
import { Monk } from "../objects/Monk";
import { Player } from "../objects/Player";
import { Villager } from "../objects/Villager";
import { BloodSystem } from "../systems/BloodSystem";
import { DayNightCycle, type Phase } from "../systems/DayNightCycle";
import { HUD } from "../systems/HUD";
import { VirtualJoystick } from "../systems/VirtualJoystick";

export class GameScene extends Phaser.Scene {
  // Systems
  private dayNight!: DayNightCycle;
  private blood!: BloodSystem;
  private joystick!: VirtualJoystick;
  private hud!: HUD;
  private map!: Phaser.Tilemaps.Tilemap;

  // Audio
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;

  // Entities
  private player!: Player;
  private villagers: Villager[] = [];
  private archers: Archer[] = [];
  private monks: Monk[] = [];

  // State
  private isGameOver: boolean = false;
  private introPlaying: boolean = true;
  private score: number = 0;
  private villagersHunted: number = 0;
  private lastCycleCount: number = 0;
  private dayNumber: number = 1;
  private wasInSafe: boolean = true;
  private cycleCompleted: boolean = false;
  private safeText: Phaser.GameObjects.Text | null = null;
  private biteOverlay: Phaser.GameObjects.Image | null = null;
  private burnOverlay: Phaser.GameObjects.Image | null = null;
  private isBurning: boolean = false;
  private smokeTimer: number = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.isGameOver = false;
    this.score = 0;
    this.villagersHunted = 0;
    this.lastCycleCount = 0;

    // Init audio
    try {
      this.audioCtx = new AudioContext();
    } catch (_) {
      /* no audio */
    }

    // 1. Draw tilemap
    this.drawMap();
    this.debugDrawSafeZones();

    // 2. Loose world bounds covering full isometric diamond
    const top = this.map.tileToWorldXY(0, 0)!;
    const right = this.map.tileToWorldXY(this.map.width - 1, 0)!;
    const bottom = this.map.tileToWorldXY(
      this.map.width - 1,
      this.map.height - 1,
    )!;
    const left = this.map.tileToWorldXY(0, this.map.height - 1)!;

    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const boundsX = left.x - tw;
    const boundsY = top.y - th;
    const boundsW = right.x + tw - boundsX;
    const boundsH = bottom.y + th * 2 - boundsY;

    this.physics.world.setBounds(boundsX, boundsY, boundsW, boundsH);

    // 3. Create entities at center of safe zone diamond
    const spawnX = this.safeDiamondCx;
    const spawnY = this.safeDiamondCy;
    this.createPlayer(spawnX, spawnY);
    this.createVillagers(spawnX, spawnY);
    this.createArchers(spawnX, spawnY);
    this.createMonks(spawnX, spawnY);

    // 4. Systems
    this.blood = new BloodSystem();
    this.dayNight = new DayNightCycle(this, (phase) =>
      this.onPhaseChange(phase),
    );
    this.joystick = new VirtualJoystick(this);
    this.hud = new HUD(this, this.blood, this.dayNight, () => this.score);

    // 5. Camera — procedural sea background
    this.cameras.main.setBackgroundColor("#3d8ea8");
    this.generateSeaBackground(boundsX, boundsY, boundsW, boundsH);
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);
    this.cameras.main.setBounds(boundsX, boundsY, boundsW, boundsH);

    // UI camera (zoom=1, no scroll) — HUD + joystick + day/night overlay + vignette
    const uiElements = [
      ...this.hud.getElements(),
      ...this.joystick.getElements(),
      this.dayNight.getOverlay(),
      this.dayNight.getVignette(),
    ];
    for (const el of uiElements) {
      this.cameras.main.ignore(el);
    }
    const uiCam = this.cameras.add(0, 0, undefined, undefined, false, "ui");
    uiCam.setScroll(0, 0);
    for (const child of this.children.list) {
      if (!uiElements.includes(child)) {
        uiCam.ignore(child);
      }
    }

    // 6. SDK
    this.initSDK();

    // 7. Intro countdown overlay
    this.playIntro();
  }

  update(time: number, delta: number): void {
    if (this.isGameOver || this.introPlaying) return;

    const dt = delta / 1000;

    // Update day/night
    this.dayNight.update(delta);

    // Check cycle increment
    const currentCycle = this.dayNight.getCycleCount();
    if (currentCycle > this.lastCycleCount) {
      const newCycles = currentCycle - this.lastCycleCount;
      for (let i = 0; i < newCycles; i++) {
        this.blood.incrementCycle();
        this.score += GameSettings.scoring.perCycle;
      }
      this.lastCycleCount = currentCycle;
    }

    // Player movement — predict and filter direction before applying velocity
    const dir = this.joystick.getDirection();
    let moveDir = { x: dir.x, y: dir.y };
    if (dir.x !== 0 || dir.y !== 0) {
      const speed = GameSettings.player.speed;
      const px = this.player.sprite.x;
      const py = this.player.sprite.y;
      const look = speed * dt + 6;
      const futureX = px + dir.x * look;
      const futureY = py + dir.y * look;
      // Check center and a point offset upward (covers top-left/top-right diamond edges)
      const okCenter = this.hasGroundAt(futureX, futureY);
      const okTop = this.hasGroundAt(futureX, futureY - 20);
      if (!okCenter || !okTop) {
        const canX =
          this.hasGroundAt(futureX, py) && this.hasGroundAt(futureX, py - 20);
        const canY =
          this.hasGroundAt(px, futureY) && this.hasGroundAt(px, futureY - 20);
        moveDir = { x: canX ? dir.x : 0, y: canY ? dir.y : 0 };
      }
    }
    const result = this.player.update(dt, moveDir, this.villagers);
    if (result.hunted) {
      this.onHunt(result.killCount);
    }

    // Check for chain attack kills completed
    if (this.player._chainKillPending > 0) {
      this.onHunt(this.player._chainKillPending);
      this.player._chainKillPending = 0;
    }

    // Villagers — same predictive check
    const playerPos = this.player.getPosition();
    for (const v of this.villagers) {
      v.update(dt, playerPos);
      if (!this.hasGroundAt(v.sprite.x, v.sprite.y)) {
        // Reverse one frame of movement
        const body = v.sprite.body as Phaser.Physics.Arcade.Body;
        v.sprite.x -= body.velocity.x * dt;
        v.sprite.y -= body.velocity.y * dt;
        body.velocity.set(0, 0);
      }
    }

    // Archers — update AI + check arrow collisions with player
    for (const archer of this.archers) {
      archer.update(dt, playerPos);
      if (!this.hasGroundAt(archer.sprite.x, archer.sprite.y)) {
        const body = archer.sprite.body as Phaser.Physics.Arcade.Body;
        archer.sprite.x -= body.velocity.x * dt;
        archer.sprite.y -= body.velocity.y * dt;
        body.velocity.set(0, 0);
      }
      // Check arrow hits on player
      for (const arrow of archer.getArrows()) {
        if (!arrow.isAlive()) continue;
        const hitDist = Phaser.Math.Distance.Between(
          arrow.sprite.x,
          arrow.sprite.y,
          this.player.sprite.x,
          this.player.sprite.y,
        );
        if (hitDist < 30) {
          this.blood.addBlood(-GameSettings.archers.arrowDamage);
          arrow.destroy();
          this.cameras.main.shake(80, 0.005);
          // Flash player red briefly
          this.player.sprite.setTint(0xff4444);
          this.time.delayedCall(150, () => {
            if (!this.isGameOver) this.player.sprite.clearTint();
          });
        }
      }
    }

    // Monks — update AI + check aura damage on player
    for (const monk of this.monks) {
      monk.update(dt, playerPos);
      if (!this.hasGroundAt(monk.sprite.x, monk.sprite.y)) {
        const body = monk.sprite.body as Phaser.Physics.Arcade.Body;
        monk.sprite.x -= body.velocity.x * dt;
        monk.sprite.y -= body.velocity.y * dt;
        body.velocity.set(0, 0);
      }
      // Aura damage
      const distToMonk = monk.getDistanceToPlayer(playerPos);
      if (distToMonk < GameSettings.monks.auraRadius) {
        const intensity = 1 - distToMonk / GameSettings.monks.auraRadius;
        const damage = GameSettings.monks.auraDamagePerSecond * intensity * dt;
        this.blood.addBlood(-damage);
        // Golden flash on player
        this.player.sprite.setTint(0xffdd44);
        this.time.delayedCall(100, () => {
          if (!this.isGameOver && !this.isBurning)
            this.player.sprite.clearTint();
        });
      }
    }

    // Blood drain
    const phase = this.dayNight.getPhase();
    const feet = this.player.getFeetPosition();
    const inSafe = this.isSafeAt(feet.x, feet.y);

    // Show "SAFE" message when entering castle
    if (inSafe && !this.wasInSafe) {
      this.showSafeMessage();
    }
    this.wasInSafe = inSafe;

    // New day: a full cycle completed AND player is in the castle
    if (this.cycleCompleted && inSafe) {
      this.cycleCompleted = false;
      this.dayNumber++;
      this.lastCycleCount = 0;
      this.spawnWave();
    }

    let drainMul = 1;
    if (phase === "day" && !inSafe) {
      drainMul +=
        GameSettings.blood.sunDamagePerSecond /
        GameSettings.blood.drainPerSecond;
    } else if (phase === "dawn" && !inSafe) {
      // Partial sun damage during dawn (scales with progress)
      const dawnProgress = this.dayNight.getPhaseProgress();
      drainMul +=
        (GameSettings.blood.sunDamagePerSecond /
          GameSettings.blood.drainPerSecond) *
        dawnProgress *
        0.5;
    }

    this.blood.update(dt, drainMul);

    // Sun burn visual (tint player red when taking sun damage)
    const isBurningNow = (phase === "day" || phase === "dawn") && !inSafe;
    this.hud.setBurning(isBurningNow);
    if (isBurningNow) {
      const pulse = Math.sin(time * 0.01) * 0.3 + 0.7;
      this.player.sprite.setAlpha(pulse);
      this.showBurnEffect(
        phase === "day" ? 1 : this.dayNight.getPhaseProgress() * 0.5,
      );
      this.emitSmoke(
        dt,
        phase === "day" ? 1 : this.dayNight.getPhaseProgress(),
      );
    } else {
      this.player.sprite.setAlpha(1);
      this.hideBurnEffect();
      this.smokeTimer = 0;
    }

    // Check game over
    if (this.blood.isEmpty()) {
      this.triggerGameOver();
    }

    // Day counter in HUD
    this.hud.setDay(this.dayNumber, phase);

    // Castle compass — compute screen-space position of castle center
    const cam = this.cameras.main;
    const castleScreenX = (this.safeDiamondCx - cam.scrollX) * cam.zoom;
    const castleScreenY = (this.safeDiamondCy - cam.scrollY) * cam.zoom;
    const pos = this.player.getPosition();
    this.hud.updateCompass(
      pos.x,
      pos.y,
      this.safeDiamondCx,
      this.safeDiamondCy,
      inSafe,
      castleScreenX,
      castleScreenY,
    );

    // HUD
    this.hud.update();
  }

  // ---- Intro Countdown ----

  private playIntro(): void {
    this.introPlaying = true;
    this.physics.pause();

    const W = this.scale.width;
    const H = this.scale.height;

    // Dark overlay (UI space, scroll-independent)
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.85)
      .setScrollFactor(0)
      .setDepth(5000);

    // Tell main camera to ignore it (it's for the UI camera)
    this.cameras.main.ignore(overlay);

    const phrases = [
      "The night is yours...",
      "Hunt or be forgotten...",
      "Let the blood flow.",
    ];

    let index = 0;

    const showPhrase = () => {
      if (index >= phrases.length) {
        // Fade out overlay and start game
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          duration: 600,
          ease: "Power2",
          onComplete: () => {
            overlay.destroy();
            this.introPlaying = false;
            this.physics.resume();
          },
        });
        return;
      }

      const txt = this.add
        .text(W / 2, H / 2, phrases[index], {
          fontFamily: "'Creepster', cursive",
          fontSize: "42px",
          color: "#cc0000",
          stroke: "#000000",
          strokeThickness: 6,
          align: "center",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(5001)
        .setAlpha(0);

      this.cameras.main.ignore(txt);

      // Fade in
      this.tweens.add({
        targets: txt,
        alpha: 1,
        duration: 700,
        ease: "Power2",
        onComplete: () => {
          // Hold, then fade out
          this.time.delayedCall(800, () => {
            this.tweens.add({
              targets: txt,
              alpha: 0,
              duration: 500,
              ease: "Power2",
              onComplete: () => {
                txt.destroy();
                index++;
                showPhrase();
              },
            });
          });
        },
      });
    };

    // Start after a short delay
    this.time.delayedCall(300, () => showPhrase());
  }

  private onHunt(killCount: number = 1): void {
    this.villagersHunted += killCount;
    this.score += GameSettings.scoring.perVillager * killCount;
    const bloodAmount =
      killCount > 1
        ? GameSettings.blood.multiHuntRestore
        : GameSettings.blood.huntRestore;
    this.blood.addBlood(bloodAmount);
    this.playBiteSound();
    if (killCount <= 1) this.showBiteEffect();
    const sdk = (window as any).FarcadeSDK;
    if (sdk?.hapticFeedback) sdk.hapticFeedback();
  }

  // ---- Bite Blood Effect ----

  private createBiteTexture(): void {
    const key = "__bite_blood__";
    if (this.textures.exists(key)) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const canvas = this.textures.createCanvas(key, w, h)!;
    const ctx = canvas.context;

    // Transparent center, blood splatter around edges
    ctx.clearRect(0, 0, w, h);

    // Radial gradient: transparent center → dark red edges
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.max(w, h) * 0.55;

    const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    grad.addColorStop(0, "rgba(120,0,0,0)");
    grad.addColorStop(0.6, "rgba(140,0,0,0.25)");
    grad.addColorStop(0.8, "rgba(160,0,0,0.6)");
    grad.addColorStop(1, "rgba(100,0,0,0.9)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Blood drip streaks along edges
    const drawDrip = (x: number, y: number, dw: number, dh: number) => {
      ctx.fillStyle = `rgba(${(100 + Math.random() * 60) | 0},0,0,${0.5 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x, y, dw / 2, dh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    // Top edge drips
    for (let i = 0; i < 18; i++) {
      const dx = Math.random() * w;
      const dy = Math.random() * 60;
      drawDrip(dx, dy, 8 + Math.random() * 20, 15 + Math.random() * 40);
    }
    // Bottom edge drips
    for (let i = 0; i < 18; i++) {
      const dx = Math.random() * w;
      const dy = h - Math.random() * 60;
      drawDrip(dx, dy, 8 + Math.random() * 20, 15 + Math.random() * 40);
    }
    // Left edge drips
    for (let i = 0; i < 12; i++) {
      const dx = Math.random() * 50;
      const dy = Math.random() * h;
      drawDrip(dx, dy, 15 + Math.random() * 30, 8 + Math.random() * 20);
    }
    // Right edge drips
    for (let i = 0; i < 12; i++) {
      const dx = w - Math.random() * 50;
      const dy = Math.random() * h;
      drawDrip(dx, dy, 15 + Math.random() * 30, 8 + Math.random() * 20);
    }

    // Corner splatters (thicker)
    const corners = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ];
    for (const [ccx, ccy] of corners) {
      for (let i = 0; i < 8; i++) {
        const ox = ccx + (Math.random() - 0.5) * 100;
        const oy = ccy + (Math.random() - 0.5) * 100;
        drawDrip(ox, oy, 12 + Math.random() * 25, 12 + Math.random() * 25);
      }
    }

    canvas.refresh();
  }

  private showBiteEffect(): void {
    const key = "__bite_blood__";
    if (!this.textures.exists(key)) {
      this.createBiteTexture();
    }

    // Reuse or create overlay
    if (this.biteOverlay && this.biteOverlay.active) {
      // Reset running tween and replay
      this.tweens.killTweensOf(this.biteOverlay);
      this.biteOverlay.setAlpha(0.85);
    } else {
      const w = this.scale.width;
      const h = this.scale.height;
      this.biteOverlay = this.add
        .image(w / 2, h / 2, key)
        .setScrollFactor(0)
        .setDepth(1050)
        .setAlpha(0.85);

      // Hide from main camera
      this.cameras.main.ignore(this.biteOverlay);
    }

    // Flash in then fade out
    this.tweens.add({
      targets: this.biteOverlay,
      alpha: 0,
      duration: 600,
      ease: "Cubic.easeOut",
    });

    // Small camera shake for impact
    this.cameras.main.shake(120, 0.008);
  }

  // ---- Burn Effect ----

  private createBurnTexture(): void {
    const key = "__burn_border__";
    if (this.textures.exists(key)) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const canvas = this.textures.createCanvas(key, w, h)!;
    const ctx = canvas.context;
    ctx.clearRect(0, 0, w, h);

    // Radial gradient: transparent center → fiery orange/yellow edges
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.max(w, h) * 0.55;

    const grad = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    grad.addColorStop(0, "rgba(255,100,0,0)");
    grad.addColorStop(0.5, "rgba(255,80,0,0.1)");
    grad.addColorStop(0.7, "rgba(255,60,0,0.35)");
    grad.addColorStop(0.85, "rgba(255,40,0,0.6)");
    grad.addColorStop(1, "rgba(200,20,0,0.85)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Heat shimmer streaks on edges
    const drawEmber = (ex: number, ey: number, ew: number, eh: number) => {
      const cr = (200 + Math.random() * 55) | 0;
      const cg = (Math.random() * 80 + 40) | 0;
      ctx.fillStyle = `rgba(${cr},${cg},0,${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(
        ex,
        ey,
        ew / 2,
        eh / 2,
        Math.random() * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    };

    // Top edge embers
    for (let i = 0; i < 14; i++) {
      drawEmber(
        Math.random() * w,
        Math.random() * 50,
        10 + Math.random() * 25,
        8 + Math.random() * 30,
      );
    }
    // Bottom edge
    for (let i = 0; i < 14; i++) {
      drawEmber(
        Math.random() * w,
        h - Math.random() * 50,
        10 + Math.random() * 25,
        8 + Math.random() * 30,
      );
    }
    // Left edge
    for (let i = 0; i < 10; i++) {
      drawEmber(
        Math.random() * 45,
        Math.random() * h,
        8 + Math.random() * 25,
        10 + Math.random() * 20,
      );
    }
    // Right edge
    for (let i = 0; i < 10; i++) {
      drawEmber(
        w - Math.random() * 45,
        Math.random() * h,
        8 + Math.random() * 25,
        10 + Math.random() * 20,
      );
    }

    // Bright yellow sparks in corners
    const corners = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ];
    for (const [ccx, ccy] of corners) {
      for (let i = 0; i < 6; i++) {
        const ox = ccx + (Math.random() - 0.5) * 80;
        const oy = ccy + (Math.random() - 0.5) * 80;
        ctx.fillStyle = `rgba(255,${(180 + Math.random() * 75) | 0},0,${0.4 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(ox, oy, 2 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    canvas.refresh();
  }

  private showBurnEffect(intensity: number): void {
    const key = "__burn_border__";
    if (!this.textures.exists(key)) {
      this.createBurnTexture();
    }

    if (!this.burnOverlay || !this.burnOverlay.active) {
      const w = this.scale.width;
      const h = this.scale.height;
      this.burnOverlay = this.add
        .image(w / 2, h / 2, key)
        .setScrollFactor(0)
        .setDepth(1051)
        .setAlpha(0);

      this.cameras.main.ignore(this.burnOverlay);
    }

    // Pulsing alpha based on intensity
    const pulse = Math.sin(this.time.now * 0.005) * 0.15 + 0.85;
    this.burnOverlay.setAlpha(intensity * 0.55 * pulse);
    this.isBurning = true;
  }

  private hideBurnEffect(): void {
    if (!this.isBurning || !this.burnOverlay) return;
    this.isBurning = false;
    this.tweens.add({
      targets: this.burnOverlay,
      alpha: 0,
      duration: 400,
      ease: "Sine.easeOut",
    });
  }

  // ---- Smoke Particles ----

  private ensureSmokeTexture(): void {
    if (this.textures.exists("__smoke__")) return;
    const gfx = this.add.graphics();
    // Soft circle gradient
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(16, 16, 16);
    gfx.fillStyle(0xffffff, 0.6);
    gfx.fillCircle(16, 16, 12);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(16, 16, 8);
    gfx.generateTexture("__smoke__", 32, 32);
    gfx.destroy();
  }

  private emitSmoke(dt: number, intensity: number): void {
    this.ensureSmokeTexture();

    // Emit rate: faster at full intensity
    const interval = 0.08 + (1 - intensity) * 0.15; // 80-230ms
    this.smokeTimer += dt;
    if (this.smokeTimer < interval) return;
    this.smokeTimer = 0;

    const px = this.player.sprite.x + (Math.random() - 0.5) * 16;
    const py = this.player.sprite.y - 10;

    // Alternate: smoke (grey) and ember (orange)
    const isEmber = Math.random() < 0.35;
    const tint = isEmber
      ? (0xff4400 + ((Math.random() * 0x88) << 8)) | 0
      : (0x444444 + ((Math.random() * 0x55) << 16)) | 0;
    const startScale = isEmber
      ? 0.08 + Math.random() * 0.08
      : 0.15 + Math.random() * 0.15;
    const endScale = isEmber ? 0 : 0.3 + Math.random() * 0.2;
    const dur = isEmber ? 300 + Math.random() * 200 : 500 + Math.random() * 400;

    const p = this.add
      .image(px, py, "__smoke__")
      .setScale(startScale)
      .setTint(tint)
      .setAlpha(isEmber ? 0.9 : 0.5)
      .setDepth(this.player.sprite.y + 1);

    this.tweens.add({
      targets: p,
      y: py - 25 - Math.random() * 20,
      x: px + (Math.random() - 0.5) * 20,
      scaleX: endScale,
      scaleY: endScale,
      alpha: 0,
      duration: dur,
      ease: "Sine.easeOut",
      onComplete: () => p.destroy(),
    });
  }

  // ---- Safe Message ----

  private showSafeMessage(): void {
    // Remove previous if still visible
    if (this.safeText) {
      this.safeText.destroy();
      this.safeText = null;
    }

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const txt = this.add
      .text(cx, cy - 40, "SAFE", {
        fontFamily: "'Creepster', cursive",
        fontSize: "48px",
        color: "#44ff88",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setAlpha(0);

    this.safeText = txt;

    // Hide from main camera (UI camera sees all new objects)
    this.cameras.main.ignore(txt);

    // Fade in, hold, then fade out
    this.tweens.add({
      targets: txt,
      alpha: 1,
      y: cy - 60,
      duration: 300,
      ease: "Back.easeOut",
      hold: 1200,
      yoyo: false,
      onComplete: () => {
        if (!txt.active) return;
        this.tweens.add({
          targets: txt,
          alpha: 0,
          y: cy - 90,
          duration: 500,
          ease: "Sine.easeIn",
          onComplete: () => {
            if (txt.active) txt.destroy();
            if (this.safeText === txt) this.safeText = null;
          },
        });
      },
    });
  }

  // ---- Map Drawing ----

  private static readonly WATER_GID = 123;
  /** Offset to shift safe zone detection downward (positive = down). */
  private static readonly SAFE_Y_OFFSET = 64;

  /** Check if a world position has a walkable ground tile (not water, not empty). */
  private hasGroundAt(worldX: number, worldY: number): boolean {
    const tilePos = this.map.worldToTileXY(worldX, worldY, true);
    if (!tilePos) return false;
    const tx = tilePos.x;
    const ty = tilePos.y;
    const layer = this.map.getLayer("Capa1");
    if (!layer) return false;
    if (tx < 0 || ty < 0 || tx >= layer.width || ty >= layer.height)
      return false;
    const tile = layer.data[ty][tx];
    return (
      tile != null && tile.index !== -1 && tile.index !== GameScene.WATER_GID
    );
  }

  /** Bounding rect of the safe zone in world coords. */
  private safeRect: Phaser.Geom.Rectangle | null = null;
  /** Diamond params for point-in-diamond check. */
  private safeDiamondCx = 0;
  private safeDiamondCy = 0;
  private safeDiamondHw = 0;
  private safeDiamondHh = 0;

  /** Check if a world position sits inside the safe zone diamond. */
  private isSafeAt(worldX: number, worldY: number): boolean {
    if (!this.safeRect) return false;
    // Quick AABB pre-check
    if (!this.safeRect.contains(worldX, worldY)) return false;
    // Diamond (rombo) check: |dx/hw| + |dy/hh| <= 1
    const dx = Math.abs(worldX - this.safeDiamondCx) / this.safeDiamondHw;
    const dy = Math.abs(worldY - this.safeDiamondCy) / this.safeDiamondHh;
    return dx + dy <= 1;
  }

  /** Check if a point is within `buffer` px of the safe zone diamond edge. */
  private isNearSafe(worldX: number, worldY: number, buffer: number): boolean {
    if (!this.safeDiamondHw) return false;
    const dx =
      Math.abs(worldX - this.safeDiamondCx) / (this.safeDiamondHw + buffer);
    const dy =
      Math.abs(worldY - this.safeDiamondCy) / (this.safeDiamondHh + buffer);
    return dx + dy <= 1;
  }

  private generateSeaBackground(
    bx: number,
    by: number,
    bw: number,
    bh: number,
  ): void {
    const S = 128;
    const key = "__sea_bg__";
    if (!this.textures.exists(key)) {
      const canvas = this.textures.createCanvas(key, S, S)!;
      const ctx = canvas.context;
      const imgData = ctx.createImageData(S, S);
      const d = imgData.data;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const fx = (x / S) * Math.PI * 2;
          const fy = (y / S) * Math.PI * 2;
          const w =
            Math.sin(fx * 3 + fy * 2) * 0.15 +
            Math.sin(fx * 5 - fy * 3) * 0.08 +
            Math.sin(fx * 2 + fy * 7) * 0.06 +
            Math.cos(fx * 4 + fy * 4) * 0.05;
          const idx = (y * S + x) * 4;
          d[idx] = Math.max(0, Math.min(255, (55 + w * 50) | 0));
          d[idx + 1] = Math.max(0, Math.min(255, (140 + w * 40) | 0));
          d[idx + 2] = Math.max(0, Math.min(255, (170 + w * 30) | 0));
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      canvas.refresh();
    }
    const sea = this.add.tileSprite(
      bx + bw / 2,
      by + bh / 2,
      bw + 512,
      bh + 512,
      key,
    );
    sea.setDepth(-10);
  }

  /** DEBUG: Draw green diamond over the safe zone and compute safeRect. */
  private debugDrawSafeZones(): void {
    const oY = GameScene.SAFE_Y_OFFSET;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let found = false;

    for (let ty = 0; ty < this.map.height; ty++) {
      for (let tx = 0; tx < this.map.width; tx++) {
        let isSafe = false;
        for (let i = 1; i <= 5; i++) {
          const layer = this.map.getLayer(`Capa${i}`);
          if (!layer) continue;
          const tile = layer.data[ty][tx];
          if (tile && tile.index !== -1 && tile.properties?.safe) {
            isSafe = true;
            break;
          }
        }
        if (isSafe) {
          found = true;
          const wp = this.map.tileToWorldXY(tx, ty)!;
          const tw = this.map.tileWidth;
          const th = this.map.tileHeight;
          const left = wp.x;
          const right = wp.x + tw;
          const top = wp.y;
          const bot = wp.y + th;
          if (left < minX) minX = left;
          if (right > maxX) maxX = right;
          if (top < minY) minY = top;
          if (bot > maxY) maxY = bot;
        }
      }
    }

    if (!found) return;

    // Expand and shift down
    const expand = 16;
    minX -= expand;
    maxX += expand;
    minY = minY + oY - expand;
    maxY = maxY + oY + expand;

    // Diamond (rombo) center and half-sizes
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const hw = (maxX - minX) / 2; // half width
    const hh = (maxY - minY) / 2; // half height

    // Store bounding rect for quick contains() pre-check
    this.safeRect = new Phaser.Geom.Rectangle(
      minX,
      minY,
      maxX - minX,
      maxY - minY,
    );
    // Store diamond params for actual check
    this.safeDiamondCx = cx;
    this.safeDiamondCy = cy;
    this.safeDiamondHw = hw;
    this.safeDiamondHh = hh;
  }

  private drawMap(): void {
    this.map = this.make.tilemap({ key: "map" });
    const tsTerrain = this.map.addTilesetImage("test", "tiles")!;
    const tsBuild = this.map.addTilesetImage("build", "dungeon")!;
    const allSets = [tsTerrain, tsBuild];

    for (let i = 1; i <= 5; i++) {
      const layer = this.map.createLayer(`Capa${i}`, allSets)!;
      if (i > 1) {
        layer.setPosition(0, -(i - 1) * 16);
      }
      // Capas 4-5 (copas de árboles) se renderizan por encima del player
      // Player depth = sprite.y (cientos/miles), así que usamos 100000+
      if (i >= 4) {
        layer.setDepth(100000 + i);
      } else {
        layer.setDepth(i - 1);
      }
    }
  }

  private drawCastle(): void {
    const c = GameSettings.castle;
    const gfx = this.add.graphics();

    // Castle base/wall
    gfx.fillStyle(0x2a2a3a);
    gfx.fillRect(c.x - c.width / 2, c.y - c.height / 2, c.width, c.height);

    // Darker roof/top
    gfx.fillStyle(0x1a1a2a);
    gfx.fillRect(c.x - c.width / 2, c.y - c.height / 2, c.width, 30);

    // Towers at corners
    const tw = 35;
    const th = 50;
    gfx.fillStyle(0x222233);
    // Top-left tower
    gfx.fillRect(c.x - c.width / 2 - 10, c.y - c.height / 2 - 20, tw, th);
    // Top-right tower
    gfx.fillRect(c.x + c.width / 2 - tw + 10, c.y - c.height / 2 - 20, tw, th);

    // Tower tops (darker)
    gfx.fillStyle(0x15152a);
    gfx.fillTriangle(
      c.x - c.width / 2 - 10,
      c.y - c.height / 2 - 20,
      c.x - c.width / 2 + tw / 2 - 10,
      c.y - c.height / 2 - 40,
      c.x - c.width / 2 + tw - 10,
      c.y - c.height / 2 - 20,
    );
    gfx.fillTriangle(
      c.x + c.width / 2 - tw + 10,
      c.y - c.height / 2 - 20,
      c.x + c.width / 2 - tw / 2 + 10,
      c.y - c.height / 2 - 40,
      c.x + c.width / 2 + 10,
      c.y - c.height / 2 - 20,
    );

    // Gate
    gfx.fillStyle(0x0a0a15);
    gfx.fillRect(c.x - 20, c.y + c.height / 2 - 35, 40, 35);

    // Windows (yellow glow)
    gfx.fillStyle(0xffcc44, 0.6);
    gfx.fillRect(c.x - 50, c.y - 20, 12, 16);
    gfx.fillRect(c.x + 38, c.y - 20, 12, 16);
    gfx.fillRect(c.x - 50, c.y + 20, 12, 16);
    gfx.fillRect(c.x + 38, c.y + 20, 12, 16);

    gfx.setDepth(c.y + c.height / 2);
  }

  private drawBuilding(x: number, y: number, w: number, h: number): void {
    const gfx = this.add.graphics();

    // Wall
    gfx.fillStyle(0x5c4a3a);
    gfx.fillRect(x - w / 2, y - h / 2, w, h);

    // Roof
    gfx.fillStyle(0x3a2a1a);
    gfx.fillRect(x - w / 2 - 4, y - h / 2 - 8, w + 8, 12);

    // Door
    gfx.fillStyle(0x2a1a0a);
    gfx.fillRect(x - 6, y + h / 2 - 16, 12, 16);

    // Window
    gfx.fillStyle(0xddcc88, 0.4);
    gfx.fillRect(x + w / 4, y - 5, 10, 10);

    gfx.setDepth(y + h / 2);
  }

  private drawChurch(x: number, y: number, w: number, h: number): void {
    const gfx = this.add.graphics();

    // Main body
    gfx.fillStyle(0x6a6a7a);
    gfx.fillRect(x - w / 2, y - h / 2, w, h);

    // Steeple
    gfx.fillStyle(0x5a5a6a);
    gfx.fillRect(x - 12, y - h / 2 - 30, 24, 30);
    gfx.fillTriangle(
      x - 14,
      y - h / 2 - 30,
      x,
      y - h / 2 - 50,
      x + 14,
      y - h / 2 - 30,
    );

    // Cross on top
    gfx.fillStyle(0xccccdd);
    gfx.fillRect(x - 2, y - h / 2 - 58, 4, 14);
    gfx.fillRect(x - 6, y - h / 2 - 54, 12, 4);

    // Door
    gfx.fillStyle(0x3a2a1a);
    gfx.fillRect(x - 10, y + h / 2 - 22, 20, 22);

    // Windows
    gfx.fillStyle(0x8888cc, 0.5);
    gfx.fillCircle(x - 25, y - 5, 8);
    gfx.fillCircle(x + 25, y - 5, 8);

    gfx.setDepth(y + h / 2);
  }

  private drawTree(x: number, y: number): void {
    const gfx = this.add.graphics();

    // Trunk
    gfx.fillStyle(0x4a3520);
    gfx.fillRect(x - 4, y - 5, 8, 25);

    // Canopy (dark green, slightly transparent)
    gfx.fillStyle(0x1a4a1a, 0.9);
    gfx.fillCircle(x, y - 15, 20);
    gfx.fillCircle(x - 10, y - 8, 14);
    gfx.fillCircle(x + 10, y - 8, 14);

    // Shadow on ground
    gfx.fillStyle(0x000000, 0.15);
    gfx.fillEllipse(x, y + 18, 30, 10);

    gfx.setDepth(y + 20);
  }

  // ---- Entity Creation ----

  private createPlayer(cx: number, cy: number): void {
    this.player = new Player(this, cx, cy);
  }

  private createVillagers(
    cx: number,
    cy: number,
    countOverride?: number,
  ): void {
    this.villagers = [];
    const safeCheck = (wx: number, wy: number) => this.isNearSafe(wx, wy, 60);
    const groundCheck = (wx: number, wy: number) => this.hasGroundAt(wx, wy);

    const count = countOverride ?? GameSettings.villagers.count;
    for (let i = 0; i < count; i++) {
      let x = 0,
        y = 0;
      // Try to find a non-safe spawn position far from safe zone
      for (let attempt = 0; attempt < 15; attempt++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 500 + Math.random() * 600;
        x = cx + Math.cos(angle) * dist;
        y = cy + Math.sin(angle) * dist;
        if (
          !this.isSafeAt(x, y) &&
          this.hasGroundAt(x, y) &&
          !this.isNearSafe(x, y, 120)
        )
          break;
      }
      const v = new Villager(this, x, y, safeCheck, groundCheck);
      this.villagers.push(v);
    }
  }

  private createArchers(cx: number, cy: number, countOverride?: number): void {
    this.archers = [];
    const safeCheck = (wx: number, wy: number) => this.isNearSafe(wx, wy, 60);
    const groundCheck = (wx: number, wy: number) => this.hasGroundAt(wx, wy);

    const count = countOverride ?? GameSettings.archers.count;
    for (let i = 0; i < count; i++) {
      let x = 0,
        y = 0;
      for (let attempt = 0; attempt < 15; attempt++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 500 + Math.random() * 600;
        x = cx + Math.cos(angle) * dist;
        y = cy + Math.sin(angle) * dist;
        if (
          !this.isSafeAt(x, y) &&
          this.hasGroundAt(x, y) &&
          !this.isNearSafe(x, y, 120)
        )
          break;
      }
      const a = new Archer(this, x, y, safeCheck, groundCheck);
      this.archers.push(a);
    }
  }

  private createMonks(cx: number, cy: number, countOverride?: number): void {
    this.monks = [];
    const safeCheck = (wx: number, wy: number) => this.isNearSafe(wx, wy, 60);
    const groundCheck = (wx: number, wy: number) => this.hasGroundAt(wx, wy);

    const count = countOverride ?? GameSettings.monks.count;
    for (let i = 0; i < count; i++) {
      let x = 0,
        y = 0;
      for (let attempt = 0; attempt < 15; attempt++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 600 + Math.random() * 500;
        x = cx + Math.cos(angle) * dist;
        y = cy + Math.sin(angle) * dist;
        if (
          !this.isSafeAt(x, y) &&
          this.hasGroundAt(x, y) &&
          !this.isNearSafe(x, y, 120)
        )
          break;
      }
      const m = new Monk(this, x, y, safeCheck, groundCheck);
      this.monks.push(m);
    }
  }

  /** Spawn a new wave of enemies with progressive difficulty. */
  private spawnWave(): void {
    // Destroy existing entities
    for (const v of this.villagers) v.destroy();
    for (const a of this.archers) a.destroy();
    for (const m of this.monks) m.destroy();

    const cx = this.safeDiamondCx;
    const cy = this.safeDiamondCy;
    const wave = this.dayNumber;

    // Progressive scaling: more enemies each wave
    const villagerCount = Math.min(
      GameSettings.villagers.count + Math.floor((wave - 1) * 2),
      30,
    );
    const archerCount = Math.min(
      GameSettings.archers.count + Math.floor((wave - 1) * 1.5),
      15,
    );
    const monkCount = Math.min(
      GameSettings.monks.count + Math.floor((wave - 1) * 0.5),
      6,
    );

    this.createVillagers(cx, cy, villagerCount);
    this.createArchers(cx, cy, archerCount);
    this.createMonks(cx, cy, monkCount);

    // Tell UI camera to ignore all newly spawned game objects
    this.syncUiCameraIgnore();

    // Increase blood drain difficulty each wave
    this.blood.incrementCycle();
  }

  /**
   * Make the UI camera ignore every non-UI game object.
   * Called after spawning new entities so they don't render on the HUD layer.
   */
  private syncUiCameraIgnore(): void {
    const uiCam = this.cameras.getCamera("ui");
    if (!uiCam) return;

    const uiElements = new Set([
      ...this.hud.getElements(),
      ...this.joystick.getElements(),
      this.dayNight.getOverlay(),
      this.dayNight.getVignette(),
    ]);
    if (this.biteOverlay) uiElements.add(this.biteOverlay);
    if (this.burnOverlay) uiElements.add(this.burnOverlay);

    for (const child of this.children.list) {
      if (!uiElements.has(child)) {
        uiCam.ignore(child);
      }
    }
  }

  // ---- Phase Changes ----

  private onPhaseChange(phase: Phase): void {
    switch (phase) {
      case "dawn":
        this.hud.showDawnWarning();
        this.playWarningSound();
        break;
      case "day":
        // Day started
        break;
      case "dusk":
        // Getting safe again
        break;
      case "night":
        // Full cycle completed — flag for next castle visit
        this.cycleCompleted = true;
        break;
    }
  }

  // ---- Game Over ----

  private triggerGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    // Stop player
    this.player.sprite.setVelocity(0, 0);
    this.player.sprite.setTint(0x440000);

    // Death effect
    this.cameras.main.shake(300, 0.01);
    this.cameras.main.fade(1000, 0, 0, 0);

    this.playDeathSound();

    // SDK game over
    this.time.delayedCall(1200, () => {
      const sdk = (window as any).FarcadeSDK;
      if (sdk?.singlePlayer?.actions?.gameOver) {
        sdk.singlePlayer.actions.gameOver({ score: this.score });
      }
    });
  }

  private restartGame(): void {
    // Clean up
    this.villagers.forEach((v) => v.destroy());
    this.villagers = [];
    this.archers.forEach((a) => a.destroy());
    this.archers = [];
    this.monks.forEach((m) => m.destroy());
    this.monks = [];
    this.player?.destroy();
    this.dayNight?.destroy();
    this.hud?.destroy();
    this.joystick?.destroy();

    // Restart scene
    this.scene.restart();
  }

  // ---- SDK ----

  private async initSDK(): Promise<void> {
    const sdk = (window as any).FarcadeSDK;
    if (!sdk) return;

    try {
      if (sdk.singlePlayer?.actions?.ready) {
        await sdk.singlePlayer.actions.ready();
      }
    } catch (e) {
      console.warn("SDK ready failed:", e);
    }

    // Play again
    if (sdk.onPlayAgain) {
      sdk.onPlayAgain(() => {
        this.restartGame();
      });
    }

    // Mute toggle
    if (sdk.onToggleMute) {
      sdk.onToggleMute((data: { isMuted: boolean }) => {
        this.isMuted = data.isMuted;
        this.sound.mute = data.isMuted;
      });
    }
  }

  // ---- Audio (Web Audio API) ----

  private playBiteSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Low thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    // Squelch
    const noise = ctx.createOscillator();
    const nGain = ctx.createGain();
    noise.type = "sawtooth";
    noise.frequency.setValueAtTime(300, now);
    noise.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    nGain.gain.setValueAtTime(0.1, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  private playWarningSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Rising alarm tone
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      const t = now + i * 0.2;
      osc.frequency.setValueAtTime(400 + i * 100, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  private playDeathSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  }
}
