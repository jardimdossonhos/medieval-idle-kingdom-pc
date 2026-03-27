import { NpcArchetype, DiplomaticRelation } from "../../core/models/enums";
import type { INpcDecisionService, NpcDecision } from "../../core/contracts/services";
import type { GameState, KingdomState } from "../../core/models/game-state";
import type { KingdomId, TimestampMs } from "../../core/models/types";

const WAR_COOLDOWN_KEY = "war:declaration";

interface ActionContext {
  state: GameState;
  now: TimestampMs;
  actor: KingdomState;
  target: KingdomState;
  actorPerceivedPower: number;
  targetPerceivedPower: number;
  isAtWar: boolean;
}

function getArmyStrength(kingdom: KingdomState): number {
  if (!kingdom) return 0;
  return kingdom.military.armies.reduce((total, army) => total + army.manpower * army.quality * (0.6 + army.morale * 0.4), 0);
}

function getPerceivedArmyStrength(actor: KingdomState, target: KingdomState): number {
  const realStrength = getArmyStrength(target);
  if (actor.isPlayer) return realStrength; // Player has perfect info for now

  // Bounded Rationality: NPC estimates enemy strength with a margin of error
  const perceptionError = 1.0 - (actor.npc?.personality.caution ?? 0.5) * 0.4; // Cautious leaders are more accurate
  const noise = (Math.random() - 0.5) * 0.3; // Random fluctuation
  return realStrength * perceptionError * (1 + noise);
}

function isAtWarBetween(state: GameState, leftId: string, rightId: string): boolean {
  return Object.values(state.wars).some(
    (war) =>
      (war.attackers.includes(leftId) && war.defenders.includes(rightId)) ||
      (war.attackers.includes(rightId) && war.defenders.includes(leftId))
  );
}

function activeWarCount(state: GameState, kingdomId: string): number {
  return Object.values(state.wars).filter((war) => war.attackers.includes(kingdomId) || war.defenders.includes(kingdomId)).length;
}

