import type { DiplomacyResolver, NpcDecision } from "../../core/contracts/services";
import { DiplomaticRelation, TreatyType } from "../../core/models/enums";
import type { BilateralRelation, Treaty } from "../../core/models/diplomacy";
import type { GameState, KingdomState } from "../../core/models/game-state";
import type { KingdomId } from "../../core/models/types";

const DEFAULT_TREATY_DURATION_MS = 1000 * 60 * 18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getOwnedRegionCount(state: GameState, kingdomId: KingdomId): number {
  let total = 0;

  for (const region of Object.values(state.world.regions)) {
    if (region.ownerId === kingdomId) {
      total += 1;
    }
  }

  return total;
}

function ensureRelation(kingdom: KingdomState, otherKingdomId: KingdomId): BilateralRelation {
  const existing = kingdom.diplomacy.relations[otherKingdomId];
  if (existing) {
    return existing;
  }

  const created: BilateralRelation = {
    withKingdomId: otherKingdomId,
    status: DiplomaticRelation.Neutral,
    score: {
      trust: 0.4,
      fear: 0.2,
      rivalry: 0.2,
      religiousTension: 0.2,
      borderTension: 0.2,
      tradeValue: 0.2
    },
    grievance: 0.08,
    allianceStrength: 0
  };

  kingdom.diplomacy.relations[otherKingdomId] = created;
  return created;
}

function setPairStatus(state: GameState, leftId: KingdomId, rightId: KingdomId, status: DiplomaticRelation): void {
  const left = state.kingdoms[leftId];
  const right = state.kingdoms[rightId];

  if (!left || !right) {
    return;
  }

  ensureRelation(left, rightId).status = status;
  ensureRelation(right, leftId).status = status;
}

function hasActiveTreaty(state: GameState, kingdomIdA: KingdomId, kingdomIdB: KingdomId, type: TreatyType, now: number): boolean {
  const kingdom = state.kingdoms[kingdomIdA];
  if (!kingdom) {
    return false;
  }

  return kingdom.diplomacy.treaties.some((treaty) => {
    const matchesType = treaty.type === type;
    const matchesParties = treaty.parties.includes(kingdomIdA) && treaty.parties.includes(kingdomIdB);
    const active = treaty.expiresAt === null || treaty.expiresAt > now;
    return matchesType && matchesParties && active;
  });
}

function addTreaty(kingdom: KingdomState, treaty: Treaty): void {
  const index = kingdom.diplomacy.treaties.findIndex((current) => current.id === treaty.id);

  if (index >= 0) {
    kingdom.diplomacy.treaties[index] = treaty;
    return;
  }

  kingdom.diplomacy.treaties.push(treaty);
}

function registerPairTreaty(
  state: GameState,
  leftId: KingdomId,
  rightId: KingdomId,
  type: TreatyType,
  now: number,
  expiresAt: number | null,
  terms: Record<string, number | string | boolean>
): void {
  const left = state.kingdoms[leftId];
  const right = state.kingdoms[rightId];

  if (!left || !right) {
    return;
  }

  const treatyId = `treaty_${type}_${leftId}_${rightId}`;
  const treaty: Treaty = {
    id: treatyId,
    type,
    parties: [leftId, rightId],
    signedAt: now,
    expiresAt,
    terms
  };

  addTreaty(left, treaty);
  addTreaty(right, treaty);
}

function softenRelationForPeace(relation: BilateralRelation): void {
  relation.grievance = roundTo(clamp(relation.grievance - 0.12, 0, 1));
  relation.score.rivalry = roundTo(clamp(relation.score.rivalry - 0.08, 0, 1));
  relation.score.borderTension = roundTo(clamp(relation.score.borderTension - 0.05, 0, 1));
  relation.score.trust = roundTo(clamp(relation.score.trust + 0.04, 0, 1));
}

export class LocalDiplomacyResolver implements DiplomacyResolver {
  resolveTick(state: GameState, now: number): GameState {
    const player = Object.values(state.kingdoms).find((kingdom) => kingdom.isPlayer);
    const totalRegions = Math.max(1, Object.keys(state.world.regions).length);
    const playerTerritoryShare = player ? getOwnedRegionCount(state, player.id) / totalRegions : 0;

    for (const kingdom of Object.values(state.kingdoms)) {
      kingdom.diplomacy.treaties = kingdom.diplomacy.treaties.filter(
        (treaty) => treaty.expiresAt === null || treaty.expiresAt > now
      );

      for (const relation of Object.values(kingdom.diplomacy.relations)) {
        const hostilityBias = relation.status === DiplomaticRelation.Hostile ? 0.012 : 0;
        const alliedBias = relation.status === DiplomaticRelation.Allied ? 0.009 : 0;

        relation.score.trust = roundTo(clamp(relation.score.trust + alliedBias - hostilityBias - relation.grievance * 0.008 + 0.002, 0, 1));
        relation.score.rivalry = roundTo(
          clamp(relation.score.rivalry + relation.score.borderTension * 0.004 + hostilityBias * 0.7 - alliedBias * 0.5, 0, 1)
        );
        relation.score.fear = roundTo(clamp(relation.score.fear + relation.score.rivalry * 0.003 - relation.score.trust * 0.002, 0, 1));
        relation.score.tradeValue = roundTo(clamp(relation.score.tradeValue + relation.score.trust * 0.003 - relation.score.rivalry * 0.003, 0, 1));

        if (relation.status === DiplomaticRelation.Hostile) {
          relation.grievance = roundTo(clamp(relation.grievance + 0.004, 0, 1));
        } else {
          relation.grievance = roundTo(clamp(relation.grievance - 0.003, 0, 1));
        }

        if (relation.grievance > 0.72 || (relation.score.rivalry > 0.64 && relation.score.trust < 0.28)) {
          relation.status = DiplomaticRelation.Hostile;
        } else if (relation.score.trust > 0.78 && relation.score.rivalry < 0.28) {
          relation.status = DiplomaticRelation.Allied;
        } else if (relation.score.trust > 0.62 && relation.score.rivalry < 0.45) {
          relation.status = DiplomaticRelation.Friendly;
        } else if (relation.status !== DiplomaticRelation.Truce) {
          relation.status = DiplomaticRelation.Neutral;
        }
      }

      if (!kingdom.isPlayer && player) {
        const relationToPlayer = kingdom.diplomacy.relations[player.id];
        const rivalry = relationToPlayer?.score.rivalry ?? 0.3;
        const trust = relationToPlayer?.score.trust ?? 0.4;

        kingdom.diplomacy.coalitionThreat = roundTo(
          clamp(playerTerritoryShare * 0.75 + rivalry * 0.2 + (1 - trust) * 0.15 + kingdom.diplomacy.warExhaustion * 0.1, 0, 1)
        );
      }
    }

    return state;
  }

