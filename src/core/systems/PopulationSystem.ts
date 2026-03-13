import type { PopulationComponent } from "../components/PopulationComponent";

/**
 * O PopulationSystem é responsável por calcular o crescimento (ou declínio)
 * da população para cada entidade ao longo do tempo.
 * Ele roda dentro do Worker para não impactar a performance da UI.
 */
export class PopulationSystem {
  update(deltaTimeSeconds: number, population: PopulationComponent, entities: readonly number[]): void {
    for (const entityId of entities) {
      const currentPop = population.total[entityId];
      const growthRate = population.growthRate[entityId];

      // Modelo de crescimento simples: população += população * taxa * tempo
      const growth = currentPop * growthRate * deltaTimeSeconds;
      population.total[entityId] = Math.max(0, currentPop + growth);
    }
  }
}