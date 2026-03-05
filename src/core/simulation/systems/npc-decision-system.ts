import type { DiplomacyResolver, INpcDecisionService, NpcDecision, WarResolver } from "../../contracts/services";
import type { WarState } from "../../models/game-state";
import type { NpcMemoryEntry } from "../../models/npc";
import type { SimulationSystem } from "../tick-pipeline";
import { createEventId, roundTo } from "./utils";

function createMemoryEntry(decision: NpcDecision, now: number): NpcMemoryEntry | null {
  if (!decision.targetKingdomId) {
    return null;
  }

  switch (decision.actionType) {
    case "oferta_alianca":
      return {
        otherKingdomId: decision.targetKingdomId,
        trustDelta: 0.08,
        fearDelta: -0.02,
        grievanceDelta: -0.05,
        note: "oferta_alianca",
        happenedAt: now
      };
    case "declarar_guerra":
      return {
        otherKingdomId: decision.targetKingdomId,
        trustDelta: -0.2,
        fearDelta: 0.18,
        grievanceDelta: 0.22,
        note: "declaracao_guerra",
        happenedAt: now
      };
    case "pressao_fronteirica":
      return {
        otherKingdomId: decision.targetKingdomId,
        trustDelta: -0.05,
        fearDelta: 0.08,
        grievanceDelta: 0.09,
        note: "pressao_fronteirica",
        happenedAt: now
      };
    case "proposta_paz":
      return {
        otherKingdomId: decision.targetKingdomId,
        trustDelta: 0.06,
        fearDelta: -0.05,
        grievanceDelta: -0.1,
        note: "proposta_paz",
        happenedAt: now
      };
    default:
      return {
        otherKingdomId: decision.targetKingdomId,
        trustDelta: 0,
        fearDelta: 0,
        grievanceDelta: 0,
        note: decision.actionType,
        happenedAt: now
      };
  }
}

function appendMemory(memories: NpcMemoryEntry[], entry: NpcMemoryEntry): NpcMemoryEntry[] {
  return [entry, ...memories].slice(0, 28);
}

function findWarBetween(wars: WarState[], leftId: string, rightId: string): WarState | undefined {
  return wars.find(
    (war) =>
      (war.attackers.includes(leftId) && war.defenders.includes(rightId)) ||
      (war.attackers.includes(rightId) && war.defenders.includes(leftId))
  );
}

export function createNpcDecisionSystem(
  decisionService: INpcDecisionService,
  diplomacyResolver: DiplomacyResolver,
  warResolver: WarResolver
): SimulationSystem {
  return {
    id: "npc_decision",
    run(context): void {
      const state = context.nextState;

      for (const kingdomId of Object.keys(state.kingdoms)) {
        const kingdom = state.kingdoms[kingdomId];

        if (kingdom.isPlayer || !kingdom.npc) {
          continue;
        }

        const decisions = decisionService.decide(state, kingdom.id);

        for (const decision of decisions) {
          context.nextState = diplomacyResolver.applyDecision(context.nextState, decision);

          let decisionResult = "registered";
          let warRisk = 0;

          if (decision.targetKingdomId && decision.actionType === "declarar_guerra") {
            const attacker = context.nextState.kingdoms[decision.actorKingdomId];
            const defender = context.nextState.kingdoms[decision.targetKingdomId];

            if (attacker && defender) {
              warRisk = warResolver.evaluateWarRisk(attacker, defender, context.nextState);

              if (warRisk >= 0.52) {
                const beforeWarIds = new Set(Object.keys(context.nextState.wars));
                context.nextState = warResolver.declareWar(context.nextState, attacker.id, defender.id);

                const warsAfter = Object.values(context.nextState.wars) as WarState[];
                const newWar = warsAfter.find((war) => !beforeWarIds.has(war.id));

                if (newWar) {
                  decisionResult = "war_declared";

                  context.events.push({
                    id: createEventId("evt_war_start", context.nextState.meta.tick),
                    type: "war.started",
                    actorKingdomId: attacker.id,
                    targetKingdomId: defender.id,
                    payload: {
                      warId: newWar.id,
                      attackers: newWar.attackers,
                      defenders: newWar.defenders
                    },
                    occurredAt: context.now
                  });
                }
              } else {
                decisionResult = "war_cancelled_low_risk";
              }
            }
          }

          if (decision.targetKingdomId && decision.actionType === "proposta_paz") {
            const activeWar = findWarBetween(Object.values(context.nextState.wars) as WarState[], decision.actorKingdomId, decision.targetKingdomId);

            if (activeWar) {
              context.nextState = warResolver.enforcePeace(context.nextState, activeWar.id);
              decisionResult = "peace_accepted";

              context.events.push({
                id: createEventId("evt_war_peace", context.nextState.meta.tick),
                type: "war.peace",
                actorKingdomId: decision.actorKingdomId,
                targetKingdomId: decision.targetKingdomId,
                payload: {
                  warId: activeWar.id,
                  source: "npc_proposal"
                },
                occurredAt: context.now
              });
            }
          }

          const memory = createMemoryEntry(decision, context.now);
          if (memory) {
            kingdom.npc.memories = appendMemory(kingdom.npc.memories, memory);
          }

          kingdom.npc.lastDecisionTick = context.nextState.meta.tick;

          context.events.push({
            id: createEventId("evt_npc", context.nextState.meta.tick),
            type: "npc.decision",
            actorKingdomId: decision.actorKingdomId,
            targetKingdomId: decision.targetKingdomId,
            payload: {
              actionType: decision.actionType,
              priority: roundTo(decision.priority),
              targetRegionId: decision.targetRegionId,
              result: decisionResult,
              warRisk,
              ...decision.payload
            },
            occurredAt: context.now
          });
        }
      }
    }
  };
}
