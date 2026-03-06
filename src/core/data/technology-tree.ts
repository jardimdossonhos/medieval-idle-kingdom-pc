import { TechnologyDomain } from "../models/enums";
import type { TechnologyNode, TechnologyState } from "../models/technology";

const NODES: TechnologyNode[] = [
  {
    id: "agri_basics",
    domain: TechnologyDomain.Economy,
    name: "Técnicas Agrárias Básicas",
    required: [],
    cost: 80,
    effects: {
      "economy.foodStock": 40,
      "population.growthRate": 0.00001
    }
  },
  {
    id: "crop_rotation",
    domain: TechnologyDomain.Economy,
    name: "Rotação de Culturas",
    required: ["agri_basics"],
    cost: 125,
    effects: {
      "economy.foodStock": 70,
      "economy.goldStock": 12
    }
  },
  {
    id: "trade_charters",
    domain: TechnologyDomain.Economy,
    name: "Cartas de Comércio",
    required: ["agri_basics"],
    cost: 130,
    effects: {
      "economy.goldStock": 45,
      "stability": 0.35
    }
  },
  {
    id: "militia_drill",
    domain: TechnologyDomain.Military,
    name: "Treino de Milícia",
    required: [],
    cost: 90,
    effects: {
      "military.techLevel": 0.08,
      "military.reserveManpower": 1500
    }
  },
  {
    id: "steel_forging",
    domain: TechnologyDomain.Military,
    name: "Forja de Aço",
    required: ["militia_drill"],
    cost: 150,
    effects: {
      "military.techLevel": 0.16,
      "economy.ironStock": 40
    }
  },
  {
    id: "siege_engineering",
    domain: TechnologyDomain.Engineering,
    name: "Engenharia de Cerco",
    required: ["steel_forging"],
    cost: 190,
    effects: {
      "military.techLevel": 0.22,
      "economy.woodStock": -20,
      "economy.ironStock": -15
    }
  },
  {
    id: "ledger_admin",
    domain: TechnologyDomain.Administration,
    name: "Contabilidade da Coroa",
    required: [],
    cost: 85,
    effects: {
      "administration.capacity": 6,
      "administration.corruption": -0.015
    }
  },
  {
    id: "cadastral_registry",
    domain: TechnologyDomain.Administration,
    name: "Cadastro Territorial",
    required: ["ledger_admin"],
    cost: 135,
    effects: {
      "administration.capacity": 10,
      "administration.corruption": -0.025,
      "stability": 0.45
    }
  },
  {
    id: "provincial_courts",
    domain: TechnologyDomain.Administration,
    name: "Cortes Provinciais",
    required: ["cadastral_registry"],
    cost: 175,
    effects: {
      "administration.capacity": 14,
      "administration.corruption": -0.03,
      "stability": 0.8
    }
  },
  {
    id: "state_cathedral",
    domain: TechnologyDomain.Religion,
    name: "Catedral de Estado",
    required: [],
    cost: 100,
    effects: {
      "religion.authority": 0.03,
      "religion.cohesion": 0.02,
      "legitimacy": 0.9
    }
  },
  {
    id: "monastic_orders",
    domain: TechnologyDomain.Religion,
    name: "Ordens Monásticas",
    required: ["state_cathedral"],
    cost: 145,
    effects: {
      "religion.authority": 0.05,
      "religion.tolerance": 0.02,
      "economy.faithStock": 25
    }
  },
  {
    id: "religious_treatises",
    domain: TechnologyDomain.Religion,
    name: "Tratados Teológicos",
    required: ["monastic_orders"],
    cost: 185,
    effects: {
      "religion.cohesion": 0.04,
      "legitimacy": 1.2,
      "stability": 0.55
    }
  },
  {
    id: "road_network",
    domain: TechnologyDomain.Logistics,
    name: "Rede de Estradas",
    required: ["ledger_admin"],
    cost: 130,
    effects: {
      "economy.goldStock": 20,
      "military.reserveManpower": 800,
      "stability": 0.2
    }
  },
  {
    id: "relay_stations",
    domain: TechnologyDomain.Logistics,
    name: "Estações de Revezamento",
    required: ["road_network"],
    cost: 165,
    effects: {
      "economy.goldStock": 25,
      "administration.capacity": 6,
      "technology.researchRate": 0.03
    }
  },
  {
    id: "river_ports",
    domain: TechnologyDomain.Logistics,
    name: "Portos Fluviais",
    required: ["trade_charters", "road_network"],
    cost: 180,
    effects: {
      "economy.goldStock": 50,
      "economy.foodStock": 30,
      "stability": 0.35
    }
  },
  {
    id: "stone_quarries",
    domain: TechnologyDomain.Engineering,
    name: "Pedreiras de Cantaria",
    required: ["crop_rotation"],
    cost: 140,
    effects: {
      "economy.woodStock": 15,
      "administration.capacity": 4,
      "stability": 0.25
    }
  },
  {
    id: "fortified_citadels",
    domain: TechnologyDomain.Engineering,
    name: "Cidadelas Fortificadas",
    required: ["stone_quarries", "steel_forging"],
    cost: 200,
    effects: {
      "military.techLevel": 0.2,
      "stability": 1,
      "economy.goldStock": -25
    }
  },
  {
    id: "hydraulic_irrigation",
    domain: TechnologyDomain.Engineering,
    name: "Irrigação Hidráulica",
    required: ["stone_quarries"],
    cost: 170,
    effects: {
      "economy.foodStock": 80,
      "population.growthRate": 0.000015,
      "stability": 0.2
    }
  }
];

