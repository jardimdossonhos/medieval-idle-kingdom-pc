import type { SimulationSystem } from "../tick-pipeline";
import { createEventId } from "./utils";

export function createDisasterSystem(): SimulationSystem {
  return {
    id: "disaster",
    run(context): void {
      const state = context.nextState;
      let eventSeq = 0;
      const disastersEnabled = state.meta.disastersEnabled ?? true; // Default to ON for old saves

      // Roda o sorteio de desastres apenas a cada 10 ciclos (para poupar processamento) e se estiver habilitado
      if (disastersEnabled && state.meta.tick > 0 && state.meta.tick % 10 === 0) {
        const allKingdomIds = Object.keys(state.kingdoms);
        
        for (const kingdomId of allKingdomIds) {
          const kingdom = state.kingdoms[kingdomId];
          
          // ~2% de chance de um desastre natural abater um império a cada 10 ciclos
          if (Math.random() < 0.02) {
            const isPlague = Math.random() > 0.5;

            if (isPlague) {
              context.events.push({
                id: createEventId({
                  prefix: "evt_plague",
                  tick: state.meta.tick,
                  systemId: "disaster",
                  actorId: kingdom.id,
                  sequence: eventSeq++
                }),
                type: "disaster.plague",
                actorKingdomId: kingdom.id,
                payload: { impact: "population_loss" },
                occurredAt: context.now,
                title: "Praga",
                details: `Uma praga mortal atingiu o império de ${kingdom.name}, dizimando a população local.`,
                severity: "high"
              } as any);
            } else {
               context.events.push({
                id: createEventId({
                  prefix: "evt_drought",
                  tick: state.meta.tick,
                  systemId: "disaster",
                  actorId: kingdom.id,
                  sequence: eventSeq++
                }),
                type: "disaster.drought",
                actorKingdomId: kingdom.id,
                payload: { impact: "food_loss" },
                occurredAt: context.now,
                title: "Seca",
                details: `Uma seca implacável arruinou as colheitas em ${kingdom.name}, zerando as reservas de comida.`,
                severity: "high"
              } as any);
            }
          }
        }
      }
    }
  };
}