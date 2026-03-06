import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature, neighbors } from "topojson-client";
import countries50m from "world-atlas/countries-50m.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const geoJsonOutputPath = path.resolve(__dirname, "..", "public", "assets", "maps", "world-countries-v1.geojson");
const definitionsOutputPath = path.resolve(__dirname, "..", "public", "assets", "maps", "world-definitions-v1.json");
const generatedModuleOutputPath = path.resolve(__dirname, "..", "src", "application", "boot", "generated", "world-definitions-v1.ts");

const campaignByCountryName = {
  Spain: "r_iberia_north",
  Portugal: "r_iberia_south",
  France: "r_gallia_west",
  Italy: "r_italia_north",
  Morocco: "r_maghreb_west",
  Algeria: "r_maghreb_east",
  Turkey: "r_anatolia_west",
  Syria: "r_levant_coast"
};

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
}

function hashString(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (Math.imul(hash, 33) + input.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

function createStableRegionId(name, isoN3, fallbackIndex, used) {
  const fallbackSlug = slugify(name) || `country_${fallbackIndex}`;
  const isoPrefix = /^\d{3}$/.test(isoN3) ? `c_${isoN3}` : `w_${fallbackSlug}`;
  const base = isoPrefix;

  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let seq = 2;
  while (used.has(`${base}_${seq}`)) {
    seq += 1;
  }

  const next = `${base}_${seq}`;
  used.add(next);
  return next;
}

function visitPositions(value, onPosition) {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    onPosition(value);
    return;
  }

  for (const item of value) {
    visitPositions(item, onPosition);
  }
}

function computeCenter(geometry) {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  visitPositions(geometry?.coordinates, (position) => {
    const [lon, lat] = position;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return { lon: 0, lat: 0 };
  }

  return {
    lon: Number(((minLon + maxLon) / 2).toFixed(4)),
    lat: Number(((minLat + maxLat) / 2).toFixed(4))
  };
}

function classifyZone(lon, lat) {
  if (lat >= 35 && lon >= -25 && lon <= 45) {
    return "europe";
  }

  if (lat >= 12 && lat < 35 && lon >= -20 && lon <= 55) {
    return "north_africa";
  }

  if (lat >= 12 && lat <= 45 && lon > 35 && lon <= 70) {
    return "near_east";
  }

  if (lat >= 15 && lon < -20) {
    return "north_america";
  }

  if (lat < -10 && lon < -20) {
    return "south_america";
  }

  if (lat >= 20 && lon >= 90 && lon <= 155) {
    return "east_asia";
  }

  if (lat >= 5 && lon >= 60 && lon < 110) {
    return "south_asia";
  }

  if (lat >= 5 && lon >= 30 && lon < 90) {
    return "central_asia";
  }

  if (lat < 20 && lon >= 95) {
    return "oceania";
  }

  return "sub_saharan_africa";
}

function createEconomicValues(regionId, zone) {
  const baseHash = hashString(regionId);
  const strategicValue = 4 + (baseHash % 7);
  const economyValue = 4 + (Math.floor(baseHash / 11) % 7);
  const militaryValue = 4 + (Math.floor(baseHash / 37) % 7);

  if (zone === "near_east" || zone === "europe") {
    return {
      strategicValue: Math.min(10, strategicValue + 1),
      economyValue,
      militaryValue: Math.min(10, militaryValue + 1)
    };
  }

  return {
    strategicValue,
    economyValue,
    militaryValue
  };
}

function buildWorldArtifacts() {
  const countriesObject = countries50m.objects.countries;
  const geometries = countriesObject?.geometries ?? [];
  const neighborIndexes = neighbors(geometries);
  const usedRegionIds = new Set();
  const byIndex = [];

  const features = geometries
    .map((geometry, index) => {
      const countryFeature = feature(countries50m, geometry);
      if (!countryFeature?.geometry) {
        return null;
      }

      const name = String(countryFeature.properties?.name ?? `Country ${index + 1}`);
      const isoN3 = String(geometry.id ?? countryFeature.id ?? "").padStart(3, "0");
      const campaignRegionId = campaignByCountryName[name];
      const regionId = campaignRegionId ?? createStableRegionId(name, isoN3, index + 1, usedRegionIds);
      usedRegionIds.add(regionId);

      const center = computeCenter(countryFeature.geometry);
      const zone = classifyZone(center.lon, center.lat);

      byIndex[index] = {
        regionId,
        name,
        isoN3,
        zone,
        center
      };

      return {
        type: "Feature",
        properties: {
          regionId,
          name,
          isoN3,
          zone,
          campaignMapped: Boolean(campaignRegionId),
          source: "world-atlas-50m"
        },
        geometry: countryFeature.geometry
      };
    })
    .filter(Boolean);

  const regions = byIndex
    .map((entry, index) => {
      if (!entry) {
        return null;
      }

      const neighborIds = (neighborIndexes[index] ?? [])
        .map((neighborIndex) => byIndex[neighborIndex]?.regionId)
        .filter(Boolean)
        .sort();

      const values = createEconomicValues(entry.regionId, entry.zone);

      return {
        id: entry.regionId,
        name: entry.name,
        zone: entry.zone,
        strategicValue: values.strategicValue,
        economyValue: values.economyValue,
        militaryValue: values.militaryValue,
        isCoastal: neighborIds.length <= 5,
        neighbors: neighborIds,
        center: {
          x: entry.center.lon,
          y: entry.center.lat
        }
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    geojson: {
      type: "FeatureCollection",
      name: "world_countries_v1",
      features
    },
    definitions: {
      mapId: "world_countries_v1",
      source: "world-atlas-50m",
      regions
    }
  };
}

function buildGeneratedModule(definitions) {
  const rows = [
    "import type { RegionDefinition } from \"../../../core/models/world\";",
    "",
    "export const WORLD_DEFINITIONS_MAP_ID = \"world_countries_v1\";",
    "",
    `export const WORLD_DEFINITIONS_V1: RegionDefinition[] = ${JSON.stringify(definitions.regions, null, 2)};`,
    ""
  ];

  return rows.join("\n");
}

async function main() {
  const artifacts = buildWorldArtifacts();
  await mkdir(path.dirname(geoJsonOutputPath), { recursive: true });
  await mkdir(path.dirname(generatedModuleOutputPath), { recursive: true });

  await writeFile(geoJsonOutputPath, JSON.stringify(artifacts.geojson));
  await writeFile(definitionsOutputPath, JSON.stringify(artifacts.definitions));
  await writeFile(generatedModuleOutputPath, buildGeneratedModule(artifacts.definitions));

  // eslint-disable-next-line no-console
  console.log(`GeoJSON gerado em: ${geoJsonOutputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Definicoes geradas em: ${definitionsOutputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Modulo TS gerado em: ${generatedModuleOutputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Total de paises: ${artifacts.geojson.features.length}`);
}

await main();
