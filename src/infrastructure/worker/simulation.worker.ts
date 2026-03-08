let intervalId: number | null = null;

type WorkerCommand =
  | { type: "START" }
  | { type: "STOP" };

interface TickMessage {
  type: "TICK";
  payload: {
    timestamp: number;
  };
}

function startClock(): void {
  if (intervalId !== null) {
    return;
  }

  intervalId = self.setInterval(() => {
    const message: TickMessage = {
      type: "TICK",
      payload: { timestamp: Date.now() }
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

