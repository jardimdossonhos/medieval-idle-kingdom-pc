import type { SimulationSystem, TickContext } from "../tick-pipeline";
import { createEventId } from "./utils";

export function createCharacterSystem(): SimulationSystem {
  return {
    id: "character",
    run(context: TickContext): void {
      const state = context.nextState;

      // Roda a cada 12 ciclos (Exatamente 1 Ano de Simulação)
      if (state.meta.tick === 0 || state.meta.tick % 12 !== 0) return;
      if (!state.world.characters) return;

      // Jogo Eterno (Imortalidade) Ativada: O tempo passa, mas a biologia congela.
      if (state.meta.immortalityEnabled) return;

      let eventSeq = 0;
      const currentYear = Math.floor(state.meta.tick / 12) + 1;

      for (const charId in state.world.characters) {
        const char = state.world.characters[charId];
        
        if (char.status === "dead") continue;

        const birthYear = Math.floor(char.birthTick / 12) + 1;
        const age = currentYear - birthYear;

        // Lendários (ex: O Panteão do Tributo) possuem uma biologia mais resistente.
        const deathThreshold = char.isLegendary ? 75 : 55;

        // Se o personagem ultrapassou a expectativa de vida da era
        if (age >= deathThreshold) {
          // +2% de chance de morte a cada ano extra vivido
          const deathChance = 0.02 + ((age - deathThreshold) * 0.02);
          
          if (Math.random() < deathChance) {
            char.status = "dead";
            char.deathTick = state.meta.tick;
            char.memory.push(`Faleceu de causas naturais aos ${age} anos de idade no ano ${currentYear}.`);

            // Emite o aviso fúnebre para o Feed Global
            context.events.push({
              id: createEventId({ prefix: "evt_char_death", tick: state.meta.tick, systemId: "character", sequence: eventSeq++ }),
              type: "character.death",
              actorKingdomId: char.employerKingdomId || char.locationKingdomId || undefined,
              payload: {
                characterId: char.id,
                characterName: char.name,
                title: char.title,
                age
              },
              occurredAt: context.now
            });
          }
        }
      }
    }
  };
}