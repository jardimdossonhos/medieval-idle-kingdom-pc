import type { EconomyComponent } from "../components/EconomyComponent";

export class EconomySystem {
  private readonly goldPerSecond: number;

  constructor(goldPerSecond = 1.5) {
    this.goldPerSecond = goldPerSecond;
  }

  update(deltaTime: number, economy: EconomyComponent, activeEntities: number[], modifiers: Record<string, Float64Array> | null = null): void {
    const gold = economy.gold;
    const food = economy.food;
    const wood = economy.wood;
    const iron = economy.iron;
    const faith = economy.faith;
    const legitimacy = economy.legitimacy;
    
    const baseGainGold = this.goldPerSecond * deltaTime;
    const baseGainFood = 2.5 * deltaTime;
    const baseGainWood = 1.0 * deltaTime;
    const baseGainIron = 0.5 * deltaTime;
    const baseGainFaith = 0.4 * deltaTime;
    const baseGainLegitimacy = 0.05 * deltaTime;

    const foodMod = modifiers?.["economy.food_production_multiplier"];
    const goldMod = modifiers?.["economy.tax_income_multiplier"]; // Usado como ganho de ouro nativo

    for (let i = 0; i < activeEntities.length; i += 1) {
      const entityId = activeEntities[i];
      
      const fMultiplier = 1 + (foodMod ? foodMod[entityId] : 0);
      const gMultiplier = 1 + (goldMod ? goldMod[entityId] : 0);

      gold[entityId] += baseGainGold * gMultiplier;
      food[entityId] += baseGainFood * fMultiplier;
      wood[entityId] += baseGainWood;
      iron[entityId] += baseGainIron;
      if (faith) faith[entityId] += baseGainFaith;
      if (legitimacy) legitimacy[entityId] += baseGainLegitimacy;
    }
  }
}
