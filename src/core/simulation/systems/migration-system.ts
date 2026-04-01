import { AutomationLevel } from "../../models/enums";
import { Diagnostic } from "../../../application/diagnostics";
import type { StaticWorldData } from "../../models/static-world-data";
import type { SimulationSystem, TickContext } from "../tick-pipeline";
import type { RegionDefinition } from "../../models/world";
import { createEventId } from "./utils";

const MIGRATION_THRESHOLD = 150; // População necessária para engatilhar o transbordo
const MIGRATION_AMOUNT = 50;     // Quantidade demográfica que forma a nova colônia

export function createMigrationSystem(staticData: StaticWorldData, orderedDefinitions: RegionDefinition[]): SimulationSystem {
  return {
    id: "migration_system",
    run: (context: TickContext) => {
      const state = context.nextState;
      // Roda apenas 1 vez por "Ano" (12 ciclos) para evitar afogar o Event Loop da UI
      // e dar tempo para o IPC do Worker consolidar e retornar a matemática do ano anterior.
      if (state.meta.tick === 0 || state.meta.tick % 12 !== 0) return;

      const migrations: Array<{ sourceId: string; targetId: string; amount: number; kingdomId: string }> = [];

      // Avaliação linear de alta performance (Data-Oriented Scan)
      for (let i = 0; i < orderedDefinitions.length; i++) {
        const def = orderedDefinitions[i];
        if (def.isWater) continue;

        const regionId = def.id;
        const region = state.world.regions[regionId];

        // Apenas tribos assentadas (Não-Selvagens) expandem
        if (!region || region.ownerId === "k_nature") continue;

        const kingdom = state.kingdoms[region.ownerId];
        if (kingdom && kingdom.administration.automation.expansion === AutomationLevel.Manual) {
          if (kingdom.isPlayer) Diagnostic.trace("MIG-SYS-PLAYER", `Expansão pulada para ${regionId}: Política Manual Ativa.`);
          continue; // Expansão orgânica retida por política governamental
        }

        const currentPop = state.ecs?.populationTotal?.[i] || 0;

        // Atingiu o Teto de Suporte (Carrying Capacity) local
        if (currentPop < MIGRATION_THRESHOLD) {
          if (kingdom.isPlayer) Diagnostic.trace("MIG-SYS-PLAYER", `Expansão pulada para ${regionId}: População ${Math.floor(currentPop)} < ${MIGRATION_THRESHOLD}.`);
          continue;
        }

          const validNeighbors = def.neighbors.filter((nid) => {
            const nRegion = state.world.regions[nid];
            const nDef = staticData.definitions[nid];
            return nRegion && nRegion.ownerId === "k_nature" && nDef && !nDef.isWater;
          });

          if (validNeighbors.length === 0) {
            if (kingdom.isPlayer) Diagnostic.trace("MIG-SYS-PLAYER", `Expansão pulada para ${regionId}: Sem vizinhos selvagens disponíveis (Fronteira Fechada).`);
            continue;
          }

            // Escolhe aleatoriamente uma direção desabitada
            const targetId = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
            
            // 1. Mutação Geopolítica (POO)
            const targetRegion = state.world.regions[targetId];
            targetRegion.ownerId = region.ownerId;
            targetRegion.controllerId = region.ownerId;
            targetRegion.dominantFaith = region.dominantFaith;
            targetRegion.unrest = 0;
            targetRegion.devastation = 0;

            // Mutação local do ECS para suportar progressão offline sem Worker ativo
            if (state.ecs && state.ecs.populationTotal) {
              const targetIdx = orderedDefinitions.findIndex(d => d.id === targetId);
              if (targetIdx !== -1) {
                (state.ecs.populationTotal as any)[i] -= MIGRATION_AMOUNT;
                (state.ecs.populationTotal as any)[targetIdx] += MIGRATION_AMOUNT;
              }
            }

            // 2. Empacota a Intenção Física para a fila
            migrations.push({ sourceId: regionId, targetId, amount: MIGRATION_AMOUNT, kingdomId: region.ownerId });
      }

      // Dispara as emissões para a pipeline (Ignoradas no offline, consumidas em tempo real)
      let eventSeq = 0;
      for (const mig of migrations) {
        context.events.push({
          id: createEventId({
            prefix: "evt_mig",
            tick: state.meta.tick,
            systemId: "migration",
            actorId: mig.kingdomId,
            sequence: eventSeq++
          }),
          type: "population.migration",
          actorKingdomId: mig.kingdomId,
          payload: mig,
          occurredAt: context.now
        });
      }
    }
  };
}