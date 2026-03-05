import { buildSaveSummary } from "./save/build-save-summary";
import type { GameStateRepository, SaveRepository, SaveSlotId, SaveSnapshot, SaveSummary } from "../core/contracts/game-ports";
import type { ClockService, EventBus } from "../core/contracts/services";
import type { EventLogEntry } from "../core/models/events";
import type { GameState } from "../core/models/game-state";
import { TickPipeline, type SimulationSystem } from "../core/simulation/tick-pipeline";
import { createAutoSlotId, MANUAL_SLOT_ID, nextAutoSlot, SAFETY_SLOT_ID } from "../infrastructure/persistence/save-slots";

export interface GameSessionDeps {
  gameStateRepository: GameStateRepository;
  saveRepository: SaveRepository;
  clock: ClockService;
  eventBus: EventBus;
  systems: SimulationSystem[];
  autosaveEveryTicks?: number;
  maxOfflineTicks?: number;
}

type StateListener = (state: GameState) => void;

export class GameSession {
  private readonly pipeline: TickPipeline;
  private readonly listeners = new Set<StateListener>();
  private currentState: GameState | null = null;
  private accumulatedMs = 0;
  private ticksSinceAutosave = 0;
  private autoSlotIndex = 0;
  private ioQueue: Promise<void> = Promise.resolve();
  private sessionLogSeq = 0;

  constructor(private readonly deps: GameSessionDeps) {
    this.pipeline = new TickPipeline(deps.systems);
  }

  async bootstrap(initialState: GameState): Promise<GameState> {
    const persisted = await this.deps.gameStateRepository.loadCurrent();
    const recovered = persisted ?? (await this.restoreFromLatestSave());
    const baseState = recovered ?? initialState;
    const now = this.deps.clock.now();

    const offlineResult = this.runOfflineProgression(baseState, now);
    this.currentState = offlineResult.state;
    this.currentState.meta.lastClosedAt = null;
    this.currentState.meta.lastUpdatedAt = now;

    if (offlineResult.ticks > 0) {
      this.currentState.events = [
        this.createSessionLog(
          "Progresso offline aplicado",
          `Foram simulados ${offlineResult.ticks} ticks durante sua ausência.`,
          "info",
          now
        ),
        ...this.currentState.events
      ].slice(0, 180);
    }

    await this.deps.gameStateRepository.saveCurrent(this.currentState);
    this.emitState();
    return this.currentState;
  }

  start(): void {
    this.deps.clock.start((deltaMs, now) => {
      this.onClockTick(deltaMs, now);
    });
  }

  stop(): void {
    this.deps.clock.stop();

    if (!this.currentState) {
      return;
    }

    this.currentState.meta.lastClosedAt = this.deps.clock.now();
    this.enqueueIo(async () => {
      if (this.currentState) {
        await this.deps.gameStateRepository.saveCurrent(this.currentState);
      }
    });
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);

