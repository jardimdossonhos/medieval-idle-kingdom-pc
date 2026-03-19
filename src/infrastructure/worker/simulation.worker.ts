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
  | { type: "EXTRACT_SAVE_STATE" }
  | { type: "PAUSE_AND_EXTRACT_STATE" }
  | { type: "RESUME" }
  | { type: "SET_TIME_SCALE"; payload: { speedMultiplier: number; isPaused: boolean } };

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

let debugTickCount = 0;
let speedMultiplier = 1;
let isPaused = false;
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
      if (!isPaused && speedMultiplier > 0) {
        const gameDeltaTime = deltaTimeSeconds * speedMultiplier;
        economySystem.update(gameDeltaTime, economy, activeEntities);
        populationSystem.update(gameDeltaTime, population, activeEntities);
      }

      debugTickCount++;
      if (debugTickCount % 40 === 0) { // Log aprox a cada 10s reais
        console.log(`[Worker Audit] Tick ${debugTickCount} | Delta: ${deltaTimeSeconds * speedMultiplier}s (Speed: ${speedMultiplier}x)`);
        console.log(`[Worker Audit] Entity 0 - Ouro: ${economy.gold[0]}, Pop Total: ${population.total[0]}, Pop Taxa: ${population.growthRate[0]}`);
        
        if (population.total[0] === 0 && population.growthRate[0] === 0) {
           console.warn("[Worker Audit] ALERTA: População ou taxa no índice 0 permanecem ZERADOS no Worker!");
        }
      }

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
  }, 250); // 4 ciclos por segundo real para fluidez visual (Buttery Smooth UI)
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
    case "SET_TIME_SCALE": {
      speedMultiplier = command.payload.speedMultiplier;
      isPaused = command.payload.isPaused;
      break;
    }
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
    case "PAUSE_AND_EXTRACT_STATE": {
      stopClock();
      if (!economy || !population) return;
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
    case "RESUME": {
      startClock();
      break;
    }
    case "RESTORE_ECS_STATE": {
      if (!economy || !population) {
        console.warn("[Worker] Ignorando RESTORE_ECS_STATE: economy ou population nulos!");
        return;
      }
      const state = command.payload;
      console.log("[Worker] Recebeu RESTORE_ECS_STATE. Lendo Ouro[0]:", state.gold ? state.gold[0] : 'Vazio', "| OuroData[0]:", (state as any).goldData ? (state as any).goldData[0] : 'Vazio');
      
      // Usamos o tamanho alocado internamente. Mesmo que o JSON recebido 
      // seja um objeto esparso, garantimos que todos os índices recebam o valor ou 0.
      if (state.gold) {
        const len = economy.gold.length;
        let modifiedCount = 0;
        for (let i = 0; i < len; i++) {
          economy.gold[i] = state.gold[i] || 0;
          economy.food[i] = state.food[i] || 0;
          economy.wood[i] = state.wood[i] || 0;
          economy.iron[i] = state.iron[i] || 0;
          if (economy.faith && state.faith) economy.faith[i] = state.faith[i] || 0;
          if (economy.legitimacy && state.legitimacy) economy.legitimacy[i] = state.legitimacy[i] || 0;
          if (population.total && state.populationTotal) population.total[i] = state.populationTotal[i] || 0;
          if (population.growthRate && state.populationGrowthRate) population.growthRate[i] = state.populationGrowthRate[i] || 0;
          if (economy.gold[i] > 0) modifiedCount++;
        }
        console.log(`[Worker] Preenchimento concluído. ${modifiedCount} entidades receberam ouro > 0.`);
      }
      
      // Handshake Crítico: Avisa a Main Thread que os dados foram restaurados com sucesso
      self.postMessage({ type: "WORKER_STATE_RESTORED" });
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
