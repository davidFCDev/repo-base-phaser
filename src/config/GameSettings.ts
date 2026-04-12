export const GameSettings = {
  canvas: {
    width: 720,
    height: 1080,
  },
  safeArea: {
    top: 120,
  },

  // World
  world: {
    width: 2000,
    height: 2000,
    groundColor: 0x1a2e1a,
  },

  // Castle (safe zone)
  castle: {
    x: 1000,
    y: 350,
    width: 280,
    height: 200,
    safeRadius: 180,
  },

  // Player (Dracula)
  player: {
    speed: 200,
    attackRange: 65,
    attackDuration: 700,
    startX: 1000,
    startY: 400,
  },

  // Blood
  blood: {
    max: 100,
    drainPerSecond: 1.0,
    drainIncreasePerCycle: 0.15,
    huntRestore: 10,
    multiHuntRestore: 22,
    multiHuntRange: 180,
    sunDamagePerSecond: 8.0,
  },

  // Day/Night cycle
  dayNight: {
    nightDuration: 15000,
    dawnDuration: 3000,
    dayDuration: 5000,
    duskDuration: 3000,
  },

  // Villagers
  villagers: {
    count: 15,
    speed: 35,
    wanderRadius: 120,
    respawnTime: 10000,
    fleeSpeed: 90,
    fleeDetectRange: 140,
  },

  // Map elements
  buildings: [
    { x: 650, y: 780, w: 80, h: 60 },
    { x: 1350, y: 820, w: 90, h: 55 },
    { x: 480, y: 1050, w: 75, h: 60 },
    { x: 1150, y: 1000, w: 85, h: 55 },
    { x: 780, y: 1250, w: 80, h: 60 },
    { x: 1400, y: 1200, w: 75, h: 55 },
    { x: 550, y: 1420, w: 85, h: 60 },
    { x: 1250, y: 1400, w: 80, h: 55 },
  ],

  church: { x: 980, y: 880, w: 110, h: 80 },

  trees: [
    { x: 300, y: 500 },
    { x: 1700, y: 500 },
    { x: 200, y: 800 },
    { x: 1800, y: 850 },
    { x: 350, y: 1100 },
    { x: 1650, y: 1100 },
    { x: 250, y: 1400 },
    { x: 1750, y: 1350 },
    { x: 500, y: 600 },
    { x: 1500, y: 650 },
    { x: 850, y: 700 },
    { x: 1100, y: 700 },
    { x: 400, y: 1300 },
    { x: 1600, y: 1500 },
    { x: 700, y: 1500 },
    { x: 1300, y: 1600 },
    { x: 900, y: 1600 },
    { x: 1100, y: 1550 },
  ],

  // Shadow system (during day)
  shadow: {
    buildingRadius: 70,
    treeRadius: 45,
  },

  // Archers
  archers: {
    count: 6,
    speed: 45,
    wanderRadius: 150,
    respawnTime: 15000,
    detectRange: 280,
    attackRange: 200,
    shotCooldown: 2200,
    arrowSpeed: 250,
    arrowDamage: 12,
  },

  // Monks
  monks: {
    count: 2,
    speed: 55,
    wanderRadius: 200,
    detectRange: 250,
    chaseSpeed: 75,
    auraRadius: 100,
    auraDamagePerSecond: 15,
  },

  // Scoring
  scoring: {
    perVillager: 10,
    perCycle: 50,
  },
};

export function getResponsiveDimensions(): { width: number; height: number } {
  const BASE_WIDTH = GameSettings.canvas.width;
  const MIN_HEIGHT = GameSettings.canvas.height;
  const BASE_ASPECT = BASE_WIDTH / MIN_HEIGHT;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vw <= 0 || vh <= 0) {
    return { width: BASE_WIDTH, height: MIN_HEIGHT };
  }

  const viewportAspect = vw / vh;

  if (viewportAspect >= BASE_ASPECT - 0.035) {
    return { width: BASE_WIDTH, height: MIN_HEIGHT };
  }

  const gameHeight = Math.round(BASE_WIDTH / viewportAspect);
  return { width: BASE_WIDTH, height: gameHeight };
}

export default GameSettings;
