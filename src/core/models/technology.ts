import { TechnologyDomain } from "./enums";

export interface TechnologyNode {
  id: string;
  domain: TechnologyDomain;
  name: string;
  required: string[];
  cost: number;
  effects: Record<string, number>;
}

export interface TechnologyState {
  unlocked: string[];
  activeResearchId: string | null;
  researchGoalId: string | null;
  accumulatedResearch: number;
  researchRate: number;
  researchFocus: TechnologyDomain;
  doctrineMilitary: string;
  doctrineAdministration: string;
}
