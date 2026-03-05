import type { WarResolver } from "../../core/contracts/services";
import { DiplomaticRelation, TreatyType } from "../../core/models/enums";
import type { Treaty } from "../../core/models/diplomacy";
import type { GameState, KingdomState, WarFront, WarState } from "../../core/models/game-state";
import type { KingdomId } from "../../core/models/types";

const PEACE_TREATY_DURATION_MS = 1000 * 60 * 28;
const CONQUEST_THRESHOLD = 62;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function militaryPower(kingdom: KingdomState): number {
  return kingdom.military.armies.reduce((total, army) => {
    const qualityFactor = 0.6 + army.quality * 0.4;
    const sustainFactor = 0.55 + army.morale * 0.25 + army.supply * 0.2;
    return total + army.manpower * qualityFactor * sustainFactor;
  }, 0);
}

function participantPower(state: GameState, participants: KingdomId[]): number {
  return participants.reduce((total, participantId) => {
    const kingdom = state.kingdoms[participantId];
    if (!kingdom) {
      return total;
    }

    const power = militaryPower(kingdom) * (1 + kingdom.military.militaryTechLevel * 0.1);
    return total + power;
  }, 0);
}

function isAtWar(kingdomId: KingdomId, war: WarState): boolean {
  return war.attackers.includes(kingdomId) || war.defenders.includes(kingdomId);
}

function areInActiveWar(state: GameState, leftId: KingdomId, rightId: KingdomId): boolean {
  for (const war of Object.values(state.wars)) {
    const leftInWar = isAtWar(leftId, war);
    const rightInWar = isAtWar(rightId, war);

    if (leftInWar && rightInWar) {
      return true;
    }
  }

  return false;
}

function hasActivePeaceTreaty(state: GameState, leftId: KingdomId, rightId: KingdomId, now: number): boolean {
  const kingdom = state.kingdoms[leftId];

  if (!kingdom) {
    return false;
  }

  return kingdom.diplomacy.treaties.some(
    (treaty) =>
      treaty.type === TreatyType.Peace &&
      treaty.parties.includes(leftId) &&
      treaty.parties.includes(rightId) &&
      (treaty.expiresAt === null || treaty.expiresAt > now)
  );
}

function setPairStatus(state: GameState, leftId: KingdomId, rightId: KingdomId, status: DiplomaticRelation): void {
  const left = state.kingdoms[leftId];
  const right = state.kingdoms[rightId];

  if (!left || !right) {
    return;
  }

  const leftRelation = left.diplomacy.relations[rightId];
  const rightRelation = right.diplomacy.relations[leftId];

  if (leftRelation) {
    leftRelation.status = status;
  }

  if (rightRelation) {
    rightRelation.status = status;
  }
}

function addTreaty(kingdom: KingdomState, treaty: Treaty): void {
  const existingIndex = kingdom.diplomacy.treaties.findIndex((entry) => entry.id === treaty.id);

  if (existingIndex >= 0) {
    kingdom.diplomacy.treaties[existingIndex] = treaty;
    return;
  }

  kingdom.diplomacy.treaties.push(treaty);
}

function addPeaceTreaty(state: GameState, leftId: KingdomId, rightId: KingdomId, signedAt: number): void {
  const left = state.kingdoms[leftId];
  const right = state.kingdoms[rightId];

  if (!left || !right) {
    return;
  }

  const treaty: Treaty = {
    id: `treaty_peace_${leftId}_${rightId}`,
    type: TreatyType.Peace,
    parties: [leftId, rightId],
    signedAt,
    expiresAt: signedAt + PEACE_TREATY_DURATION_MS,
    terms: {
      borderFreeze: true,
      warReparations: 0
    }
  };

  addTreaty(left, treaty);
  addTreaty(right, treaty);
}

function findBorderFronts(state: GameState, attackerId: KingdomId, defenderId: KingdomId): WarFront[] {
  const attackerRegions = Object.values(state.world.regions)
    .filter((region) => region.ownerId === attackerId)
    .map((region) => region.regionId).sort();

  const defenderRegionSet = new Set(
    Object.values(state.world.regions)
      .filter((region) => region.ownerId === defenderId)
      .map((region) => region.regionId)
  );

  const fronts: WarFront[] = [];

  for (const regionId of attackerRegions) {
    const definition = state.world.definitions[regionId];

    if (!definition) {
      continue;
    }

    for (const neighborId of definition.neighbors) {
      if (!defenderRegionSet.has(neighborId)) {
        continue;
      }

      fronts.push({
        regionId: neighborId,
        pressureAttackers: 50,
        pressureDefenders: 50
      });
    }
  }

  if (fronts.length > 0) {
    return fronts;
  }

  return [
    {
      regionId: state.kingdoms[defenderId]?.capitalRegionId ?? state.kingdoms[attackerId].capitalRegionId,
      pressureAttackers: 50,
      pressureDefenders: 50
    }
  ];
}