  applyDecision(state: GameState, decision: NpcDecision): GameState {
    const actor = state.kingdoms[decision.actorKingdomId];
    const targetId = decision.targetKingdomId;

    if (!actor || !targetId) {
      return state;
    }

    const target = state.kingdoms[targetId];
    if (!target) {
      return state;
    }

    const now = state.meta.lastUpdatedAt;
    const actorRelation = ensureRelation(actor, target.id);
    const targetRelation = ensureRelation(target, actor.id);

    switch (decision.actionType) {
      case "oferta_alianca": {
        actorRelation.score.trust = roundTo(clamp(actorRelation.score.trust + 0.08, 0, 1));
        targetRelation.score.trust = roundTo(clamp(targetRelation.score.trust + 0.06, 0, 1));
        actorRelation.grievance = roundTo(clamp(actorRelation.grievance - 0.04, 0, 1));
        targetRelation.grievance = roundTo(clamp(targetRelation.grievance - 0.05, 0, 1));

        if (actorRelation.score.trust > 0.6 && targetRelation.score.trust > 0.55) {
          registerPairTreaty(state, actor.id, target.id, TreatyType.Alliance, now, now + DEFAULT_TREATY_DURATION_MS * 2, {
            militarySupport: true
          });
          setPairStatus(state, actor.id, target.id, DiplomaticRelation.Allied);
        } else {
          setPairStatus(state, actor.id, target.id, DiplomaticRelation.Friendly);
        }

        break;
      }
      case "pressao_fronteirica": {
        actorRelation.score.rivalry = roundTo(clamp(actorRelation.score.rivalry + 0.05, 0, 1));
        actorRelation.score.borderTension = roundTo(clamp(actorRelation.score.borderTension + 0.07, 0, 1));
        targetRelation.score.fear = roundTo(clamp(targetRelation.score.fear + 0.08, 0, 1));
        targetRelation.score.rivalry = roundTo(clamp(targetRelation.score.rivalry + 0.06, 0, 1));
        targetRelation.grievance = roundTo(clamp(targetRelation.grievance + 0.08, 0, 1));

        if (targetRelation.grievance > 0.52) {
          setPairStatus(state, actor.id, target.id, DiplomaticRelation.Hostile);
        }

        break;
      }
      case "embargo_comercial": {
        actorRelation.score.tradeValue = roundTo(clamp(actorRelation.score.tradeValue - 0.12, 0, 1));
        targetRelation.score.tradeValue = roundTo(clamp(targetRelation.score.tradeValue - 0.2, 0, 1));
        targetRelation.grievance = roundTo(clamp(targetRelation.grievance + 0.1, 0, 1));

        registerPairTreaty(state, actor.id, target.id, TreatyType.Embargo, now, now + DEFAULT_TREATY_DURATION_MS, {
          blockedRoutes: true
        });

        break;
      }
      case "proposta_paz": {
        softenRelationForPeace(actorRelation);
        softenRelationForPeace(targetRelation);

        registerPairTreaty(state, actor.id, target.id, TreatyType.Peace, now, now + DEFAULT_TREATY_DURATION_MS, {
          borderFreeze: true
        });

        setPairStatus(state, actor.id, target.id, DiplomaticRelation.Truce);
        break;
      }
      case "declarar_guerra": {
        actorRelation.score.trust = roundTo(clamp(actorRelation.score.trust - 0.15, 0, 1));
        targetRelation.score.trust = roundTo(clamp(targetRelation.score.trust - 0.2, 0, 1));
        actorRelation.grievance = roundTo(clamp(actorRelation.grievance + 0.12, 0, 1));
        targetRelation.grievance = roundTo(clamp(targetRelation.grievance + 0.18, 0, 1));

        setPairStatus(state, actor.id, target.id, DiplomaticRelation.Hostile);
        break;
      }
      default: {
        if (hasActiveTreaty(state, actor.id, target.id, TreatyType.NonAggression, now)) {
          actorRelation.score.trust = roundTo(clamp(actorRelation.score.trust + 0.01, 0, 1));
          targetRelation.score.trust = roundTo(clamp(targetRelation.score.trust + 0.01, 0, 1));
        }
      }
    }

    return state;
  }
}
