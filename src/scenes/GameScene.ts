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

  // Music
  private musicTracks: string[] = ["music1"];
  private currentTrackIndex: number = 0;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private music2Loaded: boolean = false;

  // Tutorial
  private tutorialSeen: boolean = false;

  // Revive
  private hasRevived: boolean = false;
  private reviveModalActive: boolean = false;

  // God Mode (power-up)
  private godModeActive: boolean = false;
  private godModeTimer: number = 0;
  private godModeCooldown: number = 0;
  private powerUpBtn: Phaser.GameObjects.Container | null = null;
  private powerUpBtnTimer: Phaser.GameObjects.Graphics | null = null;
  private godModeAura: Phaser.GameObjects.Graphics | null = null;

  // Coins (collectible currency)
  private coins: number = 0;
  private coinSprites: {
    sprite: Phaser.GameObjects.Arc;
    respawnTimer: number;
    alive: boolean;
  }[] = [];

  // Shop
  private shopBtn: Phaser.GameObjects.Container | null = null;
  private shopModalActive: boolean = false;

  // Shop buffs
  private shadowCloakTimer: number = 0; // ms remaining
  private speedPotionTimer: number = 0; // ms remaining
  private eternalNightPurchased: boolean = false;
  private buffIcons: Phaser.GameObjects.Container | null = null;

  // Kills + game timer
  private kills: number = 0;
  private gameStartTime: number = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.isGameOver = false;
    this.score = 0;
    this.villagersHunted = 0;
    this.lastCycleCount = 0;
    this.dayNumber = 1;
    this.wasInSafe = true;
    this.cycleCompleted = false;
    this.hasRevived = false;
    this.reviveModalActive = false;
    this.godModeActive = false;
    this.godModeTimer = 0;
    this.godModeCooldown = 0;
    this.powerUpBtn = null;
    this.powerUpBtnTimer = null;
    this.godModeAura = null;
    this.coins = 0;
    this.coinSprites = [];
    this.shopBtn = null;
    this.shopModalActive = false;
    this.shadowCloakTimer = 0;
    this.speedPotionTimer = 0;
    this.eternalNightPurchased = false;
    this.buffIcons = null;
    this.kills = 0;
    this.gameStartTime = 0;
    this.introPlaying = true;

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
    // Archers and monks only appear from day 3 onwards — spawn 0 initially
    this.createArchers(spawnX, spawnY, 0);
    this.createMonks(spawnX, spawnY, 0);

    // 4. Systems
    this.blood = new BloodSystem();
    this.dayNight = new DayNightCycle(this, (phase) =>
      this.onPhaseChange(phase),
    );
    this.joystick = new VirtualJoystick(this);
    this.hud = new HUD(this, this.blood, this.dayNight);
    this.hud.update(); // Draw initial blood fill (100%) before intro starts

    // 5. Camera — procedural sea background
    this.cameras.main.setBackgroundColor("#3d8ea8");
    this.generateSeaBackground(boundsX, boundsY, boundsW, boundsH);
    this.cameras.main.setZoom(2.5);
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

    // Power-up button (bottom-right)
    this.createPowerUpButton();

    // Shop button (bottom-left, hidden by default)
    this.createShopButton();

    // Spawn coins across the map
    this.spawnCoins();

    // Tutorial → Intro
    if (!this.tutorialSeen) {
      this.showTutorial(() => this.playIntro());
    } else {
      this.playIntro();
    }
  }

  update(time: number, delta: number): void {
    if (this.isGameOver || this.introPlaying || this.reviveModalActive) return;

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
    // Apply god-mode speed boost by temporarily modifying the setting
    const baseSpeed = 200;
    let activeSpeed = this.godModeActive
      ? Math.round(baseSpeed * GameSettings.godMode.speedMultiplier)
      : baseSpeed;
    // Speed potion buff
    if (this.speedPotionTimer > 0 && !this.godModeActive) {
      activeSpeed = Math.round(
        activeSpeed * GameSettings.shop.speedPotion.speedMultiplier,
      );
    }
    GameSettings.player.speed = activeSpeed;
    if (dir.x !== 0 || dir.y !== 0) {
      const speed = activeSpeed;
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
    const feet = this.player.getFeetPosition();
    const inSafe = this.isSafeAt(feet.x, feet.y);

    for (const v of this.villagers) {
      v.update(dt, playerPos);
    }

    // Archers — update AI + check arrow collisions with player
    for (const archer of this.archers) {
      archer.update(dt, playerPos, inSafe);
      if (!archer.isAlive()) continue;

      // God Mode — kill archers on proximity
      if (this.godModeActive) {
        const distToArcher = Phaser.Math.Distance.Between(
          this.player.sprite.x,
          this.player.sprite.y,
          archer.sprite.x,
          archer.sprite.y,
        );
        if (distToArcher < GameSettings.godMode.killRange) {
          this.spawnBloodBurst(archer.sprite.x, archer.sprite.y);
          archer.die();
          this.kills++;
          this.score += GameSettings.godMode.killScoreArcher;
          this.showBiteEffect();
          this.playBiteSound();
          continue;
        }
      }

      // Check arrow hits on player (skip if in safe zone or god mode)
      if (inSafe || this.godModeActive) continue;
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
      monk.update(dt, playerPos, inSafe);
      if (!monk.isAlive()) continue;

      // God Mode — kill monks on proximity
      if (this.godModeActive) {
        const distToMonk = monk.getDistanceToPlayer(playerPos);
        if (distToMonk < GameSettings.godMode.killRange) {
          this.spawnBloodBurst(monk.sprite.x, monk.sprite.y);
          monk.die();
          this.kills++;
          this.score += GameSettings.godMode.killScoreMonk;
          this.showBiteEffect();
          this.playBiteSound();
          continue;
        }
      }

      // Aura damage (skip if player in safe zone or god mode)
      if (inSafe || this.godModeActive) continue;
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

    // Show "SAFE" message when entering castle
    if (inSafe && !this.wasInSafe) {
      this.showSafeMessage();
      // Pulse shop button when entering castle
      if (this.shopBtn) {
        this.shopBtn.setVisible(true);
        this.shopBtn.setScale(1);
        this.tweens.add({
          targets: this.shopBtn,
          scale: { from: 1.3, to: 1 },
          duration: 400,
          ease: "Back.easeOut",
        });
      }
    }
    if (!inSafe && this.wasInSafe && this.safeRect) {
      // Debug: log when leaving safe to confirm detection works
      console.log(
        "LEFT safe zone, feet:",
        feet.x.toFixed(0),
        feet.y.toFixed(0),
        "diamond:",
        this.safeDiamondCx.toFixed(0),
        this.safeDiamondCy.toFixed(0),
        this.safeDiamondHw.toFixed(0),
        this.safeDiamondHh.toFixed(0),
      );
    }
    this.wasInSafe = inSafe;

    // Coin collection
    this.updateCoins(dt);

    // Shop button — only visible in safe zone
    if (this.shopBtn) {
      this.shopBtn.setVisible(inSafe && !this.godModeActive);
    }

    // God mode cooldown tick
    if (this.godModeCooldown > 0 && !this.godModeActive) {
      this.godModeCooldown -= delta;
      if (this.godModeCooldown < 0) this.godModeCooldown = 0;
      this.updatePowerUpButtonState();
    }

    // Buff timers tick
    if (this.shadowCloakTimer > 0) {
      this.shadowCloakTimer -= delta;
      if (this.shadowCloakTimer < 0) this.shadowCloakTimer = 0;
    }
    if (this.speedPotionTimer > 0) {
      this.speedPotionTimer -= delta;
      if (this.speedPotionTimer < 0) this.speedPotionTimer = 0;
    }
    this.updateBuffIcons();

    // HUD coin + kills counter
    this.hud.setCoins(this.coins);
    this.hud.setKills(this.kills);

    // New day: a full cycle completed AND player is in the castle
    if (this.cycleCompleted && inSafe) {
      this.cycleCompleted = false;
      this.dayNumber++;
      this.lastCycleCount = 0;
      this.spawnWave();
      this.respawnAllCoins();
    }

    let drainMul = 1;
    // Sun damage: gentle until day 10, then ramps up
    const day = this.dayNumber;
    let sunMul: number;
    if (day <= 10) {
      // Very gentle: +2% per day (day 10 = 1.18x)
      sunMul = 1 + (day - 1) * 0.02;
    } else {
      // After day 10: base 1.18 + accelerating increase
      const extra = day - 10;
      sunMul = 1.18 + extra * extra * 0.015;
    }
    if (phase === "day" && !inSafe && this.shadowCloakTimer <= 0) {
      drainMul +=
        (GameSettings.blood.sunDamagePerSecond * sunMul) /
        GameSettings.blood.drainPerSecond;
    } else if (phase === "dawn" && !inSafe && this.shadowCloakTimer <= 0) {
      // Partial sun damage during dawn (scales with progress)
      const dawnProgress = this.dayNight.getPhaseProgress();
      drainMul +=
        ((GameSettings.blood.sunDamagePerSecond * sunMul) /
          GameSettings.blood.drainPerSecond) *
        dawnProgress *
        0.5;
    }

    // God Mode — tick timer and reduce drain
    if (this.godModeActive) {
      this.godModeTimer -= delta;
      if (this.godModeTimer <= 0) {
        this.deactivateGodMode();
      } else {
        drainMul *= GameSettings.godMode.drainMultiplier;
        // Red pulse tint
        const pulse = Math.sin(time * 0.008) * 0.15 + 0.85;
        this.player.sprite.setAlpha(pulse);
        this.player.sprite.setTint(0xff2200);
        // Draw red aura around player (world-space)
        this.drawGodModeAura(time);
      }
      this.drawPowerUpTimerArc();
    } else if (this.godModeAura) {
      this.godModeAura.clear();
    }

    this.blood.update(dt, drainMul);

    // Sun burn visual (tint player red when taking sun damage)
    const isBurningNow =
      (phase === "day" || phase === "dawn") &&
      !inSafe &&
      this.shadowCloakTimer <= 0;
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

  // ---- Music System ----

  private startMusic(): void {
    if (this.isMuted) return;
    this.playCurrentTrack();
    this.lazyLoadMusic2();
  }

  private playCurrentTrack(): void {
    if (this.currentMusic) {
      this.currentMusic.destroy();
      this.currentMusic = null;
    }
    const key = this.musicTracks[this.currentTrackIndex];
    if (!this.cache.audio.exists(key)) return;

    this.currentMusic = this.sound.add(key, { loop: false, volume: 0.35 });
    (this.currentMusic as any).once("complete", () => {
      this.currentTrackIndex =
        (this.currentTrackIndex + 1) % this.musicTracks.length;
      this.playCurrentTrack();
    });
    if (!this.isMuted) {
      (this.currentMusic as any).play();
    }
  }

  private lazyLoadMusic2(): void {
    if (this.music2Loaded) return;
    // Use fetch + decodeAudioData to avoid Phaser loader blocking the game loop
    fetch(
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/music2-NNQFIZ845A-mqdp0b9RTDfztUlMvv6fs1DktzZMbU.mp3?5kkB",
    )
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        if (!this.audioCtx) return;
        return this.audioCtx.decodeAudioData(buf);
      })
      .then((decoded) => {
        if (!decoded || this.music2Loaded) return;
        // Register the decoded audio in Phaser's cache
        this.cache.audio.add("music2", decoded);
        this.music2Loaded = true;
        if (!this.musicTracks.includes("music2")) {
          this.musicTracks.push("music2");
        }
      })
      .catch(() => {
        /* silent fail — music1 keeps playing */
      });
  }

  // ---- Tutorial Overlay ----

  private showTutorial(onDismiss: () => void): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // Start with all elements hidden; reveal after font is ready
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.92)
      .setScrollFactor(0)
      .setDepth(6000)
      .setAlpha(0);
    this.cameras.main.ignore(overlay);

    const title = this.add
      .text(W / 2, H * 0.18, "BEFORE DAWN", {
        fontFamily: "'Creepster', cursive",
        fontSize: "72px",
        color: "#cc0000",
        stroke: "#000000",
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(6001)
      .setAlpha(0);
    this.cameras.main.ignore(title);

    const lines = [
      "🩸  Your blood drains each night.",
      "Hunt villagers to survive.",
      "",
      "⚔️  Beware archers and monks.",
      "They fight back.",
      "",
      "☀️  Sunlight burns you.",
      "Return to the castle at dawn.",
    ];

    const body = this.add
      .text(W / 2, H * 0.45, lines.join("\n"), {
        fontFamily: "'Creepster', cursive",
        fontSize: "34px",
        color: "#dddddd",
        stroke: "#000000",
        strokeThickness: 5,
        align: "center",
        lineSpacing: 10,
        wordWrap: { width: W - 80 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(6001)
      .setAlpha(0);
    this.cameras.main.ignore(body);

    const tap = this.add
      .text(W / 2, H * 0.85, "Tap anywhere to begin", {
        fontFamily: "'Creepster', cursive",
        fontSize: "30px",
        color: "#888888",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(6001)
      .setAlpha(0);
    this.cameras.main.ignore(tap);

    // Wait for Creepster font to actually load, then reveal with re-rendered text
    const reveal = () => {
      // Force Phaser to re-measure with loaded font
      title.setText(title.text);
      body.setText(body.text);
      tap.setText(tap.text);

      // Fade in all elements
      this.tweens.add({
        targets: [overlay, title, body, tap],
        alpha: 1,
        duration: 400,
        ease: "Power2",
      });

      // Pulse the tap text
      this.tweens.add({
        targets: tap,
        alpha: 0.3,
        duration: 900,
        yoyo: true,
        repeat: -1,
        delay: 400,
      });
    };

    // Font is preloaded in main.ts — reveal immediately
    reveal();

    overlay.setInteractive();
    overlay.once("pointerdown", () => {
      this.tweens.killTweensOf(tap);
      this.tweens.add({
        targets: [overlay, title, body, tap],
        alpha: 0,
        duration: 400,
        ease: "Power2",
        onComplete: () => {
          overlay.destroy();
          title.destroy();
          body.destroy();
          tap.destroy();
          // Mark tutorial seen
          this.tutorialSeen = true;
          onDismiss();
        },
      });
    });
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
            this.gameStartTime = this.time.now;
            this.physics.resume();
            this.startMusic();
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
        duration: 400,
        ease: "Power2",
        onComplete: () => {
          // Hold, then fade out
          this.time.delayedCall(500, () => {
            this.tweens.add({
              targets: txt,
              alpha: 0,
              duration: 350,
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
    this.kills += killCount;
    this.score += GameSettings.scoring.perVillager * killCount;
    const bloodAmount =
      killCount > 1
        ? GameSettings.blood.multiHuntRestore
        : GameSettings.blood.huntRestore;
    this.blood.addBlood(bloodAmount);
    if (killCount > 1) {
      this.playMultiFeedSound();
      this.showMultiKillUI(killCount);
    } else {
      this.playFeedSound();
    }
    if (killCount <= 1) this.showBiteEffect();
    if (navigator.vibrate) navigator.vibrate(50);
  }

  /** Previous multi-kill UI text — destroy before showing a new one. */
  private multiKillLabel: Phaser.GameObjects.Text | null = null;
  private multiKillBlood: Phaser.GameObjects.Text | null = null;

  private showMultiKillUI(killCount: number): void {
    // Destroy previous if still alive
    if (this.multiKillLabel) {
      this.tweens.killTweensOf(this.multiKillLabel);
      this.multiKillLabel.destroy();
      this.multiKillLabel = null;
    }
    if (this.multiKillBlood) {
      this.tweens.killTweensOf(this.multiKillBlood);
      this.multiKillBlood.destroy();
      this.multiKillBlood = null;
    }

    const cx = this.scale.width / 2;
    const cy = this.scale.height * 0.38;
    const label = killCount >= 3 ? "BLOOD FEAST!" : "DOUBLE BITE!";
    const restore = GameSettings.blood.multiHuntRestore;

    // Label text — placed on UI camera coords
    const labelText = this.add
      .text(cx, cy, label, {
        fontFamily: "'Creepster', cursive",
        fontSize: "36px",
        color: "#ff2222",
        stroke: "#220000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(7002)
      .setScale(0.5);

    // Blood amount below
    const bloodText = this.add
      .text(cx, cy + 36, `+${restore}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "28px",
        color: "#ff6644",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(7002)
      .setAlpha(0);

    this.multiKillLabel = labelText;
    this.multiKillBlood = bloodText;

    // Make main camera ignore these (UI only)
    this.cameras.main.ignore(labelText);
    this.cameras.main.ignore(bloodText);
    // Make UI camera see them
    const uiCam = this.cameras.getCamera("ui");
    if (uiCam) {
      // They're new objects — UI cam needs to NOT ignore them
      // syncUiCameraIgnore would ignore them, so we skip that
    }

    // Pop-in scale then float up and fade
    this.tweens.add({
      targets: labelText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: labelText,
          y: cy - 40,
          alpha: 0,
          scaleX: 1.4,
          scaleY: 1.4,
          duration: 1800,
          ease: "Power1",
          onComplete: () => {
            labelText.destroy();
            this.multiKillLabel = null;
          },
        });
      },
    });

    // Blood text fades in then floats up
    this.tweens.add({
      targets: bloodText,
      alpha: 1,
      duration: 150,
      onComplete: () => {
        this.tweens.add({
          targets: bloodText,
          y: cy - 10,
          alpha: 0,
          duration: 1600,
          ease: "Power1",
          onComplete: () => {
            bloodText.destroy();
            this.multiKillBlood = null;
          },
        });
      },
    });
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

  /** Spawn a blood particle burst at a world position (for god mode kills). */
  private spawnBloodBurst(wx: number, wy: number): void {
    const key = "__blood_drop__";
    if (!this.textures.exists(key)) {
      const g = this.add.graphics();
      g.fillStyle(0xcc0000, 1);
      g.fillCircle(3, 3, 3);
      g.generateTexture(key, 6, 6);
      g.destroy();
    }

    const emitter = this.add.particles(wx, wy, key, {
      speed: { min: 40, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      quantity: 12,
      tint: [0xcc0000, 0x880000, 0xff2200],
      emitting: false,
    });
    emitter.setDepth(5000);
    emitter.explode(12);

    // Auto-destroy after particles are done
    this.time.delayedCall(600, () => emitter.destroy());
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
      .setDepth(7002)
      .setAlpha(0);

    this.safeText = txt;

    // Show only on UI camera
    this.cameras.main.ignore(txt);

    // Pulse glow: quick green flash on the whole screen
    const flash = this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        0x44ff88,
        0.15,
      )
      .setDepth(7001);
    this.cameras.main.ignore(flash);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 600,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (flash.active) flash.destroy();
      },
    });

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
    let minTx = Infinity,
      minTy = Infinity,
      maxTx = -Infinity,
      maxTy = -Infinity;
    let found = false;

    // Find tile-space bounding rectangle of all safe tiles
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
          if (tx < minTx) minTx = tx;
          if (tx > maxTx) maxTx = tx;
          if (ty < minTy) minTy = ty;
          if (ty > maxTy) maxTy = ty;
        }
      }
    }

    if (!found) return;

    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;

    // Compute 4 isometric diamond vertices from tile-space corners.
    // For isometric tiles, tileToWorldXY returns top-left of bounding box.
    // Each tile's diamond: top=(x+tw/2, y), right=(x+tw, y+th/2),
    //   bottom=(x+tw/2, y+th), left=(x, y+th/2)
    //
    // The iso diamond of tile block [minTx..maxTx, minTy..maxTy]:
    //   Top    = top point of tile (minTx, minTy)
    //   Right  = right point of tile (maxTx, minTy)
    //   Bottom = bottom point of tile (maxTx, maxTy)
    //   Left   = left point of tile (minTx, maxTy)

    const pTop = this.map.tileToWorldXY(minTx, minTy)!;
    const pRight = this.map.tileToWorldXY(maxTx, minTy)!;
    const pBottom = this.map.tileToWorldXY(maxTx, maxTy)!;
    const pLeft = this.map.tileToWorldXY(minTx, maxTy)!;

    const topX = pTop.x + tw / 2;
    const topY = pTop.y + oY;
    const rightX = pRight.x + tw;
    const rightY = pRight.y + th / 2 + oY;
    const bottomX = pBottom.x + tw / 2;
    const bottomY = pBottom.y + th + oY;
    const leftX = pLeft.x;
    const leftY = pLeft.y + th / 2 + oY;

    // Diamond center and half-sizes (axis-aligned diamond from these 4 vertices)
    const cx = (leftX + rightX) / 2;
    const cy = (topY + bottomY) / 2;
    // Proportional expansion (~15%)
    const scale = 1.15;
    const hw = ((rightX - leftX) / 2) * scale;
    const hh = ((bottomY - topY) / 2) * scale;

    // Store bounding rect for quick AABB pre-check
    this.safeRect = new Phaser.Geom.Rectangle(cx - hw, cy - hh, hw * 2, hh * 2);
    // Store diamond params for point-in-diamond check
    this.safeDiamondCx = cx;
    this.safeDiamondCy = cy;
    this.safeDiamondHw = hw;
    this.safeDiamondHh = hh;

    // Draw green aura border around safe zone diamond
    const gfx = this.add.graphics();
    gfx.lineStyle(5, 0x44ff44, 0.5);
    gfx.beginPath();
    gfx.moveTo(cx, cy - hh);
    gfx.lineTo(cx + hw, cy);
    gfx.lineTo(cx, cy + hh);
    gfx.lineTo(cx - hw, cy);
    gfx.closePath();
    gfx.strokePath();
    gfx.setDepth(1);

    // Generate small green glow particle texture
    if (!this.textures.exists("safe-particle")) {
      const pg = this.add.graphics();
      pg.fillStyle(0x88ff88, 1);
      pg.fillCircle(4, 4, 4);
      pg.generateTexture("safe-particle", 8, 8);
      pg.destroy();
    }

    // Spawn floating particles along the diamond perimeter
    const emitter = this.add.particles(0, 0, "safe-particle", {
      emitZone: {
        type: "edge",
        source: new Phaser.Geom.Polygon([
          cx,
          cy - hh,
          cx + hw,
          cy,
          cx,
          cy + hh,
          cx - hw,
          cy,
        ]),
        quantity: 48,
      },
      lifespan: 1800,
      speed: { min: 5, max: 15 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.6, end: 0 },
      frequency: 120,
      tint: [0x44ff44, 0x88ffaa, 0xaaffcc],
      blendMode: "ADD",
    });
    emitter.setDepth(2);
  }

  private drawMap(): void {
    this.map = this.make.tilemap({ key: "map" });
    const tsTerrain = this.map.addTilesetImage("test", "tiles")!;
    const allSets = [tsTerrain];

    for (let i = 1; i <= 5; i++) {
      const layer = this.map.createLayer(`Capa${i}`, allSets)!;
      if (i > 1) {
        layer.setPosition(0, -(i - 1) * 16);
      }
      // Solo capas 4-5 (copas de árboles) por encima del player
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

  private spawnEntitiesAt(
    count: number,
    factory: (x: number, y: number) => void,
  ): void {
    // Circular exclusion zone around castle
    const safeCx = this.safeDiamondCx;
    const safeCy = this.safeDiamondCy;
    const minSpawnDist = 300;
    const minSpawnDist2 = minSpawnDist * minSpawnDist;

    // Iterate ALL ground tiles; skip edge tiles via tile-space neighbor check
    const layer = this.map.getLayer("Capa1");
    if (!layer) return;
    const tw = this.map.tileWidth;
    const th = this.map.tileHeight;
    const W = layer.width;
    const H = layer.height;
    const isGround = (ttx: number, tty: number): boolean => {
      if (ttx < 0 || tty < 0 || ttx >= W || tty >= H) return false;
      const t = layer.data[tty][ttx];
      return t != null && t.index !== -1 && t.index !== GameScene.WATER_GID;
    };

    // Collect all valid positions
    const pool: { x: number; y: number }[] = [];

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (!isGround(tx, ty)) continue;
        if (
          !isGround(tx - 1, ty) ||
          !isGround(tx + 1, ty) ||
          !isGround(tx, ty - 1) ||
          !isGround(tx, ty + 1)
        )
          continue;
        const wp = this.map.tileToWorldXY(tx, ty)!;
        if (!wp) continue;
        const x = wp.x + tw / 2;
        const y = wp.y + th / 2;
        // Circular distance from castle
        const ddx = x - safeCx;
        const ddy = y - safeCy;
        if (ddx * ddx + ddy * ddy < minSpawnDist2) continue;
        if (this.isSafeAt(x, y)) continue;
        pool.push({ x, y });
      }
    }

    if (pool.length === 0) return;

    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    // Spawn with jitter
    for (let i = 0; i < count; i++) {
      const pos = pool[i % pool.length];
      let fx = pos.x;
      let fy = pos.y;
      const jx = pos.x + (Math.random() - 0.5) * 60;
      const jy = pos.y + (Math.random() - 0.5) * 60;
      if (
        this.hasGroundAt(jx, jy) &&
        this.hasGroundAt(jx - 28, jy) &&
        this.hasGroundAt(jx + 28, jy) &&
        this.hasGroundAt(jx, jy - 28) &&
        this.hasGroundAt(jx, jy + 28)
      ) {
        fx = jx;
        fy = jy;
      }
      factory(fx, fy);
    }
  }

  private createVillagers(
    cx: number,
    cy: number,
    countOverride?: number,
  ): void {
    this.villagers = [];
    const count = countOverride ?? GameSettings.villagers.count;
    this.addVillagers(count);
  }

  private addVillagers(count: number): void {
    const safeCheck = (wx: number, wy: number) => this.isNearSafe(wx, wy, 60);
    const groundCheck = (wx: number, wy: number) => this.hasGroundAt(wx, wy);
    this.spawnEntitiesAt(count, (x, y) => {
      const v = new Villager(this, x, y, safeCheck, groundCheck);
      this.villagers.push(v);
    });
  }

  private createArchers(cx: number, cy: number, countOverride?: number): void {
    this.archers = [];
    const count = countOverride ?? GameSettings.archers.count;
    this.addArchers(count);
  }

  private addArchers(count: number): void {
    const safeCheck = (wx: number, wy: number) => this.isNearSafe(wx, wy, 60);
    const groundCheck = (wx: number, wy: number) => this.hasGroundAt(wx, wy);
    this.spawnEntitiesAt(count, (x, y) => {
      const a = new Archer(this, x, y, safeCheck, groundCheck);
      this.archers.push(a);
    });
  }

  private createMonks(cx: number, cy: number, countOverride?: number): void {
    this.monks = [];
    const count = countOverride ?? GameSettings.monks.count;
    this.addMonks(count);
  }

  private addMonks(count: number): void {
    const safeCheck = (wx: number, wy: number) => this.isNearSafe(wx, wy, 60);
    const groundCheck = (wx: number, wy: number) => this.hasGroundAt(wx, wy);
    this.spawnEntitiesAt(count, (x, y) => {
      const m = new Monk(this, x, y, safeCheck, groundCheck);
      this.monks.push(m);
    });
  }

  /** Spawn a new wave of enemies with progressive difficulty. */
  private spawnWave(): void {
    const wave = this.dayNumber;

    // Target counts for this wave — no increase until day 5, then slow ramp
    const rampWave = Math.max(0, wave - 5);
    const targetVillagers = Math.min(
      GameSettings.villagers.count + Math.floor(rampWave * 1),
      40,
    );
    // Archers and monks only appear from day 3 onwards
    const targetArchers =
      wave < 3
        ? 0
        : Math.min(GameSettings.archers.count + Math.floor(rampWave * 0.6), 18);
    const targetMonks =
      wave < 3
        ? 0
        : Math.min(GameSettings.monks.count + Math.floor(rampWave * 0.25), 8);

    // Count currently alive entities
    const aliveVillagers = this.villagers.filter((v) => v.isAlive()).length;
    const aliveArchers = this.archers.filter((a) => a.isAlive()).length;
    const aliveMonks = this.monks.filter((m) => m.sprite?.active).length;

    // Only add the missing ones
    const addV = Math.max(0, targetVillagers - aliveVillagers);
    const addA = Math.max(0, targetArchers - aliveArchers);
    const addM = Math.max(0, targetMonks - aliveMonks);

    // Progressive stat scaling — flat until day 5, then slow ramp
    const speedMul = 1 + rampWave * 0.03; // +3% speed per wave after 5
    GameSettings.villagers.speed = Math.round(35 * speedMul);
    GameSettings.villagers.fleeSpeed = Math.round(90 * speedMul);
    GameSettings.archers.speed = Math.round(45 * speedMul);
    GameSettings.archers.arrowSpeed = Math.round(250 * (1 + rampWave * 0.025));
    GameSettings.archers.shotCooldown = Math.max(
      1200,
      Math.round(2200 * (1 - rampWave * 0.025)),
    );
    GameSettings.archers.detectRange = Math.min(380, 280 + rampWave * 6);
    GameSettings.monks.speed = Math.round(55 * speedMul);
    GameSettings.monks.chaseSpeed = Math.round(75 * speedMul);
    GameSettings.monks.auraDamagePerSecond = Math.round(
      15 * (1 + rampWave * 0.05),
    );

    if (addV > 0) this.addVillagers(addV);
    if (addA > 0) this.addArchers(addA);
    if (addM > 0) this.addMonks(addM);

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
    if (this.safeText) uiElements.add(this.safeText);
    if (this.multiKillLabel) uiElements.add(this.multiKillLabel);
    if (this.multiKillBlood) uiElements.add(this.multiKillBlood);
    if (this.powerUpBtn) uiElements.add(this.powerUpBtn);
    if (this.powerUpBtnTimer) uiElements.add(this.powerUpBtnTimer);
    if (this.shopBtn) uiElements.add(this.shopBtn);
    if (this.buffIcons) uiElements.add(this.buffIcons);

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
        this.hud.showDayWarning();
        this.playWarningSound();
        break;
      case "day":
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
    if (this.isGameOver || this.reviveModalActive) return;

    const cost = GameSettings.coins.reviveCost;
    if (this.coins >= cost) {
      // Player can afford to revive — show modal with cost
      this.showReviveModal();
      return;
    }

    // Not enough coins — game over directly
    this.executeGameOver();
  }

  private executeGameOver(): void {
    this.isGameOver = true;
    this.godModeActive = false;
    this.godModeTimer = 0;

    // Stop player
    this.player.sprite.setVelocity(0, 0);
    this.player.sprite.setTint(0x440000);

    // Death effect
    this.cameras.main.shake(300, 0.01);
    this.cameras.main.fade(1000, 0, 0, 0);

    this.playDeathSound();

    // Haptic feedback on death
    if (navigator.vibrate) navigator.vibrate(100);

    // Show game over UI after fade
    this.time.delayedCall(1200, () => {
      this.showGameOverUI();
    });
  }

  private showGameOverUI(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // Calculate game duration
    const elapsed = this.time.now - this.gameStartTime;
    const totalSecs = Math.floor(elapsed / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    // Dark overlay
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.92)
      .setScrollFactor(0)
      .setDepth(8000);
    this.cameras.main.ignore(overlay);

    // Title
    const title = this.add
      .text(W / 2, H * 0.22, "YOU DIED", {
        fontFamily: "'Creepster', cursive",
        fontSize: "56px",
        color: "#cc0000",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    this.cameras.main.ignore(title);

    // Kills
    const killsTxt = this.add
      .text(W / 2, H * 0.33, `💀 Kills: ${this.kills}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "32px",
        color: "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    this.cameras.main.ignore(killsTxt);

    // Duration
    const durationTxt = this.add
      .text(W / 2, H * 0.39, `⏱ Survived: ${durationStr}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "28px",
        color: "#cccccc",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    this.cameras.main.ignore(durationTxt);

    // Night survived
    const waveTxt = this.add
      .text(W / 2, H * 0.45, `Night ${this.dayNumber}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "24px",
        color: "#999999",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    this.cameras.main.ignore(waveTxt);

    // Play Again button
    const btnW = 280;
    const btnH = 64;
    const btnBg = this.add
      .rectangle(W / 2, H * 0.58, btnW, btnH, 0x880000, 1)
      .setStrokeStyle(2, 0xcc0000)
      .setScrollFactor(0)
      .setDepth(8001)
      .setInteractive({ useHandCursor: true });
    this.cameras.main.ignore(btnBg);

    const btnTxt = this.add
      .text(W / 2, H * 0.58, "🦇  PLAY AGAIN", {
        fontFamily: "'Creepster', cursive",
        fontSize: "28px",
        color: "#ffffff",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8002);
    this.cameras.main.ignore(btnTxt);

    btnBg.on("pointerdown", () => {
      this.restartGame();
    });

    btnBg.on("pointerover", () => {
      btnBg.setFillStyle(0xaa0000);
    });
    btnBg.on("pointerout", () => {
      btnBg.setFillStyle(0x880000);
    });
  }

  private showReviveModal(): void {
    this.reviveModalActive = true;
    this.physics.pause();
    this.player.sprite.setVelocity(0, 0);

    const W = this.scale.width;
    const H = this.scale.height;
    const cost = GameSettings.coins.reviveCost;

    // Dark overlay
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setScrollFactor(0)
      .setDepth(7000);
    this.cameras.main.ignore(overlay);

    // Skull / death text
    const skull = this.add
      .text(W / 2, H * 0.25, "💀", { fontSize: "72px" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(7001);
    this.cameras.main.ignore(skull);

    const title = this.add
      .text(W / 2, H * 0.35, "You have fallen...", {
        fontFamily: "'Creepster', cursive",
        fontSize: "40px",
        color: "#cc0000",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(7001);
    this.cameras.main.ignore(title);

    const subtitle = this.add
      .text(W / 2, H * 0.42, `💀 ${this.kills}  •  Night ${this.dayNumber}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "24px",
        color: "#dddddd",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(7001);
    this.cameras.main.ignore(subtitle);

    // Revive button
    const reviveBg = this.add
      .rectangle(W / 2, H * 0.56, 320, 70, 0x880000)
      .setScrollFactor(0)
      .setDepth(7001)
      .setInteractive({ useHandCursor: true });
    this.cameras.main.ignore(reviveBg);

    const reviveTxt = this.add
      .text(W / 2, H * 0.54, "🩸 REVIVE", {
        fontFamily: "'Creepster', cursive",
        fontSize: "32px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(7002);
    this.cameras.main.ignore(reviveTxt);

    // Cost badge below the revive button text
    const costBadge = this.add
      .text(W / 2, H * 0.59, `Cost: 🩸 ${cost}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "18px",
        color: "#ff8888",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(7002);
    this.cameras.main.ignore(costBadge);

    // End game button
    const endBg = this.add
      .rectangle(W / 2, H * 0.69, 320, 60, 0x333333)
      .setScrollFactor(0)
      .setDepth(7001)
      .setInteractive({ useHandCursor: true });
    this.cameras.main.ignore(endBg);

    const endTxt = this.add
      .text(W / 2, H * 0.69, "End Game", {
        fontFamily: "'Creepster', cursive",
        fontSize: "26px",
        color: "#888888",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(7002);
    this.cameras.main.ignore(endTxt);

    const allElements = [
      overlay,
      skull,
      title,
      subtitle,
      reviveBg,
      reviveTxt,
      costBadge,
      endBg,
      endTxt,
    ];

    const destroyModal = () => {
      allElements.forEach((el) => el.destroy());
    };

    // Revive button → spend coins
    reviveBg.on("pointerdown", () => {
      this.coins -= cost;
      destroyModal();
      this.revivePlayer();
    });

    // End game button
    endBg.on("pointerdown", () => {
      destroyModal();
      this.reviveModalActive = false;
      this.executeGameOver();
    });
  }

  private revivePlayer(): void {
    this.hasRevived = true;
    this.reviveModalActive = false;

    // Refill blood
    this.blood.addBlood(this.blood.getMaxBlood());

    // Visual reset
    this.player.sprite.clearTint();
    this.player.sprite.setAlpha(1);

    // Resume physics
    this.physics.resume();

    // Flash feedback
    this.cameras.main.flash(500, 200, 0, 0);

    // Brief invincibility visual
    this.tweens.add({
      targets: this.player.sprite,
      alpha: { from: 0.3, to: 1 },
      duration: 200,
      repeat: 4,
      yoyo: true,
    });

    // Update HUD immediately
    this.hud.update();

    // Resume music if it stopped
    if (!this.isMuted) {
      if (!this.currentMusic || !(this.currentMusic as any).isPlaying) {
        this.playCurrentTrack();
      }
    }
  }

  // ---- God Mode Power-Up ----

  private createPowerUpButton(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const btnSize = 72;
    const margin = 24;
    const bx = W - margin - btnSize / 2;
    const by = H - margin - btnSize / 2 - 110; // above joystick area

    // Container for the button (UI-space)
    const container = this.add
      .container(bx, by)
      .setScrollFactor(0)
      .setDepth(6500);
    this.cameras.main.ignore(container);

    // Gothic hexagonal bg using graphics
    const bg = this.add.graphics();
    // Octagonal shape
    const s = btnSize / 2;
    const c = s * 0.38; // corner cut
    bg.fillStyle(0x1a0008, 0.92);
    bg.beginPath();
    bg.moveTo(-s + c, -s);
    bg.lineTo(s - c, -s);
    bg.lineTo(s, -s + c);
    bg.lineTo(s, s - c);
    bg.lineTo(s - c, s);
    bg.lineTo(-s + c, s);
    bg.lineTo(-s, s - c);
    bg.lineTo(-s, -s + c);
    bg.closePath();
    bg.fillPath();
    // Border
    bg.lineStyle(2, 0x880000, 0.9);
    bg.beginPath();
    bg.moveTo(-s + c, -s);
    bg.lineTo(s - c, -s);
    bg.lineTo(s, -s + c);
    bg.lineTo(s, s - c);
    bg.lineTo(s - c, s);
    bg.lineTo(-s + c, s);
    bg.lineTo(-s, s - c);
    bg.lineTo(-s, -s + c);
    bg.closePath();
    bg.strokePath();
    container.add(bg);

    // Bat / skull icon text (gothic)
    const icon = this.add
      .text(0, -2, "🦇", { fontSize: "40px" })
      .setOrigin(0.5);
    container.add(icon);

    // Small label
    const label = this.add
      .text(0, s + 10, "BLOOD", {
        fontFamily: "'Creepster', cursive",
        fontSize: "18px",
        color: "#cc0000",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    container.add(label);

    this.powerUpBtn = container;

    // Timer arc overlay (drawn when god mode active)
    this.powerUpBtnTimer = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(6502);
    this.cameras.main.ignore(this.powerUpBtnTimer);

    // Interactive hit area on the container
    container.setSize(btnSize + 20, btnSize + 20);
    container.setInteractive({ useHandCursor: true });

    // Initial visual state
    this.updatePowerUpButtonState();

    // Click handler
    container.on("pointerdown", () => {
      if (
        this.godModeActive ||
        this.godModeCooldown > 0 ||
        this.isGameOver ||
        this.introPlaying ||
        this.reviveModalActive ||
        this.shopModalActive
      )
        return;

      this.activateGodMode();
    });

    // Create god-mode aura graphics (world-space, around player)
    this.godModeAura = this.add.graphics();
  }

  private updatePowerUpButtonState(): void {
    if (!this.powerUpBtn) return;

    this.powerUpBtn.setVisible(true);
    if (this.powerUpBtnTimer) this.powerUpBtnTimer.setVisible(true);

    const icon = this.powerUpBtn.getAt(1) as Phaser.GameObjects.Text;
    const label = this.powerUpBtn.getAt(2) as Phaser.GameObjects.Text;

    if (this.godModeActive) {
      this.powerUpBtn.setAlpha(1);
      this.powerUpBtn.setScale(1);
      icon.setAlpha(1);
      label.setText("ACTIVE");
      label.setColor("#ff4400");
    } else if (this.godModeCooldown > 0) {
      // On cooldown — show remaining seconds
      const secs = Math.ceil(this.godModeCooldown / 1000);
      this.powerUpBtn.setAlpha(0.5);
      this.powerUpBtn.setScale(1);
      icon.setText("🦇");
      icon.setAlpha(0.4);
      label.setText(`${secs}s`);
      label.setColor("#888888");
      // Draw cooldown arc
      this.drawCooldownArc();
    } else {
      this.powerUpBtn.setAlpha(1);
      this.powerUpBtn.setScale(1);
      icon.setText("🦇");
      icon.setAlpha(1);
      label.setText("READY!");
      label.setColor("#44ff44");
    }
  }

  private drawCooldownArc(): void {
    if (!this.powerUpBtnTimer || !this.powerUpBtn) return;
    this.powerUpBtnTimer.clear();
    if (this.godModeCooldown <= 0) return;

    const progress = this.godModeCooldown / GameSettings.godMode.cooldown;
    const cx = this.powerUpBtn.x;
    const cy = this.powerUpBtn.y;
    const r = 40;

    // Gray cooldown arc
    this.powerUpBtnTimer.lineStyle(4, 0x666666, 0.7);
    this.powerUpBtnTimer.beginPath();
    this.powerUpBtnTimer.arc(
      cx,
      cy,
      r,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * progress),
      false,
    );
    this.powerUpBtnTimer.strokePath();
  }

  private drawPowerUpTimerArc(): void {
    if (!this.powerUpBtnTimer || !this.powerUpBtn) return;
    this.powerUpBtnTimer.clear();

    if (!this.godModeActive) return;

    const progress = this.godModeTimer / GameSettings.godMode.duration;
    if (progress <= 0) return;

    const cx = this.powerUpBtn.x;
    const cy = this.powerUpBtn.y;
    const r = 40;

    // Red blood-like arc
    this.powerUpBtnTimer.lineStyle(5, 0xcc0000, 0.9);
    this.powerUpBtnTimer.beginPath();
    this.powerUpBtnTimer.arc(
      cx,
      cy,
      r,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * progress),
      false,
    );
    this.powerUpBtnTimer.strokePath();
  }

  private drawGodModeAura(time: number): void {
    if (!this.godModeAura) return;
    this.godModeAura.clear();

    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    const pulse = Math.sin(time * 0.006) * 8 + 48;
    const pulse2 = Math.sin(time * 0.004 + 1) * 12 + 64;

    // Outer blood mist
    this.godModeAura.fillStyle(0xff0000, 0.08);
    this.godModeAura.fillCircle(px, py, pulse2);

    // Mid glow
    this.godModeAura.fillStyle(0xcc0000, 0.15);
    this.godModeAura.fillCircle(px, py, pulse);

    // Inner core
    this.godModeAura.fillStyle(0xff2200, 0.25);
    this.godModeAura.fillCircle(px, py, 28);

    // Ring
    this.godModeAura.lineStyle(2, 0xff0000, 0.4);
    this.godModeAura.strokeCircle(px, py, pulse);

    this.godModeAura.setDepth(this.player.sprite.y - 2);
  }

  private activateGodMode(): void {
    if (this.godModeActive || this.godModeCooldown > 0) return;

    // Pause game and play transformation animation
    this.playTransformationCutscene(() => {
      // After cutscene: enable god mode
      this.godModeActive = true;
      this.godModeTimer = GameSettings.godMode.duration;

      this.player.sprite.setTint(0xff2200);

      // Haptic
      if (navigator.vibrate) navigator.vibrate(50);

      this.updatePowerUpButtonState();
    });
  }

  private playTransformationCutscene(onComplete: () => void): void {
    // Pause game logic
    this.physics.pause();
    const wasPaused = this.introPlaying;
    this.introPlaying = true; // blocks update loop

    // Freeze all entity sprite animations so the world looks frozen
    for (const v of this.villagers) v.sprite?.anims?.pause();
    for (const a of this.archers) a.sprite?.anims?.pause();
    for (const m of this.monks) m.sprite?.anims?.pause();
    this.player?.sprite?.anims?.pause();

    const W = this.scale.width;
    const H = this.scale.height;

    // Dark overlay
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.92)
      .setScrollFactor(0)
      .setDepth(8000);
    this.cameras.main.ignore(overlay);

    // Create the animation if it doesn't exist
    if (!this.anims.exists("dracula-god-transform")) {
      this.anims.create({
        key: "dracula-god-transform",
        frames: this.anims.generateFrameNumbers("dracula-god", {
          start: 0,
          end: 24,
        }),
        frameRate: 14,
        repeat: 0,
      });
    }

    // Sprite — centered, large
    const spriteSize = Math.min(W, H) * 0.7;
    const transformSprite = this.add
      .sprite(W / 2, H * 0.45, "dracula-god", 0)
      .setScrollFactor(0)
      .setDepth(8001)
      .setAlpha(0);
    // Scale to fill screen portion
    const frameScale = spriteSize / 256;
    transformSprite.setScale(frameScale);
    this.cameras.main.ignore(transformSprite);

    // Title text
    const titleText = this.add
      .text(W / 2, H * 0.78, "BLOOD AWAKENING", {
        fontFamily: "'Creepster', cursive",
        fontSize: "38px",
        color: "#ff0000",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8002)
      .setAlpha(0);
    this.cameras.main.ignore(titleText);

    // Red vignette particles (using graphics)
    const redFlash = this.add
      .rectangle(W / 2, H / 2, W, H, 0xff0000, 0)
      .setScrollFactor(0)
      .setDepth(7999);
    this.cameras.main.ignore(redFlash);

    // Play sound
    this.playGodModeSound();

    // Fade in
    this.tweens.add({
      targets: [overlay],
      alpha: 0.92,
      duration: 200,
    });

    this.tweens.add({
      targets: transformSprite,
      alpha: 1,
      duration: 300,
      delay: 100,
      onComplete: () => {
        // Play the sprite animation
        transformSprite.play("dracula-god-transform");

        // Red flash pulse during animation
        this.tweens.add({
          targets: redFlash,
          alpha: 0.15,
          duration: 200,
          yoyo: true,
          repeat: 3,
          delay: 200,
        });

        // Title fade in
        this.tweens.add({
          targets: titleText,
          alpha: 1,
          duration: 400,
          delay: 400,
        });

        // When animation finishes
        transformSprite.once("animationcomplete", () => {
          // Hold for a moment then fade out
          this.time.delayedCall(400, () => {
            this.tweens.add({
              targets: [overlay, transformSprite, titleText, redFlash],
              alpha: 0,
              duration: 400,
              ease: "Power2",
              onComplete: () => {
                overlay.destroy();
                transformSprite.destroy();
                titleText.destroy();
                redFlash.destroy();
                // Resume game
                // Resume entity sprite animations
                for (const v of this.villagers) v.sprite?.anims?.resume();
                for (const a of this.archers) a.sprite?.anims?.resume();
                for (const m of this.monks) m.sprite?.anims?.resume();
                this.player?.sprite?.anims?.resume();

                this.introPlaying = wasPaused;
                this.physics.resume();
                onComplete();
              },
            });
          });
        });
      },
    });
  }

  private deactivateGodMode(): void {
    this.godModeActive = false;
    this.godModeTimer = 0;

    // Start cooldown
    this.godModeCooldown = GameSettings.godMode.cooldown;

    // Clear aura
    if (this.godModeAura) this.godModeAura.clear();

    // Clear tint (unless burning)
    if (!this.isBurning) {
      this.player.sprite.clearTint();
    }
    this.player.sprite.setAlpha(1);

    // Flash to signal end
    this.cameras.main.flash(200, 80, 0, 0);

    if (this.powerUpBtnTimer) this.powerUpBtnTimer.clear();
    this.updatePowerUpButtonState();
  }

  private playGodModeSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Dark rumble
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(60, now);
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.4);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Rising scream
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(200, now + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(800, now + 0.5);
    gain2.gain.setValueAtTime(0.06, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.5);

    // Deep heartbeat
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(40, now);
    gain3.gain.setValueAtTime(0.25, now);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now);
    osc3.stop(now + 0.2);
  }

  // ---- Coins (Blood Gems) ----

  private spawnCoins(): void {
    const count = GameSettings.coins.count;
    for (let i = 0; i < count; i++) {
      this.spawnSingleCoin();
    }
  }

  private spawnSingleCoin(): void {
    // Find a random ground position outside the safe zone
    let x = 0;
    let y = 0;
    let attempts = 0;
    do {
      // Pick random world position using tilemap bounds
      const top = this.map.tileToWorldXY(0, 0)!;
      const right = this.map.tileToWorldXY(this.map.width - 1, 0)!;
      const bottom = this.map.tileToWorldXY(
        this.map.width - 1,
        this.map.height - 1,
      )!;
      const left = this.map.tileToWorldXY(0, this.map.height - 1)!;
      x = Phaser.Math.Between(
        Math.floor(left.x + 60),
        Math.floor(right.x - 60),
      );
      y = Phaser.Math.Between(
        Math.floor(top.y + 60),
        Math.floor(bottom.y - 60),
      );
      attempts++;
    } while (
      (!this.hasGroundAt(x, y) || this.isNearSafe(x, y, 80)) &&
      attempts < 50
    );

    if (attempts >= 50) return;

    // Red glowing circle (blood gem)
    const coin = this.add.circle(x, y, 6, 0xff2222, 1);
    coin.setStrokeStyle(2, 0xff6666, 0.8);
    coin.setDepth(y - 1);
    // Ensure coin only appears in the main camera (not the UI camera)
    this.cameras.getCamera("ui")?.ignore(coin);

    // Gentle floating animation
    this.tweens.add({
      targets: coin,
      y: y - 4,
      duration: 1200 + Math.random() * 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.coinSprites.push({ sprite: coin, respawnTimer: 0, alive: true });
  }

  private updateCoins(dt: number): void {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    const collectRange = GameSettings.coins.collectRange;

    for (const coin of this.coinSprites) {
      if (coin.alive) {
        const dist = Phaser.Math.Distance.Between(
          px,
          py,
          coin.sprite.x,
          coin.sprite.y,
        );
        if (dist < collectRange) {
          // Collect!
          coin.alive = false;
          coin.sprite.setVisible(false);
          coin.respawnTimer = GameSettings.coins.respawnTime;
          this.coins++;
          this.score += GameSettings.coins.scoreValue;
          this.playCoinSound();

          // Brief pop effect
          const pop = this.add
            .text(coin.sprite.x, coin.sprite.y - 10, "🩸", {
              fontSize: "18px",
            })
            .setOrigin(0.5)
            .setDepth(9000);
          this.tweens.add({
            targets: pop,
            y: pop.y - 30,
            alpha: 0,
            duration: 500,
            onComplete: () => pop.destroy(),
          });
        }
      } else {
        // Respawn timer
        coin.respawnTimer -= dt * 1000;
        if (coin.respawnTimer <= 0) {
          coin.alive = true;
          coin.sprite.setVisible(true);
          // Relocate to a new position
          let x = 0;
          let y = 0;
          let attempts = 0;
          const top = this.map.tileToWorldXY(0, 0)!;
          const right = this.map.tileToWorldXY(this.map.width - 1, 0)!;
          const bottom = this.map.tileToWorldXY(
            this.map.width - 1,
            this.map.height - 1,
          )!;
          const left = this.map.tileToWorldXY(0, this.map.height - 1)!;
          do {
            x = Phaser.Math.Between(
              Math.floor(left.x + 60),
              Math.floor(right.x - 60),
            );
            y = Phaser.Math.Between(
              Math.floor(top.y + 60),
              Math.floor(bottom.y - 60),
            );
            attempts++;
          } while (
            (!this.hasGroundAt(x, y) || this.isNearSafe(x, y, 80)) &&
            attempts < 50
          );
          coin.sprite.setPosition(x, y);
          coin.sprite.setDepth(y - 1);
        }
      }
    }
  }

  private playCoinSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Bright chime
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    // Sparkle overtone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1760, now + 0.05);
    gain2.gain.setValueAtTime(0.08, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.15);
  }

  // ---- Shop ----

  private respawnAllCoins(): void {
    for (const coin of this.coinSprites) {
      if (!coin.alive) {
        coin.alive = true;
        coin.sprite.setVisible(true);
        coin.respawnTimer = 0;
        // Relocate
        let x = 0;
        let y = 0;
        let attempts = 0;
        const top = this.map.tileToWorldXY(0, 0)!;
        const right = this.map.tileToWorldXY(this.map.width - 1, 0)!;
        const bottom = this.map.tileToWorldXY(
          this.map.width - 1,
          this.map.height - 1,
        )!;
        const left = this.map.tileToWorldXY(0, this.map.height - 1)!;
        do {
          x = Phaser.Math.Between(
            Math.floor(left.x + 60),
            Math.floor(right.x - 60),
          );
          y = Phaser.Math.Between(
            Math.floor(top.y + 60),
            Math.floor(bottom.y - 60),
          );
          attempts++;
        } while (
          (!this.hasGroundAt(x, y) || this.isNearSafe(x, y, 80)) &&
          attempts < 50
        );
        coin.sprite.setPosition(x, y);
        coin.sprite.setDepth(y - 1);
      }
    }
  }

  private createShopButton(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const btnSize = 60;
    const margin = 24;
    const bx = margin + btnSize / 2;
    const by = H - margin - btnSize / 2 - 110; // above joystick area

    const container = this.add
      .container(bx, by)
      .setScrollFactor(0)
      .setDepth(6500)
      .setVisible(false);
    this.cameras.main.ignore(container);

    // Dark background
    const bg = this.add.graphics();
    const s = btnSize / 2;
    const c = s * 0.38;
    bg.fillStyle(0x0a0820, 0.92);
    bg.beginPath();
    bg.moveTo(-s + c, -s);
    bg.lineTo(s - c, -s);
    bg.lineTo(s, -s + c);
    bg.lineTo(s, s - c);
    bg.lineTo(s - c, s);
    bg.lineTo(-s + c, s);
    bg.lineTo(-s, s - c);
    bg.lineTo(-s, -s + c);
    bg.closePath();
    bg.fillPath();
    bg.lineStyle(2, 0x4444aa, 0.9);
    bg.beginPath();
    bg.moveTo(-s + c, -s);
    bg.lineTo(s - c, -s);
    bg.lineTo(s, -s + c);
    bg.lineTo(s, s - c);
    bg.lineTo(s - c, s);
    bg.lineTo(-s + c, s);
    bg.lineTo(-s, s - c);
    bg.lineTo(-s, -s + c);
    bg.closePath();
    bg.strokePath();
    container.add(bg);

    const icon = this.add
      .text(0, -2, "🏪", { fontSize: "34px" })
      .setOrigin(0.5);
    container.add(icon);

    const label = this.add
      .text(0, s + 10, "SHOP", {
        fontFamily: "'Creepster', cursive",
        fontSize: "18px",
        color: "#8888ff",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    container.add(label);

    this.shopBtn = container;

    container.setSize(btnSize + 20, btnSize + 20);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerdown", () => {
      if (this.isGameOver || this.introPlaying || this.shopModalActive) return;
      this.showShopModal();
    });
  }

  private showShopModal(): void {
    this.shopModalActive = true;

    const W = this.scale.width;
    const H = this.scale.height;

    const allElements: Phaser.GameObjects.GameObject[] = [];

    // Dark overlay
    const overlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setScrollFactor(0)
      .setDepth(9000)
      .setInteractive();
    this.cameras.main.ignore(overlay);
    allElements.push(overlay);

    // Title
    const title = this.add
      .text(W / 2, H * 0.12, "🏪 BLOOD SHOP", {
        fontFamily: "'Creepster', cursive",
        fontSize: "42px",
        color: "#ff4444",
        stroke: "#000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9001);
    this.cameras.main.ignore(title);
    allElements.push(title);

    // Coin balance
    const balanceTxt = this.add
      .text(W / 2, H * 0.19, `🩸 ${this.coins}`, {
        fontFamily: "'Creepster', cursive",
        fontSize: "28px",
        color: "#ff8888",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9001);
    this.cameras.main.ignore(balanceTxt);
    allElements.push(balanceTxt);

    const cfg = GameSettings.shop;

    // Shop items definition
    const items = [
      {
        icon: "🧪",
        name: "Blood Vial",
        desc: `+${cfg.bloodVial.restoreAmount} blood`,
        cost: cfg.bloodVial.cost,
        canBuy: () => this.coins >= cfg.bloodVial.cost,
        action: () => {
          this.coins -= cfg.bloodVial.cost;
          this.blood.addBlood(cfg.bloodVial.restoreAmount);
          this.hud.update();
        },
      },
      {
        icon: "🌑",
        name: "Shadow Cloak",
        desc: "Sun immunity 1min",
        cost: cfg.shadowCloak.cost,
        canBuy: () => this.coins >= cfg.shadowCloak.cost,
        action: () => {
          this.coins -= cfg.shadowCloak.cost;
          this.shadowCloakTimer = cfg.shadowCloak.duration;
        },
      },
      {
        icon: "⏳",
        name: "Eternal Night",
        desc: "Longer nights (permanent)",
        cost: cfg.eternalNight.cost,
        canBuy: () =>
          this.coins >= cfg.eternalNight.cost && !this.eternalNightPurchased,
        action: () => {
          this.coins -= cfg.eternalNight.cost;
          this.eternalNightPurchased = true;
          this.dayNight.extendNight(cfg.eternalNight.nightBonusMs);
        },
      },
      {
        icon: "💨",
        name: "Speed Potion",
        desc: "+20% speed 1min",
        cost: cfg.speedPotion.cost,
        canBuy: () => this.coins >= cfg.speedPotion.cost,
        action: () => {
          this.coins -= cfg.speedPotion.cost;
          this.speedPotionTimer = cfg.speedPotion.duration;
        },
      },
    ];

    const destroyModal = () => {
      allElements.forEach((el) => el.destroy());
      this.shopModalActive = false;
    };

    items.forEach((item, i) => {
      const py = H * 0.29 + i * 85;
      const canAfford = item.canBuy();
      const isSoldOut =
        item.name === "Eternal Night" && this.eternalNightPurchased;

      // Item row background
      const rowBg = this.add
        .rectangle(W / 2, py, W * 0.82, 70, 0x1a0020, 0.9)
        .setStrokeStyle(1, canAfford && !isSoldOut ? 0x6644aa : 0x333344)
        .setScrollFactor(0)
        .setDepth(9001);
      this.cameras.main.ignore(rowBg);
      allElements.push(rowBg);

      // Icon + name
      const nameColor = isSoldOut
        ? "#555555"
        : canAfford
          ? "#ddddff"
          : "#666677";
      const nameTxt = this.add
        .text(W * 0.12, py - 12, `${item.icon}  ${item.name}`, {
          fontFamily: "'Creepster', cursive",
          fontSize: "22px",
          color: nameColor,
          stroke: "#000",
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(9002);
      this.cameras.main.ignore(nameTxt);
      allElements.push(nameTxt);

      // Description
      const descTxt = this.add
        .text(W * 0.18, py + 14, item.desc, {
          fontFamily: "'Creepster', cursive",
          fontSize: "16px",
          color: "#888899",
          stroke: "#000",
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(9002);
      this.cameras.main.ignore(descTxt);
      allElements.push(descTxt);

      // Buy button
      const btnLabel = isSoldOut ? "OWNED" : `🩸 ${item.cost}`;
      const btnColor = isSoldOut ? 0x333333 : canAfford ? 0x660033 : 0x222222;
      const btnW = 100;
      const btnH = 40;

      const btnBg = this.add
        .rectangle(W * 0.82, py, btnW, btnH, btnColor)
        .setStrokeStyle(
          1,
          isSoldOut ? 0x444444 : canAfford ? 0xaa0044 : 0x333333,
        )
        .setScrollFactor(0)
        .setDepth(9002);
      this.cameras.main.ignore(btnBg);
      allElements.push(btnBg);

      const btnTxt = this.add
        .text(W * 0.82, py, btnLabel, {
          fontFamily: "'Creepster', cursive",
          fontSize: "18px",
          color: isSoldOut ? "#555555" : canAfford ? "#ffffff" : "#555555",
          stroke: "#000",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(9003);
      this.cameras.main.ignore(btnTxt);
      allElements.push(btnTxt);

      if (canAfford && !isSoldOut) {
        btnBg.setInteractive({ useHandCursor: true });
        btnBg.on("pointerover", () => btnBg.setFillStyle(0x880044));
        btnBg.on("pointerout", () => btnBg.setFillStyle(0x660033));
        btnBg.on("pointerdown", () => {
          item.action();
          this.playCoinSound();
          // Refresh shop
          destroyModal();
          this.showShopModal();
        });
      }
    });

    // Close button
    const closeBtnW = 200;
    const closeBtnH = 54;
    const closeY = H * 0.29 + items.length * 85 + 30;
    const closeBg = this.add
      .rectangle(W / 2, closeY, closeBtnW, closeBtnH, 0x660000, 1)
      .setStrokeStyle(2, 0xaa0000)
      .setScrollFactor(0)
      .setDepth(9001)
      .setInteractive({ useHandCursor: true });
    this.cameras.main.ignore(closeBg);
    allElements.push(closeBg);

    const closeTxt = this.add
      .text(W / 2, closeY, "CLOSE", {
        fontFamily: "'Creepster', cursive",
        fontSize: "26px",
        color: "#ffffff",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9002);
    this.cameras.main.ignore(closeTxt);
    allElements.push(closeTxt);

    closeBg.on("pointerdown", destroyModal);
    closeBg.on("pointerover", () => closeBg.setFillStyle(0x880000));
    closeBg.on("pointerout", () => closeBg.setFillStyle(0x660000));
  }

  // ---- Buff Icons ----

  private createBuffIcons(): void {
    if (this.buffIcons) return;

    const W = this.scale.width;
    // HUD layout: barY=24, barH=36, rowY=68, font=28px → bottom ~96 → place at 106
    this.buffIcons = this.add
      .container(W / 2, 106)
      .setScrollFactor(0)
      .setDepth(1200);
    this.cameras.main.ignore(this.buffIcons);
  }

  private updateBuffIcons(): void {
    if (!this.buffIcons) {
      this.createBuffIcons();
    }
    if (!this.buffIcons) return;

    // Clear old icons
    this.buffIcons.removeAll(true);

    const buffs: { icon: string; secs: number }[] = [];
    if (this.shadowCloakTimer > 0) {
      buffs.push({ icon: "🌑", secs: Math.ceil(this.shadowCloakTimer / 1000) });
    }
    if (this.speedPotionTimer > 0) {
      buffs.push({ icon: "💨", secs: Math.ceil(this.speedPotionTimer / 1000) });
    }

    if (buffs.length === 0) return;

    // Badge layout: icon (20px emoji ~22px wide) + gap + timer ("60s" ~28px) = ~68px total
    const badgeW = 80;
    const badgeH = 32;
    const spacing = badgeW + 10;
    const startX = -((buffs.length - 1) * spacing) / 2;

    buffs.forEach((buff, i) => {
      const cx = startX + i * spacing;

      // Full-width badge background covering icon + timer
      const bg = this.add.graphics();
      bg.fillStyle(0x0a0020, 0.85);
      bg.fillRoundedRect(cx - badgeW / 2, -badgeH / 2, badgeW, badgeH, 8);
      bg.lineStyle(1, 0x6644aa, 0.8);
      bg.strokeRoundedRect(cx - badgeW / 2, -badgeH / 2, badgeW, badgeH, 8);
      this.buffIcons!.add(bg);

      // Icon — left portion of badge
      const iconTxt = this.add
        .text(cx - badgeW / 2 + 14, 0, buff.icon, { fontSize: "18px" })
        .setOrigin(0.5);
      this.buffIcons!.add(iconTxt);

      // Timer — right portion of badge
      const timerTxt = this.add
        .text(cx - badgeW / 2 + 32, 0, `${buff.secs}s`, {
          fontFamily: "'Creepster', cursive",
          fontSize: "18px",
          color: "#ddccff",
          stroke: "#000",
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5);
      this.buffIcons!.add(timerTxt);
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
    this.coinSprites.forEach((c) => c.sprite.destroy());
    this.coinSprites = [];
    this.player?.destroy();
    this.dayNight?.destroy();
    this.hud?.destroy();
    this.joystick?.destroy();
    if (this.buffIcons) {
      this.buffIcons.destroy();
      this.buffIcons = null;
    }

    // Stop music
    if (this.currentMusic) {
      this.currentMusic.destroy();
      this.currentMusic = null;
    }

    // Restart scene
    this.scene.restart();
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

  /** Soft slurp sound for single feed. */
  private playFeedSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Soft low gulp
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // Gentle wet texture
    const wet = ctx.createOscillator();
    const wGain = ctx.createGain();
    wet.type = "triangle";
    wet.frequency.setValueAtTime(400, now + 0.03);
    wet.frequency.exponentialRampToValueAtTime(150, now + 0.15);
    wGain.gain.setValueAtTime(0.06, now + 0.03);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    wet.connect(wGain);
    wGain.connect(ctx.destination);
    wet.start(now + 0.03);
    wet.stop(now + 0.15);
  }

  /** Richer, layered sound for multi-kill feed. */
  private playMultiFeedSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Deep satisfying gulp
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    // Rising shimmer (reward feel)
    const shimmer = ctx.createOscillator();
    const sGain = ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(300, now + 0.05);
    shimmer.frequency.exponentialRampToValueAtTime(600, now + 0.25);
    sGain.gain.setValueAtTime(0.07, now + 0.05);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    shimmer.connect(sGain);
    sGain.connect(ctx.destination);
    shimmer.start(now + 0.05);
    shimmer.stop(now + 0.25);

    // Soft wet layer
    const wet = ctx.createOscillator();
    const wGain = ctx.createGain();
    wet.type = "triangle";
    wet.frequency.setValueAtTime(350, now + 0.02);
    wet.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    wGain.gain.setValueAtTime(0.05, now + 0.02);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    wet.connect(wGain);
    wGain.connect(ctx.destination);
    wet.start(now + 0.02);
    wet.stop(now + 0.18);
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
