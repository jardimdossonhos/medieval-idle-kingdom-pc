import type { GameStateRepository, SaveRepository } from "../core/contracts/game-ports";
import type { ClockService, INpcDecisionService } from "../core/contracts/services";
import type { GameState } from "../core/models/game-state";
import { TickPipeline, type SimulationSystem } from "../core/simulation/tick-pipeline";

export interface GameSessionDeps {
  gameStateRepository: GameStateRepository;
  saveRepository: SaveRepository;
  clock: ClockService;
  npcDecisionService: INpcDecisionService;
  systems: SimulationSystem[];
}

export class GameSession {
  private readonly pipeline: TickPipeline;
  private currentState: GameState | null = null;

  constructor(private readonly deps: GameSessionDeps) {
    this.pipeline = new TickPipeline(deps.systems);
  }

  async bootstrap(initialState: GameState): Promise<GameState> {
    const persisted = await this.deps.gameStateRepository.loadCurrent();
    this.currentState = persisted ?? initialState;
    await this.deps.gameStateRepository.saveCurrent(this.currentState);
    return this.currentState;
  }

  start(): void {
    this.deps.clock.start((deltaMs, now) => {
      if (!this.currentState || this.currentState.meta.paused) {
        return;
      }

      const result = this.pipeline.run(this.currentState, deltaMs, now);
      this.currentState = result.state;
      void this.deps.gameStateRepository.saveCurrent(this.currentState);
    });
  }

  stop(): void {
    this.deps.clock.stop();
  }

  getState(): GameState {
    if (!this.currentState) {
      throw new Error("GameSession not bootstrapped.");
    }

    return this.currentState;
  }
}
