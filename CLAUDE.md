# CLAUDE.md - Game Development Guide

This file provides guidance to Claude Code when working with this Remix game project.

## Project Overview

This is a **Phaser 3 game** built for the **Remix/Farcade platform** (Farcaster mini-apps). The game uses:

- **Phaser 3** for game engine (loaded via CDN)
- **@farcade/game-sdk** for platform integration (loaded via CDN in production, mocked in dev)
- **@insidethesim/remix-dev** for development tooling and build pipeline

## Critical Environment Details

### Platform AI Scanner (Producción)

Al subir un juego, una **IA estricta** escanea el `dist/index.html` buscando:

- **Bare ESM imports** irresolvibles (`import * as Phaser from "phaser"`) → Reemplaza todo el juego con un prototipo básico
- **Dominios externos** no autorizados → Solo permitidos: `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`, `remix.gg`
- **`localStorage` / `sessionStorage`** → Flaggeado (Phaser CDN hace detección interna, dar "Retry" en el check)
- **`initRemix()`** → Comportamiento runtime prohibido, NO llamar nunca
- **Dist > ~600 KB** → Puede rechazar el guardado

### CDN-Loaded Libraries (DO NOT import directly)

**Phaser** y **FarcadeSDK** se cargan globalmente vía CDN. NO son dependencias npm que puedas importar.

```typescript
// ❌ WRONG - El build genera bare imports que el navegador no resuelve
// La AI de despliegue detecta imports rotos y REEMPLAZA todo el juego
import Phaser from "phaser";
import { FarcadeSDK } from "@farcade/game-sdk";

// ✅ CORRECT - Acceder desde el scope global
const Phaser = (window as any).Phaser;
const sdk = (window as any).FarcadeSDK;

// O usar las declaraciones globales de globals.d.ts
// (Phaser se declara como global, FarcadeSDK en window)
```

> **¿Por qué `(window as any).Phaser`?** El build de `remix-dev` usa esbuild con `external: ["phaser"]`. Solo reemplaza `require("phaser")` → `window.Phaser` (CJS), pero deja `import * as X from "phaser"` como bare import que el navegador no puede resolver.

Type definitions are provided in `src/globals.d.ts`:

```typescript
declare const Phaser: typeof import("phaser");
declare global {
  interface Window {
    FarcadeSDK?: FarcadeSDKType;
  }
}
```

### Canvas Size — Fullscreen Responsive

Games are designed for **Farcaster mobile**. Base 2:3, pero se expande para pantallas más altas:

```typescript
// src/config/GameSettings.ts
export const GameSettings = {
  canvas: {
    width: 720,
    height: 1080, // Base 2:3
  },
};

// Width siempre 720, height se expande para pantallas largas.
// 2:3 → 720×1080 | 9:16 → 720×1280 | 9:19.5 → 720×1560
export function getResponsiveDimensions(): { width: number; height: number } {
  const BASE_WIDTH = GameSettings.canvas.width;
  const MIN_HEIGHT = GameSettings.canvas.height;
  const BASE_ASPECT = BASE_WIDTH / MIN_HEIGHT; // 0.6667

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vw <= 0 || vh <= 0) {
    return { width: BASE_WIDTH, height: MIN_HEIGHT };
  }

  const viewportAspect = vw / vh;

  // Tolerancia ~5%: si está cerca de 2:3 (o más ancho), usar 1080
  if (viewportAspect >= BASE_ASPECT - 0.035) {
    return { width: BASE_WIDTH, height: MIN_HEIGHT };
  }

  // Pantalla más alta → expandir height
  const gameHeight = Math.round(BASE_WIDTH / viewportAspect);
  return { width: BASE_WIDTH, height: gameHeight };
}
```

**Notas fullscreen:**

- **NO hay StartScene/menú inicial** — el juego arranca directo. La plataforma gestiona el "Play" externo.
- **NO hacer `resize()` en runtime** — `Phaser.Scale.FIT` escala el canvas automáticamente.
- El height se calcula **una sola vez** al inicio basándose en `window.innerWidth / innerHeight`.

### Safe Area — Zona superior reservada

La plataforma Remix superpone controles del sistema (mute, perfil, share, etc.) en la **parte superior** de la pantalla. Para evitar que elementos de juego queden tapados, se define una **safe area** en `GameSettings`:

