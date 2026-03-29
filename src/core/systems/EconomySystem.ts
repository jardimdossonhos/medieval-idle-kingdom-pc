import type { EconomyComponent } from "../components/EconomyComponent";
import type { PopulationComponent } from "../components/PopulationComponent";

export class EconomySystem {
  update(deltaTime: number, economy: EconomyComponent, population: PopulationComponent, activeEntities: number[], _modifiers?: Record<string, Float64Array> | null): void {
    const gold = economy.gold;
    const food = economy.food;
    const wood = economy.wood;
    const iron = economy.iron;

    for (let i = 0; i < activeEntities.length; i += 1) {
      const entityId = activeEntities[i];
      
      // A força de trabalho é o motor absoluto da economia
      const pop = population.total[entityId] || 0;
      
      // Taxas per capita (extremamente lentas para forçar o pacing Idle)
      const gainFood = (pop * 0.005) + 0.02; // +0.02 base da natureza selvagem
      const gainWood = (pop * 0.001) + 0.01;
      const gainGold = (pop * 0.0005);
      const gainIron = (pop * 0.0001);

      gold[entityId] += gainGold * deltaTime;
      food[entityId] += gainFood * deltaTime;
      wood[entityId] += gainWood * deltaTime;
      iron[entityId] += gainIron * deltaTime;
    }
  }
}
