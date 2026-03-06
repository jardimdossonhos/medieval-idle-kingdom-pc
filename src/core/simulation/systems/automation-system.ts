import { ArmyPosture, AutomationLevel, TechnologyDomain } from "../../models/enums";
import { selectDefaultResearchNode, selectResearchNodeTowardsTarget } from "../../data/technology-tree";
import type { BudgetPriority } from "../../models/economy";
import type { GameState, KingdomState } from "../../models/game-state";
import type { SimulationSystem } from "../tick-pipeline";
import { clamp, getOwnedRegionIds, roundTo } from "./utils";

function isEnabled(level: AutomationLevel): boolean {
  return level !== AutomationLevel.Manual;
}

function applyBudgetTarget(current: BudgetPriority, target: BudgetPriority, strength: number): BudgetPriority {
  const next: BudgetPriority = {
    economy: current.economy + (target.economy - current.economy) * strength,
    military: current.military + (target.military - current.military) * strength,
    religion: current.religion + (target.religion - current.religion) * strength,
    administration: current.administration + (target.administration - current.administration) * strength,
    technology: current.technology + (target.technology - current.technology) * strength
  };

  const total = Math.max(1, next.economy + next.military + next.religion + next.administration + next.technology);

  return {
    economy: roundTo((next.economy / total) * 100),
    military: roundTo((next.military / total) * 100),
    religion: roundTo((next.religion / total) * 100),
    administration: roundTo((next.administration / total) * 100),
    technology: roundTo((next.technology / total) * 100)
  };
}

function activeWarCount(state: GameState, kingdomId: string): number {
  return Object.keys(state.wars)
    .sort()
    .map((warId) => state.wars[warId])
    .filter((war) => war.attackers.includes(kingdomId) || war.defenders.includes(kingdomId)).length;
}

function computeThreat(kingdom: KingdomState): number {
  const relationThreat = Object.keys(kingdom.diplomacy.relations)
    .sort()
    .map((relationId) => kingdom.diplomacy.relations[relationId])
    .reduce((top, relation) => {
      const current = relation.score.rivalry * 0.6 + relation.score.fear * 0.2 + relation.grievance * 0.2;
      return Math.max(top, current);
    }, 0);

  return clamp(Math.max(kingdom.diplomacy.coalitionThreat, relationThreat), 0, 1);
}

function selectResearchDomain(kingdom: KingdomState, threat: number, warCount: number): TechnologyDomain {
  const foodPressure = kingdom.population.pressure.famineRisk;

  if (warCount > 0 || threat > 0.72) {
    return TechnologyDomain.Military;
  }

  if (kingdom.administration.corruption > 0.22 || kingdom.administration.usedCapacity > kingdom.administration.adminCapacity * 0.92) {
    return TechnologyDomain.Administration;
  }

  if (foodPressure > 0.45) {
    return TechnologyDomain.Economy;
  }

  if (kingdom.religion.cohesion < 0.48) {
    return TechnologyDomain.Religion;
  }

  return TechnologyDomain.Logistics;
}

function selectExpansionTargets(state: GameState, kingdomId: string): string[] {
  const ownedRegions = getOwnedRegionIds(state, kingdomId);
  const candidates: string[] = [];

  for (const regionId of ownedRegions) {
    const definition = state.world.definitions[regionId];

    if (!definition) {
      continue;
    }

    for (const neighborId of definition.neighbors) {
      const neighborState = state.world.regions[neighborId];

      if (!neighborState || neighborState.ownerId === kingdomId || candidates.includes(neighborId)) {
        continue;
      }

      candidates.push(neighborId);
    }
  }

  return candidates
    .sort((leftId, rightId) => (state.world.definitions[rightId]?.strategicValue ?? 0) - (state.world.definitions[leftId]?.strategicValue ?? 0))
    .slice(0, 2);
}

