import type { KingdomState } from "../../core/models/game-state";
import type { WorldState } from "../../core/models/world";

export type MapLayerMode = "owner" | "unrest" | "war";

export interface MapSelection {
  regionId: string;
  label?: string;
}

export interface GameMapRenderer {
  mount(world: WorldState, kingdoms: Record<string, KingdomState>): Promise<void>;
  render(world: WorldState, kingdoms: Record<string, KingdomState>): void;
  setLayer(layer: MapLayerMode): void;
  destroy(): void;
}
