import { World } from "../../core/ecs/World";
import { EconomyComponent } from "../../core/components/EconomyComponent";
import { PopulationComponent } from "../../core/components/PopulationComponent";
import type { EcsState } from "../../core/models/game-state";
import { EconomySystem } from "../../core/systems/EconomySystem";
import { PopulationSystem } from "../../core/systems/PopulationSystem";

let intervalId: number | null = null;

let world: World | null = null;
let economy: EconomyComponent | null = null;
let population: PopulationComponent | null = null;
const economySystem = new EconomySystem(1.5);
const populationSystem = new PopulationSystem();

const activeEntities: number[] = [];

type WorkerCommand =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "INIT"; payload: { entityCount: number } }
  | { type: "RESTORE_ECS_STATE"; payload: EcsState }
  | { type: "EXTRACT_SAVE_STATE" };

interface TickMessage {
  type: "TICK";
  payload: {
    timestamp: number;
    goldData: Float64Array;
    foodData: Float64Array;
    woodData: Float64Array;
    ironData: Float64Array;
    faithData: Float64Array;
    legitimacyData: Float64Array;
    populationTotalData: Float64Array;
    populationGrowthRateData: Float64Array;
  };
}

function startClock(): void {
  if (intervalId !== null) {
    return;
  }

  if (!world || !economy || !population || activeEntities.length === 0) {
    // Ainda não inicializado via INIT; não inicia o relógio.
    return;
  }

  let lastTickMs = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

  intervalId = self.setInterval(() => {
    const nowMs = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
    const deltaTimeSeconds = Math.max(0, (nowMs - lastTickMs) / 1_000);
    lastTickMs = nowMs;

    if (economy && population) {
      economySystem.update(deltaTimeSeconds, economy, activeEntities);
      populationSystem.update(deltaTimeSeconds, population, activeEntities);

      const message: TickMessage = {
        type: "TICK",
        payload: {
          timestamp: Date.now(),
          goldData: economy.gold,
          foodData: economy.food,
          woodData: economy.wood,
          ironData: economy.iron,
          faithData: economy.faith,
          legitimacyData: economy.legitimacy,
          populationTotalData: population.total,
          populationGrowthRateData: population.growthRate
        }
      };
      self.postMessage(message);
    }
  }, 1_000);
}

function stopClock(): void {
  if (intervalId !== null) {
    self.clearInterval(intervalId);
    intervalId = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;

  if (!command || typeof command.type !== "string") {
    return;
  }

  switch (command.type) {
    case "INIT": {
      const count = command.payload?.entityCount ?? 0;
      world = new World();
      economy = new EconomyComponent(count > 0 ? count : 1);
      population = new PopulationComponent(count > 0 ? count : 1);
      activeEntities.length = 0;
      // Apenas aloca as entidades. O preenchimento virá do RESTORE_ECS_STATE ou de uma lógica de "novo jogo".
      for (let i = 0; i < count; i += 1) {
        const entityId = world.createEntity();
        activeEntities.push(entityId);
      }
      break;
    }
    case "EXTRACT_SAVE_STATE": {
      if (!economy || !population) {
        return;
      }

      const saveData: EcsState = {
        gold: Array.from(economy.gold),
        food: Array.from(economy.food),
        wood: Array.from(economy.wood),
        iron: Array.from(economy.iron),
        faith: Array.from(economy.faith || []),
        legitimacy: Array.from(economy.legitimacy || []),
        populationTotal: Array.from(population.total),
        populationGrowthRate: Array.from(population.growthRate)
      };

      self.postMessage({ type: "SAVE_STATE_DATA", payload: saveData });
      break;
    }
    case "RESTORE_ECS_STATE": {
      if (!economy || !population) {
        return;
      }
      const state = command.payload;
      // Garante que os arrays existem e têm o tamanho correto antes de copiar.
      if (state.gold?.length === economy.gold.length) {
        economy.gold.set(state.gold);
        economy.food.set(state.food);
        economy.wood.set(state.wood);
        economy.iron.set(state.iron);
        // Garante que os componentes opcionais também sejam restaurados se existirem
        if (economy.faith && state.faith) {
          economy.faith.set(state.faith);
        }
        if (economy.legitimacy && state.legitimacy) {
          economy.legitimacy.set(state.legitimacy);
        }
        if (population.total && state.populationTotal) {
          population.total.set(state.populationTotal);
        }
        if (population.growthRate && state.populationGrowthRate) {
          population.growthRate.set(state.populationGrowthRate);
        }
      }
      break;
    }
    case "START":
      startClock();
      break;
    case "STOP":
      stopClock();
      break;
  }
};
