import type { GameState, KingdomState, WarState } from "../models/game-state";
import type { DomainEvent } from "../models/events";
import type { KingdomId, TickId, TimestampMs } from "../models/types";

export interface NpcDecision {
  actorKingdomId: KingdomId;
  actionType: string;
  priority: number;
  targetKingdomId?: KingdomId;
  targetRegionId?: string;
  payload: Record<string, unknown>;
}

export interface INpcDecisionService {
  decide(state: GameState, actorKingdomId: KingdomId): NpcDecision[];
}

export interface DiplomacyResolver {
  resolveTick(state: GameState, now: TimestampMs): GameState;
  applyDecision(state: GameState, decision: NpcDecision): GameState;
}

export interface WarResolver {
  resolveTick(state: GameState, now: TimestampMs): GameState;
  evaluateWarRisk(attacker: KingdomState, defender: KingdomState, state: GameState): number;
  declareWar(state: GameState, attackerId: KingdomId, defenderId: KingdomId): GameState;
  enforcePeace(state: GameState, warId: string): GameState;
}

export interface SyncEnvelope {
  revision: number;
  producedAt: TimestampMs;
  tick: TickId;
  payload: unknown;
}

export interface SyncAdapter {
  push(state: GameState): Promise<void>;
  pull(): Promise<SyncEnvelope | null>;
  merge(localState: GameState, remoteEnvelope: SyncEnvelope): Promise<GameState>;
}

export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe(eventType: string, listener: (event: DomainEvent) => void): () => void;
}

export interface ClockService {
  now(): TimestampMs;
  start(onTick: (deltaMs: number, now: TimestampMs) => void): void;
  stop(): void;
}

export interface WarForecast {
  warId: string;
  attackerStrength: number;
  defenderStrength: number;
  activeFronts: number;
}

export interface WarProjectionService {
  project(war: WarState): WarForecast;
}
