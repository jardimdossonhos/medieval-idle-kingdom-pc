import type { EconomyComponent } from "../components/EconomyComponent";

export class EconomySystem {
  private readonly goldPerSecond: number;

  constructor(goldPerSecond = 1.5) {
    this.goldPerSecond = goldPerSecond;
  }

  update(deltaTime: number, economy: EconomyComponent, activeEntities: number[]): void {
    const gold = economy.gold;
    const gain = this.goldPerSecond * deltaTime;

    for (let i = 0; i < activeEntities.length; i += 1) {
      const entityId = activeEntities[i];
      gold[entityId] += gain;
    }
  }
}

