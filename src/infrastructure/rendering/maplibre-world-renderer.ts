import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { KingdomState } from "../../core/models/game-state";
import type { WorldState } from "../../core/models/world";
import type { GameMapRenderer, MapLayerMode, MapRenderContext, MapSelection } from "./map-renderer";

interface CountryFeatureProperties {
  regionId?: string;
  name?: string;
  ownerId?: string;
  ownerName?: string;
  ownerColor?: string;
  unrest?: number;
  contested?: number;
  recentlyCaptured?: number;
  selected?: number;
}

interface CountryFeature {
  type: "Feature";
  geometry: Geometry;
  properties: CountryFeatureProperties;
}

interface CountryFeatureCollection {
  type: "FeatureCollection";
  features: CountryFeature[];
}

const SOURCE_ID = "world-countries";
const FILL_LAYER_ID = "countries-fill";
const BORDER_LAYER_ID = "countries-border";

export class MapLibreWorldRenderer implements GameMapRenderer {
  private map: Map | null = null;
  private geojson: CountryFeatureCollection | null = null;
  private layerMode: MapLayerMode = "owner";
  private selectedRegionId: string | null = null;
  private mounted = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly onRegionSelect?: (selection: MapSelection) => void
  ) {}

  async mount(world: WorldState, kingdoms: Record<string, KingdomState>): Promise<void> {
    if (!this.map) {
      this.map = new maplibregl.Map({
        container: this.container,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: {
                "background-color": "#d8c7aa"
              }
            }
          ]
        },
        center: [10, 28],
        zoom: 2.2,
        maxZoom: 7,
        minZoom: 1.35,
        dragRotate: false
      });

      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      this.map.scrollZoom.enable();
      this.map.dragPan.enable();
      this.map.doubleClickZoom.enable();
      this.map.touchZoomRotate.enable();
    }

    if (!this.geojson) {
      this.geojson = await this.loadGeoJson();
    }

    if (!this.mounted) {
      await this.mountLayers();
      this.mounted = true;
    }

    this.render(world, kingdoms);
  }

  setLayer(layer: MapLayerMode): void {
    this.layerMode = layer;
    this.applyLayerMode();
  }

  render(world: WorldState, kingdoms: Record<string, KingdomState>, context?: MapRenderContext): void {
    if (!this.map || !this.geojson) {
      return;
    }

    const contestedRegionIds = context?.contestedRegionIds?.length
      ? new Set(context.contestedRegionIds)
      : new Set(
        Object.keys(world.regions)
          .sort()
          .filter((regionId) => world.regions[regionId].devastation > 0.22)
      );
    const recentlyCapturedRegionIds = context?.recentlyCapturedRegionIds?.length
      ? new Set(context.recentlyCapturedRegionIds)
      : new Set<string>();

    for (const feature of this.geojson.features) {
      const regionId = feature.properties.regionId;
      if (!regionId) {
        continue;
      }

      const region = world.regions[regionId];
      if (!region) {
        feature.properties.ownerId = "neutral";
        feature.properties.ownerName = "Fora da campanha";
        feature.properties.ownerColor = "#857a67";
        feature.properties.unrest = 0;
        feature.properties.contested = 0;
        feature.properties.recentlyCaptured = 0;
        feature.properties.selected = this.selectedRegionId === regionId ? 1 : 0;
        continue;
      }

      const owner = kingdoms[region.ownerId];

      feature.properties.ownerId = owner?.id ?? region.ownerId;
      feature.properties.ownerName = owner?.name ?? region.ownerId;
      feature.properties.ownerColor = colorForKingdom(owner?.id ?? region.ownerId);
      feature.properties.unrest = region.unrest;
      feature.properties.contested = contestedRegionIds.has(regionId) ? 1 : 0;
      feature.properties.recentlyCaptured = recentlyCapturedRegionIds.has(regionId) ? 1 : 0;
      feature.properties.selected = this.selectedRegionId === regionId ? 1 : 0;
    }

    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(this.geojson as unknown as FeatureCollection);
    this.applyLayerMode();
  }

  destroy(): void {
    if (!this.map) {
      return;
    }

    this.map.remove();
    this.map = null;
    this.mounted = false;
    this.geojson = null;
  }

  private async mountLayers(): Promise<void> {
    if (!this.map) {
      return;
    }

    if (!this.map.isStyleLoaded()) {
      await new Promise<void>((resolve) => {
        this.map?.once("load", () => resolve());
      });
    }

    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, {
        type: "geojson",
        data: this.geojson as unknown as FeatureCollection
      });
    }

    if (!this.map.getLayer(FILL_LAYER_ID)) {
      this.map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": ["coalesce", ["get", "ownerColor"], "#8d816e"],
          "fill-opacity": 0.78
        }
      });
    }

    if (!this.map.getLayer(BORDER_LAYER_ID)) {
      this.map.addLayer({
        id: BORDER_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "selected"], 1],
            "#f2d067",
            ["==", ["coalesce", ["get", "recentlyCaptured"], 0], 1],
            "#ef9e2b",
            "#4a3722"
          ],
          "line-width": [
            "case",
            ["==", ["get", "selected"], 1],
            2.8,
            ["==", ["coalesce", ["get", "recentlyCaptured"], 0], 1],
            2.2,
            1.1
          ],
          "line-opacity": [
            "case",
            ["==", ["coalesce", ["get", "contested"], 0], 1],
            0.95,
            0.8
          ]
        }
      });
    }

    this.map.on("click", FILL_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      const regionId = feature?.properties?.regionId;
      const label = feature?.properties?.name;

      if (typeof regionId === "string") {
        this.selectedRegionId = regionId;
        this.onRegionSelect?.({
          regionId,
          label: typeof label === "string" ? label : regionId
        });
      }
    });

    this.map.on("mouseenter", FILL_LAYER_ID, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = "pointer";
      }
    });

    this.map.on("mouseleave", FILL_LAYER_ID, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = "";
      }
    });
  }

  private async loadGeoJson(): Promise<CountryFeatureCollection> {
    const relativeCandidates = ["assets/maps/world-countries-v1.geojson", "assets/maps/world-countries-v0.geojson"];
    const resolvedUrls = new Set<string>();

    for (const relativePath of relativeCandidates) {
      resolvedUrls.add(new URL(relativePath, document.baseURI).toString());
      resolvedUrls.add(new URL(`./${relativePath}`, window.location.href).toString());
    }

    for (const url of resolvedUrls) {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as CountryFeatureCollection;
      if (payload.type === "FeatureCollection" && Array.isArray(payload.features) && payload.features.length > 0) {
        return payload;
      }
    }

    throw new Error("Falha ao carregar GeoJSON do mapa mundial.");
  }

  private applyLayerMode(): void {
    if (!this.map || !this.map.getLayer(FILL_LAYER_ID)) {
      return;
    }

    switch (this.layerMode) {
      case "owner":
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", ["coalesce", ["get", "ownerColor"], "#8d816e"]);
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", 0.8);
        break;
      case "unrest":
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "unrest"], 0],
          0,
          "#3e6b57",
          0.45,
          "#bb7a2a",
          0.75,
          "#ad2a24"
        ]);
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", 0.82);
        break;
      case "war":
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", [
          "case",
          ["==", ["coalesce", ["get", "contested"], 0], 1],
          "#a31f1f",
          ["coalesce", ["get", "ownerColor"], "#8d816e"]
        ]);
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", [
          "case",
          ["==", ["coalesce", ["get", "contested"], 0], 1],
          0.95,
          0.55
        ]);
        break;
    }
  }
}

function colorForKingdom(kingdomId: string): string {
  const palette = ["#8f5b3c", "#4f6d52", "#5d5277", "#9b6c2e", "#435b78", "#7d4f5f"];
  const hash = kingdomId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}
