import type { GameState, KingdomState } from "../../models/game-state";
import type { KingdomId } from "../../models/types";
import { ResourceType } from "../../models/enums";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getPlayerKingdom(state: GameState): KingdomState {
  const player = Object.values(state.kingdoms).find((kingdom) => kingdom.isPlayer);

  if (!player) {
    throw new Error("No player kingdom found in game state.");
  }

  return player;
}

export function getOwnedRegionIds(state: GameState, kingdomId: KingdomId): string[] {
  return Object.values(state.world.regions)
    .filter((region) => region.ownerId === kingdomId)
    .map((region) => region.regionId);
}

export function ensureResourceNonNegative(kingdom: KingdomState): void {
  for (const key of Object.values(ResourceType)) {
    if (kingdom.economy.stock[key] < 0) {
      kingdom.economy.stock[key] = 0;
    }
  }
}

export function createEventId(prefix: string, tick: number, sequence: number): string {
  return `${prefix}_${tick}_${sequence}`;
}
