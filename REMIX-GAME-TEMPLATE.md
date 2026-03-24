# Remix / Farcade — Guía de Configuración Base

> Referencia para crear un nuevo juego Phaser 3 en la plataforma Remix/Farcade con fullscreen responsive, SDK integrado y build limpio que pase todas las validaciones de la plataforma.

---

## 1. Estructura del Proyecto

```
index.html              ← Entry point (CDN scripts + dev block)
remix.config.ts         ← Game ID, nombre, modo SP/MP
vite.config.ts          ← Vite + remix plugin
package.json            ← Scripts: dev, build (con sanitize), preview, deploy
tsconfig.json
scripts/
  sanitize-dist.js      ← Post-build: limpia strings que la plataforma flaggea
src/
  main.ts               ← Crea Phaser.Game con dimensiones responsive
  globals.d.ts
  config/
    GameSettings.ts     ← Constantes + getResponsiveDimensions()
  scenes/
    PreloadScene.ts     ← Boot animation + carga de assets
    GameScene.ts        ← Escena principal del juego
```

---

## 2. index.html — CDN y CSS Base

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>mi-juego</title>

    <!-- Google Fonts (permitido por la plataforma) -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fredoka:wght@700&display=swap"
      rel="stylesheet"
    />

    <!-- SDK Farcade — DEBE ir antes de Phaser -->
    <script src="https://cdn.jsdelivr.net/npm/@farcade/game-sdk@latest/dist/index.min.js"></script>

    <!-- Phaser 3 vía CDN (NO bundlear — genera dist >1.5 MB y la plataforma lo rechaza) -->
    <script src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"></script>

    <style>
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }
      canvas { outline: none; margin: 0; }
    </style>
  </head>
  <body>
    <script type="module">
      if (import.meta.env.DEV) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/node_modules/@insidethesim/remix-dev/dist/styles/remix-dev.css";
        document.head.appendChild(link);
        import("@insidethesim/remix-dev/dev-init");
        if (window !== window.top) {
          import("/src/main.ts");
        }
      }
    </script>
  </body>
</html>
```

### Reglas clave del index.html

| Regla | Detalle |
|-------|---------|
| **CDN permitidos** | `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`, `remix.gg` |
| **CDN prohibidos** | `cdnjs.cloudflare.com`, `ajax.googleapis.com`, `w3.org`, cualquier otro dominio externo |
| **Phaser vía CDN** | Obligatorio. NO hacer `import * as Phaser from "phaser"` — genera dist enorme y la AI de deploy reemplaza el juego |
| **NO usar** `localStorage` / `sessionStorage` | La plataforma lo flaggea. Phaser CDN hace una detección interna pero el check acepta "Retry" |
| **NO llamar** `initRemix()` | Es comportamiento runtime inseguro; la plataforma lo prohíbe |

---

## 3. Phaser desde CDN — Patrón de Importación

En **todos los archivos .ts** que usen Phaser:

```typescript
const Phaser = (window as any).Phaser;
```

> **¿Por qué no `import`?** El build de `remix-dev` usa esbuild con `external: ["phaser"]`. Solo reemplaza `require("phaser")` → `window.Phaser` (CJS), pero deja `import * as X from "phaser"` como bare import que el navegador no puede resolver. El resultado: la AI de despliegue detecta imports rotos y reemplaza todo el juego con un prototipo básico.

---

## 4. Fullscreen Responsive — Aspect Ratio Dinámico

### GameSettings.ts

```typescript
export const GameSettings = {
  canvas: {
    width: 720,
    height: 1080,   // Base 2:3
  },
};

/**
 * Width siempre 720, height se expande para pantallas largas.
 * 2:3 → 720×1080 | 9:16 → 720×1280 | 9:19.5 → 720×1560
 */
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

### main.ts

```typescript
const Phaser = (window as any).Phaser;
import { getResponsiveDimensions } from "./config/GameSettings";
import { PreloadScene } from "./scenes/PreloadScene";
import GameScene from "./scenes/GameScene";

const dimensions = getResponsiveDimensions();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: dimensions.width,
  height: dimensions.height,
  scale: {
    mode: Phaser.Scale.FIT,       // FIT escala automáticamente
    parent: document.body,
    width: dimensions.width,
    height: dimensions.height,
  },
  transparent: true,
  scene: [PreloadScene, GameScene],
  physics: { default: "arcade" },
  fps: { target: 60 },
  antialias: true,
};

const game = new Phaser.Game(config);
(window as any).game = game;

// NO hacer game.scale.resize() en window resize.
// Scale.FIT ya maneja el display scaling.
// getResponsiveDimensions() fija la resolución lógica al inicio.
```

