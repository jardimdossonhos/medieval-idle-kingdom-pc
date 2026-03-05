import { VictoryPath } from "../../models/enums";
import type { SimulationSystem } from "../tick-pipeline";
import { clamp, createEventId, getOwnedRegionIds, getPlayerKingdom, roundTo } from "./utils";

export function createVictorySystem(): SimulationSystem {
  return {
    id: "victory",
    run(context): void {
      const state = context.nextState;
      const player = getPlayerKingdom(state);
      const totalRegions = Math.max(1, Object.keys(state.world.regions).length);
      const playerTerritory = getOwnedRegionIds(state, player.id).length;
      const territorialShare = playerTerritory / totalRegions;

      player.victoryProgress[VictoryPath.TerritorialDomination] = roundTo(territorialShare);

      if (state.victory.achievedPath === null) {
        const target = state.campaign.victoryTargets.find((item) => item.path === VictoryPath.TerritorialDomination);

        if (target && territorialShare >= target.threshold) {
          state.victory.achievedPath = VictoryPath.TerritorialDomination;
          state.victory.achievedAt = context.now;
          state.victory.postVictoryMode = true;

          context.events.push({
            id: createEventId("evt_victory", state.meta.tick, context.events.length),
            type: "victory.achieved",
            actorKingdomId: player.id,
            payload: {
              path: VictoryPath.TerritorialDomination,
              territorialShare: roundTo(territorialShare)
            },
            occurredAt: context.now
          });
        }
      }

      if (state.victory.postVictoryMode) {
        state.victory.crisisPressure = roundTo(
          clamp(state.victory.crisisPressure + 0.002 + Math.max(0, territorialShare - 0.55) * 0.01, 0, 1)
        );
      }
    }
  };
}
