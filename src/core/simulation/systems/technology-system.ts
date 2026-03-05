import type { SimulationSystem } from "../tick-pipeline";
import { clamp, createEventId, roundTo } from "./utils";

const RESEARCH_COST_PER_NODE = 100;

function nextResearchFor(kingdomId: string, tick: number): string {
  return `research_${kingdomId}_${Math.floor(tick / 10)}`;
}

export function createTechnologySystem(): SimulationSystem {
  return {
    id: "technology",
    run(context): void {
      for (const kingdom of Object.values(context.nextState.kingdoms)) {
        const budgetTechFactor = kingdom.economy.budgetPriority.technology / 20;
        const researchDelta = kingdom.technology.researchRate * (0.5 + budgetTechFactor);

        kingdom.technology.accumulatedResearch = roundTo(kingdom.technology.accumulatedResearch + researchDelta);

        if (kingdom.technology.activeResearchId === null) {
          kingdom.technology.activeResearchId = nextResearchFor(kingdom.id, context.nextState.meta.tick);
        }

        if (kingdom.technology.accumulatedResearch >= RESEARCH_COST_PER_NODE && kingdom.technology.activeResearchId) {
          const completed = kingdom.technology.activeResearchId;

          if (!kingdom.technology.unlocked.includes(completed)) {
            kingdom.technology.unlocked.push(completed);
          }

          kingdom.technology.accumulatedResearch = roundTo(kingdom.technology.accumulatedResearch - RESEARCH_COST_PER_NODE);
          kingdom.technology.activeResearchId = nextResearchFor(kingdom.id, context.nextState.meta.tick + 1);
          kingdom.technology.researchRate = roundTo(clamp(kingdom.technology.researchRate + 0.03, 0.5, 3));

          context.events.push({
            id: createEventId("evt_research", context.nextState.meta.tick, context.events.length),
            type: "technology.completed",
            actorKingdomId: kingdom.id,
            payload: {
              technologyId: completed,
              unlockedCount: kingdom.technology.unlocked.length
            },
            occurredAt: context.now
          });
        }
      }
    }
  };
}
