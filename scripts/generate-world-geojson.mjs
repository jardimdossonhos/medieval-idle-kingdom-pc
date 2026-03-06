import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import countries50m from "world-atlas/countries-50m.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.resolve(__dirname, "..", "public", "assets", "maps", "world-countries-v1.geojson");

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

function createStableRegionId(name, fallbackIndex, used) {
  const base = `w_${slugify(name) || `country_${fallbackIndex}`}`;

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

function buildWorldGeoJson() {
  const world = feature(countries50m, countries50m.objects.countries);

  if (!world || world.type !== "FeatureCollection" || !Array.isArray(world.features)) {
    throw new Error("Falha ao converter TopoJSON de países para GeoJSON.");
  }

  const usedRegionIds = new Set();

  const features = world.features
    .filter((item) => item.geometry)
    .map((item, index) => {
      const name = String(item.properties?.name ?? `Country ${index + 1}`);
      const isoN3 = String(item.id ?? "").padStart(3, "0");
      const campaignRegionId = campaignByCountryName[name];

      const regionId = campaignRegionId ?? createStableRegionId(name, index + 1, usedRegionIds);
      usedRegionIds.add(regionId);

      return {
        type: "Feature",
        properties: {
          regionId,
          name,
          isoN3,
          campaignMapped: Boolean(campaignRegionId),
          source: "world-atlas-50m"
        },
        geometry: item.geometry
      };
    });

  return {
    type: "FeatureCollection",
    name: "world_countries_v1",
    features
  };
}

async function main() {
  const payload = buildWorldGeoJson();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload));

  // eslint-disable-next-line no-console
  console.log(`Mapa mundial gerado em: ${outputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Total de países: ${payload.features.length}`);
}

await main();
