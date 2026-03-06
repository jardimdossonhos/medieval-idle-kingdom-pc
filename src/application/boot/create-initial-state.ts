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
import { buildTreatyId, sortUniqueIds } from "../../core/models/identifiers";
import type { NpcBehaviorState } from "../../core/models/npc";
import type { PopulationState } from "../../core/models/population";
import type { RegionDefinition, RegionState, StrategicRoute, WorldState } from "../../core/models/world";
import { WORLD_DEFINITIONS_MAP_ID, WORLD_DEFINITIONS_V1 } from "./generated/world-definitions-v1";

interface KingdomBlueprint {
  id: string;
  name: string;
  adjective: string;
  isPlayer: boolean;
  preferredCapitalRegionId: string;
  archetype?: NpcArchetype;
  strategicGoal?: string;
}

const KINGDOM_BLUEPRINTS: KingdomBlueprint[] = [
  {
    id: "k_player",
    name: "Coroa da Ibéria",
    adjective: "Iberico",
    isPlayer: true,
    preferredCapitalRegionId: "r_iberia_north"
  },
  {
    id: "k_rival_north",
    name: "Reino da Galia",
    adjective: "Galico",
    isPlayer: false,
    preferredCapitalRegionId: "r_gallia_west",
    archetype: NpcArchetype.Expansionist,
    strategicGoal: "expandir_fronteira_ocidental"
  },
  {
    id: "k_rival_east",
    name: "Imperio da Anatolia",
    adjective: "Anatolio",
    isPlayer: false,
    preferredCapitalRegionId: "r_anatolia_west",
    archetype: NpcArchetype.Opportunist,
    strategicGoal: "projetar_forca_levantina"
  },
  {
    id: "k_rival_south",
    name: "Sultanato do Magrebe",
    adjective: "Magrebino",
    isPlayer: false,
    preferredCapitalRegionId: "r_maghreb_west",
    archetype: NpcArchetype.Mercantile,
    strategicGoal: "dominar_rotas_comerciais"
  },
  {
    id: "k_northern_union",
    name: "Uniao do Norte",
    adjective: "Nortenho",
    isPlayer: false,
    preferredCapitalRegionId: "c_826",
    archetype: NpcArchetype.Defensive,
    strategicGoal: "balancear_poder_europeu"
  },
  {
    id: "k_steppe_khanate",
    name: "Canato da Estepe",
    adjective: "Estepario",
    isPlayer: false,
    preferredCapitalRegionId: "c_643",
    archetype: NpcArchetype.Revanchist,
    strategicGoal: "retomar_territorios_historicos"
  },
  {
    id: "k_atlantic_compact",
    name: "Compacto Atlantico",
    adjective: "Atlantico",
    isPlayer: false,
    preferredCapitalRegionId: "c_840",
    archetype: NpcArchetype.Diplomatic,
    strategicGoal: "hegemonia_maritima"
  },
  {
    id: "k_andean_assembly",
    name: "Assembleia Andina",
    adjective: "Andino",
    isPlayer: false,
    preferredCapitalRegionId: "c_076",
    archetype: NpcArchetype.Defensive,
    strategicGoal: "proteger_blocos_montanhosos"
  },
  {
    id: "k_savanna_caliphate",
    name: "Califado da Savana",
    adjective: "Savanico",
    isPlayer: false,
    preferredCapitalRegionId: "c_566",
    archetype: NpcArchetype.Treacherous,
    strategicGoal: "coletar_tributos_regionais"
  },
  {
    id: "k_indic_league",
    name: "Liga do Indico",
    adjective: "Indico",
    isPlayer: false,
    preferredCapitalRegionId: "c_356",
    archetype: NpcArchetype.Mercantile,
    strategicGoal: "maximizar_fluxo_comercial"
  },
  {
    id: "k_celestial_dynasty",
    name: "Dinastia Celestial",
    adjective: "Celestial",
    isPlayer: false,
    preferredCapitalRegionId: "c_156",
    archetype: NpcArchetype.Expansionist,
    strategicGoal: "consolidar_hemisferio_oriental"
  },
  {
    id: "k_oceanic_shogunate",
    name: "Xogunato Oceanico",
    adjective: "Oceanico",
    isPlayer: false,
    preferredCapitalRegionId: "c_392",
    archetype: NpcArchetype.Opportunist,
    strategicGoal: "controlar_arquipelagos"
  }
];

