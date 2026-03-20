﻿﻿﻿﻿﻿import { buildSaveSummary } from "./save/build-save-summary";
import type {
  CommandLogRepository,
  GameStateRepository,
  SaveRepository,
  SaveSlotId,
  SaveSnapshot,
  SaveSummary,
  SnapshotRepository
} from "../core/contracts/game-ports";
import { getTechnologyNode, isTechnologyAvailable, listAvailableTechnologyNodes, listTechnologyNodes, selectDefaultResearchNode, selectResearchNodeTowardsTarget } from "../core/data/technology-tree";
import { createEmptyStock } from "../core/models/economy";
import { AutomationLevel, DiplomaticRelation, ResourceType, TechnologyDomain, TreatyType } from "../core/models/enums";
import type { BudgetPriority, TaxPolicy } from "../core/models/economy";
import type { ClockService, DiplomacyResolver, EventBus, WarResolver } from "../core/contracts/services";
import type { CommandLogEntry, SnapshotReason, StateSnapshot } from "../core/models/commands";
import type { DomainEvent, EventLogEntry } from "../core/models/events";
import type { EcsState, GameState } from "../core/models/game-state";
import { buildTreatyId, sortUniqueIds } from "../core/models/identifiers";
import type { StaticWorldData } from "../core/models/static-world-data";
import { buildStateHash } from "../core/utils/state-fingerprint";
import { hashDeterministic } from "../core/utils/stable-hash";
import { TickPipeline, type SimulationSystem } from "../core/simulation/tick-pipeline";
import { WORLD_DEFINITIONS_V1 } from "./boot/generated/world-definitions-v1";
import { AUTOSAVE_SLOT_ID, MANUAL_SLOT_ID } from "../infrastructure/persistence/save-slots";

export interface GameSessionDeps {
  gameStateRepository: GameStateRepository;
  saveRepository: SaveRepository;
  staticWorldData: StaticWorldData;
  clock: ClockService;
  eventBus: EventBus;
  systems: SimulationSystem[];
  diplomacyResolver?: DiplomacyResolver;
  warResolver?: WarResolver;
  commandLogRepository?: CommandLogRepository;
  snapshotRepository?: SnapshotRepository;
  autosaveEveryTicks?: number;
  maxOfflineTicks?: number;
  snapshotEveryTicks?: number;
  maxSnapshots?: number;
}

type StateListener = (state: GameState) => void;

export type DiplomaticActionType = "alliance" | "non_aggression" | "peace" | "tribute" | "embargo" | "war";
export type ReligiousActionType = "send_missionaries";

export type RegionActionType = "invest_agriculture" | "invest_infrastructure" | "garrison" | "pacify";

export interface PlayerActionResult {
  ok: boolean;
  message: string;
  chance?: number;
  cooldownUntil?: number;
}

export interface TechnologyChoice {
  id: string;
  name: string;
  domain: TechnologyDomain;
  cost: number;
  required: string[];
  status: "unlocked" | "available" | "locked" | "active";
  isGoal: boolean;
}

export interface RuntimeMetrics {
  tickMsLast: number;
  tickMsAverage: number;
  offlineCatchUpMs: number;
  offlineTicks: number;
}

// Cache de Indexação Global: Transforma buscas O(N) em O(1)
const REGION_INDEX_MAP = new Map<string, number>();
for (let i = 0; i < WORLD_DEFINITIONS_V1.length; i++) {
  REGION_INDEX_MAP.set(WORLD_DEFINITIONS_V1[i].id, i);
}

export class GameSession {
  private readonly pipeline: TickPipeline;
  private readonly listeners = new Set<StateListener>();
  private currentState: GameState | null = null;
  private accumulatedMs = 0;
  private ticksSinceAutosave = 0;
  private ticksSinceSnapshot = 0;
  private ioQueue: Promise<void> = Promise.resolve();
  private sessionLogSeq = 0;
  private commandSequence = 0;
  private commandHeadHash = "genesis";
  private tickSamples: number[] = [];
  private isWorkerReady = false; // Bloqueio de segurança (Handshake)
  private pendingManualSaveResolver: (() => void) | null = null;
  private pendingAutosave = false;
  private runtimeMetrics: RuntimeMetrics = {
    tickMsLast: 0,
    tickMsAverage: 0,
    offlineCatchUpMs: 0,
    offlineTicks: 0
  };

  constructor(private readonly deps: GameSessionDeps) {
    this.pipeline = new TickPipeline(deps.systems, deps.staticWorldData);
  }

  async bootstrap(initialState: GameState): Promise<GameState> {
    await this.bootstrapCommandHead();

    this.isWorkerReady = false; // Trava a engine principal até confirmação do Worker

    const persisted = await this.deps.gameStateRepository.loadCurrent();
    const recovered = persisted ?? (await this.restoreFromSnapshotOrSave());
    const baseState = recovered ?? initialState;
    const now = this.deps.clock.now();

    const offlineResult = this.runOfflineProgression(baseState, now);
    this.currentState = offlineResult.state;
    this.currentState.meta.lastClosedAt = null;
    this.currentState.meta.lastUpdatedAt = now;
    this.runtimeMetrics.offlineCatchUpMs = this.round(offlineResult.elapsedMs, 3);
    this.runtimeMetrics.offlineTicks = offlineResult.ticks;

    if (offlineResult.ticks > 0) {
      this.currentState.events = [
        this.createSessionLog(
          "Progresso offline aplicado",
          `Foram simulados ${offlineResult.ticks} ticks durante sua ausência.`,
          "info",
          now
        ),
        ...this.currentState.events
      ].slice(0, 180);

      this.recordSystemCommand("offline.progression", {
        ticksApplied: offlineResult.ticks,
        from: baseState.meta.lastClosedAt ?? baseState.meta.lastUpdatedAt,
        to: now
      });
    }

    // Notifica o sistema que um estado de jogo está pronto (seja novo ou recuperado)
    (this.deps.eventBus as any).publish({ type: "game.loaded", payload: this.currentState });

    await this.deps.gameStateRepository.saveCurrent(this.currentState);

    if (this.deps.snapshotRepository) {
      const latestSnapshot = await this.deps.snapshotRepository.latest();
      if (!latestSnapshot) {
        await this.deps.snapshotRepository.save(this.buildStateSnapshot("bootstrap", now));
      }
    }

    this.emitState();
    return this.currentState;
  }

  public markWorkerReady(): void {
    this.isWorkerReady = true;
    console.log("[GameSession] Handshake confirmado. Simulação liberada.");
  }

  start(): void {
    this.deps.clock.start((deltaMs, now) => {
      this.onClockTick(deltaMs, now);
    });
  }

