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
  accumulatedResearch: number;
  researchRate: number;
  doctrineMilitary: string;
  doctrineAdministration: string;
}