function getMemoryModifier(actor: KingdomState, targetId: KingdomId, now: TimestampMs): number {
  const memories = actor.npc?.memories ?? [];
  let totalGrievance = 0;
  
  for (const memory of memories) {
    if (memory.otherKingdomId === targetId) {
      const ageInYears = (now - memory.happenedAt) / (1000 * 60); // Assuming 1 min = 1 year for decay
      const decayFactor = Math.exp(-ageInYears / 50); // Memory half-life of ~35 years
      totalGrievance += memory.grievanceDelta * decayFactor;
    }
  }
  return totalGrievance;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreDeclareWar(ctx: ActionContext): number {
  if (ctx.isAtWar) return 0;
  if (activeWarCount(ctx.state, ctx.actor.id) >= 2) return 0;
  if (ctx.actor.diplomacy.warExhaustion > 0.7) return 0;
  
  const warCooldownUntil = ctx.actor.diplomacy.relations[ctx.target.id]?.actionCooldowns?.[WAR_COOLDOWN_KEY] ?? 0;
  if (warCooldownUntil > ctx.now) return 0;

  const personality = ctx.actor.npc!.personality;
  const relation = ctx.actor.diplomacy.relations[ctx.target.id];

  const strengthRatio = ctx.actorPerceivedPower / Math.max(1, ctx.targetPerceivedPower);
  const memoryModifier = getMemoryModifier(ctx.actor, ctx.target.id, ctx.now);

  let score = 0;
  // Archetype base desire for war
  if ([NpcArchetype.Expansionist, NpcArchetype.Revanchist].includes(personality.archetype)) score += 0.3;
  if (NpcArchetype.Opportunist === personality.archetype && strengthRatio > 1.2) score += 0.4;

  // Structural and relational factors
  score += (strengthRatio - 1.0) * 0.4; // Higher score if stronger
  score += (relation?.score.rivalry ?? 0) * 0.2;
  score += (relation?.grievance ?? 0) * 0.25;
  score += memoryModifier * 0.3; // Past grievances matter

  // Internal pressures (negative factors)
  score -= ctx.actor.diplomacy.warExhaustion * 0.5;
  score -= (1 - (ctx.actor.stability / 100)) * 0.4; // Unstable kingdoms avoid war

  return clamp(score, 0, 1);
}

function scoreProposePeace(ctx: ActionContext): number {
  if (!ctx.isAtWar) return 0;

  const strengthRatio = ctx.actorPerceivedPower / Math.max(1, ctx.targetPerceivedPower);
  
  let score = 0;
  score += ctx.actor.diplomacy.warExhaustion * 0.6; // Main driver for peace
  score += (1 - (ctx.actor.stability / 100)) * 0.3;

  // If losing, more likely to sue for peace
  if (strengthRatio < 0.8) {
    score += (1.0 - strengthRatio) * 0.4;
  }

  return clamp(score, 0, 1);
}

function scoreOfferAlliance(ctx: ActionContext): number {
  if (ctx.isAtWar) return 0;
  if (ctx.actor.diplomacy.relations[ctx.target.id]?.status !== DiplomaticRelation.Neutral) return 0;

  const personality = ctx.actor.npc!.personality;
  const relation = ctx.actor.diplomacy.relations[ctx.target.id];

  let score = 0;
  if ([NpcArchetype.Diplomatic, NpcArchetype.Defensive].includes(personality.archetype)) score += 0.2;

  score += (relation?.score.trust ?? 0) * 0.5;
  score -= (relation?.score.rivalry ?? 0) * 0.3;
  score -= getMemoryModifier(ctx.actor, ctx.target.id, ctx.now) * 0.4; // Negative memories prevent alliances

  // External threat promotes alliances
  const externalThreat = ctx.actor.diplomacy.coalitionThreat;
  score += externalThreat * 0.3;

  return clamp(score, 0, 1);
}

export class UtilityNpcDecisionService implements INpcDecisionService {
  decide(state: GameState, actorKingdomId: string, now: TimestampMs): NpcDecision[] {
    const actor = state.kingdoms[actorKingdomId];

    if (!actor || actor.isPlayer || !actor.npc) {
      return [];
    }

    // AI thinks less frequently to save CPU
    if (state.meta.tick % 12 !== 0) {
      return [];
    }

    const potentialTargets = Object.values(state.kingdoms).filter(
      (kingdom) => kingdom.id !== actor.id && kingdom.id !== "k_nature"
    );

    const decisions: NpcDecision[] = [];

    for (const target of potentialTargets) {
      const context: ActionContext = {
        state,
        now,
        actor,
        target,
        actorPerceivedPower: getArmyStrength(actor), // NPC knows its own strength
        targetPerceivedPower: getPerceivedArmyStrength(actor, target),
        isAtWar: isAtWarBetween(state, actor.id, target.id)
      };

      const warScore = scoreDeclareWar(context);
      if (warScore > 0.55) { // High threshold for such a drastic action
        decisions.push({
          actorKingdomId,
          actionType: "declarar_guerra",
          priority: warScore,
          targetKingdomId: target.id,
          payload: { rationale: "utility_calculation", score: warScore }
        });
      }

      const peaceScore = scoreProposePeace(context);
      if (peaceScore > 0.6) {
        decisions.push({
          actorKingdomId,
          actionType: "proposta_paz",
          priority: peaceScore,
          targetKingdomId: target.id,
          payload: { rationale: "utility_calculation", score: peaceScore }
        });
      }

      const allianceScore = scoreOfferAlliance(context);
      if (allianceScore > 0.65) {
        decisions.push({
          actorKingdomId,
          actionType: "oferta_alianca",
          priority: allianceScore,
          targetKingdomId: target.id,
          payload: { rationale: "utility_calculation", score: allianceScore }
        });
      }
    }

    // Return the top N decisions
    return decisions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }
}