  stop(sync = false): void {
    this.deps.clock.stop();

    if (!this.currentState) {
      return;
    }

    const now = this.deps.clock.now();
    this.currentState.meta.lastClosedAt = now;
    this.recordSystemCommand("session.stop", { reason: "manual_stop" }, now);

    // Converte os Float64Arrays para Arrays normais antes de serializar
    // Isso previne o bug onde o F5 corrompe os recursos gerando um objeto vazio {}
    const safeState = structuredClone(this.currentState);
    if (safeState.ecs) {
      // Bypass no structuredClone: extraímos os arrays nativos da fonte viva imune à corrupção de Proxy
      safeState.ecs = {
        gold: Array.from(this.currentState.ecs?.gold || []),
        food: Array.from(this.currentState.ecs?.food || []),
        wood: Array.from(this.currentState.ecs?.wood || []),
        iron: Array.from(this.currentState.ecs?.iron || []),
        faith: Array.from(this.currentState.ecs?.faith || []),
        legitimacy: Array.from(this.currentState.ecs?.legitimacy || []),
        populationTotal: Array.from(this.currentState.ecs?.populationTotal || []),
        populationGrowthRate: Array.from(this.currentState.ecs?.populationGrowthRate || []),
      } as any;
    }

    if (sync) {
      this.deps.gameStateRepository.saveCurrentSync(safeState);
    } else {
      this.enqueueIo(async () => {
        await this.deps.gameStateRepository.saveCurrent(safeState);
      });
    }
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);

    if (this.currentState) {
      listener(this.currentState);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  setPaused(paused: boolean): void {
    const state = this.requireState();
    state.meta.paused = paused;
    this.recordPlayerCommand("session.pause", { paused });
    this.persistCurrent();
    this.emitState();
  }

  togglePause(): void {
    const state = this.requireState();
    this.setPaused(!state.meta.paused);
  }

  setSpeed(multiplier: number): void {
    const state = this.requireState();
    state.meta.speedMultiplier = Math.max(0.5, Math.min(8, multiplier));
    this.recordPlayerCommand("session.speed", { speedMultiplier: state.meta.speedMultiplier });
    this.persistCurrent();
    this.emitState();
  }

  updateTaxPolicy(patch: Partial<TaxPolicy>): void {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    const policy = player.economy.taxPolicy;

    if (typeof patch.baseRate === "number") {
      policy.baseRate = this.clamp(patch.baseRate, 0.05, 0.6);
    }

    if (typeof patch.nobleRelief === "number") {
      policy.nobleRelief = this.clamp(patch.nobleRelief, 0, 0.4);
    }

    if (typeof patch.clergyExemption === "number") {
      policy.clergyExemption = this.clamp(patch.clergyExemption, 0, 0.4);
    }

    if (typeof patch.tariffRate === "number") {
      policy.tariffRate = this.clamp(patch.tariffRate, 0, 0.5);
    }

    this.appendActionLog("Política fiscal ajustada", "As diretrizes tributárias foram atualizadas pelo conselho real.", "info");
    this.recordPlayerCommand("government.tax_policy", policy as unknown as Record<string, unknown>);
    this.persistCurrent();
    this.emitState();
  }

  updateBudgetPriority(patch: Partial<BudgetPriority>): void {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    const budget = player.economy.budgetPriority;

    if (typeof patch.economy === "number") {
      budget.economy = Math.max(0, patch.economy);
    }
    if (typeof patch.military === "number") {
      budget.military = Math.max(0, patch.military);
    }
    if (typeof patch.religion === "number") {
      budget.religion = Math.max(0, patch.religion);
    }
    if (typeof patch.administration === "number") {
      budget.administration = Math.max(0, patch.administration);
    }
    if (typeof patch.technology === "number") {
      budget.technology = Math.max(0, patch.technology);
    }

    const total = Math.max(1, budget.economy + budget.military + budget.religion + budget.administration + budget.technology);
    budget.economy = this.round((budget.economy / total) * 100);
    budget.military = this.round((budget.military / total) * 100);
    budget.religion = this.round((budget.religion / total) * 100);
    budget.administration = this.round((budget.administration / total) * 100);
    budget.technology = this.round((budget.technology / total) * 100);

    this.appendActionLog("Orçamento revisado", "As prioridades de investimento do reino foram redistribuídas.", "info");
    this.recordPlayerCommand("government.budget_priority", budget as unknown as Record<string, unknown>);
    this.persistCurrent();
    this.emitState();
  }

  setResearchFocus(focus: TechnologyDomain): void {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    player.technology.researchFocus = focus;
    const preferred = player.technology.researchGoalId
      ? selectResearchNodeTowardsTarget(player.technology, player.technology.researchGoalId) ??
        selectDefaultResearchNode(player.technology, focus)
      : selectDefaultResearchNode(player.technology, focus);
    player.technology.activeResearchId = preferred?.id ?? null;

    this.appendActionLog("Foco de pesquisa alterado", `A coroa direcionou os estudiosos para ${focus}.`, "info");
    this.recordPlayerCommand("technology.focus", { focus });
    this.persistCurrent();
    this.emitState();
  }

  setTechnologyAutomation(level: AutomationLevel): void {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    player.administration.automation.technology = level;

    this.appendActionLog("Automação tecnológica atualizada", `Nível definido para ${level}.`, "info");
    this.recordPlayerCommand("technology.automation", { level });
    this.persistCurrent();
    this.emitState();
  }

  setResearchTarget(technologyId: string): PlayerActionResult {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    const node = getTechnologyNode(technologyId);

    if (!node) {
      return { ok: false, message: "Tecnologia inválida." };
    }

    if (!isTechnologyAvailable(player.technology, technologyId)) {
      return { ok: false, message: "Tecnologia indisponível: faltam pré-requisitos ou já foi concluída." };
    }

    player.technology.researchFocus = node.domain;
    player.technology.activeResearchId = technologyId;
    this.appendActionLog("Pesquisa priorizada", `Os estudiosos agora pesquisam ${node.name}.`, "info");
    this.recordPlayerCommand("technology.target", { technologyId, domain: node.domain });
    this.persistCurrent();
    this.emitState();

    return { ok: true, message: `${node.name} definida como pesquisa ativa.` };
  }

  setResearchGoal(technologyId: string | null): PlayerActionResult {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);

    if (!technologyId) {
      player.technology.researchGoalId = null;
      this.appendActionLog("Meta tecnológica removida", "O conselho real limpou a meta de longo prazo.", "info");
      this.recordPlayerCommand("technology.goal_clear", {});
      this.persistCurrent();
      this.emitState();
      return { ok: true, message: "Meta tecnológica removida." };
    }

    const node = getTechnologyNode(technologyId);
    if (!node) {
      return { ok: false, message: "Tecnologia inválida para meta." };
    }

    if (player.technology.unlocked.includes(technologyId)) {
      return { ok: false, message: "Essa tecnologia já foi concluída." };
    }

    player.technology.researchGoalId = technologyId;
    const nextStep = selectResearchNodeTowardsTarget(player.technology, technologyId);

    if (nextStep) {
      player.technology.activeResearchId = nextStep.id;
      player.technology.researchFocus = nextStep.domain;
    }

    const details = nextStep && nextStep.id !== technologyId
      ? `Meta definida: ${node.name}. Próxima pesquisa necessária: ${nextStep.name}.`
      : `Meta definida: ${node.name}.`;
    this.appendActionLog("Meta tecnológica definida", details, "info");
    this.recordPlayerCommand("technology.goal_set", {
      technologyId,
      nextStepId: nextStep?.id ?? null
    });
    this.persistCurrent();
    this.emitState();

    return { ok: true, message: details };
  }

