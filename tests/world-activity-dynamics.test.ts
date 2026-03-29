import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/application/boot/create-initial-state";
import { createStaticWorldData } from "../src/application/boot/static-world-data";
import { createDefaultSimulationSystems } from "../src/core/simulation/create-default-systems";
import { TickPipeline } from "../src/core/simulation/tick-pipeline";
import { LocalDiplomacyResolver } from "../src/infrastructure/diplomacy/local-diplomacy-resolver";
import { RuleBasedNpcDecisionService } from "../src/infrastructure/npc/rule-based-npc-decision-service";
import { LocalWarResolver } from "../src/infrastructure/war/local-war-resolver";
import { WORLD_DEFINITIONS_V1 } from "../src/application/boot/generated/world-definitions-v1";

describe("world activity dynamics", () => {
  it("produces at least 3 territorial changes over 10 minutes in auto simulation", () => {
    const staticData = createStaticWorldData();
    const diplomacyResolver = new LocalDiplomacyResolver();
    const warResolver = new LocalWarResolver(staticData);
    const npcDecisionService = new RuleBasedNpcDecisionService();
    const eventBus = { publish: () => {} };
    const systems = createDefaultSimulationSystems({
      npcDecisionService,
      diplomacyResolver,
      warResolver,
      eventBus,
      staticData,
      orderedDefinitions: WORLD_DEFINITIONS_V1
    });

    const pipeline = new TickPipeline(systems, staticData);
    let state = createInitialState(staticData, undefined, WORLD_DEFINITIONS_V1);
    let simNow = state.meta.lastUpdatedAt;
    const initialOwnersByRegion = new Map(
      Object.keys(state.world.regions)
        .sort()
        .map((regionId) => [regionId, state.world.regions[regionId].ownerId] as const)
    );

    const ticks = Math.floor((10 * 60 * 1000) / state.meta.tickDurationMs);

    for (let index = 0; index < ticks; index += 1) {
      simNow += state.meta.tickDurationMs;
      const result = pipeline.run(state, state.meta.tickDurationMs, simNow);
      state = result.state;
    }

    const changedRegions = Object.keys(state.world.regions)
      .sort()
      .filter((regionId) => state.world.regions[regionId].ownerId !== initialOwnersByRegion.get(regionId)).length;

    expect(changedRegions).toBeGreaterThanOrEqual(3);
  });
});
