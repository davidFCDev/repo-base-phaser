import GameSettings from "../config/GameSettings";

export class BloodSystem {
  private blood: number;
  private maxBlood: number;
  private baseDrain: number;
  private cyclesPassed: number = 0;

  constructor() {
    this.maxBlood = GameSettings.blood.max;
    this.blood = this.maxBlood;
    this.baseDrain = GameSettings.blood.drainPerSecond;
  }

  update(dt: number, environmentMultiplier: number = 1): void {
    const cycleDrainIncrease =
      1 + this.cyclesPassed * GameSettings.blood.drainIncreasePerCycle;
    const totalDrain =
      this.baseDrain * cycleDrainIncrease * environmentMultiplier;
    this.blood = Math.max(0, this.blood - totalDrain * dt);
  }

  addBlood(amount: number): void {
    this.blood = Math.max(0, Math.min(this.maxBlood, this.blood + amount));
  }

  getBlood(): number {
    return this.blood;
  }

  getMaxBlood(): number {
    return this.maxBlood;
  }

  getPercent(): number {
    return this.blood / this.maxBlood;
  }

  isEmpty(): boolean {
    return this.blood <= 0;
  }

  incrementCycle(): void {
    this.cyclesPassed++;
  }

  getCyclesPassed(): number {
    return this.cyclesPassed;
  }

  reset(): void {
    this.blood = this.maxBlood;
    this.cyclesPassed = 0;
  }
}