  listTechnologyChoices(): TechnologyChoice[] {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    const availableIds = new Set(listAvailableTechnologyNodes(player.technology).map((node) => node.id));
    const unlockedIds = new Set(player.technology.unlocked);
    const activeId = player.technology.activeResearchId;

    return listTechnologyNodes().map((node) => {
      let status: TechnologyChoice["status"] = "locked";

      if (unlockedIds.has(node.id)) {
        status = "unlocked";
      } else if (availableIds.has(node.id)) {
        status = "available";
      }

      if (activeId === node.id) {
        status = "active";
      }

      return {
        id: node.id,
        name: node.name,
        domain: node.domain,
        cost: node.cost,
        required: node.required,
        status,
        isGoal: player.technology.researchGoalId === node.id
      };
    });
  }

  executeDiplomaticAction(targetKingdomId: string, actionType: DiplomaticActionType): PlayerActionResult {
    let state = this.requireState();
    const now = this.deps.clock.now();
    const player = this.getPlayerKingdom(state);
    const target = state.kingdoms[targetKingdomId];

    if (!target || target.id === player.id) {
      return { ok: false, message: "Alvo diplomático inválido." };
    }

    const relation = player.diplomacy.relations[target.id];
    if (!relation) {
      return { ok: false, message: "Relação diplomática inexistente para o alvo." };
    }
    relation.actionCooldowns = relation.actionCooldowns ?? {};

    const cooldownKey = `diplomacy:${actionType}`;
    const cooldownUntil = relation.actionCooldowns[cooldownKey] ?? 0;
    if (cooldownUntil > now) {
      return { ok: false, message: "Ação em cooldown diplomático.", cooldownUntil };
    }

    const { cost, chance, cooldownMs, actionPt } = this.getDiplomaticConfig(state, player.id, target.id, actionType);

    // A verificação de custo agora usa o estado do ECS como fonte da verdade.
    if (!this.canAfford(cost)) {
      return { ok: false, message: "Recursos insuficientes para executar esta ação." };
    }

    // A aplicação do custo agora modifica o estado do ECS (atualização otimista).
    this.applyCost(cost);

    const roll = this.nextRandom(state);
    const success = roll <= chance;

    relation.actionCooldowns[cooldownKey] = now + cooldownMs;
    const reverse = target.diplomacy.relations[player.id];
    if (reverse) {
      reverse.actionCooldowns = reverse.actionCooldowns ?? {};
      reverse.actionCooldowns[cooldownKey] = now + cooldownMs;
    }

    if (success) {
      if (this.deps.diplomacyResolver) {
        state = this.deps.diplomacyResolver.applyDecision(state, {
          actorKingdomId: player.id,
          actionType: actionPt,
          priority: chance,
          targetKingdomId: target.id,
          payload: { source: "player_ui" }
        });
      }

      if (actionType === "peace") {
        this.resolvePlayerPeace(state, player.id, target.id);
      }

      if (actionType === "war") {
        if (this.deps.warResolver) {
          state = this.deps.warResolver.declareWar(state, player.id, target.id);
        }
      }

      if (actionType === "tribute") {
        // Lógica de tributo agora lê e escreve no estado do ECS.
        if (state.ecs) {
          const targetStock = this.getKingdomTotalEcsStock(state, target.id);
          const tribute = this.round(targetStock.gold * 0.08);

          const playerCapitalIndex = this.getKingdomCapitalIndex(state, player.id);
          const targetCapitalIndex = this.getKingdomCapitalIndex(state, target.id);

          if (playerCapitalIndex !== -1 && targetCapitalIndex !== -1) {
            state.ecs.gold[targetCapitalIndex] = Math.max(0, state.ecs.gold[targetCapitalIndex] - tribute);
            state.ecs.gold[playerCapitalIndex] = this.round(state.ecs.gold[playerCapitalIndex] + tribute);
          }
        } else {
          // Fallback para a lógica antiga se o ECS não estiver presente
          const tribute = this.round(target.economy.stock.gold * 0.08);
          target.economy.stock.gold = Math.max(0, target.economy.stock.gold - tribute);
          player.economy.stock.gold = this.round(player.economy.stock.gold + tribute);
        }
      }

      this.appendActionLog(
        "Ação diplomática bem-sucedida",
        `${player.name} executou ${actionType} com ${target.name}.`,
        actionType === "war" ? "critical" : "info"
      );
    } else {
      player.stability = this.round(this.clamp(player.stability - 0.4, 0, 100));
      this.appendActionLog(
        "Ação diplomática recusada",
        `${target.name} rejeitou ${actionType}.`,
        "warning"
      );
    }

    this.recordPlayerCommand("diplomacy.action", {
      targetKingdomId,
      actionType,
      chance: this.round(chance, 4),
      roll: this.round(roll, 4),
      success
    });
    this.persistCurrent();
    this.emitState();

    return {
      ok: success,
      message: success ? "Ação executada com sucesso." : "Ação falhou na negociação.",
      chance: this.round(chance, 4),
      cooldownUntil: now + cooldownMs
    };
  }