```typescript
// src/config/GameSettings.ts
export const GameSettings = {
  canvas: { width: 720, height: 1080 },
  safeArea: {
    top: 120, // px lógicos reservados desde el borde superior
  },
};
```

**Reglas obligatorias:**

- **Ningún HUD, texto, botón ni elemento interactivo** debe colocarse por encima de `GameSettings.safeArea.top` (Y < 120).
- **El spawn de objetos del juego** debe respetar `y >= GameSettings.safeArea.top` como mínimo.
- **Fondos y decoración** pueden extenderse al área completa (es solo visual, no interactivo).
- El valor `120` corresponde a ~11% de 1080px y cubre el overlay de la plataforma + notch/Dynamic Island.

```typescript
import GameSettings from "../config/GameSettings";

// ✅ CORRECTO — HUD debajo de la safe area
const safeY = GameSettings.safeArea.top;
this.scoreText = this.add.text(50, safeY + 10, "Score: 0", { ... });

// ❌ INCORRECTO — Texto tapado por los controles de la plataforma
this.scoreText = this.add.text(50, 20, "Score: 0", { ... });
```

> **Tip:** Si el SDK provee `contentSafeAreaInset` vía `gameInfo`, puedes usar ese valor dinámico. Si no, `GameSettings.safeArea.top` es el fallback seguro.

## @farcade/game-sdk API Reference

The SDK provides the interface between your game and the Remix/Farcade platform.

### Initialization Flow

**CRITICAL**: Always await `ready()` before using any SDK features.
**IMPORTANT**: El paquete `@farcade/game-sdk` expone `window.FarcadeSDK`, **NO** `window.RemixSDK`.

```typescript
// In your main scene's create() or a dedicated init function
async initializeSDK() {
  const sdk = (window as any).FarcadeSDK
  if (!sdk) {
    // SDK not available (standalone mode)
    return
  }

  // Single player mode
  const gameInfo = await sdk.singlePlayer.actions.ready()

  // gameInfo contains:
  // - players: Player[] - all players in the game
  // - player: Player - the current player
  // - viewContext: 'full_screen' | 'mini' | etc.
  // - initialGameState: GameStateEnvelope | null - saved state or null if new game

  // Load saved state if exists
  if (gameInfo.initialGameState?.gameState) {
    this.loadState(gameInfo.initialGameState.gameState)
  }

  // Setup event listeners
  this.setupSDKListeners()
  this.restartGame() // Arrancar directamente
}
```

### Player Type

```typescript
interface Player {
  id: string; // Unique player ID
  name: string; // Display name
  imageUrl?: string; // Profile image URL
  purchasedItems: string[]; // Array of owned item slugs
}
```

### Single Player API

```typescript
const sdk = (window as any).FarcadeSDK;

// Initialize and get game info
const gameInfo = await sdk.singlePlayer.actions.ready();

// Save game state (persists across sessions)
sdk.singlePlayer.actions.saveGameState({
  gameState: {
    score: 100,
    level: 5,
    // any serializable data
  },
});

// Trigger game over (shows score screen — la plataforma gestiona la UI)
sdk.singlePlayer.actions.gameOver({
  score: 1500,
});

// Haptic feedback (mobile vibration)
sdk.hapticFeedback();
// Fallback nativo
if (navigator.vibrate) navigator.vibrate(50);
```

> **El juego NO muestra su propia UI de game over.** La plataforma se encarga del overlay con score y "Try Again". Tu código solo necesita llamar `gameOver({ score })` al morir y tener registrado `onPlayAgain()` para reiniciar.

### Multiplayer API

```typescript
// Initialize multiplayer
const gameInfo = await window.FarcadeSDK.multiplayer.actions.ready()

// Save and broadcast state to other players
window.FarcadeSDK.multiplayer.actions.saveGameState({
  gameState: {
    board: [...],
    currentTurn: 'player1',
  },
  alertUserIds: [otherPlayerId] // Notify specific players
})

// Listen for state updates from other players
window.FarcadeSDK.on('game_state_updated', (envelope) => {
  if (envelope?.gameState) {
    this.loadState(envelope.gameState)
  }
})

// Multiplayer game over
window.FarcadeSDK.multiplayer.actions.gameOver({
  scores: [
    { playerId: '1', score: 100 },
    { playerId: '2', score: 85 },
  ]
})
```

### Event Listeners

El SDK soporta tanto el patrón `.on()` como métodos directos:

```typescript
const sdk = (window as any).FarcadeSDK;
if (!sdk) return;

// Try Again — la plataforma muestra el botón, el SDK llama a este callback
sdk.onPlayAgain(() => {
  this.restartGame();
});

// Mute/Unmute desde la plataforma
sdk.onToggleMute((data: { isMuted: boolean }) => {
  this.sound.mute = data.isMuted;
});

// Purchase completion
sdk.onPurchaseComplete(() => {
  if (sdk.hasItem("reward-id")) {
    this.unlockFeature();
  }
});
```

También funciona el patrón con `.on()` (compatibilidad):

```typescript
window.FarcadeSDK.on('play_again', () => this.restartGame())
window.FarcadeSDK.on('toggle_mute', (data: { isMuted: boolean }) => { ... })
window.FarcadeSDK.on('purchase_complete', (data) => { ... })
```

### Purchased Items / Boost Tiers

**IMPORTANT**: The `purchasedItems` array and `hasItem()` contain **reward IDs only**, NOT tier names.

```typescript
// ❌ WRONG - Tier names are NOT in purchasedItems
if (window.FarcadeSDK.hasItem("tier-1")) {
} // NEVER works in production
if (window.FarcadeSDK.hasItem("tier-2")) {
} // NEVER works in production
if (window.FarcadeSDK.hasItem("tier-3")) {
} // NEVER works in production

// ✅ CORRECT - Check for specific reward IDs
if (window.FarcadeSDK.hasItem("double-jump")) {
  this.player.enableDoubleJump();
}

if (window.FarcadeSDK.hasItem("speed-boost")) {
  this.player.speed *= 1.5;
}
```

**How Boost Tiers Work:**

1. Users purchase a **tier** (Bronze/Silver/Gold aka tier-1/tier-2/tier-3)
2. Each tier contains **rewards** configured by the game developer
3. When purchased, the **reward IDs** (not tier names) are added to `purchasedItems`
4. Use `hasItem('reward-id')` to check if a player owns that reward

```typescript
// Get all purchased reward IDs
const items = window.FarcadeSDK.purchasedItems; // ['double-jump', 'speed-boost', ...]

// Initiate a purchase (opens platform modal)
const result = await window.FarcadeSDK.purchase({ item: "tier-1" });
if (result.success) {
  // Rewards from tier-1 are now in purchasedItems
}
```

## The .remix Directory

The `.remix` directory stores local development state. This is NOT deployed to production.

### Directory Structure

```
.remix/
├── boost-config.json      # Boost tiers and rewards configuration
├── current-state.json     # Current game state (generated during play)
├── settings.json          # Dashboard panel states
└── saved-states/          # Manually saved game states for testing
    └── *.json
```

### boost-config.json

Defines boost tier rewards. When a tier is "purchased" in dev mode, its **rewards** (not tier names) become available via `hasItem()`.

```json
{
  "purchasedItems": ["tier-1"], // Tracks which tiers are owned (internal only)
  "tierRewards": {
    "tier-1": ["Double Jump", "Speed Boost"], // Rewards unlocked by tier 1
    "tier-2": ["Extra Life"], // Rewards unlocked by tier 2
    "tier-3": ["Invincibility"] // Rewards unlocked by tier 3
  }
}
```

**How it works:**

- When `tier-1` is in `purchasedItems`, `hasItem('double-jump')` and `hasItem('speed-boost')` return true
- `hasItem('tier-1')` does **NOT** work - tier names are never in the SDK's purchasedItems

**Reward Slugs**: Reward names are converted to slugs for `hasItem()`:

- "Double Jump" → `double-jump`
- "Speed Boost" → `speed-boost`
- "Extra Life" → `extra-life`

### saved-states/

Store test states to quickly restore game scenarios:

```json
{
  "id": "unique-id",
  "label": "Level 5 - Boss Fight",
  "timestamp": 1234567890,
  "gameState": {
    "id": "state-id",
    "gameState": {
      "level": 5,
      "health": 100,
      "score": 5000
    }
  }
}
```

## Development Dashboard

Run `pnpm dev` to start the development server with the dashboard.

### Dashboard Panels

1. **Game State Panel** - View/edit current game state, save/load states
2. **Boost Config Panel** - Configure boost tiers and simulate purchases
3. **Build Panel** - Build production bundle

### Simulating Purchases

In the Boost Config Panel:

