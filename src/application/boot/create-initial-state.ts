import { createDefaultBudgetPriority, createEmptyStock, type EconomyState } from "../../core/models/economy";
import {
  ArmyPosture,
  AutomationLevel,
  DiplomaticRelation,
  NpcArchetype,
  PopulationClass,
  ReligiousPolicy,
  ResourceType,
  TechnologyDomain,
  TreatyType,
  VictoryPath
} from "../../core/models/enums";
import type { GameState, KingdomState } from "../../core/models/game-state";
import type { PopulationState } from "../../core/models/population";
import type { RegionDefinition, WorldState } from "../../core/models/world";
import { SEED_REGION_DEFINITIONS } from "./seed-map-definitions";

function createBasePopulation(total: number): PopulationState {
  return {
    total,
    groups: {
      [PopulationClass.Peasants]: 0.72,
      [PopulationClass.Nobles]: 0.04,
      [PopulationClass.Clergy]: 0.07,
      [PopulationClass.Soldiers]: 0.09,
      [PopulationClass.Merchants]: 0.08
    },
    growthRatePerTick: 0.00015,
    pressure: {
      taxation: 0.2,
      inequality: 0.25,
      warWeariness: 0,
      famineRisk: 0,
      zeal: 0.3
    },
    unrest: 0.12
  };
}

function createBaseEconomy(seedGold: number): EconomyState {
  const stock = createEmptyStock();
  stock[ResourceType.Gold] = seedGold;
  stock[ResourceType.Food] = 1200;
  stock[ResourceType.Wood] = 800;
  stock[ResourceType.Iron] = 340;
  stock[ResourceType.Faith] = 200;
  stock[ResourceType.Legitimacy] = 65;

  return {
    stock,
    incomePerTick: createEmptyStock(),
    upkeepPerTick: createEmptyStock(),
    productionByRegion: {},
    taxPolicy: {
      baseRate: 0.2,
      nobleRelief: 0.1,
      clergyExemption: 0.08,
      tariffRate: 0.12
    },
    budgetPriority: createDefaultBudgetPriority(),
    inflation: 0,
    corruption: 0.08
  };
}

function createKingdom(id: string, name: string, adjective: string, capitalRegionId: string, isPlayer: boolean): KingdomState {
  return {
    id,
    name,
    adjective,
    isPlayer,
    capitalRegionId,
    economy: createBaseEconomy(isPlayer ? 350 : 280),
    population: createBasePopulation(isPlayer ? 2100000 : 1700000),
    technology: {
      unlocked: ["agri_basics", "militia_drill"],
      activeResearchId: "ledger_admin",
      accumulatedResearch: 0,
      researchRate: 1,
      doctrineMilitary: "levy_discipline",
      doctrineAdministration: "crown_stewardship"
    },
    religion: {
      stateFaith: "imperial_church",
      policy: ReligiousPolicy.Orthodoxy,
      authority: 0.6,
      cohesion: 0.58,
      conversionPressure: 0.18,
      tolerance: 0.35
    },
    military: {
      posture: ArmyPosture.Balanced,
      recruitmentPriority: 0.52,
      offensiveFocus: 0.48,
      targetRegionIds: [],
      armies: [
        {
          id: `${id}_army_1`,
          stationedRegionId: capitalRegionId,
          manpower: isPlayer ? 21000 : 17000,
          quality: isPlayer ? 0.54 : 0.5,
          morale: 0.62,
          supply: 0.73
        }
      ],
      reserveManpower: isPlayer ? 85000 : 64000,
      militaryTechLevel: 1
    },
    diplomacy: {
      treaties: [
        {
          id: "treaty_seed_truce",
          type: TreatyType.Peace,
          parties: ["k_player", "k_rival_south"],
          signedAt: Date.now() - 1000 * 60 * 60,
          expiresAt: Date.now() + 1000 * 60 * 60 * 10,
          terms: { warReparations: 0 }
        }
      ],
      relations: {},
      coalitionThreat: 0,
      warExhaustion: 0
    },
    administration: {
      adminCapacity: 100,
      usedCapacity: 55,
      corruption: 0.08,
      policy: {
        regionalAutonomyTarget: 0.34,
        directRuleBias: 0.58,
        assimilationInvestment: 0.3,
        antiCorruptionBudget: 0.2
      },
      regionalControl: [],
      automation: {
        economy: isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic,
        construction: isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic,
        defense: isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic,
        diplomacyReactive: isPlayer ? AutomationLevel.Manual : AutomationLevel.NearlyAutomatic,
        expansion: isPlayer ? AutomationLevel.Manual : AutomationLevel.NearlyAutomatic,
        technology: isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic
      }
    },
    victoryProgress: {
      [VictoryPath.TerritorialDomination]: 0,
      [VictoryPath.DiplomaticHegemony]: 0,
      [VictoryPath.EconomicSupremacy]: 0,
      [VictoryPath.ReligiousSupremacy]: 0,
      [VictoryPath.DynasticLegacy]: 0
    },
    legitimacy: 62,
    stability: 58,
    npc: isPlayer
      ? undefined
      : {
          personality: {
            archetype: NpcArchetype.Expansionist,
            ambition: 0.72,
            caution: 0.4,
            greed: 0.46,
            zeal: 0.5,
            honor: 0.43,
            betrayalTendency: 0.35
          },
          strategicGoal: "expansao_fronteiras",
          memories: [],
          lastDecisionTick: 0
        }
  };
}