  executeRegionAction(regionId: string, actionType: RegionActionType): PlayerActionResult {
    const state = this.requireState();
    const now = this.deps.clock.now();
    const player = this.getPlayerKingdom(state);
    const region = state.world.regions[regionId];
    const regionDef = this.deps.staticWorldData.definitions[regionId];

    if (!region || !regionDef) {
      return { ok: false, message: "Região inválida." };
    }

    if (region.ownerId !== player.id) {
      return { ok: false, message: "Você só pode administrar regiões próprias." };
    }

    region.actionCooldowns = region.actionCooldowns ?? {};
    const cooldownUntil = region.actionCooldowns[actionType] ?? 0;
    if (cooldownUntil > now) {
      return { ok: false, message: "Ação em cooldown regional.", cooldownUntil };
    }

    const config = this.getRegionActionConfig(actionType);
    if (!this.canAfford(config.cost)) {
      return { ok: false, message: "Recursos insuficientes para esta ação regional." };
    }

    this.applyCost(config.cost);
    region.actionCooldowns[actionType] = now + config.cooldownMs;

    switch (actionType) {
      case "invest_agriculture":
        region.devastation = this.round(this.clamp(region.devastation - 0.08, 0, 1));
        region.unrest = this.round(this.clamp(region.unrest - 0.05, 0, 1));
        player.economy.stock.food = this.round(player.economy.stock.food + 40 + regionDef.economyValue * 2);
        break;
      case "invest_infrastructure":
        region.autonomy = this.round(this.clamp(region.autonomy - 0.05, 0, 1));
        region.assimilation = this.round(this.clamp(region.assimilation + 0.04, 0, 1));
        region.devastation = this.round(this.clamp(region.devastation - 0.04, 0, 1));
        break;
      case "garrison":
        region.unrest = this.round(this.clamp(region.unrest - 0.08, 0, 1));
        region.autonomy = this.round(this.clamp(region.autonomy - 0.03, 0, 1));
        player.military.reserveManpower = Math.max(0, player.military.reserveManpower - 300);
        if (player.military.armies.length > 0) {
          player.military.armies[0].manpower += 300;
        }
        break;
      case "pacify":
        region.unrest = this.round(this.clamp(region.unrest - 0.14, 0, 1));
        region.assimilation = this.round(this.clamp(region.assimilation + 0.03, 0, 1));
        region.autonomy = this.round(this.clamp(region.autonomy + 0.02, 0, 1));
        player.stability = this.round(this.clamp(player.stability + 0.8, 0, 100));
        break;
    }

    this.appendActionLog("Ação regional executada", `${config.label} aplicada em ${regionDef.name}.`, "info");
    this.recordPlayerCommand("region.action", { regionId, actionType });
    this.persistCurrent();
    this.emitState();

    return {
      ok: true,
      message: `${config.label} aplicada.`,
      cooldownUntil: now + config.cooldownMs
    };
  }

  async saveManual(): Promise<void> {
    if (!this.currentState) {
      return Promise.resolve();
    }
    
    return new Promise<void>((resolve) => {
      // Sincronização Passiva: Levanta a bandeira de salvar. 
      // O save será feito com dados perfeitamente frescos na exata fração de segundo em que o próximo TICK do Worker chegar.
      this.pendingManualSaveResolver = resolve;
      
      // Proteção de UI (Anti-Ghost Button): Se nada ocorrer em 3s, força o destrave para não congelar o jogo.
      setTimeout(() => {
        if (this.pendingManualSaveResolver === resolve) {
          console.warn("[GameSession] Timeout aguardando Worker. Forçando salvamento com dados atuais.");
          this.doCommitManualSave(resolve).catch(console.error);
          this.pendingManualSaveResolver = null;
        }
      }, 3000);
    });
  }

  async listSaveSlots(): Promise<SaveSummary[]> {
    return this.deps.saveRepository.listSlots();
  }

  async peekSaveSlot(slotId: SaveSlotId): Promise<GameState | null> {
    // Espia os dados do save no banco sem alterar a sessão atual. Útil para a UI montar modais de confirmação pré-load.
    const snapshot = await this.deps.saveRepository.loadFromSlot(slotId);
    return snapshot ? snapshot.state : null;
  }

  async loadSlot(slotId: SaveSlotId): Promise<GameState> {
    this.isWorkerReady = false; // Trava a engine até RESTORE_ECS_STATE confirmar

    const snapshot = await this.deps.saveRepository.loadFromSlot(slotId);

    if (!snapshot) {
      throw new Error(`Save slot ${slotId} não encontrado ou corrompido.`);
    }

    this.currentState = structuredClone(snapshot.state);
    this.currentState.meta.lastUpdatedAt = this.deps.clock.now();
    this.currentState.meta.paused = false;

    await this.deps.gameStateRepository.saveCurrent(this.currentState);
    this.recordPlayerCommand("save.load_slot", { slotId });
    this.captureSnapshot("bootstrap");

    // Notifica o sistema que um estado de jogo foi carregado
    (this.deps.eventBus as any).publish({ type: "game.loaded", payload: this.currentState });

    this.emitState();
    return this.currentState;
  }

  async deleteSlot(slotId: SaveSlotId): Promise<void> {
    await this.deps.saveRepository.deleteSlot(slotId);
  }

  async clearCurrentState(): Promise<void> {
    await this.deps.gameStateRepository.clearCurrent();
  }

  async clearAllSaves(): Promise<void> {
    await (this.deps.saveRepository as any).clearAll();
  }

  getState(): GameState {
    return this.requireState();
  }

  executeReligiousAction(targetKingdomId: string, actionType: ReligiousActionType): PlayerActionResult {
    const state = this.requireState();
    const now = this.deps.clock.now();
    const player = this.getPlayerKingdom(state);
    const target = state.kingdoms[targetKingdomId];

    if (!target || target.id === player.id) {
      return { ok: false, message: "Alvo religioso inválido." };
    }

    const relation = player.diplomacy.relations[target.id];
    if (!relation) {
      return { ok: false, message: "Sem rota diplomática para esta ação religiosa." };
    }
    relation.actionCooldowns = relation.actionCooldowns ?? {};

    const config = this.getReligiousActionConfig(player.id, target.id, actionType);
    const cooldownUntil = relation.actionCooldowns[config.cooldownKey] ?? 0;
    if (cooldownUntil > now) {
      return { ok: false, message: "Ação religiosa em cooldown.", cooldownUntil };
    }

    if (!this.canAfford(config.cost)) {
      return { ok: false, message: "Recursos insuficientes para enviar missionários." };
    }

    this.applyCost(config.cost);
    const roll = this.nextRandom(state);
    const success = roll <= config.chance;

    relation.actionCooldowns[config.cooldownKey] = now + config.cooldownMs;
    const reverse = target.diplomacy.relations[player.id];
    if (reverse) {
      reverse.actionCooldowns = reverse.actionCooldowns ?? {};
      reverse.actionCooldowns[config.cooldownKey] = now + config.cooldownMs;
    }

    if (success) {
      const currentInfluence = target.religion.externalInfluenceIn[player.id] ?? 0;
      const boostedInfluence = this.clamp(currentInfluence + config.pressureGain, 0, 1);
      target.religion.externalInfluenceIn[player.id] = this.round(boostedInfluence, 4);

      this.appendActionLog(
        "Missionários enviados",
        `${player.name} iniciou campanha missionária em ${target.name}.`,
        "info"
      );
    } else {
      player.stability = this.round(this.clamp(player.stability - 0.25, 0, 100));
      this.appendActionLog(
        "Campanha missionária bloqueada",
        `${target.name} reprimiu a tentativa de infiltração religiosa.`,
        "warning"
      );
    }

    this.recordPlayerCommand("religion.action", {
      targetKingdomId,
      actionType,
      chance: this.round(config.chance, 4),
      roll: this.round(roll, 4),
      success,
      pressureGain: this.round(config.pressureGain, 4)
    });
    this.persistCurrent();
    this.emitState();

    return {
      ok: success,
      message: success ? "Campanha missionária iniciada." : "Campanha missionária falhou.",
      chance: this.round(config.chance, 4),
      cooldownUntil: now + config.cooldownMs
    };
  }