    if (this.currentState) {
      listener(this.currentState);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  setPaused(paused: boolean): void {
    const state = this.requireState();
    state.meta.paused = paused;
    this.persistCurrent();
    this.emitState();
  }

  togglePause(): void {
    const state = this.requireState();
    this.setPaused(!state.meta.paused);
  }

  setSpeed(multiplier: number): void {
    const state = this.requireState();
    state.meta.speedMultiplier = Math.max(0.5, Math.min(8, multiplier));
    this.persistCurrent();
    this.emitState();
  }

  async saveManual(): Promise<void> {
    const snapshot = this.buildSnapshot(MANUAL_SLOT_ID);
    await this.deps.saveRepository.saveToSlot(snapshot);
  }

  async saveSafety(reason: string): Promise<void> {
    const state = this.requireState();
    state.events = [
      this.createSessionLog("Save de segurança", `Registro criado antes de: ${reason}`, "warning", this.deps.clock.now()),
      ...state.events
    ].slice(0, 180);

    const snapshot = this.buildSnapshot(SAFETY_SLOT_ID);
    await this.deps.saveRepository.saveToSlot(snapshot);
    await this.deps.gameStateRepository.saveCurrent(state);
    this.emitState();
  }

  async listSaveSlots(): Promise<SaveSummary[]> {
    return this.deps.saveRepository.listSlots();
  }

  async loadSlot(slotId: SaveSlotId): Promise<GameState> {
    const snapshot = await this.deps.saveRepository.loadFromSlot(slotId);

    if (!snapshot) {
      throw new Error(`Save slot ${slotId} não encontrado ou corrompido.`);
    }

    this.currentState = structuredClone(snapshot.state);
    this.currentState.meta.lastUpdatedAt = this.deps.clock.now();
    this.currentState.meta.paused = false;

    await this.deps.gameStateRepository.saveCurrent(this.currentState);
    this.emitState();
    return this.currentState;
  }

  getState(): GameState {
    return this.requireState();
  }

  private onClockTick(deltaMs: number, now: number): void {
    const state = this.currentState;
    if (!state || state.meta.paused) {
      return;
    }

    void now;

    this.accumulatedMs += deltaMs * state.meta.speedMultiplier;

    let progressed = false;
    let simNow = state.meta.lastUpdatedAt;

    while (true) {
      const current = this.currentState;
      if (!current) {
        break;
      }

      const tickDurationMs = Math.max(1, current.meta.tickDurationMs);

      if (this.accumulatedMs < tickDurationMs) {
        break;
      }

      // Advance simulated time deterministically even if multiple ticks are processed in a single clock callback.
      simNow = Math.max(simNow, current.meta.lastUpdatedAt) + tickDurationMs;

      const result = this.pipeline.run(current, tickDurationMs, simNow);
      this.currentState = result.state;
      progressed = true;
      this.ticksSinceAutosave += 1;

      for (const event of result.events) {
        this.deps.eventBus.publish(event);
      }

      if (this.ticksSinceAutosave >= (this.deps.autosaveEveryTicks ?? 5)) {
        this.ticksSinceAutosave = 0;
        this.runAutosave();
      }

      this.accumulatedMs -= tickDurationMs;
    }

    if (!progressed) {
      return;
    }

    this.persistCurrent();
    this.emitState();
  }

  private runAutosave(): void {
    if (!this.currentState) {
      return;
    }

    const slotId = createAutoSlotId(this.autoSlotIndex);
    const snapshot = this.buildSnapshot(slotId);

    this.autoSlotIndex = nextAutoSlot(this.autoSlotIndex);

    this.enqueueIo(async () => {
      await this.deps.saveRepository.saveToSlot(snapshot);
    });
  }

  private buildSnapshot(slotId: SaveSlotId): SaveSnapshot {
    const state = this.requireState();
    const now = this.deps.clock.now();

    return {
      summary: buildSaveSummary(slotId, state, now),
      state: structuredClone(state)
    };
  }

  private persistCurrent(): void {
    this.enqueueIo(async () => {
      if (this.currentState) {
        await this.deps.gameStateRepository.saveCurrent(this.currentState);
      }
    });
  }

  private enqueueIo(action: () => Promise<void>): void {
    this.ioQueue = this.ioQueue
      .then(action)
      .catch((error: unknown) => {
        console.error("Falha em operação de persistência", error);
      });
  }

  private async restoreFromLatestSave(): Promise<GameState | null> {
    const slots = await this.deps.saveRepository.listSlots();

    for (const slot of slots) {
      const snapshot = await this.deps.saveRepository.loadFromSlot(slot.slotId);
      if (snapshot) {
        return structuredClone(snapshot.state);
      }
    }

    return null;
  }

  private runOfflineProgression(state: GameState, now: number): { state: GameState; ticks: number } {
    const lastSnapshotAt = state.meta.lastClosedAt ?? state.meta.lastUpdatedAt;
    if (!lastSnapshotAt || lastSnapshotAt >= now) {
      return { state, ticks: 0 };
    }

    const elapsedMs = now - lastSnapshotAt;
    const maxTicks = this.deps.maxOfflineTicks ?? 1_200;
    const desiredTicks = Math.floor(elapsedMs / Math.max(1, state.meta.tickDurationMs));
    const ticksToSimulate = Math.max(0, Math.min(desiredTicks, maxTicks));

    let workingState = structuredClone(state);

    for (let index = 0; index < ticksToSimulate; index += 1) {
            const tickNow = lastSnapshotAt + (index + 1) * workingState.meta.tickDurationMs;
      const result = this.pipeline.run(workingState, workingState.meta.tickDurationMs, tickNow);
      workingState = result.state;
    }

    return {
      state: workingState,
      ticks: ticksToSimulate
    };
  }

  private emitState(): void {
    if (!this.currentState) {
      return;
    }

    for (const listener of this.listeners) {
      listener(this.currentState);
    }
  }

  private requireState(): GameState {
    if (!this.currentState) {
      throw new Error("Sessão ainda não inicializada.");
    }

    return this.currentState;
  }

  private createSessionLog(title: string, details: string, severity: EventLogEntry["severity"], now: number): EventLogEntry {
    const tick = this.currentState?.meta.tick ?? 0;
    const seq = this.sessionLogSeq++;
    return {
      id: `evt_session_${tick}_${seq}`,
      title,
      details,
      severity,
      occurredAt: now
    };
  }
}