function reduceArmyForWar(kingdom: KingdomState, intensity: number): void {
  for (const army of kingdom.military.armies) {
    const supplyPenalty = 1 + (1 - army.supply) * 0.7;
    const attritionRate = (0.0015 + intensity * 0.0018) * supplyPenalty;

    army.manpower = Math.max(800, Math.round(army.manpower * (1 - attritionRate)));
    army.morale = roundTo(clamp(army.morale - 0.003 - intensity * 0.005, 0.25, 1));
    army.supply = roundTo(clamp(army.supply - 0.002 - intensity * 0.004, 0.25, 1));
  }
}

function applyConquest(state: GameState, winners: KingdomId[], losers: KingdomId[]): { regionId: string; previousOwnerId: KingdomId; newOwnerId: KingdomId } | null {
  if (winners.length === 0 || losers.length === 0) {
    return null;
  }

  const winnerId = winners[0];
  const loserSet = new Set(losers);

  const winnerRegions = Object.values(state.world.regions)
    .filter((region) => region.ownerId === winnerId)
    .map((region) => region.regionId)
    .sort();

  const candidates = new Set<string>();

  for (const winnerRegionId of winnerRegions) {
    const definition = state.world.definitions[winnerRegionId];

    if (!definition) {
      continue;
    }

    for (const neighborId of definition.neighbors) {
      const neighborState = state.world.regions[neighborId];
      if (neighborState && loserSet.has(neighborState.ownerId)) {
        candidates.add(neighborId);
      }
    }
  }

  let targetRegionId: string | null = null;

  if (candidates.size > 0) {
    const sortedCandidates = Array.from(candidates).sort((a, b) => {
      const va = state.world.definitions[a]?.strategicValue ?? 0;
      const vb = state.world.definitions[b]?.strategicValue ?? 0;
      if (vb !== va) {
        return vb - va;
      }
      return a.localeCompare(b);
    });

    targetRegionId = sortedCandidates[0] ?? null;
  } else {
    const fallback = Object.values(state.world.regions)
      .filter((region) => loserSet.has(region.ownerId))
      .map((region) => region.regionId)
      .sort()[0];

    targetRegionId = fallback ?? null;
  }

  if (!targetRegionId) {
    return null;
  }

  const region = state.world.regions[targetRegionId];
  const previousOwnerId = region.ownerId;

  region.ownerId = winnerId;
  region.controllerId = winnerId;
  region.autonomy = roundTo(clamp(region.autonomy + 0.2, 0, 1));
  region.assimilation = roundTo(clamp(Math.min(region.assimilation, 0.36), 0, 1));
  region.unrest = roundTo(clamp(region.unrest + 0.3, 0, 1));
  region.devastation = roundTo(clamp(region.devastation + 0.12, 0, 1));

  return {
    regionId: targetRegionId,
    previousOwnerId,
    newOwnerId: winnerId
  };
}

export class LocalWarResolver implements WarResolver {
  evaluateWarRisk(attacker: KingdomState, defender: KingdomState, state: GameState): number {
    const now = state.meta.lastUpdatedAt;
    if (hasActivePeaceTreaty(state, attacker.id, defender.id, now) || areInActiveWar(state, attacker.id, defender.id)) {
      return 0;
    }

    const relation = attacker.diplomacy.relations[defender.id];
    const tension = relation
      ? relation.score.rivalry * 0.34 + relation.score.borderTension * 0.21 + relation.grievance * 0.3 + (1 - relation.score.trust) * 0.15
      : 0.32;

    const attackerPower = Math.max(1, militaryPower(attacker));
    const defenderPower = Math.max(1, militaryPower(defender));
    const ratio = attackerPower / defenderPower;
    const powerFactor = clamp((ratio - 0.85) / 0.9, 0, 1);

    const stabilityFactor = clamp(attacker.stability / 100, 0, 1);
    const exhaustionPenalty = clamp(attacker.diplomacy.warExhaustion * 0.42, 0, 0.4);

    return roundTo(clamp(tension * 0.6 + powerFactor * 0.28 + stabilityFactor * 0.12 - exhaustionPenalty, 0, 1));
  }

