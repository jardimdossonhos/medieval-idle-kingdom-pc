import type { KingdomState } from "../../core/models/game-state";
import type { WorldState } from "../../core/models/world";
import type { GameMapRenderer, MapLayerMode, MapSelection } from "./map-renderer";
import { MapLibreWorldRenderer } from "./maplibre-world-renderer";
import { PixiMapRenderer } from "./pixi-map-renderer";

export class HybridMapRenderer implements GameMapRenderer {
  private active: GameMapRenderer;

  constructor(
    private readonly container: HTMLElement,
    private readonly onRegionSelect?: (selection: MapSelection) => void
  ) {
    this.active = new MapLibreWorldRenderer(container, onRegionSelect);
  }

  async mount(world: WorldState, kingdoms: Record<string, KingdomState>): Promise<void> {
    try {
      await this.active.mount(world, kingdoms);
    } catch {
      this.active.destroy();
      this.active = new PixiMapRenderer(this.container, this.onRegionSelect);
      await this.active.mount(world, kingdoms);
    }
  }

  render(world: WorldState, kingdoms: Record<string, KingdomState>): void {
    this.active.render(world, kingdoms);
  }

  setLayer(layer: MapLayerMode): void {
    this.active.setLayer(layer);
  }

  destroy(): void {
    this.active.destroy();
  }
}
