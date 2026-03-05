import { AutomationLevel } from "./enums";
import type { RegionId } from "./types";

export interface AdministrativePolicy {
  regionalAutonomyTarget: number;
  directRuleBias: number;
  assimilationInvestment: number;
  antiCorruptionBudget: number;
}

export interface RegionalControl {
  regionId: RegionId;
  localAutonomy: number;
  taxationEfficiency: number;
  integration: number;
  revoltRisk: number;
}

export interface AutomationPolicy {
  economy: AutomationLevel;
  construction: AutomationLevel;
  defense: AutomationLevel;
  diplomacyReactive: AutomationLevel;
  expansion: AutomationLevel;
  technology: AutomationLevel;
}

export interface AdministrationState {
  adminCapacity: number;
  usedCapacity: number;
  corruption: number;
  policy: AdministrativePolicy;
  regionalControl: RegionalControl[];
  automation: AutomationPolicy;
}
