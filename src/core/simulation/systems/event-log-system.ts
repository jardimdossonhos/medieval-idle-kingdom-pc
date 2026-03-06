import type { DomainEvent, EventLogEntry } from "../../models/events";
import type { GameState } from "../../models/game-state";
import type { SimulationSystem } from "../tick-pipeline";

interface EventDescriptor {
  title: string;
  details: string;
  severity: EventLogEntry["severity"];
  groupKey?: string;
  suggestedAction?: string;
}

const SEVERITY_RANK: Record<EventLogEntry["severity"], number> = {
  info: 0,
  warning: 1,
  critical: 2
};

function kingdomName(state: GameState, kingdomId: string | undefined): string {
  if (!kingdomId) {
    return "Desconhecido";
  }

  return state.kingdoms[kingdomId]?.name ?? kingdomId;
}

function buildGroupKey(event: DomainEvent, customKey?: string): string {
  if (customKey) {
    return customKey;
  }

  const actor = event.actorKingdomId ?? "none";
  const target = event.targetKingdomId ?? "none";
  const regionId = typeof event.payload.regionId === "string" ? event.payload.regionId : "none";
  return `${event.type}|${actor}|${target}|${regionId}`;
}

function describeNpcDecision(event: DomainEvent, state: GameState): EventDescriptor {
  const actionType = String(event.payload.actionType ?? "acao");
  const actor = kingdomName(state, event.actorKingdomId);
  const target = kingdomName(state, event.targetKingdomId);
  const result = String(event.payload.result ?? "registrada");

  return {
    title: "Movimento diplomático estrangeiro",
    details: `${actor} executou ${actionType} contra ${target} (${result}).`,
    severity: actionType === "declarar_guerra" ? "warning" : "info",
    suggestedAction: actionType === "declarar_guerra" ? "Fortaleça guarnições e negocie alianças defensivas." : "Ajuste sua postura diplomática com este reino.",
    groupKey: `npc.decision|${event.actorKingdomId ?? "none"}|${event.targetKingdomId ?? "none"}|${actionType}`
  };
}

function describeEvent(event: DomainEvent, state: GameState): EventDescriptor {
  switch (event.type) {
    case "economy.food_shortage": {
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Escassez de alimentos",
        details: `${actor} está abaixo do estoque alimentar recomendado.`,
        severity: "warning",
        suggestedAction: "Invista em agricultura nas regiões do seu reino.",
        groupKey: `economy.food_shortage|${event.actorKingdomId ?? "none"}`
      };
    }
    case "population.unrest_warning": {
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Agitação social",
        details: `${actor} apresenta agitação elevada e risco político interno.`,
        severity: "warning",
        suggestedAction: "Use a ação Pacificar na região crítica e reduza pressão fiscal.",
        groupKey: `population.unrest_warning|${event.actorKingdomId ?? "none"}`
      };
    }
    case "technology.completed": {
      const actor = kingdomName(state, event.actorKingdomId);
      const technologyName = String(event.payload.technologyName ?? event.payload.technologyId ?? "pesquisa");
      return {
        title: "Pesquisa concluída",
        details: `${actor} concluiu ${technologyName}.`,
        severity: "info",
        suggestedAction: "Mantenha foco de pesquisa coerente com sua estratégia atual."
      };
    }
    case "religion.tension": {
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Tensão religiosa",
        details: `${actor} enfrenta tensão entre coesão religiosa e tolerância interna.`,
        severity: "warning",
        suggestedAction: "Aumente orçamento religioso ou ajuste política de tolerância."
      };
    }
    case "administration.revolt_risk": {
      const actor = kingdomName(state, event.actorKingdomId);
      const regionId = String(event.payload.regionId ?? "região");
      return {
        title: "Risco de revolta",
        details: `${actor} detectou risco elevado de revolta em ${regionId}.`,
        severity: "warning",
        suggestedAction: "Aplique pacificação e reforce guarnição local.",
        groupKey: `administration.revolt_risk|${event.actorKingdomId ?? "none"}|${regionId}`
      };
    }
    case "war.started": {
      const actor = kingdomName(state, event.actorKingdomId);
      const target = kingdomName(state, event.targetKingdomId);
      return {
        title: "Guerra declarada",
        details: `${actor} iniciou guerra contra ${target}.`,
        severity: "critical",
        suggestedAction: "Priorize orçamento militar e prepare defesa de fronteira."
      };
    }
    case "war.escalated": {
      const warId = String(event.payload.warId ?? "guerra");
      return {
        title: "Guerra escalando",
        details: `O conflito ${warId} atingiu intensidade alta no front.`,
        severity: "warning",
        suggestedAction: "Tente proposta de paz se sua exaustão estiver elevada.",
        groupKey: `war.escalated|${warId}`
      };
    }
    case "war.region_captured": {
      const regionId = String(event.payload.regionId ?? "região");
      const actor = kingdomName(state, event.actorKingdomId);
      return {
        title: "Território conquistado",
        details: `${actor} tomou controle de ${regionId}.`,
        severity: "critical",
        suggestedAction: "Invista e pacifique a região conquistada para evitar rebelião.",
        groupKey: `war.region_captured|${regionId}|${event.actorKingdomId ?? "none"}`
      };
    }
    case "war.peace": {
      const actor = kingdomName(state, event.actorKingdomId);
      const target = kingdomName(state, event.targetKingdomId);
      return {
        title: "Paz assinada",
        details: `${actor} e ${target} encerraram hostilidades.`,
        severity: "info",
        suggestedAction: "Reorganize economia e recupere estabilidade interna."
      };
    }
    case "npc.decision":
      return describeNpcDecision(event, state);
    case "victory.achieved":
      return {
        title: "Vitória alcançada",
        details: "Um caminho de vitória foi completado. O modo contínuo permanece ativo.",
        severity: "critical",
        suggestedAction: "Prepare-se para crises de superexpansão no pós-vitória."
      };
    case "world.activity_summary": {
      const warsStarted = Number(event.payload.warsStarted ?? 0);
      const peacesSigned = Number(event.payload.peacesSigned ?? 0);
      const captures = Number(event.payload.captures ?? 0);
      return {
        title: "Resumo geopolítico",
        details: `${warsStarted} guerras iniciadas, ${captures} conquistas e ${peacesSigned} acordos de paz no ciclo recente.`,
        severity: warsStarted + captures >= 3 ? "warning" : "info",
        suggestedAction: "Ajuste postura diplomática e monitore fronteiras críticas no mapa.",
        groupKey: "world.activity_summary"
      };
    }
    default:
      return {
        title: "Evento estratégico",
        details: JSON.stringify(event.payload),
        severity: "info"
      };
  }
}

