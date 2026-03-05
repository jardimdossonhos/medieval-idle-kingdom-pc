import type { WarResolver } from "../../contracts/services";
import type { SimulationSystem } from "../tick-pipeline";
import { createEventId, roundTo } from "./utils";

export function createWarSystem(warResolver: WarResolver): SimulationSystem {
  return {
    id: "war",
    run(context): void {
      const stateBefore = context.nextState;
      const ownersBefore = new Map(Object.entries(stateBefore.world.regions).map(([regionId, region]) => [regionId, region.ownerId]));
      const warScoresBefore = new Map(Object.entries(stateBefore.wars).map(([warId, war]) => [warId, war.warScore]));

      context.nextState = warResolver.resolveTick(context.nextState, context.now);

      const warsAfter = Object.values(context.nextState.wars);

      for (const war of warsAfter) {
        const previousScore = warScoresBefore.get(war.id);

        if (previousScore !== undefined && Math.abs(previousScore) < 45 && Math.abs(war.warScore) >= 45) {
          context.events.push({
            id: createEventId("evt_war_escalation", context.nextState.meta.tick, context.events.length),
            type: "war.escalated",
            actorKingdomId: war.warScore > 0 ? war.attackers[0] : war.defenders[0],
            payload: {
              warId: war.id,
              warScore: roundTo(war.warScore)
            },
            occurredAt: context.now
          });
        }
      }

      for (const [regionId, previousOwnerId] of ownersBefore.entries()) {
        const regionAfter = context.nextState.world.regions[regionId];
        if (!regionAfter || regionAfter.ownerId === previousOwnerId) {
          continue;
        }

        context.events.push({
          id: createEventId("evt_war_capture", context.nextState.meta.tick, context.events.length),
          type: "war.region_captured",
          actorKingdomId: regionAfter.ownerId,
          targetKingdomId: previousOwnerId,
          payload: {
            regionId,
            previousOwnerId,
            newOwnerId: regionAfter.ownerId
          },
          occurredAt: context.now
        });
      }
    }
  };
}