### Notas fullscreen

- **NO hay StartScene/menú inicial** — el juego arranca directo. La plataforma gestiona el "Play" externo.
- **NO hacer `resize()` en runtime** — Phaser Scale.FIT escala el canvas automáticamente. Cambiar la resolución lógica rompe escenas sin resize handler.
- El height se calcula **una sola vez** al inicio basándose en `window.innerWidth / innerHeight`.

---

## 5. FarcadeSDK — Integración Completa

### Variable global

```typescript
const sdk = (window as any).FarcadeSDK;
```

> **IMPORTANTE:** El paquete `@farcade/game-sdk` expone `window.FarcadeSDK`, **NO** `window.RemixSDK`. Si usas el nombre incorrecto, `gameOver` y `onPlayAgain` nunca se ejecutan.

### 5.1 Inicialización (en `create()` de la escena principal)

```typescript
create() {
  // ... setup del juego ...

  this.setupSDKListeners();
  this.restartGame();  // Arrancar directamente
}
```

### 5.2 Game Over → SDK reporta el score

```typescript
async saveHighScoreAndGameOver() {
  const finalScore = this.score;

  try {
    const sdk = (window as any).FarcadeSDK;
    if (sdk) {
      sdk.singlePlayer.actions.gameOver({ score: finalScore });
    }
  } catch (e) {
    console.log("SDK gameOver failed:", e);
  }

  // NO usar localStorage para high score — el SDK lo gestiona
}
```

### 5.3 Listeners del SDK

```typescript
setupSDKListeners() {
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
}
```

### 5.4 Haptic Feedback

```typescript
triggerHapticFeedback() {
  try {
    const sdk = (window as any).FarcadeSDK;
    if (sdk) {
      sdk.hapticFeedback();
    }
  } catch (e) {}
  // Fallback nativo
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
}
```

### 5.5 Compras In-App (opcional)

```typescript
private async checkPurchase() {
  const sdk = (window as any).FarcadeSDK;
  if (!sdk) return;

  try {
    await sdk.ready(); // Esperar datos del jugador
  } catch {
    return;
  }

  if (sdk.hasItem("item-id")) {
    this.unlockFeature();
  }

  sdk.onPurchaseComplete(() => {
    if (sdk.hasItem("item-id")) {
      this.unlockFeature();
    }
  });
}
```

### API disponible en FarcadeSDK

| Método | Uso |
|--------|-----|
| `sdk.ready()` | Espera a que el SDK cargue datos del jugador |
| `sdk.singlePlayer.actions.gameOver({ score })` | Reporta score final → muestra UI de game over de la plataforma |
| `sdk.onPlayAgain(callback)` | Se ejecuta cuando el jugador pulsa "Try Again" |
| `sdk.onToggleMute({ isMuted })` | Se ejecuta cuando la plataforma mute/unmute |
| `sdk.hapticFeedback()` | Vibración haptic en móvil |
| `sdk.hasItem("item-id")` | Comprueba si el jugador tiene un item comprado |
| `sdk.onPurchaseComplete(callback)` | Se ejecuta tras compra exitosa |

---

## 6. Build y Sanitización

### package.json (scripts)

```json
{
  "scripts": {
    "dev": "remix-dev dev",
    "build": "remix-dev build && node scripts/sanitize-dist.js",
    "preview": "remix-dev preview",
    "deploy": "remix-dev deploy"
  }
}
```

### scripts/sanitize-dist.js

La plataforma escanea el `dist/index.html` buscando dominios no autorizados. Three.js (y otras libs) incluyen strings internas con `w3.org` (XML namespaces) y `jcgt.org` (comentarios GLSL). **No son peticiones de red**, pero el scanner los flaggea.

```javascript
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, "../dist/index.html");

let html = readFileSync(distPath, "utf-8");

// 1. Three.js XML namespace → construir URL en runtime
html = html.replace(
  /createElementNS\("http:\/\/www\.w3\.org\/1999\/xhtml"/g,
  'createElementNS(["http://","ww","w.","w3",".org/1999/xhtml"].join("")',
);

// 2. GLSL shader comments con jcgt.org
html = html.replace(
  /\/\/\s*https?:\/\/jcgt\.org\/[^\n]*/g,
  "// [reference removed]",
);

writeFileSync(distPath, html, "utf-8");
console.log("✅ sanitize-dist: cleaned w3.org and jcgt.org references");
```

