import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { KingdomState } from "../../core/models/game-state";
import type { StaticWorldData } from "../../core/models/static-world-data";
import type { WorldState } from "../../core/models/world";
import type { GameMapRenderer, MapLayerMode, MapRenderContext, MapSelection } from "./map-renderer";

interface CountryFeatureProperties {
  regionId?: string;
  name?: string;
  ownerId?: string;
  ownerName?: string;
  ownerColor?: string;
  dominantFaith?: string;
  dominantShare?: number;
  minorityFaith?: string;
  minorityShare?: number;
  faithColor?: string;
  unrest?: number;
  contested?: number;
  recentlyCaptured?: number;
  pulse?: number;
  selected?: number;
  isAllied?: number;
  isEnemy?: number;
  wealthRatio?: number;
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

interface WarMarkerFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    regionId: string;
    label: string;
  };
}

interface WarMarkerFeatureCollection {
  type: "FeatureCollection";
  features: WarMarkerFeature[];
}

const SOURCE_ID = "world-countries";
const FILL_LAYER_ID = "countries-fill";
const CONTESTED_LAYER_ID = "countries-contested";
const BORDER_LAYER_ID = "countries-border";
const WAR_MARKER_SOURCE_ID = "war-markers";
const WAR_MARKER_LAYER_ID = "war-markers-circle";