function toDefinitionMap(definitions: RegionDefinition[]): Record<string, RegionDefinition> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
}

function createWorldState(): WorldState {
  return {
    mapId: "mediterranean_frontier_v1",
    definitions: toDefinitionMap(SEED_REGION_DEFINITIONS),
    regions: {
      r_iberia_north: {
        regionId: "r_iberia_north",
        ownerId: "k_player",
        controllerId: "k_player",
        autonomy: 0.2,
        assimilation: 1,
        unrest: 0.1,
        devastation: 0,
        localFaithStrength: 0.68
      },
      r_iberia_south: {
        regionId: "r_iberia_south",
        ownerId: "k_player",
        controllerId: "k_player",
        autonomy: 0.27,
        assimilation: 1,
        unrest: 0.15,
        devastation: 0,
        localFaithStrength: 0.62
      },
      r_gallia_west: {
        regionId: "r_gallia_west",
        ownerId: "k_rival_north",
        controllerId: "k_rival_north",
        autonomy: 0.24,
        assimilation: 1,
        unrest: 0.13,
        devastation: 0,
        localFaithStrength: 0.64
      },
      r_italia_north: {
        regionId: "r_italia_north",
        ownerId: "k_rival_east",
        controllerId: "k_rival_east",
        autonomy: 0.22,
        assimilation: 1,
        unrest: 0.12,
        devastation: 0,
        localFaithStrength: 0.6
      },
      r_levant_coast: {
        regionId: "r_levant_coast",
        ownerId: "k_rival_east",
        controllerId: "k_rival_east",
        autonomy: 0.28,
        assimilation: 1,
        unrest: 0.2,
        devastation: 0.04,
        localFaithStrength: 0.53
      },
      r_maghreb_west: {
        regionId: "r_maghreb_west",
        ownerId: "k_rival_south",
        controllerId: "k_rival_south",
        autonomy: 0.31,
        assimilation: 1,
        unrest: 0.18,
        devastation: 0,
        localFaithStrength: 0.57
      },
      r_maghreb_east: {
        regionId: "r_maghreb_east",
        ownerId: "k_rival_south",
        controllerId: "k_rival_south",
        autonomy: 0.29,
        assimilation: 1,
        unrest: 0.16,
        devastation: 0,
        localFaithStrength: 0.55
      },
      r_anatolia_west: {
        regionId: "r_anatolia_west",
        ownerId: "k_rival_east",
        controllerId: "k_rival_east",
        autonomy: 0.27,
        assimilation: 1,
        unrest: 0.14,
        devastation: 0,
        localFaithStrength: 0.59
      }
    },
    routes: [
      { id: "route_ib_gw", from: "r_iberia_north", to: "r_gallia_west", routeType: "land", controlWeight: 1 },
      { id: "route_ib_is", from: "r_iberia_north", to: "r_iberia_south", routeType: "land", controlWeight: 0.9 },
      { id: "route_is_mw", from: "r_iberia_south", to: "r_maghreb_west", routeType: "sea", controlWeight: 1.1 },
      { id: "route_mw_me", from: "r_maghreb_west", to: "r_maghreb_east", routeType: "land", controlWeight: 1 },
      { id: "route_me_lc", from: "r_maghreb_east", to: "r_levant_coast", routeType: "sea", controlWeight: 1.2 },
      { id: "route_lc_aw", from: "r_levant_coast", to: "r_anatolia_west", routeType: "land", controlWeight: 1 },
      { id: "route_aw_in", from: "r_anatolia_west", to: "r_italia_north", routeType: "sea", controlWeight: 1.3 }
    ]
  };
}