1. Add custom rewards to each tier
2. Toggle tier ownership with the checkbox
3. The game receives `purchase_complete` events
4. Use `hasItem('reward-slug')` to check ownership

## Game Architecture Patterns

### Scene Structure

```typescript
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  preload(): void {
    // Load assets (images, audio, etc.)
    this.load.image("player", "assets/player.png");
  }

  create(): void {
    // Create game objects, initialize SDK
    this.initializeSDK();
    this.createPlayer();
    this.setupInput();
  }

  update(time: number, delta: number): void {
    // Game loop - called every frame
    this.updatePlayer(delta);
    this.checkCollisions();
  }

  private async initializeSDK(): Promise<void> {
    if (!window.FarcadeSDK) return;

    const gameInfo = await window.FarcadeSDK.singlePlayer.actions.ready();

    // Load saved state
    if (gameInfo.initialGameState?.gameState) {
      this.loadState(gameInfo.initialGameState.gameState);
    }

    // Setup event listeners
    window.FarcadeSDK.on("play_again", () => this.restartGame());
    window.FarcadeSDK.on("purchase_complete", () => this.updateRewards());
  }
}
```

### State Management Pattern

```typescript
// Save state through SDK (persists to .remix/current-state.json in dev)
private saveGameState(): void {
  if (!window.FarcadeSDK?.singlePlayer?.actions?.saveGameState) return

  window.FarcadeSDK.singlePlayer.actions.saveGameState({
    gameState: {
      score: this.score,
      level: this.level,
      playerPosition: { x: this.player.x, y: this.player.y },
      timestamp: Date.now(),
    }
  })
}

// Load state from SDK response
private loadState(state: any): void {
  if (!state) return

  if (typeof state.score === 'number') {
    this.score = state.score
  }
  if (typeof state.level === 'number') {
    this.level = state.level
  }
  // etc.
}
```

### Reward-Gated Features

```typescript
private updateRewards(): void {
  // Check for specific rewards
  if (window.FarcadeSDK?.hasItem('double-jump')) {
    this.player.doubleJumpEnabled = true
  }

  if (window.FarcadeSDK?.hasItem('speed-boost')) {
    this.player.speed *= 1.5
  }

  // Or iterate all purchased items
  const items = window.FarcadeSDK?.purchasedItems || []
  items.forEach(item => {
    this.applyReward(item)
  })
}
```

## Inital Project Structure

(This may change over time)

```
my-game/
├── src/
│   ├── main.ts              # Entry point - crea Phaser.Game con dimensiones responsive
│   ├── globals.d.ts         # Type declarations for CDN libraries (Phaser, FarcadeSDK)
│   ├── config/
│   │   └── GameSettings.ts  # Constantes + getResponsiveDimensions()
│   ├── scenes/
│   │   └── GameScene.ts     # Main game scene (extend with more scenes as needed)
│   ├── objects/             # Game object classes (Player, Enemy, Projectile, etc.)
│   ├── systems/             # Game systems (Physics, Spawning, Scoring, Audio, etc.)
│   └── utils/               # Utility functions and helpers
├── scripts/
│   └── sanitize-dist.js     # Post-build: limpia strings que la plataforma flaggea (Three.js)
├── .remix/                  # Development state (not deployed)
│   ├── boost-config.json    # Boost tier rewards configuration
│   ├── settings.json        # Dashboard panel states
│   └── saved-states/        # Saved game states for testing
├── index.html               # HTML entry con CDN scripts (SDK antes de Phaser)
├── vite.config.ts           # Vite configuration with Remix plugin + global polyfill
├── remix.config.ts          # Game configuration (multiplayer, gameId)
├── package.json             # Dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

## Modular Code Architecture

### Separation of Concerns

Organize code into logical modules to keep scenes clean and maintainable:

**Objects** (`src/objects/`) - Game entities with their own state and behavior:

```typescript
// src/objects/Player.ts
export class Player {
  private sprite: Phaser.GameObjects.Sprite;
  private speed: number = 200;
  private health: number = 100;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, "player");
    // Setup physics, animations, etc.
  }

  update(delta: number, cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
    // Movement logic
  }

  takeDamage(amount: number): void {
    this.health -= amount;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }
}
```

**Systems** (`src/systems/`) - Cross-cutting game logic:

```typescript
// src/systems/ScoreSystem.ts
export class ScoreSystem {
  private score: number = 0;
  private highScore: number = 0;
  private onScoreChange?: (score: number) => void;

