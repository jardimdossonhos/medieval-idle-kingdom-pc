import type { SaveSnapshot } from "../../core/contracts/game-ports";
import type { GameState } from "../../core/models/game-state";

export const SAVE_SCHEMA_VERSION = 1;

export interface SaveEnvelope {
  schemaVersion: number;
  storedAt: number;
  snapshot: SaveSnapshot;
}

export function toSaveEnvelope(snapshot: SaveSnapshot): SaveEnvelope {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    storedAt: Date.now(),
    snapshot
  };
}

export function isValidEnvelope(input: unknown): input is SaveEnvelope {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Partial<SaveEnvelope>;
  return (
    candidate.schemaVersion === SAVE_SCHEMA_VERSION &&
    typeof candidate.storedAt === "number" &&
    !!candidate.snapshot &&
    isValidGameStateShape(candidate.snapshot.state)
  );
}

export function isValidGameStateShape(input: unknown): input is GameState {
  if (!input || typeof input !== "object") {
    return false;
  }

  const state = input as Partial<GameState>;
  return (
    !!state.meta &&
    !!state.campaign &&
    !!state.world &&
    !!state.kingdoms &&
    !!state.victory
  );
}