export class MapLibreWorldRenderer implements GameMapRenderer {
  private map: Map | null = null;
  private geojson: CountryFeatureCollection | null = null;
  private readonly regionCenters = new globalThis.Map<string, [number, number]>();
  private layerMode: MapLayerMode = "owner";
  private selectedRegionId: string | null = null;
  private mounted = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly staticData?: StaticWorldData,
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
      this.indexRegionCenters(this.geojson);
    }

    if (!this.mounted) {
      await this.mountLayers();
      this.mounted = true;
    }

    this.map.resize();
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
    const playerAlliedRegionIds = context?.playerAlliedRegionIds?.length
      ? new Set(context.playerAlliedRegionIds)
      : new Set<string>();
    const playerEnemyRegionIds = context?.playerEnemyRegionIds?.length
      ? new Set(context.playerEnemyRegionIds)
      : new Set<string>();
    const animationClockMs = context?.animationClockMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());

    for (const feature of this.geojson.features) {
      const regionId = feature.properties.regionId;
      if (!regionId) {
        continue;
      }

      const region = world.regions[regionId];
      const isRecentlyCaptured = recentlyCapturedRegionIds.has(regionId);
      const pulse = isRecentlyCaptured ? buildPulse(animationClockMs, regionId) : 0;

      if (!region) {
        feature.properties.ownerId = "neutral";
        feature.properties.ownerName = "Fora da campanha";
        feature.properties.ownerColor = "#857a67";
        feature.properties.dominantFaith = "unknown";
        feature.properties.dominantShare = 0;
        feature.properties.minorityFaith = undefined;
        feature.properties.minorityShare = undefined;
        feature.properties.faithColor = "#6f6352";
        feature.properties.unrest = 0;
        feature.properties.contested = 0;
        feature.properties.recentlyCaptured = 0;
        feature.properties.pulse = pulse;
        feature.properties.selected = this.selectedRegionId === regionId ? 1 : 0;
        feature.properties.isAllied = 0;
        feature.properties.isEnemy = 0;
        feature.properties.wealthRatio = 0;
        continue;
      }

      const owner = kingdoms[region.ownerId];

      feature.properties.ownerId = owner?.id ?? region.ownerId;
      feature.properties.ownerName = owner?.name ?? region.ownerId;
      feature.properties.ownerColor = colorForKingdom(owner?.id ?? region.ownerId);
      feature.properties.dominantFaith = region.dominantFaith;
      feature.properties.dominantShare = region.dominantShare;
      feature.properties.minorityFaith = region.minorityFaith;
      feature.properties.minorityShare = region.minorityShare;
      feature.properties.faithColor = colorForFaith(region.dominantFaith, this.staticData);
      feature.properties.unrest = region.unrest;
      feature.properties.contested = contestedRegionIds.has(regionId) ? 1 : 0;
      feature.properties.recentlyCaptured = isRecentlyCaptured ? 1 : 0;
      feature.properties.pulse = pulse;
      feature.properties.selected = this.selectedRegionId === regionId ? 1 : 0;
      feature.properties.isAllied = playerAlliedRegionIds.has(regionId) ? 1 : 0;
      feature.properties.isEnemy = playerEnemyRegionIds.has(regionId) ? 1 : 0;
      feature.properties.wealthRatio = context?.regionWealthRatio?.[regionId] ?? 0;
    }

    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(this.geojson as unknown as FeatureCollection);

    const markerRegions = context?.activeWarMarkerRegionIds?.length
      ? context.activeWarMarkerRegionIds
      : Array.from(contestedRegionIds).sort();
    this.updateWarMarkers(markerRegions);
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
    this.regionCenters.clear();
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

    if (!this.map.getSource(WAR_MARKER_SOURCE_ID)) {
      this.map.addSource(WAR_MARKER_SOURCE_ID, {
        type: "geojson",
        data: emptyWarMarkerCollection() as unknown as FeatureCollection
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

    if (!this.map.getLayer(CONTESTED_LAYER_ID)) {
      this.map.addLayer({
        id: CONTESTED_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#8f1f1f",
          "line-width": [
            "case",
            ["==", ["coalesce", ["get", "contested"], 0], 1],
            2.1,
            0.2
          ],
          "line-opacity": [
            "case",
            ["==", ["coalesce", ["get", "contested"], 0], 1],
            0.88,
            0
          ],
          "line-dasharray": [1.2, 1.1]
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
            [">", ["coalesce", ["get", "pulse"], 0], 0],
            "#f2b15a",
            ["==", ["coalesce", ["get", "recentlyCaptured"], 0], 1],
            "#ef9e2b",
            "#4a3722"
          ],
          "line-width": [
            "case",
            ["==", ["get", "selected"], 1],
            2.8,
            [">", ["coalesce", ["get", "pulse"], 0], 0],
            ["+", 1.5, ["*", ["coalesce", ["get", "pulse"], 0], 2.4]],
            ["==", ["coalesce", ["get", "recentlyCaptured"], 0], 1],
            2.2,
            1.1
          ],
          "line-opacity": [
            "case",
            ["==", ["coalesce", ["get", "contested"], 0], 1],
            0.98,
            0.8
          ]
        }
      });
    }

    if (!this.map.getLayer(WAR_MARKER_LAYER_ID)) {
      this.map.addLayer({
        id: WAR_MARKER_LAYER_ID,
        type: "circle",
        source: WAR_MARKER_SOURCE_ID,
        paint: {
          "circle-color": "#b12222",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1.3,
            2.8,
            4,
            5.2,
            7,
            7.8
          ],
          "circle-opacity": 0.88,
          "circle-stroke-color": "#f7d9a4",
          "circle-stroke-width": 1.1
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
    const failures: string[] = [];

    for (const url of buildGeoJsonUrlCandidates()) {
      let response: Response;
      try {
        response = await fetch(url, { cache: "force-cache" });
      } catch (error) {
        failures.push(`${url} (${error instanceof Error ? error.message : "erro de rede"})`);
        continue;
      }

      if (!response.ok) {
        failures.push(`${url} (HTTP ${response.status})`);
        continue;
      }

      const payload = (await response.json()) as CountryFeatureCollection;
      if (payload.type === "FeatureCollection" && Array.isArray(payload.features) && payload.features.length > 0) {
        return payload;
      }

      failures.push(`${url} (payload inválido)`);
    }

    throw new Error(`Falha ao carregar GeoJSON do mapa mundial. Tentativas: ${failures.join("; ")}`);
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
          0.58
        ]);
        break;
      case "religion":
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", ["coalesce", ["get", "faithColor"], "#75624a"]);
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "dominantShare"], 0],
          0,
          0.44,
          0.5,
          0.72,
          1,
          0.9
        ]);
        break;
      case "diplomacy":
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", [
          "case",
          ["==", ["coalesce", ["get", "isAllied"], 0], 1],
          "#3e6b8c", // Azul: Jogador e Aliados
          ["==", ["coalesce", ["get", "isEnemy"], 0], 1],
          "#a32a2a", // Vermelho: Inimigos / Rivais
          "#8d816e"  // Neutro
        ]);
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", 0.85);
        break;
      case "economy":
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-color", [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "wealthRatio"], 0],
          0, "#8d816e",     // Pobre (Cor base neutra)
          0.2, "#a6955a",   // Leve acúmulo
          0.5, "#cca43b",   // Riqueza moderada
          1, "#f2d067"      // Extremamente Rico (Dourado Vibrante)
        ]);
        this.map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", 0.85);
        break;
    }
  }

  private updateWarMarkers(regionIds: readonly string[]): void {
    if (!this.map) {
      return;
    }

    const source = this.map.getSource(WAR_MARKER_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) {
      return;
    }

    const features: WarMarkerFeature[] = [];
    for (const regionId of Array.from(new Set(regionIds)).sort()) {
      const center = this.regionCenters.get(regionId);
      if (!center) {
        continue;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: center
        },
        properties: {
          regionId,
          label: "WAR"
        }
      });
    }

    source.setData({
      type: "FeatureCollection",
      features
    } as unknown as FeatureCollection);
  }

  private indexRegionCenters(collection: CountryFeatureCollection): void {
    this.regionCenters.clear();

    for (const feature of collection.features) {
      const regionId = feature.properties.regionId;
      if (!regionId) {
        continue;
      }

      const center = geometryCenter(feature.geometry);
      if (center) {
        this.regionCenters.set(regionId, center);
      }
    }
  }
}