  declareWar(state: GameState, attackerId: KingdomId, defenderId: KingdomId): GameState {
    if (attackerId === defenderId || !state.kingdoms[attackerId] || !state.kingdoms[defenderId]) {
      return state;
    }

    if (areInActiveWar(state, attackerId, defenderId)) {
      return state;
    }

    const now = state.meta.lastUpdatedAt;
    if (hasActivePeaceTreaty(state, attackerId, defenderId, now)) {
      return state;
    }

    const warId = `war_${attackerId}_${defenderId}_${state.meta.tick}`;
    const fronts = findBorderFronts(state, attackerId, defenderId);

    state.wars[warId] = {
      id: warId,
      attackers: [attackerId],
      defenders: [defenderId],
      warScore: 0,
      startedAt: now,
      fronts
    };

    setPairStatus(state, attackerId, defenderId, DiplomaticRelation.Hostile);

    state.kingdoms[attackerId].diplomacy.warExhaustion = roundTo(
      clamp(state.kingdoms[attackerId].diplomacy.warExhaustion + 0.02, 0, 1)
    );
    state.kingdoms[defenderId].diplomacy.warExhaustion = roundTo(
      clamp(state.kingdoms[defenderId].diplomacy.warExhaustion + 0.03, 0, 1)
    );

    return state;
  }

  enforcePeace(state: GameState, warId: string): GameState {
    const war = state.wars[warId];

    if (!war) {
      return state;
    }

    const signedAt = state.meta.lastUpdatedAt;

    for (const attackerId of war.attackers) {
      for (const defenderId of war.defenders) {
        setPairStatus(state, attackerId, defenderId, DiplomaticRelation.Truce);
        addPeaceTreaty(state, attackerId, defenderId, signedAt);
      }
    }

    for (const kingdomId of [...war.attackers, ...war.defenders]) {
      const kingdom = state.kingdoms[kingdomId];
      kingdom.diplomacy.warExhaustion = roundTo(clamp(kingdom.diplomacy.warExhaustion * 0.72, 0, 1));
    }

    delete state.wars[warId];
    return state;
  }

  resolveTick(state: GameState, now: number): GameState {
    const warsToPeace: string[] = [];

    for (const war of Object.values(state.wars)) {
      const attackerPower = participantPower(state, war.attackers);
      const defenderPower = participantPower(state, war.defenders);
      const combinedPower = Math.max(1, attackerPower + defenderPower);

      if (attackerPower < 300 || defenderPower < 300) {
        warsToPeace.push(war.id);
        continue;
      }

      const pressureDelta = (attackerPower - defenderPower) / combinedPower;
      war.warScore = roundTo(clamp(war.warScore + pressureDelta * 12, -100, 100));

      for (const front of war.fronts) {
        front.pressureAttackers = roundTo(clamp(front.pressureAttackers + pressureDelta * 8, 0, 100));
        front.pressureDefenders = roundTo(clamp(100 - front.pressureAttackers, 0, 100));
      }

      const intensity = clamp(Math.abs(pressureDelta) + 0.25, 0.2, 1);

      for (const attackerId of war.attackers) {
        const attacker = state.kingdoms[attackerId];
        reduceArmyForWar(attacker, intensity);
        attacker.diplomacy.warExhaustion = roundTo(clamp(attacker.diplomacy.warExhaustion + 0.003 + intensity * 0.004, 0, 1));
      }

      for (const defenderId of war.defenders) {
        const defender = state.kingdoms[defenderId];
        reduceArmyForWar(defender, intensity);
        defender.diplomacy.warExhaustion = roundTo(clamp(defender.diplomacy.warExhaustion + 0.0035 + intensity * 0.004, 0, 1));
      }

      if (war.warScore >= CONQUEST_THRESHOLD) {
        applyConquest(state, war.attackers, war.defenders);
        war.warScore = roundTo(clamp(war.warScore - 38, -100, 100));
      } else if (war.warScore <= -CONQUEST_THRESHOLD) {
        applyConquest(state, war.defenders, war.attackers);
        war.warScore = roundTo(clamp(war.warScore + 38, -100, 100));
      }

      const ageTicks = (now - war.startedAt) / Math.max(1, state.meta.tickDurationMs);

      if ((ageTicks > 42 && Math.abs(war.warScore) < 12) || this.mustForcePeace(war, state)) {
        warsToPeace.push(war.id);
      }
    }

    for (const warId of warsToPeace) {
      this.enforcePeace(state, warId);
    }

    return state;
  }

  private mustForcePeace(war: WarState, state: GameState): boolean {
    const participants = [...war.attackers, ...war.defenders];
    const exhausted = participants.filter((id) => state.kingdoms[id]?.diplomacy.warExhaustion > 0.9).length;
    return exhausted >= participants.length;
  }
}
