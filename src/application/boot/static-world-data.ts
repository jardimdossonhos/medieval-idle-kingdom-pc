import type { ReligionDefinition, StaticWorldData } from "../../core/models/static-world-data";
import type { RegionDefinition, StrategicRoute } from "../../core/models/world";
import { WORLD_DEFINITIONS_MAP_ID, WORLD_DEFINITIONS_V1 } from "./generated/world-definitions-v1";

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildRoutes(definitions: Record<string, RegionDefinition>): StrategicRoute[] {
  const routes: StrategicRoute[] = [];

  for (const regionId of Object.keys(definitions).sort()) {
    const definition = definitions[regionId];

    for (const neighborId of [...definition.neighbors].sort()) {
      if (regionId.localeCompare(neighborId) >= 0) {
        continue;
      }

      const neighbor = definitions[neighborId];
      if (!neighbor) {
        continue;
      }

      routes.push({
        id: `route_${regionId}_${neighborId}`,
        from: regionId,
        to: neighborId,
        routeType: definition.isCoastal && neighbor.isCoastal ? "sea" : "land",
        controlWeight: round(0.8 + ((definition.strategicValue + neighbor.strategicValue) / 20))
      });
    }
  }

  return routes;
}

const RELIGIONS_V1: ReligionDefinition[] = [
  {
    id: "imperial_church",
    name: "Igreja Imperial",
    color: "#7b4a33",
    bonuses: {
      economyMult: 1.02,
      stabilityMult: 1.03,
      militaryMoraleMult: 1.01,
      missionaryPower: 1.06,
      authorityGrowth: 1.07,
      toleranceBaseline: 0.32,
      warZeal: 1.02
    }
  },
  {
    id: "desert_faith",
    name: "Fé do Deserto",
    color: "#ad7b2f",
    bonuses: {
      economyMult: 1.01,
      stabilityMult: 1.01,
      militaryMoraleMult: 1.03,
      missionaryPower: 1.08,
      authorityGrowth: 1.04,
      toleranceBaseline: 0.28,
      warZeal: 1.08
    }
  },
  {
    id: "ancestral_cults",
    name: "Cultos Ancestrais",
    color: "#4f6c3e",
    bonuses: {
      economyMult: 1.01,
      stabilityMult: 1.05,
      militaryMoraleMult: 1,
      missionaryPower: 0.94,
      authorityGrowth: 0.99,
      toleranceBaseline: 0.45,
      warZeal: 0.95
    }
  },
  {
    id: "lotus_order",
    name: "Ordem do Lótus",
    color: "#b66a6a",
    bonuses: {
      economyMult: 1.02,
      stabilityMult: 1.02,
      militaryMoraleMult: 0.99,
      missionaryPower: 1.04,
      authorityGrowth: 1,
      toleranceBaseline: 0.48,
      warZeal: 0.97
    }
  },
  {
    id: "northern_old_gods",
    name: "Velhos Deuses do Norte",
    color: "#49657a",
    bonuses: {
      economyMult: 0.99,
      stabilityMult: 1,
      militaryMoraleMult: 1.06,
      missionaryPower: 0.92,
      authorityGrowth: 1.02,
      toleranceBaseline: 0.25,
      warZeal: 1.11
    }
  },
  {
    id: "scholar_sun",
    name: "Sol dos Eruditos",
    color: "#8a6a9b",
    bonuses: {
      economyMult: 1.04,
      stabilityMult: 1.01,
      militaryMoraleMult: 0.98,
      missionaryPower: 1.03,
      authorityGrowth: 1,
      toleranceBaseline: 0.52,
      warZeal: 0.94
    }
  },
  {
    id: "sea_saints",
    name: "Santos do Mar",
    color: "#2f6f74",
    bonuses: {
      economyMult: 1.03,
      stabilityMult: 1.01,
      militaryMoraleMult: 1.01,
      missionaryPower: 1.02,
      authorityGrowth: 1.01,
      toleranceBaseline: 0.4,
      warZeal: 1
    }
  }
];

export function createStaticWorldData(
  injectedDefinitions?: RegionDefinition[],
  injectedMapId?: string
): StaticWorldData {
  const defs = injectedDefinitions ?? WORLD_DEFINITIONS_V1;
  const mId = injectedMapId ?? WORLD_DEFINITIONS_MAP_ID;

  const definitions: Record<string, RegionDefinition> = Object.fromEntries(
    [...defs]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => [definition.id, definition] as const)
  );

  const neighborsByRegionId: Record<string, string[]> = {};
  for (const regionId of Object.keys(definitions).sort()) {
    neighborsByRegionId[regionId] = [...definitions[regionId].neighbors].sort();
  }

  const religions = Object.fromEntries(
    [...RELIGIONS_V1]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((religion) => [religion.id, religion] as const)
  );

  return {
    mapId: mId,
    definitions,
    neighborsByRegionId,
    routes: buildRoutes(definitions),
    religions
  };
}
