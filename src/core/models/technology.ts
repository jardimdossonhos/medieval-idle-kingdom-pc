import { TechnologyDomain } from "./enums";

export interface TechnologyEffect {
  target: string;
  value: number;
  type: "multiplier" | "additive";
}

export interface TechnologyNode {
  id: string;
  domain: TechnologyDomain;
  name: string;
  description: string;
  required: string[];
  cost: number;
  effects: TechnologyEffect[];
}

export interface TechnologyState {
  unlocked: string[];
  activeResearchId: string | null;
  researchFocus: TechnologyDomain;
  researchGoalId: string | null;
  accumulatedResearch: number;
}

export type CalculatedTechnologyEffects = Map<string, number>;