function mergeSeverity(current: EventLogEntry["severity"], incoming: EventLogEntry["severity"]): EventLogEntry["severity"] {
  return SEVERITY_RANK[current] >= SEVERITY_RANK[incoming] ? current : incoming;
}

function stripCountSuffix(details: string): string {
  return details.replace(/\s\(x\d+\)$/u, "");
}

export function createEventLogSystem(maxEntries = 180, dedupeWindowMs = 45_000): SimulationSystem {
  return {
    id: "event_log",
    run(context): void {
      if (context.events.length === 0) {
        return;
      }

      const mergedLog = [...context.nextState.events];

      for (const event of context.events) {
        const descriptor = describeEvent(event, context.nextState);
        const groupKey = buildGroupKey(event, descriptor.groupKey);
        const regionId = typeof event.payload.regionId === "string" ? event.payload.regionId : undefined;

        const existingIndex = mergedLog.findIndex(
          (entry) => entry.groupKey === groupKey && context.now - entry.occurredAt <= dedupeWindowMs
        );

        if (existingIndex >= 0) {
          const previous = mergedLog[existingIndex];
          const nextCount = (previous.count ?? 1) + 1;
          const baseDetails = stripCountSuffix(previous.details);

          mergedLog.splice(existingIndex, 1);
          mergedLog.unshift({
            ...previous,
            severity: mergeSeverity(previous.severity, descriptor.severity),
            occurredAt: event.occurredAt,
            details: `${baseDetails} (x${nextCount})`,
            count: nextCount,
            suggestedAction: descriptor.suggestedAction ?? previous.suggestedAction,
            actorKingdomId: event.actorKingdomId,
            targetKingdomId: event.targetKingdomId,
            regionId: regionId ?? previous.regionId
          });

          continue;
        }

        mergedLog.unshift({
          id: event.id,
          title: descriptor.title,
          details: descriptor.details,
          severity: descriptor.severity,
          occurredAt: event.occurredAt,
          count: 1,
          groupKey,
          suggestedAction: descriptor.suggestedAction,
          actorKingdomId: event.actorKingdomId,
          targetKingdomId: event.targetKingdomId,
          regionId
        });
      }

      context.nextState.events = mergedLog
        .sort((left, right) => right.occurredAt - left.occurredAt)
        .slice(0, maxEntries);
    }
  };
}