  getStaticWorldData(): StaticWorldData {
    return this.deps.staticWorldData;
  }

  getRuntimeMetrics(): RuntimeMetrics {
    return { ...this.runtimeMetrics };
  }

  async flushPersistence(): Promise<void> {
    await this.ioQueue;
  }

  public updateEcsState(ecsState: EcsState): void {
    const state = this.currentState;
    if (state) {
      state.ecs = ecsState;

      // AUTO-DESTRAVE: O Worker provou estar vivo. Libera a simulação do F5/Load congelado!
      if (!this.isWorkerReady) {
        this.markWorkerReady();
      }

      // COMMIT ATÔMICO: Transação segura no exato frame em que a matriz fresca chegou.
      if (this.pendingManualSaveResolver) {
        this.doCommitManualSave(this.pendingManualSaveResolver).catch(console.error);
        this.pendingManualSaveResolver = null;
      }
      if (this.pendingAutosave) {
        this.doCommitAutosave();
        this.pendingAutosave = false;
      }
    }
  }

  private async doCommitManualSave(resolve: () => void): Promise<void> {
    const snapshot = this.buildSaveSlotSnapshot(MANUAL_SLOT_ID);
    await this.deps.saveRepository.saveToSlot(snapshot);
    this.recordPlayerCommand("save.manual", { slotId: MANUAL_SLOT_ID });
    this.captureSnapshot("manual");
    resolve();
  }

  private doCommitAutosave(): void {
    const snapshot = this.buildSaveSlotSnapshot(AUTOSAVE_SLOT_ID);
    this.enqueueIo(async () => {
      await this.deps.saveRepository.saveToSlot(snapshot);
    });
    this.recordSystemCommand("save.autosave", { slotId: AUTOSAVE_SLOT_ID });
    this.captureSnapshot("autosave");
  }

  private getPlayerKingdom(state: GameState): GameState["kingdoms"][string] {
    const player = Object.keys(state.kingdoms)
      .sort()
      .map((kingdomId) => state.kingdoms[kingdomId])
      .find((kingdom) => kingdom.isPlayer);

    if (!player) {
      throw new Error("Reino do jogador não encontrado.");
    }

    return player;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private round(value: number, decimals = 2): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private monotonicNow(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }

    return Date.now();
  }

  private registerTickTiming(elapsedMs: number): void {
    this.tickSamples.push(elapsedMs);

    if (this.tickSamples.length > 60) {
      this.tickSamples.shift();
    }

    const total = this.tickSamples.reduce((sum, value) => sum + value, 0);
    const average = this.tickSamples.length === 0 ? 0 : total / this.tickSamples.length;

    this.runtimeMetrics.tickMsLast = this.round(elapsedMs, 3);
    this.runtimeMetrics.tickMsAverage = this.round(average, 3);
  }

  private nextRandom(state: GameState): number {
    state.randomSeed = (Math.imul(state.randomSeed, 1664525) + 1013904223) >>> 0;
    return state.randomSeed / 0x100000000;
  }

  private getKingdomCapitalIndex(state: GameState, kingdomId: string): number {
    const kingdom = state.kingdoms[kingdomId];
    if (!kingdom) {
      return -1;
    }
    return REGION_INDEX_MAP.get(kingdom.capitalRegionId) ?? -1;
  }

  private getKingdomTotalEcsStock(state: GameState, kingdomId: string): Record<ResourceType, number> {
    const emptyStock = createEmptyStock();
    if (!state.ecs) {
      return emptyStock;
    }

    const kingdomRegionIndices = Object.values(state.world.regions)
      .filter((r) => r.ownerId === kingdomId)
      .map((r) => REGION_INDEX_MAP.get(r.regionId))
      .filter((index): index is number => index !== undefined);

    const totals = emptyStock;
    const ecs = state.ecs;

    for (const index of kingdomRegionIndices) {
      totals.gold += ecs.gold[index] ?? 0;
      totals.food += ecs.food[index] ?? 0;
      totals.wood += ecs.wood[index] ?? 0;
      totals.iron += ecs.iron[index] ?? 0;
      totals.faith += ecs.faith[index] ?? 0;
      totals.legitimacy += ecs.legitimacy[index] ?? 0;
    }
    return totals;
  }

  private canAfford(cost: Partial<Record<ResourceType, number>>): boolean {
    const state = this.requireState();
    const player = this.getPlayerKingdom(state);
    const playerEcsStock = this.getKingdomTotalEcsStock(state, player.id);

    return Object.entries(cost).every(([resource, value]) => {
      const key = resource as ResourceType;
      const required = value ?? 0;
      return playerEcsStock[key] >= required;
    });
  }

  private applyCost(cost: Partial<Record<ResourceType, number>>): void {
    // Esta é uma atualização otimista que será reconciliada pelo worker no próximo tick.
    const state = this.requireState();
    if (!state.ecs) {
      return;
    }

    const player = this.getPlayerKingdom(state);
    const capitalIndex = this.getKingdomCapitalIndex(state, player.id);

    if (capitalIndex === -1) {
      console.error(`[applyCost] Não foi possível encontrar o índice da capital para o jogador ${player.id}`);
      return;
    }

    for (const [resource, value] of Object.entries(cost)) {
      const key = resource as ResourceType;
      const required = value ?? 0;
      const resourceArray = state.ecs[key];
      if (resourceArray && capitalIndex < resourceArray.length) {
        resourceArray[capitalIndex] = this.round(Math.max(0, resourceArray[capitalIndex] - required));
      }
    }
  }

