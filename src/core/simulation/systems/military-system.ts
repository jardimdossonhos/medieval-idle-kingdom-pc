import type { SimulationSystem, TickContext } from "../tick-pipeline";

export function createMilitarySystem(): SimulationSystem {
  return {
    id: "military_system",
    run: (context: TickContext) => {
      const state = context.nextState;
      
      // A logística militar não precisa rodar a cada milissegundo. 
      // Rodamos a cada 4 ciclos (representando "meses" de campanha) para poupar CPU.
      if (state.meta.tick % 4 !== 0) return;

      for (const kingdomId in state.kingdoms) {
        if (kingdomId === "k_nature") continue;

        const kingdom = state.kingdoms[kingdomId];
        
        // 1. Recuperação orgânica de Moral e Suprimentos em tempo de paz
        for (const army of kingdom.military.armies) {
          if (army.morale < 1.0) {
            // A moral sobe 2% a cada ciclo lógico de descanso
            army.morale = Math.min(1.0, army.morale + 0.02);
          }
          // Futuro: Dreno de Manpower do Worker para reforçar os exércitos POO
        }
      }
    }
  };
}