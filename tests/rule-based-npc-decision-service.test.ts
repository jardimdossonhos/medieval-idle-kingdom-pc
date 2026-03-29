﻿﻿﻿import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/application/boot/create-initial-state";
import { RuleBasedNpcDecisionService } from "../src/infrastructure/npc/rule-based-npc-decision-service";
import { WORLD_DEFINITIONS_V1 } from "../src/application/boot/generated/world-definitions-v1";

describe("RuleBasedNpcDecisionService", () => {
  it("proposes war when expansionist NPC has strong advantage", () => {
    const state = createInitialState(undefined, undefined, WORLD_DEFINITIONS_V1);
    const service = new RuleBasedNpcDecisionService();

    const actor = state.kingdoms.k_rival_north;
    const player = state.kingdoms.k_player;
    const relation = actor.diplomacy.relations[player.id];

    relation.score.rivalry = 0.82;
    relation.score.trust = 0.18;
    relation.grievance = 0.76;

    actor.military.armies[0].manpower = 42000;
    actor.military.armies[0].quality = 0.7;
    player.military.armies[0].manpower = 16000;
    player.military.armies[0].quality = 0.45;

    const decisions = service.decide(state, actor.id);

    expect(decisions.some((decision) => decision.actionType === "declarar_guerra")).toBe(true);
  });

  it("proposes peace when exhaustion is high during war", () => {
    const state = createInitialState(undefined, undefined, WORLD_DEFINITIONS_V1);
    const service = new RuleBasedNpcDecisionService();

    const actor = state.kingdoms.k_rival_north;
    const player = state.kingdoms.k_player;

    actor.diplomacy.warExhaustion = 0.84;
    state.wars.war_live = {
      id: "war_live",
      attackers: [actor.id],
      defenders: [player.id],
      casualties: {},
      warScore: -8,
      startedAt: state.meta.lastUpdatedAt,
      fronts: [
        {
          regionId: "r_gallia_west",
          pressureAttackers: 50,
          pressureDefenders: 50
        }
      ]
    };

    const decisions = service.decide(state, actor.id);

    expect(decisions.some((decision) => decision.actionType === "proposta_paz")).toBe(true);
  });
});