  private appendActionLog(title: string, details: string, severity: EventLogEntry["severity"]): void {
    const state = this.requireState();
    const entry = this.createSessionLog(title, details, severity, this.deps.clock.now());
    state.events = [entry, ...state.events].slice(0, 180);
  }

  private getDiplomaticConfig(
    state: GameState,
    playerId: string,
    targetId: string,
    actionType: DiplomaticActionType
  ): {
    cost: Partial<Record<ResourceType, number>>;
    chance: number;
    cooldownMs: number;
    actionPt: string;
  } {
    const relation = state.kingdoms[playerId].diplomacy.relations[targetId];
    const trust = relation?.score.trust ?? 0.3;
    const rivalry = relation?.score.rivalry ?? 0.3;
    const fear = relation?.score.fear ?? 0.2;
    const grievance = relation?.grievance ?? 0.2;

    const base = {
      cost: {} as Partial<Record<ResourceType, number>>,
      chance: 0.55,
      cooldownMs: 45_000,
      actionPt: "oferta_alianca"
    };

    switch (actionType) {
      case "alliance":
        base.cost = {
          [ResourceType.Gold]: 18,
          [ResourceType.Legitimacy]: 4
        };
        base.chance = this.clamp(0.2 + trust * 0.55 + (1 - rivalry) * 0.25, 0.08, 0.9);
        base.cooldownMs = 90_000;
        base.actionPt = "oferta_alianca";
        break;
      case "non_aggression":
        base.cost = {
          [ResourceType.Gold]: 12,
          [ResourceType.Legitimacy]: 2
        };
        base.chance = this.clamp(0.25 + trust * 0.45 + (1 - grievance) * 0.2, 0.1, 0.92);
        base.cooldownMs = 75_000;
        base.actionPt = "pacto_nao_agressao";
        break;
      case "peace":
        base.cost = {
          [ResourceType.Gold]: 20
        };
        base.chance = this.clamp(0.3 + fear * 0.25 + trust * 0.2 + grievance * 0.15, 0.15, 0.92);
        base.cooldownMs = 55_000;
        base.actionPt = "proposta_paz";
        break;
      case "tribute":
        base.cost = {
          [ResourceType.Legitimacy]: 3,
          [ResourceType.Gold]: 10
        };
        base.chance = this.clamp(0.2 + fear * 0.55 + (1 - trust) * 0.2, 0.06, 0.85);
        base.cooldownMs = 80_000;
        base.actionPt = "exigir_tributo";
        break;
      case "embargo":
        base.cost = {
          [ResourceType.Gold]: 14
        };
        base.chance = this.clamp(0.28 + rivalry * 0.35 + (1 - trust) * 0.2, 0.12, 0.88);
        base.cooldownMs = 65_000;
        base.actionPt = "embargo_comercial";
        break;
      case "war": {
        const attacker = state.kingdoms[playerId];
        const defender = state.kingdoms[targetId];
        const risk = this.deps.warResolver ? this.deps.warResolver.evaluateWarRisk(attacker, defender, state) : 0.45;
        base.cost = {
          [ResourceType.Gold]: 35,
          [ResourceType.Food]: 50,
          [ResourceType.Iron]: 18,
          [ResourceType.Legitimacy]: 5
        };
        base.chance = this.clamp(0.18 + risk * 0.7 + rivalry * 0.08, 0.08, 0.95);
        base.cooldownMs = 95_000;
        base.actionPt = "declarar_guerra";
        break;
      }
    }

    return base;
  }

  private resolvePlayerPeace(state: GameState, leftId: string, rightId: string): void {
    const warIds = Object.keys(state.wars)
      .sort()
      .filter((warId) => {
        const war = state.wars[warId];
        const leftInWar = war.attackers.includes(leftId) || war.defenders.includes(leftId);
        const rightInWar = war.attackers.includes(rightId) || war.defenders.includes(rightId);
        return leftInWar && rightInWar;
      });

    if (warIds.length === 0) {
      return;
    }

    for (const warId of warIds) {
      if (this.deps.warResolver) {
        this.deps.warResolver.enforcePeace(state, warId);
        continue;
      }

      delete state.wars[warId];
      const leftRelation = state.kingdoms[leftId].diplomacy.relations[rightId];
      const rightRelation = state.kingdoms[rightId].diplomacy.relations[leftId];

      if (leftRelation) {
        leftRelation.status = DiplomaticRelation.Truce;
      }
      if (rightRelation) {
        rightRelation.status = DiplomaticRelation.Truce;
      }

      const signedAt = state.meta.lastUpdatedAt;
      const parties = sortUniqueIds([leftId, rightId]);
      const treaty = {
        id: buildTreatyId(TreatyType.Peace, parties, signedAt),
        type: TreatyType.Peace,
        parties,
        signedAt,
        expiresAt: signedAt + 60_000,
        terms: { borderFreeze: true }
      };

      state.kingdoms[leftId].diplomacy.treaties.push(treaty);
      state.kingdoms[rightId].diplomacy.treaties.push(treaty);
    }
  }

  private getRegionActionConfig(actionType: RegionActionType): {
    label: string;
    cooldownMs: number;
    cost: Partial<Record<ResourceType, number>>;
  } {
    switch (actionType) {
      case "invest_agriculture":
        return {
          label: "Investimento em agricultura",
          cooldownMs: 42_000,
          cost: {
            [ResourceType.Gold]: 28,
            [ResourceType.Wood]: 22
          }
        };
      case "invest_infrastructure":
        return {
          label: "Investimento em infraestrutura",
          cooldownMs: 50_000,
          cost: {
            [ResourceType.Gold]: 40,
            [ResourceType.Wood]: 30,
            [ResourceType.Iron]: 10
          }
        };
      case "garrison":
        return {
          label: "Reforço de guarnição",
          cooldownMs: 35_000,
          cost: {
            [ResourceType.Gold]: 35,
            [ResourceType.Food]: 20,
            [ResourceType.Iron]: 18
          }
        };
      case "pacify":
        return {
          label: "Pacificação administrativa",
          cooldownMs: 40_000,
          cost: {
            [ResourceType.Gold]: 24,
            [ResourceType.Faith]: 16,
            [ResourceType.Legitimacy]: 3
          }
        };
    }
  }