function emptyWarMarkerCollection(): WarMarkerFeatureCollection {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function buildPulse(clockMs: number, regionId: string): number {
  const seed = regionId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const normalized = Math.sin((clockMs + seed * 13) * 0.008);
  return Number(((normalized + 1) * 0.5).toFixed(3));
}

function geometryCenter(geometry: Geometry | null | undefined): [number, number] | null {
  if (!geometry) {
    return null;
  }

  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  collectBounds(geometry, bounds);

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
    return null;
  }

  return [Number(((bounds.minX + bounds.maxX) / 2).toFixed(6)), Number(((bounds.minY + bounds.maxY) / 2).toFixed(6))];
}

function collectBounds(value: unknown, bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
  if (Array.isArray(value)) {
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const lon = value[0];
      const lat = value[1];
      bounds.minX = Math.min(bounds.minX, lon);
      bounds.maxX = Math.max(bounds.maxX, lon);
      bounds.minY = Math.min(bounds.minY, lat);
      bounds.maxY = Math.max(bounds.maxY, lat);
      return;
    }

    for (const child of value) {
      collectBounds(child, bounds);
    }
    return;
  }

  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if ("coordinates" in candidate) {
      collectBounds(candidate.coordinates, bounds);
    }
    if ("geometries" in candidate) {
      collectBounds(candidate.geometries, bounds);
    }
  }
}

function colorForKingdom(kingdomId: string): string {
  const palette = ["#8f5b3c", "#4f6d52", "#5d5277", "#9b6c2e", "#435b78", "#7d4f5f"];
  const hash = kingdomId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function colorForFaith(faithId: string, staticData?: StaticWorldData): string {
  const staticColor = staticData?.religions[faithId]?.color;
  if (typeof staticColor === "string" && staticColor.length > 0) {
    return staticColor;
  }

  const palette = ["#7b4a33", "#ad7b2f", "#4f6c3e", "#b66a6a", "#49657a", "#8a6a9b", "#2f6f74"];
  const hash = faithId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function buildGeoJsonUrlCandidates(): string[] {
  const currentUrl = new URL(window.location.href);
  currentUrl.hash = "";
  currentUrl.search = "";

  if (!currentUrl.pathname.endsWith("/")) {
    const hasFileName = currentUrl.pathname.split("/").pop()?.includes(".") ?? false;
    currentUrl.pathname = hasFileName
      ? currentUrl.pathname.replace(/[^/]*$/u, "")
      : `${currentUrl.pathname}/`;
  }

  return [
    new URL("assets/maps/world-countries-v1.geojson", currentUrl).toString(),
    new URL("assets/maps/world-countries-v0.geojson", currentUrl).toString(),
    new URL("./assets/maps/world-countries-v1.geojson", currentUrl).toString(),
    new URL("./assets/maps/world-countries-v0.geojson", currentUrl).toString()
  ];
}