  addScore(points: number): void {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
    this.onScoreChange?.(this.score);
  }

  reset(): void {
    this.score = 0;
  }

  getState(): { score: number; highScore: number } {
    return { score: this.score, highScore: this.highScore };
  }

  loadState(state: { score?: number; highScore?: number }): void {
    this.score = state.score ?? 0;
    this.highScore = state.highScore ?? 0;
  }
}
```

**Utils** (`src/utils/`) - Pure helper functions:

```typescript
// src/utils/math.ts
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// src/utils/collision.ts
export function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < r1 + r2;
}
```

### Scene Composition

Keep scenes focused by delegating to objects and systems:

```typescript
// src/scenes/GameScene.ts
import { Player } from "../objects/Player";
import { EnemySpawner } from "../systems/EnemySpawner";
import { ScoreSystem } from "../systems/ScoreSystem";
import GameSettings from "../config/GameSettings";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemySpawner!: EnemySpawner;
  private scoreSystem!: ScoreSystem;

  create(): void {
    // Initialize systems
    this.scoreSystem = new ScoreSystem();
    this.enemySpawner = new EnemySpawner(this);

    // Create objects
    this.player = new Player(
      this,
      GameSettings.canvas.width / 2,
      GameSettings.canvas.height - 100,
    );

    // Initialize SDK
    this.initializeSDK();
  }

  update(time: number, delta: number): void {
    this.player.update(delta, this.cursors);
    this.enemySpawner.update(delta);
    this.checkCollisions();
  }

  private checkCollisions(): void {
    // Collision logic using objects
  }
}
```

### Configuration-Driven Design

Centralize tunable values in `GameSettings.ts`:

```typescript
// src/config/GameSettings.ts
export const GameSettings = {
  canvas: {
    width: 720,
    height: 1080,
  },
  player: {
    speed: 200,
    startHealth: 100,
    invincibilityDuration: 1500,
  },
  enemies: {
    spawnRate: 2000, // ms between spawns
    minSpeed: 100,
    maxSpeed: 300,
    pointValue: 10,
  },
  difficulty: {
    speedIncreasePerLevel: 1.1,
    spawnRateDecreasePerLevel: 0.9,
  },
};

export default GameSettings;
```

If game state grows large enough, consider breaking it into modules for maintainability.

### State Serialization Pattern

Each module handles its own state serialization:

```typescript
// In GameScene
private getGameState(): object {
  return {
    player: this.player.getState(),
    score: this.scoreSystem.getState(),
    level: this.currentLevel,
    timestamp: Date.now(),
  }
}

private loadGameState(state: any): void {
  if (state.player) this.player.loadState(state.player)
  if (state.score) this.scoreSystem.loadState(state.score)
  if (typeof state.level === 'number') this.currentLevel = state.level
}

private saveGameState(): void {
  window.FarcadeSDK?.singlePlayer.actions.saveGameState({
    gameState: this.getGameState()
  })
}
```

### Adding New Features

When adding new game features:

1. **Create an object class** if it's a visible entity (e.g., `src/objects/PowerUp.ts`)
2. **Create a system** if it's cross-cutting logic (e.g., `src/systems/PowerUpSystem.ts`)
3. **Add configuration** to `GameSettings.ts` for tunable values
4. **Wire it up** in the scene's `create()` and `update()` methods
5. **Add state methods** (`getState()`, `loadState()`) for persistence

## Build & Production

### Development

```bash
pnpm dev      # Start dev server with dashboard
```

### Production Build

```bash
pnpm build    # Creates dist/index.html (single file)
pnpm preview  # Preview production build
```

### Sanitización Post-Build (si usas Three.js)

Si usas Three.js, añade un script de sanitización para limpiar strings que la plataforma flaggea:

```json
"build": "remix-dev build && node scripts/sanitize-dist.js"
```

El script limpia referencias a `w3.org` (XML namespaces) y `jcgt.org` (GLSL comments) que Three.js incluye internamente.

### Production Notes

- **Single HTML file** - All assets inlined for Farcaster
- **No SDK mock** - Real SDK provided by Remix platform
- **CDN libraries** - Phaser/SDK loaded from CDN (not bundled)
- **dist/index.html < ~600 KB** — si es mayor, la plataforma puede rechazar
- **AI Scanner** revisa imports, dominios externos, localStorage, etc.

## Common Patterns

### Checking SDK Availability

```typescript
// Always guard SDK calls
if (window.FarcadeSDK?.singlePlayer?.actions?.ready) {
  const gameInfo = await window.FarcadeSDK.singlePlayer.actions.ready();
}

