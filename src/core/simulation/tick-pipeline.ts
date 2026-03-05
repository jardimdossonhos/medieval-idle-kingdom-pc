import type { GameState } from "../models/game-state";
import type { DomainEvent } from "../models/events";

export interface TickContext {
  previousState: GameState;
  nextState: GameState;
  deltaMs: number;
  now: number;
  events: DomainEvent[];
}

export interface SimulationSystem {
  id: string;
  run(context: TickContext): void;
}

export interface TickResult {
  state: GameState;
  events: DomainEvent[];
}

export class TickPipeline {
  constructor(private readonly systems: SimulationSystem[]) {}

  run(previousState: GameState, deltaMs: number, now: number): TickResult {
    const context: TickContext = {
      previousState,
      nextState: structuredClone(previousState),
      deltaMs,
      now,
      events: []
    };

    for (const system of this.systems) {
      system.run(context);
    }

    context.nextState.meta.tick += 1;
    context.nextState.meta.lastUpdatedAt = now;

    return {
      state: context.nextState,
      events: context.events
    };
  }
}
