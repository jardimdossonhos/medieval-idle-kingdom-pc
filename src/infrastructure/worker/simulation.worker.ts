import { World } from "../../core/ecs/World";
import { EconomyComponent } from "../../core/components/EconomyComponent";
import { EconomySystem } from "../../core/systems/EconomySystem";

let intervalId: number | null = null;

let world: World | null = null;
let economy: EconomyComponent | null = null;
const economySystem = new EconomySystem(1.5);

const activeEntities: number[] = [];

type WorkerCommand =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "INIT"; payload: { entityCount: number } };

interface TickMessage {
  type: "TICK";
  payload: {
    timestamp: number;
    goldData: Float64Array;
  };
}

function startClock(): void {
  if (intervalId !== null) {
    return;
  }

  if (!world || !economy || activeEntities.length === 0) {
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

    if (economy) {
      economySystem.update(deltaTimeSeconds, economy, activeEntities);
    }

    const message: TickMessage = {
      type: "TICK",
      payload: { timestamp: Date.now(), goldData: economy ? economy.gold : new Float64Array(0) }
    };
    self.postMessage(message);
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
      activeEntities.length = 0;

      for (let i = 0; i < count; i += 1) {
        const entityId = world.createEntity();
        activeEntities.push(entityId);
        if (economy) {
          // Ouro inicial aleatório entre 100 e 500
          economy.gold[entityId] = 100 + Math.random() * 400;
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