export function createAutomationSystem(): SimulationSystem {
  return {
    id: "automation",
    run(context): void {
      const state = context.nextState;

      for (const kingdomId of Object.keys(state.kingdoms).sort()) {
        const kingdom = state.kingdoms[kingdomId];
        const warCount = activeWarCount(state, kingdom.id);
        const threat = computeThreat(kingdom);

        if (isEnabled(kingdom.administration.automation.economy)) {
          let targetBudget: BudgetPriority = {
            economy: 25,
            military: 20,
            religion: 15,
            administration: 20,
            technology: 20
          };

          const foodReserveTarget = kingdom.population.total / 6_500;
          const lowFood = kingdom.economy.stock.food < foodReserveTarget;
          const lowGold = kingdom.economy.stock.gold < 85;

          if (lowFood || lowGold) {
            targetBudget = {
              economy: 34,
              military: 18,
              religion: 10,
              administration: 24,
              technology: 14
            };
          } else if (warCount > 0 || threat > 0.64) {
            targetBudget = {
              economy: 24,
              military: 34,
              religion: 10,
              administration: 18,
              technology: 14
            };
          } else if (kingdom.economy.stock.gold > 220) {
            targetBudget = {
              economy: 22,
              military: 18,
              religion: 12,
              administration: 20,
              technology: 28
            };
          }

          const automationStrength = kingdom.administration.automation.economy === AutomationLevel.NearlyAutomatic ? 0.35 : 0.2;

          kingdom.economy.budgetPriority = applyBudgetTarget(kingdom.economy.budgetPriority, targetBudget, automationStrength);
        }

        if (isEnabled(kingdom.administration.automation.defense)) {
          if (warCount > 0 || threat > 0.62) {
            kingdom.military.posture = ArmyPosture.Defensive;
            kingdom.military.recruitmentPriority = roundTo(clamp(kingdom.military.recruitmentPriority + 0.03, 0.35, 0.92));
            kingdom.military.offensiveFocus = roundTo(clamp(kingdom.military.offensiveFocus - 0.03, 0.12, 0.72));
          } else {
            kingdom.military.recruitmentPriority = roundTo(clamp(kingdom.military.recruitmentPriority - 0.01, 0.25, 0.85));
            kingdom.military.offensiveFocus = roundTo(clamp(kingdom.military.offensiveFocus + 0.01, 0.2, 0.85));
          }
        }

        if (isEnabled(kingdom.administration.automation.expansion)) {
          if (warCount === 0 && threat < 0.52 && kingdom.stability > 52 && kingdom.economy.stock.gold > 120) {
            kingdom.military.posture = ArmyPosture.Aggressive;
            kingdom.military.offensiveFocus = roundTo(clamp(kingdom.military.offensiveFocus + 0.02, 0.3, 0.95));
            kingdom.military.targetRegionIds = selectExpansionTargets(state, kingdom.id);
          } else if (warCount > 0 || threat > 0.72) {
            kingdom.military.targetRegionIds = [];
          }
        }

        if (isEnabled(kingdom.administration.automation.technology)) {
          const goalId = kingdom.technology.researchGoalId;
          if (!goalId || kingdom.technology.unlocked.includes(goalId)) {
            const domain = selectResearchDomain(kingdom, threat, warCount);
            kingdom.technology.researchFocus = domain;
          }

          if (kingdom.technology.activeResearchId === null || state.meta.tick % 28 === 0) {
            const target = kingdom.technology.researchGoalId
              ? selectResearchNodeTowardsTarget(kingdom.technology, kingdom.technology.researchGoalId) ??
                selectDefaultResearchNode(kingdom.technology, kingdom.technology.researchFocus)
              : selectDefaultResearchNode(kingdom.technology, kingdom.technology.researchFocus);
            kingdom.technology.activeResearchId = target?.id ?? null;
          }

          const rateBoost = kingdom.administration.automation.technology === AutomationLevel.NearlyAutomatic ? 0.03 : 0.015;
          kingdom.technology.researchRate = roundTo(clamp(kingdom.technology.researchRate + rateBoost, 0.6, 4));
        }

        if (isEnabled(kingdom.administration.automation.diplomacyReactive) && threat > 0.7) {
          for (const relation of Object.keys(kingdom.diplomacy.relations)
            .sort()
            .map((relationId) => kingdom.diplomacy.relations[relationId])
            .sort((left, right) => right.score.rivalry - left.score.rivalry)
            .slice(0, 2)) {
            relation.score.rivalry = roundTo(clamp(relation.score.rivalry - 0.02, 0, 1));
            relation.score.borderTension = roundTo(clamp(relation.score.borderTension - 0.015, 0, 1));
            relation.score.trust = roundTo(clamp(relation.score.trust + 0.01, 0, 1));
          }
        }
      }
    }
  };
}