const OWNER_OVERRIDES: Record<string, string> = {
  r_iberia_north: "k_player",
  r_iberia_south: "k_player",
  r_gallia_west: "k_rival_north",
  r_italia_north: "k_rival_north",
  r_maghreb_west: "k_rival_south",
  r_maghreb_east: "k_rival_south",
  r_anatolia_west: "k_rival_east",
  r_levant_coast: "k_rival_east"
};

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (Math.imul(hash, 31) + input.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createBasePopulation(total: number): PopulationState {
  return {
    total,
    groups: {
      [PopulationClass.Peasants]: 0.71,
      [PopulationClass.Nobles]: 0.05,
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
    unrest: 0.13
  };
}

function createBaseEconomy(seedGold: number): EconomyState {
  const stock = createEmptyStock();
  stock[ResourceType.Gold] = seedGold;
  stock[ResourceType.Food] = 1_200;
  stock[ResourceType.Wood] = 850;
  stock[ResourceType.Iron] = 360;
  stock[ResourceType.Faith] = 210;
  stock[ResourceType.Legitimacy] = 66;

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

function createNpcBehavior(archetype: NpcArchetype, strategicGoal: string): NpcBehaviorState {
  const personalityByArchetype: Record<NpcArchetype, NpcBehaviorState["personality"]> = {
    [NpcArchetype.Expansionist]: {
      archetype,
      ambition: 0.76,
      caution: 0.36,
      greed: 0.42,
      zeal: 0.45,
      honor: 0.41,
      betrayalTendency: 0.36
    },
    [NpcArchetype.Defensive]: {
      archetype,
      ambition: 0.45,
      caution: 0.72,
      greed: 0.32,
      zeal: 0.38,
      honor: 0.55,
      betrayalTendency: 0.18
    },
    [NpcArchetype.Mercantile]: {
      archetype,
      ambition: 0.54,
      caution: 0.52,
      greed: 0.76,
      zeal: 0.26,
      honor: 0.47,
      betrayalTendency: 0.22
    },
    [NpcArchetype.ReligiousFanatic]: {
      archetype,
      ambition: 0.58,
      caution: 0.34,
      greed: 0.24,
      zeal: 0.84,
      honor: 0.6,
      betrayalTendency: 0.18
    },
    [NpcArchetype.Opportunist]: {
      archetype,
      ambition: 0.66,
      caution: 0.46,
      greed: 0.58,
      zeal: 0.34,
      honor: 0.32,
      betrayalTendency: 0.48
    },
    [NpcArchetype.Treacherous]: {
      archetype,
      ambition: 0.62,
      caution: 0.41,
      greed: 0.6,
      zeal: 0.3,
      honor: 0.22,
      betrayalTendency: 0.74
    },
    [NpcArchetype.Diplomatic]: {
      archetype,
      ambition: 0.52,
      caution: 0.57,
      greed: 0.4,
      zeal: 0.29,
      honor: 0.68,
      betrayalTendency: 0.17
    },
    [NpcArchetype.Revanchist]: {
      archetype,
      ambition: 0.74,
      caution: 0.31,
      greed: 0.36,
      zeal: 0.55,
      honor: 0.44,
      betrayalTendency: 0.39
    }
  };

  return {
    personality: personalityByArchetype[archetype],
    strategicGoal,
    memories: [],
    lastDecisionTick: 0
  };
}

function createKingdom(blueprint: KingdomBlueprint, capitalRegionId: string, ownedRegionCount: number): KingdomState {
  const populationBase = blueprint.isPlayer ? 2_300_000 : 1_600_000;
  const populationTotal = populationBase + ownedRegionCount * 130_000;
  const seedGold = (blueprint.isPlayer ? 360 : 290) + ownedRegionCount * 3;
  const armyManpower = (blueprint.isPlayer ? 21_000 : 17_000) + ownedRegionCount * 120;

  return {
    id: blueprint.id,
    name: blueprint.name,
    adjective: blueprint.adjective,
    isPlayer: blueprint.isPlayer,
    capitalRegionId,
    economy: createBaseEconomy(seedGold),
    population: createBasePopulation(populationTotal),
    technology: {
      unlocked: ["agri_basics", "militia_drill"],
      activeResearchId: "ledger_admin",
      researchGoalId: null,
      accumulatedResearch: 0,
      researchRate: 1,
      researchFocus: TechnologyDomain.Administration,
      doctrineMilitary: "levy_discipline",
      doctrineAdministration: "crown_stewardship"
    },
    religion: {
      stateFaith: "imperial_church",
      policy: ReligiousPolicy.Orthodoxy,
      authority: blueprint.isPlayer ? 0.62 : 0.57,
      cohesion: blueprint.isPlayer ? 0.6 : 0.54,
      conversionPressure: 0.18,
      tolerance: 0.35
    },
    military: {
      posture: ArmyPosture.Balanced,
      recruitmentPriority: 0.52,
      offensiveFocus: blueprint.isPlayer ? 0.47 : 0.51,
      targetRegionIds: [],
      armies: [
        {
          id: `${blueprint.id}_army_1`,
          stationedRegionId: capitalRegionId,
          manpower: armyManpower,
          quality: blueprint.isPlayer ? 0.56 : 0.5,
          morale: blueprint.isPlayer ? 0.64 : 0.59,
          supply: 0.73
        }
      ],
      reserveManpower: Math.round(armyManpower * 3.5),
      militaryTechLevel: 1
    },
    diplomacy: {
      treaties: [],
      relations: {},
      coalitionThreat: 0,
      warExhaustion: 0
    },
    administration: {
      adminCapacity: 95 + ownedRegionCount * 0.45,
      usedCapacity: 55 + ownedRegionCount * 0.3,
      corruption: 0.08,
      policy: {
        regionalAutonomyTarget: 0.34,
        directRuleBias: 0.58,
        assimilationInvestment: 0.3,
        antiCorruptionBudget: 0.2
      },
      regionalControl: [],
      automation: {
        economy: blueprint.isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic,
        construction: blueprint.isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic,
        defense: blueprint.isPlayer ? AutomationLevel.Assisted : AutomationLevel.NearlyAutomatic,
        diplomacyReactive: blueprint.isPlayer ? AutomationLevel.Manual : AutomationLevel.Assisted,
        expansion: blueprint.isPlayer ? AutomationLevel.Manual : AutomationLevel.Assisted,
        technology: blueprint.isPlayer ? AutomationLevel.Assisted : AutomationLevel.Assisted
      }
    },
    victoryProgress: {
      [VictoryPath.TerritorialDomination]: 0,
      [VictoryPath.DiplomaticHegemony]: 0,
      [VictoryPath.EconomicSupremacy]: 0,
      [VictoryPath.ReligiousSupremacy]: 0,
      [VictoryPath.DynasticLegacy]: 0
    },
    legitimacy: blueprint.isPlayer ? 64 : 58,
    stability: blueprint.isPlayer ? 60 : 56,
    npc: blueprint.isPlayer
      ? undefined
      : createNpcBehavior(blueprint.archetype ?? NpcArchetype.Opportunist, blueprint.strategicGoal ?? "equilibrio_regional")
  };
}

function toDefinitionMap(definitions: RegionDefinition[]): Record<string, RegionDefinition> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
}

function listDefinitionsSorted(): RegionDefinition[] {
  return [...WORLD_DEFINITIONS_V1].sort((left, right) => left.id.localeCompare(right.id));
}

function assignRegionOwners(definitions: RegionDefinition[], kingdomIds: string[]): Record<string, string> {
  const nonPlayerIds = kingdomIds.filter((id) => id !== "k_player").sort();
  const protectedIds = new Set(Object.keys(OWNER_OVERRIDES));
  const ownerByRegionId: Record<string, string> = {};

  for (const definition of definitions) {
    const overrideOwner = OWNER_OVERRIDES[definition.id];
    if (overrideOwner) {
      ownerByRegionId[definition.id] = overrideOwner;
      continue;
    }

    const hash = hashString(definition.id);
    ownerByRegionId[definition.id] = nonPlayerIds[hash % nonPlayerIds.length] ?? "k_rival_north";
  }

  for (const kingdomId of kingdomIds) {
    const hasAny = Object.keys(ownerByRegionId)
      .sort()
      .some((regionId) => ownerByRegionId[regionId] === kingdomId);

    if (hasAny) {
      continue;
    }

    const byOwner = new Map<string, string[]>();
    for (const regionId of Object.keys(ownerByRegionId).sort()) {
      const owner = ownerByRegionId[regionId];
      const list = byOwner.get(owner) ?? [];
      list.push(regionId);
      byOwner.set(owner, list);
    }

    const donor = [...byOwner.entries()]
      .filter(([owner]) => owner !== "k_player")
      .sort((left, right) => right[1].length - left[1].length)[0];

    if (!donor) {
      continue;
    }

    const transferable = donor[1].find((regionId) => !protectedIds.has(regionId));
    if (!transferable) {
      continue;
    }

    ownerByRegionId[transferable] = kingdomId;
  }

  return ownerByRegionId;
}

function buildOwnerIndex(ownerByRegionId: Record<string, string>): Map<string, string[]> {
  const byOwner = new Map<string, string[]>();

  for (const regionId of Object.keys(ownerByRegionId).sort()) {
    const ownerId = ownerByRegionId[regionId];
    const list = byOwner.get(ownerId) ?? [];
    list.push(regionId);
    byOwner.set(ownerId, list);
  }

  return byOwner;
}

function selectCapitalRegionId(
  blueprint: KingdomBlueprint,
  definitionsById: Record<string, RegionDefinition>,
  ownedRegionIds: string[]
): string {
  if (ownedRegionIds.includes(blueprint.preferredCapitalRegionId)) {
    return blueprint.preferredCapitalRegionId;
  }

  const fallback = [...ownedRegionIds]
    .sort((left, right) => {
      const leftValue = definitionsById[left]?.strategicValue ?? 0;
      const rightValue = definitionsById[right]?.strategicValue ?? 0;
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }
      return left.localeCompare(right);
    })[0];

  if (fallback) {
    return fallback;
  }

  return blueprint.preferredCapitalRegionId;
}

function createRegionState(definition: RegionDefinition, ownerId: string): RegionState {
  const seed = hashString(definition.id);
  const unrest = 0.08 + ((seed % 23) / 100);
  const autonomy = 0.2 + ((Math.floor(seed / 13) % 22) / 100);
  const devastation = ((Math.floor(seed / 31) % 7) / 100);
  const assimilation = 0.74 + ((Math.floor(seed / 47) % 23) / 100);
  const faithStrength = 0.45 + ((Math.floor(seed / 71) % 33) / 100);

  return {
    regionId: definition.id,
    ownerId,
    controllerId: ownerId,
    autonomy: round(clamp(autonomy, 0, 1)),
    assimilation: round(clamp(assimilation, 0, 1)),
    unrest: round(clamp(unrest, 0, 1)),
    devastation: round(clamp(devastation, 0, 1)),
    localFaithStrength: round(clamp(faithStrength, 0, 1)),
    actionCooldowns: {}
  };
}

function createWorldRoutes(definitionsById: Record<string, RegionDefinition>): StrategicRoute[] {
  const routes: StrategicRoute[] = [];

  for (const definition of Object.keys(definitionsById)
    .sort()
    .map((regionId) => definitionsById[regionId])) {
    for (const neighborId of [...definition.neighbors].sort()) {
      if (definition.id.localeCompare(neighborId) >= 0) {
        continue;
      }

      const neighbor = definitionsById[neighborId];
      if (!neighbor) {
        continue;
      }

      routes.push({
        id: `route_${definition.id}_${neighborId}`,
        from: definition.id,
        to: neighborId,
        routeType: definition.isCoastal && neighbor.isCoastal ? "sea" : "land",
        controlWeight: round(0.8 + ((definition.strategicValue + neighbor.strategicValue) / 20), 2)
      });
    }
  }

  return routes;
}

function createWorldState(ownerByRegionId: Record<string, string>): WorldState {
  const definitions = toDefinitionMap(listDefinitionsSorted());
  const regions: Record<string, RegionState> = {};

  for (const regionId of Object.keys(definitions).sort()) {
    const definition = definitions[regionId];
    const ownerId = ownerByRegionId[regionId] ?? "k_rival_north";
    regions[regionId] = createRegionState(definition, ownerId);
  }

  return {
    mapId: WORLD_DEFINITIONS_MAP_ID,
    definitions,
    regions,
    routes: createWorldRoutes(definitions)
  };
}

function createSeedRelations(state: GameState): void {
  const ids = Object.keys(state.kingdoms).sort();

  for (const id of ids) {
    const kingdom = state.kingdoms[id];

    for (const otherId of ids) {
      if (id === otherId) {
        continue;
      }

      const rivalryBias = state.kingdoms[otherId].isPlayer && !kingdom.isPlayer ? 0.24 : 0.18;
      const trustBias = kingdom.isPlayer ? 0.5 : 0.42;

      kingdom.diplomacy.relations[otherId] = {
        withKingdomId: otherId,
        status: DiplomaticRelation.Neutral,
        score: {
          trust: trustBias,
          fear: 0.22,
          rivalry: rivalryBias,
          religiousTension: 0.18,
          borderTension: 0.24,
          tradeValue: 0.31
        },
        grievance: 0.1,
        allianceStrength: 0,
        actionCooldowns: {}
      };
    }
  }
}

function createSeedTreaty(state: GameState, now: number): void {
  const player = state.kingdoms.k_player;
  const south = state.kingdoms.k_rival_south;

  if (!player || !south) {
    return;
  }

  const parties = sortUniqueIds([player.id, south.id]);
  const signedAt = now - 1000 * 60 * 60;
  const treaty = {
    id: buildTreatyId(TreatyType.Peace, parties, signedAt),
    type: TreatyType.Peace,
    parties,
    signedAt,
    expiresAt: now + 1000 * 60 * 60 * 6,
    terms: {
      borderFreeze: true,
      warReparations: 0
    }
  };

  player.diplomacy.treaties.push(treaty);
  south.diplomacy.treaties.push(treaty);
}

function createKingdoms(ownerByRegionId: Record<string, string>): Record<string, KingdomState> {
  const definitionsById = toDefinitionMap(listDefinitionsSorted());
  const byOwner = buildOwnerIndex(ownerByRegionId);
  const kingdoms: Record<string, KingdomState> = {};

  for (const blueprint of KINGDOM_BLUEPRINTS) {
    const ownedRegions = byOwner.get(blueprint.id) ?? [];
    const capitalRegionId = selectCapitalRegionId(blueprint, definitionsById, ownedRegions);
    kingdoms[blueprint.id] = createKingdom(blueprint, capitalRegionId, ownedRegions.length);
  }

  return kingdoms;
}

export function createInitialState(): GameState {
  const now = Date.now();
  const definitions = listDefinitionsSorted();
  const kingdomIds = KINGDOM_BLUEPRINTS.map((entry) => entry.id).sort();
  const ownerByRegionId = assignRegionOwners(definitions, kingdomIds);

  const state: GameState = {
    meta: {
      schemaVersion: 2,
      sessionId: `session_${now}`,
      tick: 0,
      tickDurationMs: 3_000,
      speedMultiplier: 1,
      paused: false,
      createdAt: now,
      lastUpdatedAt: now,
      lastClosedAt: null
    },
    campaign: {
      id: "campaign_world_thrones",
      name: "Coroas do Mundo",
      mapId: WORLD_DEFINITIONS_MAP_ID,
      startDateIso: "1100-01-01",
      victoryTargets: [
        { path: VictoryPath.TerritorialDomination, threshold: 0.55 },
        { path: VictoryPath.DiplomaticHegemony, threshold: 0.65 },
        { path: VictoryPath.EconomicSupremacy, threshold: 0.7 },
        { path: VictoryPath.ReligiousSupremacy, threshold: 0.68 },
        { path: VictoryPath.DynasticLegacy, threshold: 0.72 }
      ]
    },
    world: createWorldState(ownerByRegionId),
    kingdoms: createKingdoms(ownerByRegionId),
    wars: {},
    events: [
      {
        id: "evt_seed_campaign_start",
        title: "As Coroas do Mundo Entram em Movimento",
        details: "A campanha mundial foi iniciada com todas as regioes ativas no mapa.",
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
  createSeedTreaty(state, now);

  for (const regionId of Object.keys(state.world.regions).sort()) {
    const region = state.world.regions[regionId];
    region.actionCooldowns = region.actionCooldowns ?? {};
  }

  return state;
}