  private onClockTick(deltaMs: number, now: number): void {
    const state = this.currentState;
    if (!state || state.meta.paused || !this.isWorkerReady) {
      return;
    }

    void now;

    this.accumulatedMs += deltaMs * state.meta.speedMultiplier;

    let progressed = false;
    let simNow = state.meta.lastUpdatedAt;

    while (true) {
      const current = this.currentState;
      if (!current) {
        break;
      }

      const tickDurationMs = Math.max(1, current.meta.tickDurationMs);

      if (this.accumulatedMs < tickDurationMs) {
        break;
      }

      simNow = Math.max(simNow, current.meta.lastUpdatedAt) + tickDurationMs;

      const previousTick = current.meta.tick;
      const tickStartedAt = this.monotonicNow();
      
      const ecsBackup = current.ecs;

      const result = this.pipeline.run(current, tickDurationMs, simNow);
      const tickElapsedMs = this.monotonicNow() - tickStartedAt;
      this.registerTickTiming(tickElapsedMs);
      this.currentState = result.state;
      if (ecsBackup) {
        this.currentState.ecs = ecsBackup;
      }
      progressed = true;
      this.ticksSinceAutosave += 1;
      this.ticksSinceSnapshot += 1;

      for (const event of result.events) {
        this.deps.eventBus.publish(event);
      }

      this.recordTickCommands(previousTick, result.state.meta.tick, result.events, simNow);

      if (this.ticksSinceAutosave >= (this.deps.autosaveEveryTicks ?? 5)) {
        this.ticksSinceAutosave = 0;
        this.runAutosave();
      }

      const snapshotEveryTicks = Math.max(1, this.deps.snapshotEveryTicks ?? 25);
      while (this.ticksSinceSnapshot >= snapshotEveryTicks) {
        this.ticksSinceSnapshot -= snapshotEveryTicks;
        this.captureSnapshot("periodic", simNow);
      }

      this.accumulatedMs -= tickDurationMs;
    }

    if (!progressed) {
      return;
    }

    this.persistCurrent();
    this.emitState();
  }

  private runAutosave(): void {
    if (!this.currentState) {
      return;
    }
    this.pendingAutosave = true;
  }

  private buildSaveSlotSnapshot(slotId: SaveSlotId): SaveSnapshot {
    const state = this.requireState();
    const now = this.deps.clock.now();

    // Cria uma cópia profunda para evitar mutações no estado em memória
    const stateCopy = structuredClone(state);

    // Converte os Float64Arrays do ECS para Arrays normais para garantir a serialização
    if (stateCopy.ecs) {
      // Extração direta da fonte de verdade (imune a quebras de protótipo)
      stateCopy.ecs = {
        gold: Array.from(state.ecs?.gold || []),
        food: Array.from(state.ecs?.food || []),
        wood: Array.from(state.ecs?.wood || []),
        iron: Array.from(state.ecs?.iron || []),
        faith: Array.from(state.ecs?.faith || []),
        legitimacy: Array.from(state.ecs?.legitimacy || []),
        populationTotal: Array.from(state.ecs?.populationTotal || []),
        populationGrowthRate: Array.from(state.ecs?.populationGrowthRate || []),
      } as any;
    }

    return {
      summary: buildSaveSummary(slotId, stateCopy, now),
      state: stateCopy
    };
  }

  private buildStateSnapshot(reason: SnapshotReason, savedAt = this.deps.clock.now()): StateSnapshot {
    const state = this.requireState();

    return {
      id: `snapshot:${state.meta.tick}:${savedAt}:${reason}`,
      tick: state.meta.tick,
      savedAt,
      reason,
      commandSequence: this.commandSequence,
      commandHash: this.commandHeadHash,
      stateHash: buildStateHash(state),
      state: structuredClone(state)
    };
  }

  private getReligiousActionConfig(
    actorKingdomId: string,
    targetKingdomId: string,
    _actionType: ReligiousActionType
  ): {
    cooldownKey: string;
    cooldownMs: number;
    cost: Partial<Record<ResourceType, number>>;
    chance: number;
    pressureGain: number;
  } {
    const state = this.requireState();
    const actor = state.kingdoms[actorKingdomId];
    const target = state.kingdoms[targetKingdomId];

    const actorMissionaryPower = this.clamp(actor.religion.authority * 0.5 + actor.religion.missionaryBudget * 0.5, 0, 1);
    const targetResistance = this.clamp(target.religion.authority * 0.45 + target.religion.tolerance * 0.35 + target.stability / 100 * 0.2, 0, 1);

    return {
      cooldownKey: "religion:send_missionaries",
      cooldownMs: 90_000,
      cost: {
        [ResourceType.Gold]: 18,
        [ResourceType.Faith]: 26,
        [ResourceType.Legitimacy]: 2
      },
      chance: this.clamp(0.2 + actorMissionaryPower * 0.55 - targetResistance * 0.32, 0.08, 0.9),
      pressureGain: this.clamp(0.2 + actorMissionaryPower * 0.18, 0.16, 0.42)
    };
  }

  private captureSnapshot(reason: SnapshotReason, savedAt = this.deps.clock.now()): void {
    const repository = this.deps.snapshotRepository;
    if (!repository || !this.currentState) {
      return;
    }

    const snapshot = this.buildStateSnapshot(reason, savedAt);
    const maxSnapshots = Math.max(5, this.deps.maxSnapshots ?? 20);

    this.enqueueIo(async () => {
      await repository.save(snapshot);
      await this.pruneSnapshots(repository, maxSnapshots);
    });
  }

  private async pruneSnapshots(repository: SnapshotRepository, maxSnapshots: number): Promise<void> {
    const entries = await repository.list(maxSnapshots + 20);

    if (entries.length <= maxSnapshots) {
      return;
    }

    for (const stale of entries.slice(maxSnapshots)) {
      await repository.delete(stale.id);
    }
  }

  private persistCurrent(): void {
    this.enqueueIo(async () => {
      if (this.currentState) {
        await this.deps.gameStateRepository.saveCurrent(this.currentState);
      }
    });
  }

  private enqueueIo(action: () => Promise<void>): void {
    this.ioQueue = this.ioQueue
      .then(action)
      .catch((error: unknown) => {
        console.error("Falha em operação de persistência", error);
      });
  }

  private async restoreFromSnapshotOrSave(): Promise<GameState | null> {
    if (this.deps.snapshotRepository) {
      const latestSnapshot = await this.deps.snapshotRepository.latest();
      if (latestSnapshot) {
        return structuredClone(latestSnapshot.state);
      }
    }

    return this.restoreFromLatestSave();
  }

  private async restoreFromLatestSave(): Promise<GameState | null> {
    const slots = await this.deps.saveRepository.listSlots();

    for (const slot of slots) {
      const snapshot = await this.deps.saveRepository.loadFromSlot(slot.slotId);
      if (snapshot) {
        return structuredClone(snapshot.state);
      }
    }

    return null;
  }