const NODE_MAP = new Map(NODES.map((item) => [item.id, item]));

function byDomainAndCost(a: TechnologyNode, b: TechnologyNode): number {
  if (a.domain !== b.domain) {
    return a.domain.localeCompare(b.domain);
  }

  if (a.cost !== b.cost) {
    return a.cost - b.cost;
  }

  return a.id.localeCompare(b.id);
}

export function getTechnologyNode(id: string): TechnologyNode | undefined {
  return NODE_MAP.get(id);
}

export function listTechnologyNodes(): TechnologyNode[] {
  return [...NODES].sort(byDomainAndCost);
}

export function isTechnologyUnlocked(state: TechnologyState, nodeId: string): boolean {
  return state.unlocked.includes(nodeId);
}

export function isTechnologyAvailable(state: TechnologyState, nodeId: string): boolean {
  const node = NODE_MAP.get(nodeId);
  if (!node) {
    return false;
  }

  if (isTechnologyUnlocked(state, nodeId)) {
    return false;
  }

  return node.required.every((requiredId) => isTechnologyUnlocked(state, requiredId));
}

export function listAvailableTechnologyNodes(state: TechnologyState, domain?: TechnologyDomain): TechnologyNode[] {
  return listTechnologyNodes().filter((node) => {
    if (domain && node.domain !== domain) {
      return false;
    }

    return isTechnologyAvailable(state, node.id);
  });
}

export function selectDefaultResearchNode(state: TechnologyState, focus: TechnologyDomain): TechnologyNode | null {
  const preferred = listAvailableTechnologyNodes(state, focus);
  if (preferred.length > 0) {
    return preferred[0];
  }

  const fallback = listAvailableTechnologyNodes(state);
  return fallback[0] ?? null;
}

function selectPendingPrerequisite(state: TechnologyState, nodeId: string, visited: Set<string>): TechnologyNode | null {
  if (visited.has(nodeId)) {
    return null;
  }

  visited.add(nodeId);

  if (isTechnologyUnlocked(state, nodeId)) {
    return null;
  }

  const node = getTechnologyNode(nodeId);
  if (!node) {
    return null;
  }

  for (const requiredId of [...node.required].sort()) {
    const pending = selectPendingPrerequisite(state, requiredId, visited);
    if (pending) {
      return pending;
    }
  }

  if (isTechnologyAvailable(state, nodeId)) {
    return node;
  }

  return null;
}

export function selectResearchNodeTowardsTarget(state: TechnologyState, targetId: string): TechnologyNode | null {
  if (isTechnologyUnlocked(state, targetId)) {
    return null;
  }

  return selectPendingPrerequisite(state, targetId, new Set<string>());
}
