import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface FeatureCollection {
  type: string;
  features: Array<{
    properties?: {
      regionId?: string;
      name?: string;
    };
  }>;
}

describe("world map asset", () => {
  it("contains global coverage and campaign region ids", () => {
    const file = new URL("../public/assets/maps/world-countries-v1.geojson", import.meta.url);
    const content = readFileSync(file, "utf8");
    const payload = JSON.parse(content) as FeatureCollection;

    expect(payload.type).toBe("FeatureCollection");
    expect(payload.features.length).toBeGreaterThanOrEqual(200);

    const ids = new Set(payload.features.map((item) => item.properties?.regionId).filter(Boolean));

    expect(ids.has("r_iberia_north")).toBe(true);
    expect(ids.has("r_iberia_south")).toBe(true);
    expect(ids.has("r_gallia_west")).toBe(true);
    expect(ids.has("r_italia_north")).toBe(true);
    expect(ids.has("r_maghreb_west")).toBe(true);
    expect(ids.has("r_maghreb_east")).toBe(true);
    expect(ids.has("r_anatolia_west")).toBe(true);
    expect(ids.has("r_levant_coast")).toBe(true);
  });
});