function createSeedRelations(state: GameState): void {
  const ids = Object.keys(state.kingdoms);

  for (const id of ids) {
    const kingdom = state.kingdoms[id];
    for (const otherId of ids) {
      if (id === otherId) {
        continue;
      }

      kingdom.diplomacy.relations[otherId] = {
        withKingdomId: otherId,
        status: DiplomaticRelation.Neutral,
        score: {
          trust: 0.45,
          fear: 0.2,
          rivalry: 0.22,
          religiousTension: 0.18,
          borderTension: 0.25,
          tradeValue: 0.3
        },
        grievance: 0.1,
        allianceStrength: 0
      };
    }
  }
}

export function createInitialState(): GameState {
  const now = Date.now();

  const state: GameState = {
    meta: {
      schemaVersion: 1,
      sessionId: `session_${now}`,
      tick: 0,
      tickDurationMs: 3000,
      speedMultiplier: 1,
      paused: false,
      createdAt: now,
      lastUpdatedAt: now,
      lastClosedAt: null
    },
    campaign: {
      id: "campaign_mediterranean_ascension",
      name: "Ascensão do Mediterrâneo",
      mapId: "mediterranean_frontier_v1",
      startDateIso: "1100-01-01",
      victoryTargets: [
        { path: VictoryPath.TerritorialDomination, threshold: 0.55 },
        { path: VictoryPath.DiplomaticHegemony, threshold: 0.65 },
        { path: VictoryPath.EconomicSupremacy, threshold: 0.7 },
        { path: VictoryPath.ReligiousSupremacy, threshold: 0.68 },
        { path: VictoryPath.DynasticLegacy, threshold: 0.72 }
      ]
    },
    world: createWorldState(),
    kingdoms: {
      k_player: createKingdom("k_player", "Coroa da Ibéria", "Ibérico", "r_iberia_north", true),
      k_rival_north: createKingdom("k_rival_north", "Reino da Gália", "Gálico", "r_gallia_west", false),
      k_rival_east: createKingdom("k_rival_east", "Império da Anatólia", "Anatólio", "r_anatolia_west", false),
      k_rival_south: createKingdom("k_rival_south", "Sultanato do Magrebe", "Magrebino", "r_maghreb_west", false)
    },
    wars: {},
    events: [
      {
        id: "evt_seed_campaign_start",
        title: "Uma Nova Coroa se Ergue",
        details: "Seu reino entra em uma era mediterrânea de disputas.",
        severity: "info",
        occurredAt: now
      }
    ],
    victory: {
      achievedPath: null,
      achievedAt: null,
      postVictoryMode: false,
      crisisPressure: 0
    },
    randomSeed: now
  };

  createSeedRelations(state);

  state.kingdoms.k_player.technology.unlocked.push(
    `domain_${TechnologyDomain.Administration}_tier_1`
  );

  return state;
}