> Si no usas Three.js, este script puede estar vacío o simplemente no existir (quita el `&& node scripts/sanitize-dist.js` del build).

---

## 7. vite.config.ts

```typescript
import { remixPlugin } from "@insidethesim/remix-dev/vite";
import { defineConfig } from "vite";
import remixConfig from "./remix.config";

export default defineConfig({
  plugins: [remixPlugin(remixConfig)],
  define: {
    global: "window",   // Polyfill de `global` para libs que lo esperan
  },
});
```

---

## 8. remix.config.ts

```typescript
export default {
  gameId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  // Se genera con `npx create-remix-game link`
  isRemixGame: false,   // true después de linkear
  gameName: 'mi-juego',
  multiplayer: false,    // true si es multijugador
}
```

---

## 9. Dependencias

```json
{
  "devDependencies": {
    "@farcade/game-sdk": "^0.2.1",
    "@insidethesim/remix-dev": "^1.2.4",
    "typescript": "^5.9.2",
    "vite": "^7.0.0"
  },
  "dependencies": {
    "phaser": "^3.90.0"
  }
}
```

> `phaser` está en dependencies para que TypeScript tenga los tipos, pero **no se bundlea** — se carga vía CDN. El build de remix-dev lo externaliza automáticamente.

> Si usas Three.js, añade `"three": "^0.181.2"` y `"@types/three": "^0.181.0"` a dependencies. Three.js **sí** se bundlea (import directo funciona).

---

## 10. Checklist Pre-Deploy

- [ ] **`window.FarcadeSDK`** — NO `RemixSDK` ni otro nombre
- [ ] **`sdk.singlePlayer.actions.gameOver({ score })`** — sin esto no hay "Game Over" ni "Try Again"
- [ ] **`sdk.onPlayAgain()`** — registrar callback para restart
- [ ] **`sdk.onToggleMute()`** — para mute desde la plataforma
- [ ] **Sin `localStorage` / `sessionStorage`** en tu código (Phaser CDN tiene detección interna, dar "Retry" en el check)
- [ ] **Sin `initRemix()`** — comportamiento runtime prohibido
- [ ] **Sin dominios externos** fuera de los permitidos (jsdelivr, fonts.googleapis, fonts.gstatic, remix.gg)
- [ ] **`sanitize-dist.js`** en el build script si usas Three.js
- [ ] **Phaser vía CDN** con `const Phaser = (window as any).Phaser;` — NUNCA import ESM
- [ ] **Sin StartScene/menú** — arrancar el juego directo desde `create()`
- [ ] **`Scale.FIT`** + `getResponsiveDimensions()` para fullscreen responsive
- [ ] **dist/index.html < ~600 KB** — si es mayor, la plataforma puede rechazar el guardado

---

## 11. Errores Comunes y Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| Game Over no salta | `window.RemixSDK` es `undefined` | Usar `window.FarcadeSDK` |
| Try Again no funciona | `onPlayAgain` nunca se registró | Llamar `setupSDKListeners()` en `create()` con `FarcadeSDK` |
| AI de deploy reemplaza el juego | Bare ESM import `from "phaser"` irresolvible | Usar CDN + `(window as any).Phaser` |
| Dist > 1.5 MB | Phaser bundleado en el dist | Mantener Phaser en CDN |
| Warning `w3.org` / `jcgt.org` | Strings internas de Three.js | Usar `sanitize-dist.js` |
| Warning `localStorage` | Phaser CDN feature detection | Dar "Retry Checks" en la plataforma |
| Warning CDN no aprobado | `cdnjs.cloudflare.com`, `ajax.googleapis.com`, etc. | Solo usar `cdn.jsdelivr.net` |
| Assets flaggeados | URLs de `remix.gg/blob/...` | Son válidas, pero verificar que la plataforma las acepte |

---

## 12. Flujo de Game Over Completo

```
Jugador muere
  → gameOverSplatter() / tu lógica de muerte
    → isGameActive = false
    → saveHighScoreAndGameOver()
      → sdk.singlePlayer.actions.gameOver({ score })
        → La plataforma muestra UI de Game Over con score + botón "Try Again"
          → sdk.onPlayAgain() callback se ejecuta
            → restartGame() reinicia la escena
```

> **El juego NO muestra su propia UI de game over.** La plataforma se encarga del overlay con score y "Try Again". Tu código solo necesita:
> 1. Llamar `gameOver({ score })` al morir
> 2. Tener registrado `onPlayAgain()` para reiniciar
