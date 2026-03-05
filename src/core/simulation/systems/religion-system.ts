import { ReligiousPolicy } from "../../models/enums";
import type { SimulationSystem } from "../tick-pipeline";
import { clamp, createEventId, getOwnedRegionIds, roundTo } from "./utils";

export function createReligionSystem(): SimulationSystem {
  return {
    id: "religion",
    run(context): void {
      const state = context.nextState;

      for (const kingdom of Object.values(state.kingdoms)) {
        const ownedRegions = getOwnedRegionIds(state, kingdom.id);
        const regionalFaithAverage =
          ownedRegions.length === 0
            ? kingdom.religion.cohesion
            : ownedRegions.reduce((total, regionId) => total + state.world.regions[regionId].localFaithStrength, 0) / ownedRegions.length;

        const clergySupport = kingdom.population.groups.clergy;
        const budgetSupport = kingdom.economy.budgetPriority.religion / 100;

        let authorityDelta = clergySupport * 0.012 + budgetSupport * 0.01 - kingdom.population.unrest * 0.008;
        let toleranceDelta = 0;

        switch (kingdom.religion.policy) {
          case ReligiousPolicy.Tolerant:
            toleranceDelta = 0.012;
            authorityDelta -= 0.005;
            break;
          case ReligiousPolicy.Orthodoxy:
            authorityDelta += 0.008;
            toleranceDelta = -0.004;
            break;
          case ReligiousPolicy.Zealous:
            authorityDelta += 0.012;
            toleranceDelta = -0.01;
            break;
        }

        kingdom.religion.authority = roundTo(clamp(kingdom.religion.authority + authorityDelta, 0, 1));
        kingdom.religion.tolerance = roundTo(clamp(kingdom.religion.tolerance + toleranceDelta, 0, 1));

        const cohesionTarget = clamp(
          regionalFaithAverage * 0.55 + kingdom.religion.authority * 0.28 + (1 - kingdom.religion.tolerance) * 0.17,
          0,
          1
        );

        kingdom.religion.cohesion = roundTo(
          clamp(kingdom.religion.cohesion + (cohesionTarget - kingdom.religion.cohesion) * 0.08, 0, 1)
        );

        const conversionBase = (1 - kingdom.religion.tolerance) * 0.08 + kingdom.religion.authority * 0.07;
        kingdom.religion.conversionPressure = roundTo(clamp(conversionBase, 0, 1));

        let faithConflict = 0;

        for (const regionId of ownedRegions) {
          const region = state.world.regions[regionId];
          const drift = (kingdom.religion.cohesion - region.localFaithStrength) * kingdom.religion.conversionPressure * 0.06;

          region.localFaithStrength = roundTo(clamp(region.localFaithStrength + drift, 0, 1));

          if (kingdom.religion.tolerance < 0.3 && Math.abs(region.localFaithStrength - kingdom.religion.cohesion) > 0.24) {
            region.unrest = roundTo(clamp(region.unrest + 0.012, 0, 1));
            faithConflict += 0.012;
          }
        }

        kingdom.legitimacy = roundTo(
          clamp(kingdom.legitimacy + kingdom.religion.authority * 0.45 + kingdom.religion.cohesion * 0.32 - faithConflict * 8, 0, 100)
        );

        kingdom.stability = roundTo(
          clamp(kingdom.stability + kingdom.religion.cohesion * 0.35 - (1 - kingdom.religion.tolerance) * 0.15 - faithConflict * 4, 0, 100)
        );

        const tensionIndex = (1 - kingdom.religion.tolerance) * 0.55 + faithConflict * 6 + (1 - kingdom.religion.cohesion) * 0.25;

        if (tensionIndex > 0.55 && state.meta.tick % 6 === 0) {
          context.events.push({
            id: createEventId("evt_religion", state.meta.tick, context.events.length),
            type: "religion.tension",
            actorKingdomId: kingdom.id,
            payload: {
              tolerance: kingdom.religion.tolerance,
              cohesion: kingdom.religion.cohesion,
              tensionIndex: roundTo(tensionIndex)
            },
            occurredAt: context.now
          });
        }
      }
    }
  };
}
