﻿import type { PopulationComponent } from "../components/PopulationComponent";

/**
 * O PopulationSystem é responsável por calcular o crescimento (ou declínio)
 * da população para cada entidade ao longo do tempo.
 * Ele roda dentro do Worker para não impactar a performance da UI.
 */
export class PopulationSystem {
  update(deltaTimeSeconds: number, population: PopulationComponent, entities: readonly number[]): void {
    // Soft-cap (Carrying Capacity): Impede a explosão matemática para trilhões de habitantes.
    // Define um limite natural de cerca de 2.5 milhões de habitantes por hexágono na era medieval.
    const CARRYING_CAPACITY = 2500000;

    for (const entityId of entities) {
      const currentPop = population.total[entityId];
      const growthRate = population.growthRate[entityId];

      // Modelo Logístico (Curva em S): 
      // Quando pop é zero, cresce 100% da taxa. Quando atinge o teto, cresce 0%.
      const limitFactor = Math.max(0, 1 - (currentPop / CARRYING_CAPACITY));

      const growth = currentPop * growthRate * limitFactor * deltaTimeSeconds;
      population.total[entityId] = Math.max(0, currentPop + growth);
    }
  }
}