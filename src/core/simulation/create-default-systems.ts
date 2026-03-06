import type { DiplomacyResolver, INpcDecisionService, WarResolver } from "../contracts/services";
import type { SimulationSystem } from "./tick-pipeline";
import { createAdministrationSystem } from "./systems/administration-system";
import { createAutomationSystem } from "./systems/automation-system";
import { createDiplomacySystem } from "./systems/diplomacy-system";
import { createEconomySystem } from "./systems/economy-system";
import { createEventLogSystem } from "./systems/event-log-system";
import { createNpcDecisionSystem } from "./systems/npc-decision-system";
import { createPopulationSystem } from "./systems/population-system";
import { createReligionSystem } from "./systems/religion-system";
import { createTechnologySystem } from "./systems/technology-system";
import { createVictorySystem } from "./systems/victory-system";
import { createWarSystem } from "./systems/war-system";
import { createWorldActivitySystem } from "./systems/world-activity-system";

export interface SimulationServices {
  npcDecisionService: INpcDecisionService;
  diplomacyResolver: DiplomacyResolver;
  warResolver: WarResolver;
}

export function createDefaultSimulationSystems(services: SimulationServices): SimulationSystem[] {
  return [
    createAutomationSystem(),
    createEconomySystem(),
    createPopulationSystem(),
    createReligionSystem(),
    createAdministrationSystem(),
    createTechnologySystem(),
    createDiplomacySystem(services.diplomacyResolver),
    createNpcDecisionSystem(services.npcDecisionService, services.diplomacyResolver, services.warResolver),
    createWarSystem(services.warResolver),
    createWorldActivitySystem(),
    createVictorySystem(),
    createEventLogSystem()
  ];
}
