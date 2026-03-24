const Phaser = (window as any).Phaser;
import { getResponsiveDimensions } from "./config/GameSettings";
import { GameScene } from "./scenes/GameScene";

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
  transparent: true,
  scene: [GameScene],
  physics: {
    default: "arcade",
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