  private async bootstrapCommandHead(): Promise<void> {
    const commandRepository = this.deps.commandLogRepository;

    if (!commandRepository) {
      this.commandSequence = 0;
      this.commandHeadHash = "genesis";
      return;
    }

    const latest = await commandRepository.latest();

    if (!latest) {
      this.commandSequence = 0;
      this.commandHeadHash = "genesis";
      return;
    }

    this.commandSequence = latest.sequence;
    this.commandHeadHash = latest.hash;
  }

  private runOfflineProgression(state: GameState, now: number): { state: GameState; ticks: number; elapsedMs: number } {
    const lastSnapshotAt = state.meta.lastClosedAt ?? state.meta.lastUpdatedAt;
    if (!lastSnapshotAt || lastSnapshotAt >= now) {
      return { state, ticks: 0, elapsedMs: 0 };
    }

    const elapsedMs = now - lastSnapshotAt;
    const maxTicks = this.deps.maxOfflineTicks ?? 12_000;
    const desiredTicks = Math.floor(elapsedMs / Math.max(1, state.meta.tickDurationMs));
    const ticksToSimulate = Math.max(0, Math.min(desiredTicks, maxTicks));

    if (ticksToSimulate === 0) {
      return {
        state,
        ticks: 0,
        elapsedMs: 0
      };
    }

    const tickDurationMs = Math.max(1, state.meta.tickDurationMs);
    const coarseStepTicks = this.selectOfflineCoarseStep(ticksToSimulate);
    const startedAt = this.monotonicNow();
    
    const ecsBackup = state.ecs;

    const batchResult = this.pipeline.runBatch(state, ticksToSimulate, tickDurationMs, lastSnapshotAt, {
      collectEvents: false,
      coarseStepTicks
    });
    
    if (ecsBackup) {
      batchResult.state.ecs = ecsBackup;
    }

    return {
      state: batchResult.state,
      ticks: ticksToSimulate,
      elapsedMs: this.monotonicNow() - startedAt
    };
  }

  private selectOfflineCoarseStep(ticks: number): number {
    if (ticks >= 10_000) {
      return 8;
    }

    if (ticks >= 6_000) {
      return 6;
    }

    if (ticks >= 3_000) {
      return 4;
    }

    if (ticks >= 1_500) {
      return 2;
    }

    return 1;
  }

  private emitState(): void {
    if (!this.currentState) {
      return;
    }

    for (const listener of this.listeners) {
      listener(this.currentState);
    }
  }

  private requireState(): GameState {
    if (!this.currentState) {
      throw new Error("Sessão ainda não inicializada.");
    }

    return this.currentState;
  }

  private createSessionLog(title: string, details: string, severity: EventLogEntry["severity"], now: number): EventLogEntry {
    const tick = this.currentState?.meta.tick ?? 0;
    const seq = this.sessionLogSeq++;
    return {
      id: `evt_session_${tick}_${seq}`,
      title,
      details,
      severity,
      occurredAt: now
    };
  }

  private createCommandEntry(input: Omit<CommandLogEntry, "sequence" | "id" | "previousHash" | "hash">): CommandLogEntry {
    const sequence = this.commandSequence + 1;
    const previousHash = this.commandHeadHash;
    const id = `cmd:${input.tick}:${sequence}:${input.commandType}`;

    const base = {
      sequence,
      id,
      issuerType: input.issuerType,
      issuerId: input.issuerId,
      tick: input.tick,
      commandType: input.commandType,
      payload: input.payload,
      createdAt: input.createdAt,
      previousHash
    };
    const hash = hashDeterministic({
      sequence,
      id,
      issuerType: input.issuerType,
      issuerId: input.issuerId,
      tick: input.tick,
      commandType: input.commandType,
      payload: input.payload,
      previousHash
    });

    this.commandSequence = sequence;
    this.commandHeadHash = hash;

    return {
      ...base,
      hash
    };
  }

  private enqueueCommandEntries(entries: CommandLogEntry[]): void {
    const repository = this.deps.commandLogRepository;

    if (!repository || entries.length === 0) {
      return;
    }

    this.enqueueIo(async () => {
      await repository.append(entries);
    });
  }

  private recordPlayerCommand(commandType: string, payload: Record<string, unknown>): void {
    const repository = this.deps.commandLogRepository;
    const state = this.currentState;

    if (!repository || !state) {
      return;
    }

    const player = Object.keys(state.kingdoms)
      .sort()
      .map((kingdomId) => state.kingdoms[kingdomId])
      .find((kingdom) => kingdom.isPlayer);
    const entry = this.createCommandEntry({
      issuerType: "player",
      issuerId: player?.id ?? "player",
      tick: state.meta.tick,
      commandType,
      payload,
      createdAt: this.deps.clock.now()
    });

    this.enqueueCommandEntries([entry]);
  }

  private recordSystemCommand(commandType: string, payload: Record<string, unknown>, createdAt = this.deps.clock.now()): void {
    const repository = this.deps.commandLogRepository;
    const state = this.currentState;

    if (!repository || !state) {
      return;
    }

    const entry = this.createCommandEntry({
      issuerType: "system",
      issuerId: "runtime",
      tick: state.meta.tick,
      commandType,
      payload,
      createdAt
    });

    this.enqueueCommandEntries([entry]);
  }

  private recordTickCommands(previousTick: number, currentTick: number, events: DomainEvent[], createdAt: number): void {
    const repository = this.deps.commandLogRepository;

    if (!repository) {
      return;
    }

    const state = this.currentState;
    const stateHash = state ? buildStateHash(state) : null;
    const entries: CommandLogEntry[] = [];

    entries.push(
      this.createCommandEntry({
        issuerType: "system",
        issuerId: "tick_engine",
        tick: currentTick,
        commandType: "tick.processed",
        payload: {
          previousTick,
          currentTick,
          eventCount: events.length,
          stateHash
        },
        createdAt
      })
    );

    for (const event of events) {
      const issuerType: CommandLogEntry["issuerType"] = event.type.startsWith("npc.") ? "npc" : "system";
      const issuerId = event.actorKingdomId ?? (issuerType === "npc" ? "npc" : "system");

      entries.push(
        this.createCommandEntry({
          issuerType,
          issuerId,
          tick: currentTick,
          commandType: `event.${event.type}`,
          payload: {
            eventId: event.id,
            targetKingdomId: event.targetKingdomId,
            payload: event.payload
          },
          createdAt
        })
      );
    }

    this.enqueueCommandEntries(entries);
  }
}
