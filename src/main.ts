const Phaser = (window as any).Phaser;
import { getResponsiveDimensions } from "./config/GameSettings";
import { GameScene } from "./scenes/GameScene";
import { PreloadScene } from "./scenes/PreloadScene";

// Preload Creepster font before starting the game to avoid FOUT on mobile
function preloadFont(): Promise<void> {
  // Use FontFace API if available (modern browsers, including mobile Safari 10+)
  if (typeof FontFace !== "undefined") {
    const font = new FontFace(
      "Creepster",
      "url(https://fonts.gstatic.com/s/creepster/v13/AlZy_zVUqJz4yMrMHSA9VLs.woff2)",
      { style: "normal", weight: "400" },
    );
    return font
      .load()
      .then((loaded) => {
        (document as any).fonts.add(loaded);
      })
      .catch(() => {
        // Fallback: try CSS-based loading
        return (document as any).fonts
          ?.load?.("40px Creepster")
          .catch(() => {});
      });
  }
  // Fallback for older browsers
  if ((document as any).fonts?.load) {
    return (document as any).fonts.load("40px Creepster").catch(() => {});
  }
  return Promise.resolve();
}

// Wait for font then start game
preloadFont()
  .then(() => {
    startGame();
  })
  .catch(() => {
    startGame();
  });

function startGame(): void {
  // Calcula dimensiones responsive (fullscreen dinámico)
  const dimensions = getResponsiveDimensions();

  // Game configuration
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL,
    width: dimensions.width,
    height: dimensions.height,
    scale: {
      mode: Phaser.Scale.FIT,
      parent: document.body,
      width: dimensions.width,
      height: dimensions.height,
    },
    transparent: false,
    backgroundColor: "#0a0a0a",
    scene: [PreloadScene, GameScene],
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
      },
    },
    fps: {
      target: 60,
    },
    pixelArt: false,
    antialias: true,
  };

  // Create the game instance
  const game = new Phaser.Game(config);

  // Store globally for performance monitoring and HMR cleanup
  (window as any).game = game;

  // NO hacer game.scale.resize() en window resize.
  // Scale.FIT ya maneja el display scaling.
  // getResponsiveDimensions() fija la resolución lógica al inicio.
}
