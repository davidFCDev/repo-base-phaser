/**
 * Game Settings for remix-repo-base
 * Centralized configuration for all tunable game parameters
 */

export const GameSettings = {
  canvas: {
    width: 720,
    height: 1080,
  },

  /**
   * Safe area inset (en píxeles lógicos del canvas, base 720×1080).
   *
   * La plataforma Remix superpone controles del sistema (mute, perfil, etc.)
   * en la parte superior de la pantalla. Ningún elemento interactivo ni HUD
   * crítico debe colocarse dentro de esta zona.
   *
   * - top: pixeles reservados desde el borde superior del canvas.
   *   Valor por defecto 120 px (~11 % de 1080). Cubre overlays de la plataforma
   *   y el notch/Dynamic Island de móviles.
   *
   * Uso:
   *   const safeY = GameSettings.safeArea.top;
   *   // Colocar HUD debajo de safeY
   *   this.scoreText = this.add.text(x, safeY + 10, ...);
   *   // Spawns de objetos: y >= safeY
   */
  safeArea: {
    top: 120,
  },
};

/**
 * Calcula dimensiones responsive para fullscreen.
 * Width siempre 720, height se expande para pantallas más altas.
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

export default GameSettings;
