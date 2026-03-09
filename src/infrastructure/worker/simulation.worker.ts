import { World } from "../../core/ecs/World";
import { EconomyComponent } from "../../core/components/EconomyComponent";
import { EconomySystem } from "../../core/systems/EconomySystem";

let intervalId: number | null = null;

const world = new World();
const economy = new EconomyComponent(1_000);
const economySystem = new EconomySystem(1.5);

const activeEntities: number[] = [];
activeEntities.push(world.createEntity());

type WorkerCommand =
  | { type: "START" }
  | { type: "STOP" };

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

  let lastTickMs = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

  intervalId = self.setInterval(() => {
    const nowMs = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
    const deltaTimeSeconds = Math.max(0, (nowMs - lastTickMs) / 1_000);
    lastTickMs = nowMs;

    economySystem.update(deltaTimeSeconds, economy, activeEntities);

    const message: TickMessage = {
      type: "TICK",
      payload: { timestamp: Date.now(), goldData: economy.gold }
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
    case "START":
      startClock();
      break;
    case "STOP":
      stopClock();
      break;
  }
};

