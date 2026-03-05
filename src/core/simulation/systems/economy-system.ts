import { ResourceType } from "../../models/enums";
import { createEmptyStock } from "../../models/economy";
import type { SimulationSystem } from "../tick-pipeline";
import { createEventId, ensureResourceNonNegative, getOwnedRegionIds, roundTo } from "./utils";

export function createEconomySystem(): SimulationSystem {
  return {
    id: "economy",
    run(context): void {
      const state = context.nextState;

      for (const kingdom of Object.values(state.kingdoms)) {
        const ownedRegionIds = getOwnedRegionIds(state, kingdom.id);
        const regionalEconomy = ownedRegionIds.reduce((total, regionId) => {
          const definition = state.world.definitions[regionId];
          return total + (definition?.economyValue ?? 0);
        }, 0);

        const regionalMilitaryValue = ownedRegionIds.reduce((total, regionId) => {
          const definition = state.world.definitions[regionId];
          return total + (definition?.militaryValue ?? 0);
        }, 0);

        const populationFactor = kingdom.population.total / 100_000;
        const soldierShare = kingdom.population.groups.soldiers;
        const merchantShare = kingdom.population.groups.merchants;
        const armyManpower = kingdom.military.armies.reduce((sum, army) => sum + army.manpower, 0);

        const goldIncome = roundTo(regionalEconomy * (0.8 + merchantShare * 0.6) + populationFactor * 0.2);
        const foodIncome = roundTo(regionalEconomy * 1.35 + kingdom.population.groups.peasants * 3.5);
        const woodIncome = roundTo(regionalEconomy * 0.45);
        const ironIncome = roundTo(regionalMilitaryValue * 0.3);
        const faithIncome = roundTo(ownedRegionIds.length * 0.12 * (1 + kingdom.religion.authority));
        const legitimacyIncome = roundTo(0.08 + kingdom.stability / 500);

        const goldUpkeep = roundTo(armyManpower / 8_500 + kingdom.administration.usedCapacity * 0.045 + kingdom.economy.corruption * 1.8);
        const foodUpkeep = roundTo(kingdom.population.total / 95_000 + armyManpower / 5_500);
        const woodUpkeep = roundTo(armyManpower / 30_000);
        const ironUpkeep = roundTo((armyManpower / 22_000) * (0.8 + soldierShare));
        const faithUpkeep = roundTo(0.04 + (1 - kingdom.religion.tolerance) * 0.2);
        const legitimacyUpkeep = roundTo((100 - kingdom.stability) / 900);

        kingdom.economy.incomePerTick = createEmptyStock();
        kingdom.economy.upkeepPerTick = createEmptyStock();

        kingdom.economy.incomePerTick[ResourceType.Gold] = goldIncome;
        kingdom.economy.incomePerTick[ResourceType.Food] = foodIncome;
        kingdom.economy.incomePerTick[ResourceType.Wood] = woodIncome;
        kingdom.economy.incomePerTick[ResourceType.Iron] = ironIncome;
        kingdom.economy.incomePerTick[ResourceType.Faith] = faithIncome;
        kingdom.economy.incomePerTick[ResourceType.Legitimacy] = legitimacyIncome;

        kingdom.economy.upkeepPerTick[ResourceType.Gold] = goldUpkeep;
        kingdom.economy.upkeepPerTick[ResourceType.Food] = foodUpkeep;
        kingdom.economy.upkeepPerTick[ResourceType.Wood] = woodUpkeep;
        kingdom.economy.upkeepPerTick[ResourceType.Iron] = ironUpkeep;
        kingdom.economy.upkeepPerTick[ResourceType.Faith] = faithUpkeep;
        kingdom.economy.upkeepPerTick[ResourceType.Legitimacy] = legitimacyUpkeep;

        for (const resource of Object.values(ResourceType)) {
          kingdom.economy.stock[resource] = roundTo(
            kingdom.economy.stock[resource] + kingdom.economy.incomePerTick[resource] - kingdom.economy.upkeepPerTick[resource]
          );
        }

        ensureResourceNonNegative(kingdom);

        if (kingdom.economy.stock[ResourceType.Food] < kingdom.population.total / 8_000 && context.nextState.meta.tick % 5 === 0) {
          context.events.push({
            id: createEventId("evt_food", context.nextState.meta.tick, context.events.length),
            type: "economy.food_shortage",
            actorKingdomId: kingdom.id,
            payload: {
              stock: kingdom.economy.stock[ResourceType.Food],
              required: roundTo(kingdom.population.total / 8_000)
            },
            occurredAt: context.now
          });
        }
      }
    }
  };
}
