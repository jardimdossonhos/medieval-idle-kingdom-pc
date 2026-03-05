import type { SaveSlotId } from "../../core/contracts/game-ports";

export const AUTO_SLOT_COUNT = 5;
export const MANUAL_SLOT_ID: SaveSlotId = "manual-1";
export const SAFETY_SLOT_ID: SaveSlotId = "safety-1";

export function createAutoSlotId(index: number): SaveSlotId {
  const bounded = ((index % AUTO_SLOT_COUNT) + AUTO_SLOT_COUNT) % AUTO_SLOT_COUNT;
  return `auto-${bounded + 1}`;
}

export function nextAutoSlot(currentIndex: number): number {
  return (currentIndex + 1) % AUTO_SLOT_COUNT;
}
