import { PreloadSceneBase } from "./PreloadSceneBase";

export class PreloadScene extends PreloadSceneBase {
  constructor() {
    super("PreloadScene", "GameScene");
  }

  protected loadProjectAssets(): void {
    this.load.crossOrigin = "anonymous";

    // Tilemap
    this.load.tilemapTiledJSON(
      "map",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/finalmap2-AVGu8yEeCm-s3hUNBPh0bIZ3ilBcOFAnJRRp1Q9M9.json?U717",
    );
    this.load.image("tiles", "assets/tileset.png");
    this.load.image("dungeon", "assets/dungeon.png");

    // Dracula spritesheets (256×256 per frame, 5 cols × 2 rows)
    const sc = { frameWidth: 256, frameHeight: 256 };
    this.load.spritesheet(
      "dracula-idle-right",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/idle-right-BLrC0HHsER-5llpuuiQEPMys1Whe6cKejStQ2ahwZ.webp?KUHp",
      sc,
    );
    this.load.spritesheet(
      "dracula-idle-down",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/idle-down-sW0C6iRiPO-F5tNPolwsu0Z4jQzFA44S5QG9IiCQ1.webp?In3o",
      sc,
    );
    this.load.spritesheet(
      "dracula-idle-up",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/idle-up-vhSvspoouV-i1OGTWQsj2e58aM19nSFueDZb02YP7.webp?JQTk",
      sc,
    );
    this.load.spritesheet(
      "dracula-walk-right",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-right-f6Wa0WpNkO-NtW2KfZMGneHwN2t1sOMwb8FJbDFrZ.webp?Cnio",
      sc,
    );
    this.load.spritesheet(
      "dracula-walk-down",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-down-BeRQhAENmB-Kqj2hQWsDcc8Wa9pI3Baxopvn9Q3Od.webp?V2zc",
      sc,
    );
    this.load.spritesheet(
      "dracula-walk-up",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-up-wLTPP7s2lN-YcjFd9NxEJurFEUBOWTHGuw58xBaB4.webp?eXU2",
      sc,
    );

    // Archer spritesheets (256×256 per frame)
    this.load.spritesheet(
      "archer-walk-right",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/archer-walk-right-X6PypjqdB0-X33hzHdAff2VRttqp07rp1TtLwmc9H.webp?d4Bg",
      sc,
    );
    this.load.spritesheet(
      "archer-walk-down",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/archer-walk-down-SqbndebmOA-jTtwoz6STvlLIYfxNUCRTCbAW2sRm6.webp?3yLK",
      sc,
    );
    this.load.spritesheet(
      "archer-walk-up",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/archer-walk-up-R012f35m4S-0LSwA9fZu0UJz4w6SBFxVttPF2oXqi.webp?EUGh",
      sc,
    );
    this.load.spritesheet(
      "archer-shot-up",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/archer-shot-up-YaHkyaL6ph-yKSvBKV4w6ZJ2BN1HeKPHjNnUR0zZq.webp?wkBo",
      sc,
    );
    this.load.spritesheet(
      "archer-shot-down",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/archer-shot-down-L0c2Fe6L4G-8lk21ZA13L9NGxoZELO65zTIEjP5hA.webp?gbVg",
      sc,
    );

    // Monk spritesheets (256×256 per frame)
    this.load.spritesheet(
      "monk-walk-right",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-right-XpoaBqPUJR-LTYL3LsC7thSiJwKCjWMUNiX2zegEl.webp?32vy",
      sc,
    );
    this.load.spritesheet(
      "monk-walk-down",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-down-ybVdgXbLHo-3NXOtMxTl7fqNfoUa7xvHOrnRDmgBT.webp?2zaM",
      sc,
    );
    this.load.spritesheet(
      "monk-walk-up",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-up-pme9l8zM9y-1oKhLgnXGieakcf2uMxMCT9zMv0swk.webp?QoVm",
      sc,
    );

    // Villager spritesheets (256×256 per frame)
    this.load.spritesheet(
      "villager-walk-right",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-right-A5jK3nk3EI-l1EZau8jQjINei9MagfZP1lI4jDjVt.webp?8KOI",
      sc,
    );
    this.load.spritesheet(
      "villager-walk-down",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-down-UqVwXlJt1i-vz41dAMdP1GUyf4wxbkJO3qX6Vwf9k.webp?tLly",
      sc,
    );
    this.load.spritesheet(
      "villager-walk-up",
      "https://lqy3lriiybxcejon.public.blob.vercel-storage.com/169e4210-4770-452d-8ff1-e104cc0e82b6/walk-up-TFBgQz8MUQ-5lNXuoy1okSd7x0BiHeORbSexIU2lB.webp?BcLg",
      sc,
    );
  }
}
