import type { DomainEvent, EventLogEntry } from "../../models/events";
import type { GameState } from "../../models/game-state";
import type { SimulationSystem } from "../tick-pipeline";

interface EventDescriptor {
  title: string;
  details: string;
  severity: EventLogEntry["severity"];
}

function kingdomName(state: GameState, kingdomId: string | undefined): string {
  if (!kingdomId) {
    return "Desconhecido";
  }

  return state.kingdoms[kingdomId]?.name ?? kingdomId;
}

function describeNpcDecision(event: DomainEvent, state: GameState): EventDescriptor {
  const actionType = String(event.payload.actionType ?? "acao");
  const actor = kingdomName(state, event.actorKingdomId);
  const target = kingdomName(state, event.targetKingdomId);
  const result = String(event.payload.result ?? "registrada");

  return {
    title: "Movimento diplomático estrangeiro",
    details: `${actor} executou ${actionType} contra ${target} (${result}).`,
    severity: actionType === "declarar_guerra" ? "warning" : "info"
  };
}

function describeEvent(event: DomainEvent, state: GameState): EventDescriptor {
  switch (event.type) {
    case "economy.food_shortage": {
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Escassez de alimentos",
        details: `${actor} está abaixo do estoque alimentar recomendado.`,
        severity: "warning"
      };
    }
    case "population.unrest_warning": {
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Agitação social",
        details: `${actor} apresenta agitação elevada e risco político interno.`,
        severity: "warning"
      };
    }
    case "technology.completed": {
      const actor = kingdomName(state, event.actorKingdomId);
      const technologyId = String(event.payload.technologyId ?? "pesquisa");
      return {
        title: "Pesquisa concluída",
        details: `${actor} concluiu ${technologyId}.`,
        severity: "info"
      };
    }
    case "religion.tension": {
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Tensão religiosa",
        details: `${actor} enfrenta tensão entre coesão religiosa e tolerância interna.`,
        severity: "warning"
      };
    }
    case "administration.revolt_risk": {
      const actor = kingdomName(state, event.actorKingdomId);
      const regionId = String(event.payload.regionId ?? "região");
      return {
        title: "Risco de revolta",
        details: `${actor} detectou risco elevado de revolta em ${regionId}.`,
        severity: "warning"
      };
    }
    case "war.started": {
      const actor = kingdomName(state, event.actorKingdomId);
      const target = kingdomName(state, event.targetKingdomId);
      return {
        title: "Guerra declarada",
        details: `${actor} iniciou guerra contra ${target}.`,
        severity: "critical"
      };
    }
    case "war.escalated": {
      const warId = String(event.payload.warId ?? "guerra");
      return {
        title: "Guerra escalando",
        details: `O conflito ${warId} atingiu intensidade alta no front.`,
        severity: "warning"
      };
    }
    case "war.region_captured": {
      const regionId = String(event.payload.regionId ?? "região");
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Território conquistado",
        details: `${actor} tomou controle de ${regionId}.`,
        severity: "critical"
      };
    }
    case "war.peace": {
      const actor = kingdomName(state, event.actorKingdomId);
      const target = kingdomName(state, event.targetKingdomId);
      return {
        title: "Paz assinada",
        details: `${actor} e ${target} encerraram hostilidades.`,
        severity: "info"
      };
    }
    case "npc.decision":
      return describeNpcDecision(event, state);
    case "victory.achieved":
      return {
        title: "Vitória alcançada",
        details: "Um caminho de vitória foi completado. O modo contínuo permanece ativo.",
        severity: "critical"
      };
    default:
      return {
        title: "Evento estratégico",
        details: JSON.stringify(event.payload),
        severity: "info"
      };
  }
}

export function createEventLogSystem(maxEntries = 180): SimulationSystem {
  return {
    id: "event_log",
    run(context): void {
      if (context.events.length === 0) {
        return;
      }

      const newEntries: EventLogEntry[] = context.events.map((event) => {
        const descriptor = describeEvent(event, context.nextState);

        return {
          id: event.id,
          title: descriptor.title,
          details: descriptor.details,
          severity: descriptor.severity,
          occurredAt: event.occurredAt
        };
      });

      context.nextState.events = [...newEntries, ...context.nextState.events].slice(0, maxEntries);
    }
  };
}
