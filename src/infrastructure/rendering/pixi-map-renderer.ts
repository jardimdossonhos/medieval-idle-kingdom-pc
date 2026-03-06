import { Application, Container, Graphics, Text } from "pixi.js";
import type { KingdomState } from "../../core/models/game-state";
import type { RegionDefinition, WorldState } from "../../core/models/world";
import type { GameMapRenderer, MapLayerMode, MapSelection } from "./map-renderer";

interface RegionNode {
  shape: Graphics;
  label: Text;
}

const REGION_WIDTH = 128;
const REGION_HEIGHT = 62;

export class PixiMapRenderer implements GameMapRenderer {
  private app: Application | null = null;
  private layerContainer: Container | null = null;
  private readonly regionNodes = new Map<string, RegionNode>();
  private selectedRegionId: string | null = null;
  private mapLayer: MapLayerMode = "owner";

  constructor(
    private readonly container: HTMLElement,
    private readonly onRegionSelect?: (selection: MapSelection) => void
  ) {}

  async mount(world: WorldState, kingdoms: Record<string, KingdomState>): Promise<void> {
    if (!this.app) {
      this.app = new Application();
      await this.app.init({
        resizeTo: this.container,
        background: "#d9c8a7",
        antialias: true
      });

      this.container.innerHTML = "";
      this.container.appendChild(this.app.canvas);
      this.layerContainer = new Container();
      this.app.stage.addChild(this.layerContainer);
    }

    this.render(world, kingdoms);
  }

  setLayer(layer: MapLayerMode): void {
    this.mapLayer = layer;
  }

  render(world: WorldState, kingdoms: Record<string, KingdomState>): void {
    if (!this.app || !this.layerContainer) {
      return;
    }

    if (this.regionNodes.size === 0) {
      this.drawRegions(world);
    }

    for (const [regionId, regionState] of Object.entries(world.regions)) {
      const node = this.regionNodes.get(regionId);
      if (!node) {
        continue;
      }

      const owner = kingdoms[regionState.ownerId];
      const selected = this.selectedRegionId === regionId;

      let fillColor = owner ? colorForKingdom(owner.id) : 0x8d816e;
      if (this.mapLayer === "unrest") {
        fillColor = colorForUnrest(regionState.unrest);
      }

      if (this.mapLayer === "war") {
        fillColor = colorForWarPressure(regionState.devastation);
      }

      redrawRegionShape(node.shape, world.definitions[regionId], fillColor, selected);
    }
  }

  destroy(): void {
    if (!this.app) {
      return;
    }

    this.app.destroy(true);
    this.app = null;
    this.layerContainer = null;
    this.regionNodes.clear();
  }

  private drawRegions(world: WorldState): void {
    if (!this.layerContainer) {
      return;
    }

    this.layerContainer.removeChildren();
    this.regionNodes.clear();

    for (const region of Object.values(world.definitions)) {
      const shape = new Graphics();
      shape.eventMode = "static";
      shape.cursor = "pointer";

      shape.on("pointertap", () => {
        this.selectedRegionId = region.id;
        this.onRegionSelect?.({ regionId: region.id, label: region.name });
      });

      const label = new Text({
        text: region.name,
        style: {
          fontFamily: "Georgia",
          fontSize: 12,
          fill: "#2a241b",
          align: "center"
        }
      });
      label.anchor.set(0.5);
      label.x = region.center.x;
      label.y = region.center.y;

      redrawRegionShape(shape, region, 0x927a61, false);

      this.layerContainer.addChild(shape);
      this.layerContainer.addChild(label);
      this.regionNodes.set(region.id, { shape, label });
    }
  }
}

function redrawRegionShape(shape: Graphics, region: RegionDefinition, fillColor: number, selected: boolean): void {
  const x = region.center.x - REGION_WIDTH / 2;
  const y = region.center.y - REGION_HEIGHT / 2;

  shape.clear();
  shape.lineStyle(selected ? 3 : 2, selected ? 0xf2d067 : 0x4a3722, 1);
  shape.beginFill(fillColor, selected ? 0.95 : 0.82);
  shape.drawRoundedRect(x, y, REGION_WIDTH, REGION_HEIGHT, 14);
  shape.endFill();
}

function colorForKingdom(kingdomId: string): number {
  const palette = [0x8f5b3c, 0x4f6d52, 0x5d5277, 0x9b6c2e, 0x435b78, 0x7d4f5f];
  const hash = kingdomId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function colorForUnrest(unrest: number): number {
  if (unrest >= 0.7) {
    return 0xad2a24;
  }

  if (unrest >= 0.45) {
    return 0xc57127;
  }

  return 0x42715d;
}

function colorForWarPressure(devastation: number): number {
  if (devastation >= 0.35) {
    return 0x8f2020;
  }

  if (devastation >= 0.18) {
    return 0xb6542e;
  }

  return 0x4f5f6b;
}
