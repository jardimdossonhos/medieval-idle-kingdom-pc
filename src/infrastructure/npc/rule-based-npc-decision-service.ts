import { NpcArchetype } from "../../core/models/enums";
import type { INpcDecisionService, NpcDecision } from "../../core/contracts/services";
import type { GameState } from "../../core/models/game-state";

function armyStrengthFor(state: GameState, kingdomId: string): number {
  const kingdom = state.kingdoms[kingdomId];
  if (!kingdom) {
    return 0;
  }

  return kingdom.military.armies.reduce((total, army) => total + army.manpower * army.quality * (0.6 + army.morale * 0.4), 0);
}

function isAtWarBetween(state: GameState, leftId: string, rightId: string): boolean {
  return Object.values(state.wars).some(
    (war) =>
      (war.attackers.includes(leftId) && war.defenders.includes(rightId)) ||
      (war.attackers.includes(rightId) && war.defenders.includes(leftId))
  );
}

function hostilityFromMemory(state: GameState, actorKingdomId: string, targetKingdomId: string): number {
  const memories = state.kingdoms[actorKingdomId]?.npc?.memories ?? [];

  const targetMemories = memories.filter((memory) => memory.otherKingdomId === targetKingdomId).slice(0, 5);

  if (targetMemories.length === 0) {
    return 0;
  }

  const hostility = targetMemories.reduce((total, memory) => total + memory.grievanceDelta + memory.fearDelta * 0.3, 0);
  return hostility / targetMemories.length;
}

export class RuleBasedNpcDecisionService implements INpcDecisionService {
  decide(state: GameState, actorKingdomId: string): NpcDecision[] {
    const actor = state.kingdoms[actorKingdomId];

    if (!actor || actor.isPlayer || !actor.npc) {
      return [];
    }

    if (state.meta.tick % 6 !== 0) {
      return [];
    }

    const player = Object.values(state.kingdoms).find((kingdom) => kingdom.isPlayer);
    if (!player) {
      return [];
    }

    const relation = actor.diplomacy.relations[player.id];
    if (!relation) {
      return [];
    }

    const actorStrength = armyStrengthFor(state, actor.id);
    const playerStrength = Math.max(1, armyStrengthFor(state, player.id));
    const strengthRatio = actorStrength / playerStrength;
    const memoryHostility = hostilityFromMemory(state, actor.id, player.id);
    const atWar = isAtWarBetween(state, actor.id, player.id);

    const decisions: NpcDecision[] = [];

    if (atWar && (actor.diplomacy.warExhaustion > 0.68 || strengthRatio < 0.85 || actor.stability < 35)) {
      decisions.push({
        actorKingdomId,
        actionType: "proposta_paz",
        priority: 0.86,
        targetKingdomId: player.id,
        payload: {
          rationale: "fadiga_de_guerra",
          warExhaustion: actor.diplomacy.warExhaustion,
          strengthRatio
        }
      });
    }

    if (!atWar) {
      const aggressionIndex =
        relation.score.rivalry * 0.35 +
        relation.grievance * 0.25 +
        memoryHostility * 0.15 +
        actor.npc.personality.ambition * 0.15 +
        (1 - relation.score.trust) * 0.1;

      const canStartWar =
        aggressionIndex > 0.52 &&
        strengthRatio > 1.04 &&
        actor.stability > 38 &&
        actor.diplomacy.warExhaustion < 0.62;

      if (
        canStartWar &&
        [NpcArchetype.Expansionist, NpcArchetype.Opportunist, NpcArchetype.Revanchist].includes(actor.npc.personality.archetype)
      ) {
        decisions.push({
          actorKingdomId,
          actionType: "declarar_guerra",
          priority: 0.9,
          targetKingdomId: player.id,
          payload: {
            rationale: "janela_estrategica",
            aggressionIndex,
            strengthRatio
          }
        });
      } else if (aggressionIndex > 0.4 && strengthRatio > 0.95) {
        decisions.push({
          actorKingdomId,
          actionType: "pressao_fronteirica",
          priority: 0.72,
          targetKingdomId: player.id,
          payload: {
            rationale: "coercao_sem_guerra",
            aggressionIndex,
            strengthRatio
          }
        });
      }
    }

    const allianceIndex =
      relation.score.trust * 0.45 +
      relation.score.tradeValue * 0.2 +
      (1 - relation.grievance) * 0.2 +
      (actor.npc.personality.honor - actor.npc.personality.betrayalTendency) * 0.15;

    if (
      !atWar &&
      allianceIndex > 0.58 &&
      [NpcArchetype.Diplomatic, NpcArchetype.Mercantile, NpcArchetype.Defensive].includes(actor.npc.personality.archetype)
    ) {
      decisions.push({
        actorKingdomId,
        actionType: "oferta_alianca",
        priority: 0.66,
        targetKingdomId: player.id,
        payload: {
          rationale: "equilibrio_regional",
          allianceIndex
        }
      });
    }

    return decisions
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 2);
  }
}
