import type { EconomyComponent } from "../components/EconomyComponent";

export class EconomySystem {
  private readonly goldPerSecond: number;

  constructor(goldPerSecond = 1.5) {
    this.goldPerSecond = goldPerSecond;
  }

  update(deltaTime: number, economy: EconomyComponent, activeEntities: number[]): void {
    const gold = economy.gold;
    const food = economy.food;
    const wood = economy.wood;
    const iron = economy.iron;
    const gainGold = this.goldPerSecond * deltaTime;
    const gainFood = 2.5 * deltaTime;
    const gainWood = 1.0 * deltaTime;
    const gainIron = 0.5 * deltaTime;

    for (let i = 0; i < activeEntities.length; i += 1) {
      const entityId = activeEntities[i];
      gold[entityId] += gainGold;
      food[entityId] += gainFood;
      wood[entityId] += gainWood;
      iron[entityId] += gainIron;
    }
  }
}

