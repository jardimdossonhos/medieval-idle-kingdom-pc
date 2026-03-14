import "./styles/global.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TechnologyEffect } from "./core/models/technology";
import { isTechnologyAvailable, isTechnologyUnlocked } from "./core/data/technology-tree";
import { createInitialState } from "./application/boot/create-initial-state";
import { createStaticWorldData } from "./application/boot/static-world-data";
import { WORLD_DEFINITIONS_V1 } from "./application/boot/generated/world-definitions-v1";
import {
  GameSession,
  type DiplomaticActionType,
  type RegionActionType,
  type ReligiousActionType,
  type RuntimeMetrics,
  type TechnologyChoice
} from "./application/game-session";
import { AutomationLevel, ResourceType, TechnologyDomain } from "./core/models/enums";
import { createDefaultSimulationSystems } from "./core/simulation/create-default-systems";
import type { SaveSummary } from "./core/contracts/game-ports";
import type { GameState, KingdomState } from "./core/models/game-state";
import type { MapLayerMode, MapRenderContext, MapSelection } from "./infrastructure/rendering/map-renderer";
import { HybridMapRenderer } from "./infrastructure/rendering/hybrid-map-renderer";
import { LocalDiplomacyResolver } from "./infrastructure/diplomacy/local-diplomacy-resolver";
import { RuleBasedNpcDecisionService } from "./infrastructure/npc/rule-based-npc-decision-service";
import { createRuntimePersistenceBundle } from "./infrastructure/persistence/runtime-persistence";
import { BrowserClockService } from "./infrastructure/runtime/browser-clock-service";
import { LocalEventBus } from "./infrastructure/runtime/local-event-bus";
import { LocalWarResolver } from "./infrastructure/war/local-war-resolver";

interface UiRefs {
  playerValue: HTMLElement;
  tickValue: HTMLElement;
  updatedValue: HTMLElement;
  statusValue: HTMLElement;
  victoryValue: HTMLElement;
  postVictoryValue: HTMLElement;
  pauseButton: HTMLButtonElement;
  speedSelect: HTMLSelectElement;
  openSavesButton: HTMLButtonElement;
  manualSaveButton: HTMLButtonElement;
  toastArea: HTMLElement;
  devTickLastValue: HTMLElement | null;
  devTickAvgValue: HTMLElement | null;
  devOfflineValue: HTMLElement | null;
  mapCanvas: HTMLElement;
  mapLayerSelect: HTMLSelectElement;
  resourceList: HTMLElement;
  riskList: HTMLElement;
  explainList: HTMLElement;
  regionInfo: HTMLElement;
  regionActions: HTMLElement;
  governmentApplyButton: HTMLButtonElement;
  budgetInputs: Record<string, HTMLInputElement>;
  taxInputs: Record<string, HTMLInputElement>;
  techFocusSelect: HTMLSelectElement;
  techAutomationSelect: HTMLSelectElement;
  techHideCompletedToggle: HTMLInputElement;
  techClearGoalButton: HTMLButtonElement;
  techApplyButton: HTMLButtonElement;
  techSummary: HTMLElement;
  techTreeList: HTMLElement;
  diplomacyList: HTMLElement;
  militarySummary: HTMLElement;
  saveList: HTMLElement;
  eventList: HTMLElement;
  profileNameInput: HTMLInputElement;
  profileEmailInput: HTMLInputElement;
  profileIdValue: HTMLElement;
  profileSaveButton: HTMLButtonElement;
  tabButtons: HTMLButtonElement[];
  tabPanels: HTMLElement[];
}

type TabId = "mapa" | "governo" | "diplomacia" | "tecnologia" | "militar" | "eventos" | "saves" | "configuracoes";

interface LocalPlayerProfile {
  id: string;
  name: string;
  email: string;
}

const PROFILE_STORAGE_KEY = "midk.profile.v1";

const TECH_DOMAIN_ORDER: TechnologyDomain[] = [
  TechnologyDomain.Economy,
  TechnologyDomain.Military,
  TechnologyDomain.Administration,
  TechnologyDomain.Religion,
  TechnologyDomain.Logistics,
  TechnologyDomain.Engineering
];

function queryElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Elemento não encontrado: ${selector}`);
  }

  return element as T;
}

function queryOptionalElement<T extends Element>(root: ParentNode, selector: string): T | null {
  const element = root.querySelector(selector);
  return element ? (element as T) : null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(value);
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getPlayerKingdom(state: GameState): KingdomState {
  const player = Object.keys(state.kingdoms)
    .sort()
    .map((id) => state.kingdoms[id])
    .find((kingdom) => kingdom.isPlayer);

  if (!player) {
    throw new Error("Reino do jogador não encontrado.");
  }

  return player;
}

function riskClass(value: number): string {
  if (value >= 0.7) {
    return "risk-high";
  }

  if (value >= 0.45) {
    return "risk-medium";
  }

  return "risk-low";
}

function formatTechEffect(effect: TechnologyEffect): string {
  const isMultiplier = effect.type === "multiplier";
  const sign = effect.value > 0 ? "+" : "";
  const value = isMultiplier ? `${sign}${effect.value * 100}%` : `${sign}${effect.value}`;

  // Mapeamento para nomes mais amigáveis na UI
  const targetMap: Record<string, string> = {
    "economy.food_production_multiplier": "Produção de Comida",
    "population.growth_rate_multiplier": "Crescimento Populacional",
    "economy.tax_income_multiplier": "Renda de Impostos",
    "economy.trade_income_multiplier": "Renda de Comércio",
    "stability_additive": "Estabilidade",
    "military.manpower_recovery_multiplier": "Recuperação de Mão de Obra",
    "military.army_maintenance_multiplier": "Manutenção de Exércitos",
    "military.infantry_quality_multiplier": "Qualidade da Infantaria",
    "economy.iron_production_multiplier": "Produção de Ferro",
    "military.siege_ability_multiplier": "Habilidade de Cerco",
    "administration.capacity_additive": "Capacidade Administrativa",
    "administration.corruption_multiplier": "Corrupção",
    "legitimacy_additive": "Legitimidade",
    "religion.authority_multiplier": "Autoridade Religiosa",
    "religion.faith_production_multiplier": "Produção de Fé",
    "technology.research_points_multiplier": "Pontos de Pesquisa",
    "military.movement_speed_multiplier": "Velocidade de Movimento",
    "economy.wood_production_multiplier": "Produção de Madeira",
    "military.fort_defense_multiplier": "Defesa de Forte"
  };

  const targetLabel = targetMap[effect.target] || effect.target;
  return `${value} ${targetLabel}`;
}

function normalizePercentage(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return round(Math.max(0, parsed));
}

function techDomainLabel(domain: TechnologyDomain): string {
  switch (domain) {
    case TechnologyDomain.Economy:
      return "Economia";
    case TechnologyDomain.Military:
      return "Militar";
    case TechnologyDomain.Administration:
      return "Administração";
    case TechnologyDomain.Religion:
      return "Religião";
    case TechnologyDomain.Logistics:
      return "Logística";
    case TechnologyDomain.Engineering:
      return "Engenharia";
  }
}

function techStatusLabel(status: TechnologyChoice["status"]): string {
  switch (status) {
    case "active":
      return "Ativa";
    case "available":
      return "Disponível";
    case "unlocked":
      return "Concluída";
    case "locked":
      return "Bloqueada";
  }
}

function automationLevelLabel(level: AutomationLevel): string {
  switch (level) {
    case AutomationLevel.Manual:
      return "Manual";
    case AutomationLevel.Assisted:
      return "Assistido";
    case AutomationLevel.NearlyAutomatic:
      return "Quase automático";
  }
}

function generateProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }

  return `local-${Date.now().toString(36)}`;
}

function createDefaultProfile(): LocalPlayerProfile {
  return {
    id: generateProfileId(),
    name: "Monarca Local",
    email: ""
  };
}

function loadLocalProfile(): LocalPlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      const fallback = createDefaultProfile();
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<LocalPlayerProfile>;
    if (typeof parsed.id !== "string" || typeof parsed.name !== "string" || typeof parsed.email !== "string") {
      const fallback = createDefaultProfile();
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }

    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email
    };
  } catch {
    const fallback = createDefaultProfile();
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveLocalProfile(profile: LocalPlayerProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

async function bootstrapApp(): Promise<void> {
  const appRoot = document.getElementById("app");

  if (!appRoot) {
    throw new Error("Elemento #app não encontrado.");
  }

  document.documentElement.lang = "pt-BR";
  document.title = "Reino Idle Medieval";
  const showDevMetrics = import.meta.env.DEV;

  appRoot.innerHTML = `
    <main class="app-shell">
      <header class="app-header card">
        <div class="header-title">
          <h1>Reino Idle Medieval</h1>
          <p>Grand strategy idle local-first com foco em decisões de alto nível.</p>
        </div>
        <div class="status-grid">
          <div><span>Jogador</span><strong id="player-value">-</strong></div>
          <div><span>Ciclo</span><strong id="tick-value">0</strong></div>
          <div><span>Atualizado</span><strong id="updated-value">-</strong></div>
          <div><span>Estado</span><strong id="status-value">Pausado</strong></div>
          <div><span>Vitória</span><strong id="victory-value">Ainda não alcançada</strong></div>
          <div><span>Pós-vitória</span><strong id="post-victory-value">-</strong></div>
        </div>
      </header>

      <section class="control-row card">
        <button id="toggle-pause-btn">Pausar</button>
        <label>
          Velocidade
          <select id="speed-select">
            <option value="0.5">0.5x</option>
            <option value="1" selected>1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </label>
        <button id="open-saves-btn">Menu de saves</button>
        <span id="toast-area" class="toast"></span>
      </section>

      <section class="map-workspace">
        <article class="card map-card">
          <div class="map-toolbar">
            <h2>Mapa estratégico</h2>
            <label>
              Camada
              <select id="map-layer-select">
                <option value="owner" selected>Domínio</option>
                <option value="unrest">Instabilidade</option>
                <option value="war">Contestado/Guerra</option>
                <option value="religion">Religião</option>
              </select>
            </label>
          </div>
          <p class="map-hint">Use scroll/pinch para zoom e arraste para mover o mapa.</p>
          <div id="map-canvas" class="map-canvas"></div>
        </article>

        <aside class="side-column">
          <article class="card">
            <h2>Riscos estratégicos</h2>
            <ul id="risk-list" class="risk-list"></ul>
            <h3>Explicabilidade</h3>
            <ul id="explain-list" class="list compact explain-list"></ul>
          </article>
          <article class="card">
            <h2>Região selecionada</h2>
            <div id="region-info">Selecione uma região no mapa.</div>
            <div id="region-actions" class="action-grid"></div>
          </article>
          <article class="card">
            <h2>Recursos</h2>
            <ul id="resource-list" class="list compact"></ul>
          </article>
        </aside>
      </section>

      <section class="tabs card">
        <button class="tab-btn is-active" data-tab="mapa">Mapa</button>
        <button class="tab-btn" data-tab="governo">Governo</button>
        <button class="tab-btn" data-tab="diplomacia">Diplomacia</button>
        <button class="tab-btn" data-tab="tecnologia">Tecnologia</button>
        <button class="tab-btn" data-tab="militar">Militar</button>
        <button class="tab-btn" data-tab="eventos">Eventos</button>
        <button class="tab-btn" data-tab="saves">Saves</button>
        <button class="tab-btn" data-tab="configuracoes">Configurações</button>
      </section>

      <section class="panel-grid">
        <article class="card tab-panel" data-tab-panel="mapa">
          <h2>Painel de campanha</h2>
          <p>Defina foco de expansão por diplomacia e ações regionais para dominar o mapa.</p>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="governo">
          <h2>Governo e economia</h2>
          <div class="form-grid">
            <label>Taxa base <input id="tax-base" type="number" min="0.05" max="0.6" step="0.01"></label>
            <label>Alívio nobre <input id="tax-noble" type="number" min="0" max="0.4" step="0.01"></label>
            <label>Isenção clero <input id="tax-clergy" type="number" min="0" max="0.4" step="0.01"></label>
            <label>Tarifa comercial <input id="tax-tariff" type="number" min="0" max="0.5" step="0.01"></label>
          </div>
          <h3>Prioridade de orçamento (%)</h3>
          <div class="form-grid">
            <label>Economia <input id="budget-economy" type="number" min="0" max="100" step="1"></label>
            <label>Militar <input id="budget-military" type="number" min="0" max="100" step="1"></label>
            <label>Religião <input id="budget-religion" type="number" min="0" max="100" step="1"></label>
            <label>Administração <input id="budget-administration" type="number" min="0" max="100" step="1"></label>
            <label>Tecnologia <input id="budget-technology" type="number" min="0" max="100" step="1"></label>
          </div>
          <button id="government-apply-btn">Aplicar políticas</button>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="diplomacia">
          <h2>Diplomacia e conflito</h2>
          <div id="diplomacy-list" class="diplomacy-list"></div>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="tecnologia">
          <h2>Direção tecnológica</h2>
          <div class="inline-form">
            <label>
              Foco de pesquisa
              <select id="tech-focus-select">
                <option value="economy">Economia</option>
                <option value="military">Militar</option>
                <option value="administration">Administração</option>
                <option value="religion">Religião</option>
                <option value="logistics">Logística</option>
                <option value="engineering">Engenharia</option>
              </select>
            </label>
            <label>
              Automação de pesquisa
              <select id="tech-automation-select">
                <option value="manual">Manual</option>
                <option value="assisted">Assistido</option>
                <option value="nearly_automatic">Quase automático</option>
              </select>
            </label>
            <label class="inline-check">
              <input id="tech-hide-completed-toggle" type="checkbox" checked>
              Ocultar concluídas
            </label>
            <button id="tech-clear-goal-btn">Limpar meta</button>
            <button id="tech-apply-btn">Aplicar foco</button>
          </div>
          <div id="tech-summary" class="summary-grid"></div>
          <h3>Árvore tecnológica</h3>
          <div id="tech-tree-list" class="tech-tree-list"></div>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="militar">
          <h2>Painel militar</h2>
          <div id="military-summary"></div>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="eventos">
          <h2>Registro de eventos</h2>
          <ul id="event-list" class="list"></ul>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="saves">
          <h2>Gestão de saves</h2>
          <div class="inline-form saves-toolbar">
            <button id="manual-save-btn">Salvar Jogo</button>
            <button id="refresh-saves-btn">Atualizar Lista</button>
          </div>
          <div id="save-list" class="save-list"></div>
        </article>

        <article class="card tab-panel is-hidden" data-tab-panel="configuracoes">
          <h2>Configurações e perfil local</h2>
          <div class="form-grid">
            <label>Nome do jogador <input id="profile-name-input" type="text" maxlength="40"></label>
            <label>Email (multiplayer futuro) <input id="profile-email-input" type="email" maxlength="100"></label>
          </div>
          <div class="summary-grid">
            <span>ID local</span><strong id="profile-id-value">-</strong>
            <span>Ciclo da simulação</span><strong>1 ciclo = 1 tick do reino</strong>
            <span>Observação multiplayer</span><strong>Conta ainda local-first (sem login online)</strong>
          </div>
          ${
            showDevMetrics
              ? `
          <div class="summary-grid">
            <span>Tick (ms) último</span><strong id="dev-tick-last">0</strong>
            <span>Tick (ms) média</span><strong id="dev-tick-avg">0</strong>
            <span>Offline catch-up</span><strong id="dev-offline">0 ms / 0 ticks</strong>
          </div>
          `
              : ""
          }
          <button id="profile-save-btn">Salvar perfil local</button>
          <p class="hint-text">Este perfil local prepara o caminho para autenticação e sincronização entre dispositivos no multiplayer futuro.</p>
        </article>
      </section>
    </main>
  `;

  const ui: UiRefs = {
    playerValue: queryElement(appRoot, "#player-value"),
    tickValue: queryElement(appRoot, "#tick-value"),
    updatedValue: queryElement(appRoot, "#updated-value"),
    statusValue: queryElement(appRoot, "#status-value"),
    victoryValue: queryElement(appRoot, "#victory-value"),
    postVictoryValue: queryElement(appRoot, "#post-victory-value"),
    pauseButton: queryElement(appRoot, "#toggle-pause-btn"),
    speedSelect: queryElement(appRoot, "#speed-select"),
    openSavesButton: queryElement(appRoot, "#open-saves-btn"),
    manualSaveButton: queryElement(appRoot, "#manual-save-btn"),
    refreshSavesButton: queryElement(appRoot, "#refresh-saves-btn"),
    toastArea: queryElement(appRoot, "#toast-area"),
    devTickLastValue: queryOptionalElement(appRoot, "#dev-tick-last"),
    devTickAvgValue: queryOptionalElement(appRoot, "#dev-tick-avg"),
    devOfflineValue: queryOptionalElement(appRoot, "#dev-offline"),
    mapCanvas: queryElement(appRoot, "#map-canvas"),
    mapLayerSelect: queryElement(appRoot, "#map-layer-select"),
    resourceList: queryElement(appRoot, "#resource-list"),
    riskList: queryElement(appRoot, "#risk-list"),
    explainList: queryElement(appRoot, "#explain-list"),
    regionInfo: queryElement(appRoot, "#region-info"),
    regionActions: queryElement(appRoot, "#region-actions"),
    governmentApplyButton: queryElement(appRoot, "#government-apply-btn"),
    budgetInputs: {
      economy: queryElement(appRoot, "#budget-economy"),
      military: queryElement(appRoot, "#budget-military"),
      religion: queryElement(appRoot, "#budget-religion"),
      administration: queryElement(appRoot, "#budget-administration"),
      technology: queryElement(appRoot, "#budget-technology")
    },
    taxInputs: {
      baseRate: queryElement(appRoot, "#tax-base"),
      nobleRelief: queryElement(appRoot, "#tax-noble"),
      clergyExemption: queryElement(appRoot, "#tax-clergy"),
      tariffRate: queryElement(appRoot, "#tax-tariff")
    },
    techFocusSelect: queryElement(appRoot, "#tech-focus-select"),
    techAutomationSelect: queryElement(appRoot, "#tech-automation-select"),
    techHideCompletedToggle: queryElement(appRoot, "#tech-hide-completed-toggle"),
    techClearGoalButton: queryElement(appRoot, "#tech-clear-goal-btn"),
    techApplyButton: queryElement(appRoot, "#tech-apply-btn"),
    techSummary: queryElement(appRoot, "#tech-summary"),
    techTreeList: queryElement(appRoot, "#tech-tree-list"),
    diplomacyList: queryElement(appRoot, "#diplomacy-list"),
    militarySummary: queryElement(appRoot, "#military-summary"),
    saveList: queryElement(appRoot, "#save-list"),
    eventList: queryElement(appRoot, "#event-list"),
    profileNameInput: queryElement(appRoot, "#profile-name-input"),
    profileEmailInput: queryElement(appRoot, "#profile-email-input"),
    profileIdValue: queryElement(appRoot, "#profile-id-value"),
    profileSaveButton: queryElement(appRoot, "#profile-save-btn"),
    tabButtons: Array.from(appRoot.querySelectorAll<HTMLButtonElement>(".tab-btn")),
    tabPanels: Array.from(appRoot.querySelectorAll<HTMLElement>(".tab-panel"))
  };

  const simulationWorker = new Worker(
    new URL("./infrastructure/worker/simulation.worker.ts", import.meta.url),
    { type: "module" }
  );

  simulationWorker.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      type?: string;
      payload?: {
        timestamp?: number;
        goldData?: Float64Array;
        foodData?: Float64Array;
        woodData?: Float64Array;
        ironData?: Float64Array;
        faithData?: Float64Array;
        legitimacyData?: Float64Array;
        populationTotalData?: Float64Array;
        populationGrowthRateData?: Float64Array;
      };
    };
    if (data?.type === "TICK") {
      const payload = data.payload;
      if (payload?.goldData instanceof Float64Array) {
        currentSimulationState.goldData = payload.goldData;
      }
      if (payload?.foodData instanceof Float64Array) {
        currentSimulationState.foodData = payload.foodData;
      }
      if (payload?.woodData instanceof Float64Array) {
        currentSimulationState.woodData = payload.woodData;
      }
      if (payload?.ironData instanceof Float64Array) {
        currentSimulationState.ironData = payload.ironData;
      }
      if (payload?.faithData instanceof Float64Array) {
        currentSimulationState.faithData = payload.faithData;
      }
      if (payload?.legitimacyData instanceof Float64Array) {
        currentSimulationState.legitimacyData = payload.legitimacyData;
      }
      if (payload?.populationTotalData instanceof Float64Array) {
        currentSimulationState.populationTotalData = payload.populationTotalData;
      }
      if (payload?.populationGrowthRateData instanceof Float64Array) {
        currentSimulationState.populationGrowthRateData = payload.populationGrowthRateData;
      }

      // Atualiza o GameState na sessão com os dados mais recentes do worker.
      // Isso é crucial para que as decisões lógicas (como canAfford) usem dados frescos.
      if (payload) {
        session.updateEcsState({
          gold: Array.from(payload.goldData ?? []),
          food: Array.from(payload.foodData ?? []),
          wood: Array.from(payload.woodData ?? []),
          iron: Array.from(payload.ironData ?? []),
          faith: Array.from(payload.faithData ?? []),
          legitimacy: Array.from(payload.legitimacyData ?? []),
          populationTotal: Array.from(payload.populationTotalData ?? []),
          populationGrowthRate: Array.from(payload.populationGrowthRateData ?? [])
        });
      }

      updateUIPanel();
    }
  };

  const totalCountries = WORLD_DEFINITIONS_V1.length;
  simulationWorker.postMessage({ type: "INIT" as const, payload: { entityCount: totalCountries } });
  simulationWorker.postMessage({ type: "START" as const });

  const resourceLabels: Record<ResourceType, string> = {
    gold: "Ouro",
    food: "Comida",
    wood: "Madeira",
    iron: "Ferro",
    faith: "Fé",
    legitimacy: "Legitimidade"
  };

  const governmentInputs = [
    ...Object.values(ui.taxInputs),
    ...Object.values(ui.budgetInputs)
  ];

  let selectedRegionId: string | null = null;
  let selectedMapLabel: string | null = null;
  let toastTimeout: number | null = null;
  let isGovernmentFormDirty = false;
  let hideCompletedTechnologies = true;
  let profile = loadLocalProfile();
  let selectedCountryIndex: number | null = null;
  let currentSimulationState: {
    goldData: Float64Array;
    foodData: Float64Array;
    woodData: Float64Array;
    ironData: Float64Array;
    faithData: Float64Array;
    legitimacyData: Float64Array;
    populationTotalData: Float64Array;
    populationGrowthRateData: Float64Array;
  } = {
    goldData: new Float64Array(0),
    foodData: new Float64Array(0),
    woodData: new Float64Array(0),
    ironData: new Float64Array(0),
    faithData: new Float64Array(0),
    legitimacyData: new Float64Array(0),
    populationTotalData: new Float64Array(0),
    populationGrowthRateData: new Float64Array(0)
  };
  let resourcesInitialized = false;

  function showToast(message: string): void {
    ui.toastArea.textContent = message;

    if (toastTimeout !== null) {
      window.clearTimeout(toastTimeout);
    }

    toastTimeout = window.setTimeout(() => {
      ui.toastArea.textContent = "";
      toastTimeout = null;
    }, 2600);
  }

  function setActiveTab(tabId: TabId): void {
    for (const button of ui.tabButtons) {
      button.classList.toggle("is-active", button.dataset.tab === tabId);
    }

    for (const panel of ui.tabPanels) {
      panel.classList.toggle("is-hidden", panel.dataset.tabPanel !== tabId);
    }
  }

  function syncProfileUi(): void {
    ui.playerValue.textContent = profile.name;
    ui.profileNameInput.value = profile.name;
    ui.profileEmailInput.value = profile.email;
    ui.profileIdValue.textContent = profile.id;
  }

  function isGovernmentInputFocused(): boolean {
    const active = document.activeElement;
    return governmentInputs.includes(active as HTMLInputElement);
  }

  const staticWorldData = createStaticWorldData();
  const eventBus = new LocalEventBus();
  const npcDecisionService = new RuleBasedNpcDecisionService();
  const diplomacyResolver = new LocalDiplomacyResolver();
  const warResolver = new LocalWarResolver(staticWorldData);

  // Esta será a base para o gerenciamento de múltiplas campanhas.
  // Por enquanto, usamos um ID fixo. No futuro, este ID virá de uma tela de seleção.
  const activeCampaignId = "default_campaign_v1";
  const persistence = createRuntimePersistenceBundle(activeCampaignId);

  const session = new GameSession({
    gameStateRepository: persistence.gameStateRepository,
    saveRepository: persistence.saveRepository,
    staticWorldData,
    commandLogRepository: persistence.commandLogRepository,
    snapshotRepository: persistence.snapshotRepository,
    clock: new BrowserClockService(1_000),
    eventBus,
    diplomacyResolver,
    warResolver,
    systems: createDefaultSimulationSystems({
      npcDecisionService,
      diplomacyResolver,
      warResolver
    }),
    autosaveEveryTicks: 5,
    maxOfflineTicks: 12_000,
    snapshotEveryTicks: 25,
    maxSnapshots: 20
  });
  // highlight-start
  // Envia o estado do ECS para o worker quando um jogo é carregado
  eventBus.subscribe("game.loaded", (state) => {
    if (state.ecs) {
      simulationWorker.postMessage({ type: "RESTORE_ECS_STATE", payload: state.ecs });
    }
  });
  // highlight-end
  const mapRenderer = new HybridMapRenderer(ui.mapCanvas, staticWorldData, (selection: MapSelection) => {
    selectedRegionId = selection.regionId;
    selectedMapLabel = selection.label ?? selection.regionId;

    const regionId = selectedRegionId;
    if (regionId) {
      const index = WORLD_DEFINITIONS_V1.findIndex((def) => def.id === regionId);
      selectedCountryIndex = index >= 0 ? index : null;
    } else {
      selectedCountryIndex = null;
    }

    renderRegionInfo(session.getState());
    setActiveTab("mapa");
    updateUIPanel();
  });

  eventBus.subscribe("victory.achieved", () => {
    showToast("Caminho de vitória alcançado. O império segue em modo contínuo.");
  });

  function renderHeader(state: GameState): void {
    ui.playerValue.textContent = profile.name;
    ui.tickValue.textContent = String(state.meta.tick);
    ui.updatedValue.textContent = formatDate(state.meta.lastUpdatedAt);
    ui.statusValue.textContent = state.meta.paused ? "Pausado" : "Executando";
    ui.pauseButton.textContent = state.meta.paused ? "Retomar" : "Pausar";
    ui.speedSelect.value = String(state.meta.speedMultiplier);

    ui.victoryValue.textContent = state.victory.achievedPath ?? "Ainda não alcançada";
    ui.postVictoryValue.textContent = state.victory.postVictoryMode
      ? `${formatNumber(state.victory.crisisPressure * 100)}%`
      : "-";
  }

  function renderRuntimeMetrics(metrics: RuntimeMetrics): void {
    if (!ui.devTickLastValue || !ui.devTickAvgValue || !ui.devOfflineValue) {
      return;
    }

    ui.devTickLastValue.textContent = formatNumber(metrics.tickMsLast);
    ui.devTickAvgValue.textContent = formatNumber(metrics.tickMsAverage);
    ui.devOfflineValue.textContent = `${formatNumber(metrics.offlineCatchUpMs)} ms / ${metrics.offlineTicks} ticks`;
  }

  function renderResources(state: GameState): void {
    if (!resourcesInitialized) {
      ui.resourceList.innerHTML = "";

      for (const resource of Object.keys(resourceLabels) as ResourceType[]) {
        const item = document.createElement("li");
        item.dataset.resource = resource;
        // Inicializa com 0; updateUIPanel irá preencher com os dados do worker.
        item.textContent = `${resourceLabels[resource]}: 0`;
        ui.resourceList.appendChild(item);
      }

      resourcesInitialized = true;
    }
    // A atualização agora é feita exclusivamente pela função updateUIPanel
    // para garantir que os dados venham sempre do worker (ECS).
  }

  function updateUIPanel(): void {
    const state = session.getState();
    if (!state) {
      return;
    }

    const player = getPlayerKingdom(state);
    const playerRegionIds = Object.keys(state.world.regions).filter(
      (regionId) => state.world.regions[regionId].ownerId === player.id
    );

    const playerRegionIndices = playerRegionIds
      .map((regionId) => WORLD_DEFINITIONS_V1.findIndex((def) => def.id === regionId))
      .filter((index) => index !== -1);

    const totals: Record<string, number> = {};
    const allResources = currentSimulationState;

    for (const resource of Object.keys(resourceLabels) as ResourceType[]) {
      const dataArray = allResources[`${resource}Data` as keyof typeof allResources];
      let total = 0;
      if (dataArray) {
        for (const index of playerRegionIndices) {
          if (index < dataArray.length) {
            total += dataArray[index];
          }
        }
      }
      totals[resource] = total;

      const item = ui.resourceList.querySelector<HTMLLIElement>(`li[data-resource="${resource}"]`);
      if (item) {
        item.textContent = `${resourceLabels[resource]}: ${formatNumber(totals[resource])}`;
      }
    }
  }

  function getPlayerTotalPopulation(state: GameState): number {
    const player = getPlayerKingdom(state);
    const playerRegionIds = Object.keys(state.world.regions).filter(
      (regionId) => state.world.regions[regionId].ownerId === player.id
    );

    const playerRegionIndices = playerRegionIds
      .map((regionId) => WORLD_DEFINITIONS_V1.findIndex((def) => def.id === regionId))
      .filter((index) => index !== -1);

    let total = 0;
    const popData = currentSimulationState.populationTotalData;
    if (popData) {
      for (const index of playerRegionIndices) {
        if (index < popData.length) {
          total += popData[index];
        }
      }
    }
    return total;
  }

  function getPlayerTotalResource(state: GameState, resource: ResourceType): number {
    const player = getPlayerKingdom(state);
    const playerRegionIds = Object.keys(state.world.regions).filter(
      (regionId) => state.world.regions[regionId].ownerId === player.id
    );
    const playerRegionIndices = playerRegionIds
      .map((regionId) => WORLD_DEFINITIONS_V1.findIndex((def) => def.id === regionId))
      .filter((index) => index !== -1);
    let total = 0;
    const dataArray = currentSimulationState[`${resource}Data` as keyof typeof currentSimulationState];
    if (dataArray) {
      for (const index of playerRegionIndices) {
        if (index < dataArray.length) {
          total += dataArray[index];
        }
      }
    }
    return total;
  }

  function renderRiskIndicators(state: GameState): void {
    const player = getPlayerKingdom(state);
    const ownedRegions = Object.keys(state.world.regions)
      .sort()
      .filter((regionId) => state.world.regions[regionId].ownerId === player.id)
      .map((regionId) => state.world.regions[regionId]);

    // A necessidade de comida e o estoque agora são baseados nos dados do ECS.
    const totalFood = getPlayerTotalResource(state, ResourceType.Food);
    const foodNeed = getPlayerTotalPopulation(state) / 8_000;
    const famine = foodNeed <= 0 ? 0 : Math.max(0, (foodNeed - totalFood) / foodNeed);
    const revolt = ownedRegions.length === 0 ? 0 : Math.max(...ownedRegions.map((region) => region.unrest));

    const atWar = Object.keys(state.wars)
      .sort()
      .some((warId) => {
        const war = state.wars[warId];
        return war.attackers.includes(player.id) || war.defenders.includes(player.id);
      });

    const worstRivalry = Object.keys(player.diplomacy.relations)
      .sort()
      .map((relationId) => player.diplomacy.relations[relationId])
      .reduce((top, relation) => Math.max(top, relation.score.rivalry), 0);

    const warRisk = atWar ? 1 : worstRivalry;

    const entries = [
      { label: "Fome", value: famine },
      { label: "Revolta", value: revolt },
      { label: "Guerra", value: warRisk }
    ];

    ui.riskList.innerHTML = "";

    for (const entry of entries) {
      const item = document.createElement("li");
      item.className = `risk-item ${riskClass(entry.value)}`;
      item.innerHTML = `<span>${entry.label}</span><strong>${formatNumber(entry.value * 100)}%</strong>`;
      ui.riskList.appendChild(item);
    }
  }

  function renderExplainers(state: GameState): void {
    const player = getPlayerKingdom(state);
    const explainers: Array<{ label: string; reason: string; suggestion: string; level: "low" | "medium" | "high" }> = [];

    // A reserva de comida e a população agora são baseadas nos dados do ECS.
    const totalPopulation = getPlayerTotalPopulation(state);
    const totalFood = getPlayerTotalResource(state, ResourceType.Food);
    const foodReserveTarget = totalPopulation / 8_000;
    const foodGap = foodReserveTarget <= 0 ? 0 : (foodReserveTarget - totalFood) / foodReserveTarget;
    if (foodGap > 0.35) {
      explainers.push({
        label: "Pressão alimentar",
        reason: "A reserva de comida está abaixo da necessidade da população.",
        suggestion: "Invista em agricultura e aumente orçamento em economia.",
        level: foodGap > 0.6 ? "high" : "medium"
      });
    }

    const adminUsage = player.administration.adminCapacity <= 0
      ? 0
      : player.administration.usedCapacity / player.administration.adminCapacity;
    if (adminUsage > 0.85 || player.administration.corruption > 0.2) {
      explainers.push({
        label: "Sobrecarga administrativa",
        reason: `Capacidade usada em ${formatNumber(adminUsage * 100)}% e corrupção em ${formatNumber(player.administration.corruption * 100)}%.`,
        suggestion: "Priorize tecnologia de administração e reduza expansão imediata.",
        level: adminUsage > 0.95 ? "high" : "medium"
      });
    }

    const highUnrestRegions = Object.keys(state.world.regions)
      .sort()
      .map((regionId) => state.world.regions[regionId])
      .filter((region) => region.ownerId === player.id && region.unrest > 0.45).length;

    if (highUnrestRegions > 0) {
      explainers.push({
        label: "Instabilidade regional",
        reason: `${highUnrestRegions} região(ões) próprias com risco alto de revolta.`,
        suggestion: "Use pacificação e guarnição nas regiões críticas.",
        level: highUnrestRegions >= 3 ? "high" : "medium"
      });
    }

    const strongestRival = Object.keys(player.diplomacy.relations)
      .sort()
      .map((relationId) => player.diplomacy.relations[relationId])
      .reduce((top, relation) => Math.max(top, relation.score.rivalry + relation.score.fear * 0.5), 0);
    const externalThreat = Math.max(player.diplomacy.coalitionThreat, strongestRival);

    if (externalThreat > 0.55) {
      explainers.push({
        label: "Ameaça externa",
        reason: "Rivais e coalizões estão aumentando o risco de guerra.",
        suggestion: "Tente pacto/aliança com vizinhos e fortaleça postura defensiva.",
        level: externalThreat > 0.75 ? "high" : "medium"
      });
    }

    if (explainers.length === 0) {
      explainers.push({
        label: "Situação estável",
        reason: "Nenhum risco sistêmico crítico no momento.",
        suggestion: "Aproveite para acelerar tecnologia e desenvolvimento.",
        level: "low"
      });
    }

    ui.explainList.innerHTML = "";

    for (const explainer of explainers) {
      const item = document.createElement("li");
      item.className = `explain-item risk-${explainer.level}`;
      item.innerHTML = `<strong>${explainer.label}</strong><span>${explainer.reason}</span><small>Sugestão: ${explainer.suggestion}</small>`;
      ui.explainList.appendChild(item);
    }
  }

  function renderRegionInfo(state: GameState): void {
    if (!selectedRegionId) {
      ui.regionInfo.textContent = "Selecione uma região no mapa.";
      ui.regionActions.innerHTML = "";
      return;
    }

    const region = state.world.regions[selectedRegionId];
    const regionDef = staticWorldData.definitions[selectedRegionId];

    if (!region || !regionDef) {
      const label = selectedMapLabel ?? selectedRegionId;
      ui.regionInfo.innerHTML = `
        <div class="summary-grid">
          <span>País</span><strong>${label}</strong>
          <span>Status</span><strong>Fora da campanha inicial</strong>
          <span>Ações</span><strong>Indisponíveis nesta fase</strong>
        </div>
      `;
      ui.regionActions.innerHTML = "";
      return;
    }

    const owner = state.kingdoms[region.ownerId];
    const dominantFaith = staticWorldData.religions[region.dominantFaith];
    const minorityFaith = region.minorityFaith ? staticWorldData.religions[region.minorityFaith] : null;
    const minorityText = region.minorityFaith && typeof region.minorityShare === "number"
      ? `${minorityFaith?.name ?? region.minorityFaith} (${formatNumber(region.minorityShare * 100)}%)`
      : "Sem minoria relevante";

    ui.regionInfo.innerHTML = `
      <div class="summary-grid">
        <span>Nome</span><strong>${regionDef.name}</strong>
        <span>Dono</span><strong>${owner?.name ?? "-"}</strong>
        <span>Fé dominante</span><strong>${dominantFaith?.name ?? region.dominantFaith} (${formatNumber(region.dominantShare * 100)}%)</strong>
        <span>Minoria religiosa</span><strong>${minorityText}</strong>
        <span>Tensão de fé</span><strong>${formatNumber(region.faithUnrest * 100)}%</strong>
        <span>Instabilidade</span><strong>${formatNumber(region.unrest * 100)}%</strong>
        <span>Autonomia</span><strong>${formatNumber(region.autonomy * 100)}%</strong>
        <span>Assimilação</span><strong>${formatNumber(region.assimilation * 100)}%</strong>
        <span>Devastação</span><strong>${formatNumber(region.devastation * 100)}%</strong>
      </div>
    `;

    const actions: Array<{ id: RegionActionType; label: string }> = [
      { id: "invest_agriculture", label: "Investir em agricultura" },
      { id: "invest_infrastructure", label: "Investir em infraestrutura" },
      { id: "garrison", label: "Reforçar guarnição" },
      { id: "pacify", label: "Pacificar" }
    ];

    ui.regionActions.innerHTML = "";

    for (const action of actions) {
      const button = document.createElement("button");
      button.textContent = action.label;
      button.addEventListener("click", () => {
        const result = session.executeRegionAction(selectedRegionId ?? "", action.id);
        showToast(result.message);
      });
      ui.regionActions.appendChild(button);
    }
  }

  function renderGovernmentInputs(state: GameState): void {
    if (isGovernmentFormDirty || isGovernmentInputFocused()) {
      return;
    }

    const player = getPlayerKingdom(state);

    ui.taxInputs.baseRate.value = String(round(player.economy.taxPolicy.baseRate));
    ui.taxInputs.nobleRelief.value = String(round(player.economy.taxPolicy.nobleRelief));
    ui.taxInputs.clergyExemption.value = String(round(player.economy.taxPolicy.clergyExemption));
    ui.taxInputs.tariffRate.value = String(round(player.economy.taxPolicy.tariffRate));

    ui.budgetInputs.economy.value = String(round(player.economy.budgetPriority.economy));
    ui.budgetInputs.military.value = String(round(player.economy.budgetPriority.military));
    ui.budgetInputs.religion.value = String(round(player.economy.budgetPriority.religion));
    ui.budgetInputs.administration.value = String(round(player.economy.budgetPriority.administration));
    ui.budgetInputs.technology.value = String(round(player.economy.budgetPriority.technology));
  }

  function renderTechnologyTree(choices: TechnologyChoice[]): void {
    const nameById = new Map(choices.map((choice) => [choice.id, choice.name] as const));
    ui.techTreeList.innerHTML = "";

    for (const domain of TECH_DOMAIN_ORDER) {
      const rawDomainNodes = choices.filter((choice) => choice.domain === domain);
      const domainNodes = hideCompletedTechnologies
        ? rawDomainNodes.filter((choice) => choice.status !== "unlocked")
        : rawDomainNodes;

      if (domainNodes.length === 0) {
        continue;
      }

      const section = document.createElement("section");
      section.className = "tech-domain-group";

      const heading = document.createElement("h4");
      const completedCount = rawDomainNodes.filter((choice) => choice.status === "unlocked").length;
      heading.textContent = `${techDomainLabel(domain)} (${domainNodes.length} ativos, ${completedCount} concluídas)`;
      section.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "tech-node-grid";

      for (const node of domainNodes) {
        const nodeElement = document.createElement("article");
        nodeElement.className = `tech-node tech-${node.status}${node.isGoal ? " tech-goal" : ""}`;
        const requiredText = node.required.length === 0
          ? "Sem pré-requisitos"
          : node.required.map((requiredId) => nameById.get(requiredId) ?? requiredId).join(", ");

        const goalBadge = node.isGoal ? `<span class="tech-goal-badge">Meta</span>` : "";
        nodeElement.innerHTML = `
          <header class="tech-node-header">
            <strong>${node.name}</strong>
            <span class="tech-status">${techStatusLabel(node.status)}</span>
          </header>
          <div class="tech-node-meta">
            <span>Pesquisa necessária: ${formatNumber(node.cost)}</span>
            <span>Pré-requisitos: ${requiredText}</span>
            ${goalBadge}
          </div>
        `;

        const actions = document.createElement("div");
        actions.className = "tech-node-actions";

        const researchAction = document.createElement("button");
        researchAction.className = "tech-action-btn";
        if (node.status === "available") {
          researchAction.textContent = "Pesquisar agora";
          researchAction.addEventListener("click", () => {
            const result = session.setResearchTarget(node.id);
            showToast(result.message);
          });
        } else if (node.status === "active") {
          researchAction.textContent = "Pesquisa ativa";
          researchAction.disabled = true;
        } else if (node.status === "unlocked") {
          researchAction.textContent = "Concluída";
          researchAction.disabled = true;
        } else {
          researchAction.textContent = "Bloqueada";
          researchAction.disabled = true;
        }

        const goalAction = document.createElement("button");
        goalAction.className = "tech-action-btn";
        if (node.status === "unlocked") {
          goalAction.textContent = "Meta indisponível";
          goalAction.disabled = true;
        } else if (node.isGoal) {
          goalAction.textContent = "Meta ativa";
          goalAction.disabled = true;
        } else {
          goalAction.textContent = "Definir meta";
          goalAction.addEventListener("click", () => {
            const result = session.setResearchGoal(node.id);
            showToast(result.message);
          });
        }

        actions.appendChild(researchAction);
        actions.appendChild(goalAction);
        nodeElement.appendChild(actions);
        grid.appendChild(nodeElement);
      }

      section.appendChild(grid);
      ui.techTreeList.appendChild(section);
    }

    if (ui.techTreeList.childElementCount === 0) {
      const empty = document.createElement("p");
      empty.className = "hint-text";
      empty.textContent = "Nenhuma tecnologia pendente visível com o filtro atual.";
      ui.techTreeList.appendChild(empty);
    }
  }

  function renderTechnology(state: GameState): void {
    const player = getPlayerKingdom(state);
    const choices = session.listTechnologyChoices();
    const activeChoice = choices.find((choice) => choice.id === player.technology.activeResearchId);
    const goalChoice = choices.find((choice) => choice.isGoal);

    ui.techFocusSelect.value = player.technology.researchFocus;
    ui.techAutomationSelect.value = player.administration.automation.technology;
    ui.techHideCompletedToggle.checked = hideCompletedTechnologies;

    ui.techSummary.innerHTML = `
      <span>Pesquisa ativa</span><strong>${activeChoice?.name ?? "-"}</strong>
      <span>Meta tecnológica</span><strong>${goalChoice?.name ?? "-"}</strong>
      <span>Automação</span><strong>${automationLevelLabel(player.administration.automation.technology)}</strong>
      <span>Acúmulo</span><strong>${formatNumber(player.technology.accumulatedResearch)}</strong>
      <span>Taxa</span><strong>${formatNumber(player.technology.researchRate)}</strong>
      <span>Tecnologias desbloqueadas</span><strong>${player.technology.unlocked.length}</strong>
    `;

    renderTechnologyTree(choices, state);
  }

  function createDiplomacyActionButton(targetId: string, actionType: DiplomaticActionType, label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = label;

    button.addEventListener("click", () => {
      const result = session.executeDiplomaticAction(targetId, actionType);
      const chanceText = typeof result.chance === "number" ? ` (chance ${formatNumber(result.chance * 100)}%)` : "";
      showToast(`${result.message}${chanceText}`);
      if (result.ok) {
        setActiveTab("eventos");
      }
    });

    return button;
  }

  function createReligiousActionButton(targetId: string, actionType: ReligiousActionType, label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = label;

    button.addEventListener("click", () => {
      const result = session.executeReligiousAction(targetId, actionType);
      const chanceText = typeof result.chance === "number" ? ` (chance ${formatNumber(result.chance * 100)}%)` : "";
      showToast(`${result.message}${chanceText}`);
      if (result.ok) {
        setActiveTab("eventos");
      }
    });

    return button;
  }

  function renderDiplomacy(state: GameState): void {
    const player = getPlayerKingdom(state);
    const neighborIds = new Set<string>();

    for (const regionId of Object.keys(state.world.regions).sort()) {
      const region = state.world.regions[regionId];
      if (region.ownerId !== player.id) {
        continue;
      }

      const definition = staticWorldData.definitions[regionId];
      for (const neighborRegionId of definition?.neighbors ?? []) {
        const neighborOwner = state.world.regions[neighborRegionId]?.ownerId;
        if (neighborOwner && neighborOwner !== player.id) {
          neighborIds.add(neighborOwner);
        }
      }
    }

    ui.diplomacyList.innerHTML = "";

    if (neighborIds.size === 0) {
      ui.diplomacyList.innerHTML = "<p>Nenhum vizinho diplomático direto no momento.</p>";
      return;
    }

    for (const targetId of Array.from(neighborIds).sort()) {
      const target = state.kingdoms[targetId];
      const relation = player.diplomacy.relations[targetId];

      const row = document.createElement("div");
      row.className = "diplomacy-row";
      row.innerHTML = `
        <div class="summary-grid">
          <span>Reino</span><strong>${target?.name ?? targetId}</strong>
          <span>Confiança</span><strong>${formatNumber((relation?.score.trust ?? 0) * 100)}%</strong>
          <span>Rivalidade</span><strong>${formatNumber((relation?.score.rivalry ?? 0) * 100)}%</strong>
          <span>Agravo</span><strong>${formatNumber((relation?.grievance ?? 0) * 100)}%</strong>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "action-grid diplomacy-actions";

      actions.appendChild(createDiplomacyActionButton(targetId, "alliance", "Aliança"));
      actions.appendChild(createDiplomacyActionButton(targetId, "non_aggression", "Pacto"));
      actions.appendChild(createDiplomacyActionButton(targetId, "peace", "Paz"));
      actions.appendChild(createDiplomacyActionButton(targetId, "tribute", "Tributo"));
      actions.appendChild(createDiplomacyActionButton(targetId, "embargo", "Embargo"));
      actions.appendChild(createDiplomacyActionButton(targetId, "war", "Declarar guerra"));
      actions.appendChild(createReligiousActionButton(targetId, "send_missionaries", "Enviar missionários"));

      row.appendChild(actions);
      ui.diplomacyList.appendChild(row);
    }
  }

  function renderMilitary(state: GameState): void {
    const player = getPlayerKingdom(state);

    const activeWars = Object.keys(state.wars)
      .sort()
      .map((warId) => state.wars[warId])
      .filter((war) => war.attackers.includes(player.id) || war.defenders.includes(player.id));

    const totalManpower = player.military.armies.reduce((sum, army) => sum + army.manpower, 0);

    ui.militarySummary.innerHTML = `
      <div class="summary-grid">
        <span>Postura</span><strong>${player.military.posture}</strong>
        <span>Manpower ativo</span><strong>${formatNumber(totalManpower)}</strong>
        <span>Reserva</span><strong>${formatNumber(player.military.reserveManpower)}</strong>
        <span>Tecnologia militar</span><strong>${formatNumber(player.military.militaryTechLevel)}</strong>
        <span>Guerras ativas</span><strong>${activeWars.length}</strong>
      </div>
    `;

    if (activeWars.length > 0) {
      const list = document.createElement("ul");
      list.className = "list";

      for (const war of activeWars) {
        const item = document.createElement("li");
        item.innerHTML = `<strong>${war.id}</strong><span>War score: ${formatNumber(war.warScore)}</span>`;
        list.appendChild(item);
      }

      ui.militarySummary.appendChild(list);
    }
  }

  function renderEventLog(state: GameState): void {
    ui.eventList.innerHTML = "";

    if (state.events.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Sem eventos recentes.";
      ui.eventList.appendChild(item);
      return;
    }

    for (const event of state.events.slice(0, 30)) {
      const item = document.createElement("li");
      const countText = event.count && event.count > 1 ? ` (x${event.count})` : "";
      const suggestion = event.suggestedAction ? `<small>Sugestão: ${event.suggestedAction}</small>` : "";
      item.className = `event-${event.severity}`;
      item.innerHTML = `<strong>${event.title}${countText}</strong><span>${event.details}</span>${suggestion}<small>${formatDate(event.occurredAt)}</small>`;
      ui.eventList.appendChild(item);
    }
  }

  function buildMapRenderContext(state: GameState): MapRenderContext {
    const contestedRegionIds = new Set<string>();
    const recentlyCapturedRegionIds = new Set<string>();
    const activeWarMarkerRegionIds = new Set<string>();
    const recentCaptureWindowMs = Math.max(30_000, state.meta.tickDurationMs * 24);

    for (const warId of Object.keys(state.wars).sort()) {
      const war = state.wars[warId];

      for (const front of [...war.fronts].sort((left, right) => left.regionId.localeCompare(right.regionId))) {
        contestedRegionIds.add(front.regionId);
        activeWarMarkerRegionIds.add(front.regionId);
      }
    }

    for (const regionId of Object.keys(state.world.regions).sort()) {
      const region = state.world.regions[regionId];
      if (region.unrest > 0.62 || region.devastation > 0.35) {
        contestedRegionIds.add(regionId);
      }
    }

    for (const event of state.events) {
      if (event.occurredAt < state.meta.lastUpdatedAt - recentCaptureWindowMs) {
        continue;
      }
      if (event.groupKey?.startsWith("war.region_captured") && event.regionId) {
        recentlyCapturedRegionIds.add(event.regionId);
      }
    }

    return {
      contestedRegionIds: Array.from(contestedRegionIds).sort(),
      recentlyCapturedRegionIds: Array.from(recentlyCapturedRegionIds).sort(),
      activeWarMarkerRegionIds: Array.from(activeWarMarkerRegionIds).sort(),
      animationClockMs: typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
    };
  }

  async function renderSaveSlots(): Promise<void> {
    const slots = await session.listSaveSlots();
    ui.saveList.innerHTML = "";

    if (slots.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhum save encontrado.";
      ui.saveList.appendChild(empty);
      return;
    }

    for (const slot of slots) {
      ui.saveList.appendChild(buildSaveSlotElement(slot));
    }
  }

  function buildSaveSlotElement(slot: SaveSummary): HTMLElement {
    const item = document.createElement("div");
    item.className = "save-item";

    const metadata = document.createElement("div");
    metadata.className = "save-meta";
    metadata.innerHTML = `
      <strong>${slot.slotId}</strong>
      <span>${slot.playerKingdomName} • Ciclo ${slot.tick}</span>
      <span>${formatDate(slot.savedAt)}</span>
      <span>Territórios: ${slot.territoryCount} | Militar: ${formatNumber(slot.militaryPower)}</span>
    `;

    const loadButton = document.createElement("button");
    loadButton.textContent = "Carregar";
    loadButton.addEventListener("click", async () => {
      try {
        await session.loadSlot(slot.slotId);
        await renderSaveSlots();
        showToast("Save restaurado com sucesso.");
      } catch {
        showToast("Falha ao carregar save.");
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Excluir";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Tem certeza que deseja excluir o save "${slot.slotId}"? Esta ação é irreversível.`)) {
        return;
      }
      try {
        await session.deleteSlot(slot.slotId);
        await renderSaveSlots();
        showToast("Save excluído.");
      } catch (e) {
        console.error("Falha ao excluir save", e);
        showToast("Falha ao excluir o save.");
      }
    });

    item.appendChild(metadata);
    item.appendChild(loadButton);
    item.appendChild(deleteButton);
    return item;
  }

  function renderState(state: GameState): void {
    renderHeader(state);
    renderRuntimeMetrics(session.getRuntimeMetrics());
    renderResources(state);
    renderRiskIndicators(state);
    renderExplainers(state);
    renderRegionInfo(state);
    renderGovernmentInputs(state);
    renderTechnology(state);
    renderDiplomacy(state);
    renderMilitary(state);
    renderEventLog(state);
    mapRenderer.render(state.world, state.kingdoms, buildMapRenderContext(state));
  }

  ui.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab as TabId | undefined;
      if (tab) {
        setActiveTab(tab);
      }
    });
  });

  ui.pauseButton.addEventListener("click", () => {
    session.togglePause();
  });

  ui.speedSelect.addEventListener("change", () => {
    const speed = Number.parseFloat(ui.speedSelect.value);
    session.setSpeed(Number.isFinite(speed) ? speed : 1);
  });

  ui.openSavesButton.addEventListener("click", () => {
    setActiveTab("saves");
  });

  ui.manualSaveButton.addEventListener("click", async () => {
    try {
      await session.saveManual();
      await renderSaveSlots();
      showToast("Save manual concluído.");
    } catch {
      showToast("Falha ao salvar.");
    }
  });

  ui.refreshSavesButton.addEventListener("click", async () => {
    await renderSaveSlots();
    showToast("Lista de saves atualizada.");
  });

  ui.mapLayerSelect.addEventListener("change", () => {
    const layer = ui.mapLayerSelect.value as MapLayerMode;
    const state = session.getState();
    mapRenderer.setLayer(layer);
    mapRenderer.render(state.world, state.kingdoms, buildMapRenderContext(state));
  });

  for (const input of governmentInputs) {
    input.addEventListener("input", () => {
      isGovernmentFormDirty = true;
    });
  }

  ui.governmentApplyButton.addEventListener("click", () => {
    session.updateTaxPolicy({
      baseRate: normalizePercentage(ui.taxInputs.baseRate.value),
      nobleRelief: normalizePercentage(ui.taxInputs.nobleRelief.value),
      clergyExemption: normalizePercentage(ui.taxInputs.clergyExemption.value),
      tariffRate: normalizePercentage(ui.taxInputs.tariffRate.value)
    });

    session.updateBudgetPriority({
      economy: normalizePercentage(ui.budgetInputs.economy.value),
      military: normalizePercentage(ui.budgetInputs.military.value),
      religion: normalizePercentage(ui.budgetInputs.religion.value),
      administration: normalizePercentage(ui.budgetInputs.administration.value),
      technology: normalizePercentage(ui.budgetInputs.technology.value)
    });

    isGovernmentFormDirty = false;
    renderGovernmentInputs(session.getState());
    showToast("Políticas de governo aplicadas.");
  });

  ui.techApplyButton.addEventListener("click", () => {
    const focus = ui.techFocusSelect.value as TechnologyDomain;
    session.setResearchFocus(focus);
    showToast(`Foco de pesquisa atualizado para ${focus}.`);
  });

  ui.techAutomationSelect.addEventListener("change", () => {
    const level = ui.techAutomationSelect.value as AutomationLevel;
    session.setTechnologyAutomation(level);
    showToast(`Automação tecnológica: ${automationLevelLabel(level)}.`);
  });

  ui.techHideCompletedToggle.addEventListener("change", () => {
    hideCompletedTechnologies = ui.techHideCompletedToggle.checked;
    renderTechnology(session.getState());
  });

  ui.techClearGoalButton.addEventListener("click", () => {
    const result = session.setResearchGoal(null);
    showToast(result.message);
  });

  ui.profileSaveButton.addEventListener("click", () => {
    const nextName = ui.profileNameInput.value.trim();
    const nextEmail = ui.profileEmailInput.value.trim();

    if (nextName.length < 2) {
      showToast("Informe um nome de jogador com pelo menos 2 caracteres.");
      return;
    }

    profile = {
      ...profile,
      name: nextName,
      email: nextEmail
    };
    saveLocalProfile(profile);
    syncProfileUi();
    showToast("Perfil local salvo.");
  });

  syncProfileUi();

  const initialState = await session.bootstrap(createInitialState(staticWorldData));
  mapRenderer.setLayer("owner");
  await mapRenderer.mount(initialState.world, initialState.kingdoms);

  session.subscribe((state) => {
    renderState(state);
  });

  await renderSaveSlots();
  session.start();

  window.addEventListener("beforeunload", () => {
    session.stop();
    mapRenderer.destroy();
  });
}

void bootstrapApp().catch((error: unknown) => {
  console.error("Falha ao iniciar aplicação", error);

  const appRoot = document.getElementById("app");
  if (appRoot) {
    appRoot.innerHTML = `
      <main class="app-shell">
        <section class="card">
          <h1>Falha na inicialização</h1>
          <p>Verifique o console do navegador para detalhes.</p>
        </section>
      </main>
    `;
  }
});
