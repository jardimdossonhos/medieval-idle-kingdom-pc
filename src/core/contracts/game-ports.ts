import type { GameState } from "../models/game-state";
import type { TimestampMs } from "../models/types";

export type SaveSlotId = `auto-${number}` | "manual-1" | "safety-1";

export interface SaveSummary {
  slotId: SaveSlotId;
  savedAt: TimestampMs;
  campaignName: string;
  playerKingdomName: string;
  tick: number;
  territoryCount: number;
  militaryPower: number;
  economyPower: number;
  victoryAchieved: boolean;
}

export interface SaveSnapshot {
  summary: SaveSummary;
  state: GameState;
}

export interface GameStateRepository {
  loadCurrent(): Promise<GameState | null>;
  saveCurrent(state: GameState): Promise<void>;
  clearCurrent(): Promise<void>;
}

export interface SaveRepository {
  saveToSlot(snapshot: SaveSnapshot): Promise<void>;
  loadFromSlot(slotId: SaveSlotId): Promise<SaveSnapshot | null>;
  listSlots(): Promise<SaveSummary[]>;
  deleteSlot(slotId: SaveSlotId): Promise<void>;
}
