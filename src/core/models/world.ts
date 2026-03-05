import type { KingdomId, Point2D, RegionId } from "./types";

export interface RegionDefinition {
  id: RegionId;
  name: string;
  zone: "europe" | "north_africa" | "near_east";
  strategicValue: number;
  economyValue: number;
  militaryValue: number;
  isCoastal: boolean;
  neighbors: RegionId[];
  center: Point2D;
}

export interface RegionState {
  regionId: RegionId;
  ownerId: KingdomId;
  controllerId: KingdomId;
  autonomy: number;
  assimilation: number;
  unrest: number;
  devastation: number;
  localFaithStrength: number;
}

export interface StrategicRoute {
  id: string;
  from: RegionId;
  to: RegionId;
  routeType: "land" | "sea";
  controlWeight: number;
}

export interface WorldState {
  mapId: string;
  definitions: Record<RegionId, RegionDefinition>;
  regions: Record<RegionId, RegionState>;
  routes: StrategicRoute[];
}