// For hasItem checks
const hasReward = window.FarcadeSDK?.hasItem("reward-slug") ?? false;
```

### Game Over Flow

```typescript
private triggerGameOver(): void {
  if (!window.FarcadeSDK) return

  // Single player
  window.FarcadeSDK.singlePlayer.actions.gameOver({
    score: this.score
  })

  // Platform shows game over screen
  // User can tap "Play Again" which triggers 'play_again' event
}
```

### Color/Theme from Player Data

```typescript
// Players have profile images
const player = gameInfo.player;
if (player.imageUrl) {
  this.load.image("playerAvatar", player.imageUrl);
}

// Use player name for display
this.add.text(100, 100, `Welcome, ${player.name}!`);
```

## Troubleshooting

### "Cannot find module 'phaser'"

Phaser is loaded via CDN, not npm. Usa `const Phaser = (window as any).Phaser` en cada archivo .ts.

### AI de deploy reemplaza el juego

Causa: Bare ESM import `from "phaser"` irresolvible en el dist. Usar CDN + `(window as any).Phaser`.

### Game Over no salta

`window.RemixSDK` es `undefined` — Usar `window.FarcadeSDK` (no RemixSDK).

### Try Again no funciona

`onPlayAgain` nunca se registró — Llamar `setupSDKListeners()` en `create()` con `FarcadeSDK`.

### SDK methods not working

1. Ensure you awaited `ready()` first
2. Check `window.FarcadeSDK` exists before calling methods
3. In dev mode, the mock SDK handles everything

### State not persisting

1. Always use SDK methods, never localStorage directly
2. Check `.remix/current-state.json` to see saved state
3. Clear state with "Reset State" in Game State Panel

### Warning `w3.org` / `jcgt.org`

Strings internas de Three.js. Usar `sanitize-dist.js` post-build.

### Warning `localStorage`

Phaser CDN feature detection. Dar "Retry Checks" en la plataforma.

### Warning CDN no aprobado

`cdnjs.cloudflare.com`, `ajax.googleapis.com`, etc. → Solo usar `cdn.jsdelivr.net`.

### Dist > 1.5 MB

Phaser bundleado en el dist. Mantener Phaser en CDN.

### hasItem() returning false

1. **Never check for tier names** - `hasItem('tier-1')` will ALWAYS fail in production
2. Check `.remix/boost-config.json` has the tier in `purchasedItems`
3. Verify the reward is listed under that tier in `tierRewards`
4. Reward names are slugified: "My Reward" → `my-reward`

### Common Boost Tier Mistakes

```typescript
// ❌ WRONG - Will fail in production
const boostTier = sdk.hasItem("tier-3")
  ? 3
  : sdk.hasItem("tier-2")
    ? 2
    : sdk.hasItem("tier-1")
      ? 1
      : 0;

// ✅ CORRECT - Check for actual reward IDs
const hasDoubleJump = sdk.hasItem("double-jump");
const hasSpeedBoost = sdk.hasItem("speed-boost");
```

## Checklist Pre-Deploy

- [ ] **`window.FarcadeSDK`** — NO `RemixSDK` ni otro nombre
- [ ] **`sdk.singlePlayer.actions.gameOver({ score })`** — sin esto no hay "Game Over" ni "Try Again"
- [ ] **`sdk.onPlayAgain()`** — registrar callback para restart
- [ ] **`sdk.onToggleMute()`** — para mute desde la plataforma
- [ ] **Sin `localStorage` / `sessionStorage`** en tu código
- [ ] **Sin `initRemix()`** — comportamiento runtime prohibido
- [ ] **Sin dominios externos** fuera de los permitidos (jsdelivr, fonts.googleapis, fonts.gstatic, remix.gg)
- [ ] **Phaser vía CDN** con `const Phaser = (window as any).Phaser` — NUNCA import ESM
- [ ] **Sin StartScene/menú** — arrancar el juego directo desde `create()`
- [ ] **`Scale.FIT`** + `getResponsiveDimensions()` para fullscreen responsive
- [ ] **dist/index.html < ~600 KB**
