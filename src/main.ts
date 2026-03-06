import "./styles/global.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { createInitialState } from "./application/boot/create-initial-state";
import { GameSession, type DiplomaticActionType, type RegionActionType } from "./application/game-session";
import { TechnologyDomain, type ResourceType } from "./core/models/enums";
import { createDefaultSimulationSystems } from "./core/simulation/create-default-systems";
import type { SaveSummary } from "./core/contracts/game-ports";
import type { GameState, KingdomState } from "./core/models/game-state";
import type { MapLayerMode, MapSelection } from "./infrastructure/rendering/map-renderer";
import { HybridMapRenderer } from "./infrastructure/rendering/hybrid-map-renderer";
import { LocalDiplomacyResolver } from "./infrastructure/diplomacy/local-diplomacy-resolver";
import { RuleBasedNpcDecisionService } from "./infrastructure/npc/rule-based-npc-decision-service";
import {
  IndexedDbCommandLogRepository,
  IndexedDbGameStateRepository,
  IndexedDbSaveRepository,
  IndexedDbSnapshotRepository
} from "./infrastructure/persistence/indexeddb-repositories";
import { BrowserClockService } from "./infrastructure/runtime/browser-clock-service";
import { LocalEventBus } from "./infrastructure/runtime/local-event-bus";
import { LocalWarResolver } from "./infrastructure/war/local-war-resolver";

interface UiRefs {
  tickValue: HTMLElement;
  updatedValue: HTMLElement;
  statusValue: HTMLElement;
  victoryValue: HTMLElement;
  postVictoryValue: HTMLElement;
  pauseButton: HTMLButtonElement;
  speedSelect: HTMLSelectElement;
  manualSaveButton: HTMLButtonElement;
  safetySaveButton: HTMLButtonElement;
  refreshSavesButton: HTMLButtonElement;
  toastArea: HTMLElement;
  mapCanvas: HTMLElement;
  mapLayerSelect: HTMLSelectElement;
  resourceList: HTMLElement;
  riskList: HTMLElement;
  regionInfo: HTMLElement;
  regionActions: HTMLElement;
  governmentApplyButton: HTMLButtonElement;
  budgetInputs: Record<string, HTMLInputElement>;
  taxInputs: Record<string, HTMLInputElement>;
  techFocusSelect: HTMLSelectElement;
  techApplyButton: HTMLButtonElement;
  techSummary: HTMLElement;
  diplomacyList: HTMLElement;
  militarySummary: HTMLElement;
  saveList: HTMLElement;
  eventList: HTMLElement;
  tabButtons: HTMLButtonElement[];
  tabPanels: HTMLElement[];
}

type TabId = "mapa" | "governo" | "diplomacia" | "tecnologia" | "militar" | "eventos" | "saves";

function queryElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Elemento não encontrado: ${selector}`);
  }

  return element as T;
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

function normalizePercentage(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return round(Math.max(0, parsed));
}

async function bootstrapApp(): Promise<void> {
  const appRoot = document.getElementById("app");

  if (!appRoot) {
    throw new Error("Elemento #app não encontrado.");
  }

  document.documentElement.lang = "pt-BR";
  document.title = "Reino Idle Medieval";

  appRoot.innerHTML = `
    <main class="app-shell">
      <header class="app-header card">
        <div class="header-title">
          <h1>Reino Idle Medieval</h1>
          <p>Grand strategy idle local-first com foco em decisões de alto nível.</p>
        </div>
        <div class="status-grid">
          <div><span>Tick</span><strong id="tick-value">0</strong></div>
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
        <button id="manual-save-btn">Salvar manual</button>
        <button id="safety-save-btn">Save de segurança</button>
        <button id="refresh-saves-btn">Atualizar saves</button>
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
              </select>
            </label>
          </div>
          <div id="map-canvas" class="map-canvas"></div>
        </article>

        <aside class="side-column">
          <article class="card">
            <h2>Riscos estratégicos</h2>
            <ul id="risk-list" class="risk-list"></ul>
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
            <button id="tech-apply-btn">Aplicar foco</button>
          </div>
          <div id="tech-summary" class="summary-grid"></div>
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
          <h2>Slots de save</h2>
          <div id="save-list" class="save-list"></div>
        </article>
      </section>
    </main>
  `;

  const ui: UiRefs = {
    tickValue: queryElement(appRoot, "#tick-value"),
    updatedValue: queryElement(appRoot, "#updated-value"),
    statusValue: queryElement(appRoot, "#status-value"),
    victoryValue: queryElement(appRoot, "#victory-value"),
    postVictoryValue: queryElement(appRoot, "#post-victory-value"),
    pauseButton: queryElement(appRoot, "#toggle-pause-btn"),
    speedSelect: queryElement(appRoot, "#speed-select"),
    manualSaveButton: queryElement(appRoot, "#manual-save-btn"),
    safetySaveButton: queryElement(appRoot, "#safety-save-btn"),
    refreshSavesButton: queryElement(appRoot, "#refresh-saves-btn"),
    toastArea: queryElement(appRoot, "#toast-area"),
    mapCanvas: queryElement(appRoot, "#map-canvas"),
    mapLayerSelect: queryElement(appRoot, "#map-layer-select"),
    resourceList: queryElement(appRoot, "#resource-list"),
    riskList: queryElement(appRoot, "#risk-list"),
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
    techApplyButton: queryElement(appRoot, "#tech-apply-btn"),
    techSummary: queryElement(appRoot, "#tech-summary"),
    diplomacyList: queryElement(appRoot, "#diplomacy-list"),
    militarySummary: queryElement(appRoot, "#military-summary"),
    saveList: queryElement(appRoot, "#save-list"),
    eventList: queryElement(appRoot, "#event-list"),
    tabButtons: Array.from(appRoot.querySelectorAll<HTMLButtonElement>(".tab-btn")),
    tabPanels: Array.from(appRoot.querySelectorAll<HTMLElement>(".tab-panel"))
  };

  const resourceLabels: Record<ResourceType, string> = {
    gold: "Ouro",
    food: "Comida",
    wood: "Madeira",
    iron: "Ferro",
    faith: "Fé",
    legitimacy: "Legitimidade"
  };

  let selectedRegionId: string | null = null;
  let selectedMapLabel: string | null = null;
  let toastTimeout: number | null = null;

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

  const eventBus = new LocalEventBus();
  const npcDecisionService = new RuleBasedNpcDecisionService();
  const diplomacyResolver = new LocalDiplomacyResolver();
  const warResolver = new LocalWarResolver();
  const session = new GameSession({
    gameStateRepository: new IndexedDbGameStateRepository(),
    saveRepository: new IndexedDbSaveRepository(),
    commandLogRepository: new IndexedDbCommandLogRepository(),
    snapshotRepository: new IndexedDbSnapshotRepository(),
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
    maxOfflineTicks: 1_800,
    snapshotEveryTicks: 25,
    maxSnapshots: 20
  });

  const mapRenderer = new HybridMapRenderer(ui.mapCanvas, (selection: MapSelection) => {
    selectedRegionId = selection.regionId;
    selectedMapLabel = selection.label ?? selection.regionId;
    renderRegionInfo(session.getState());
    setActiveTab("mapa");
  });

  eventBus.subscribe("victory.achieved", () => {
    showToast("Caminho de vitória alcançado. O império segue em modo contínuo.");
  });

  function renderHeader(state: GameState): void {
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

  function renderResources(state: GameState): void {
    const player = getPlayerKingdom(state);
    ui.resourceList.innerHTML = "";

    for (const resource of Object.keys(resourceLabels) as ResourceType[]) {
      const item = document.createElement("li");
      item.textContent = `${resourceLabels[resource]}: ${formatNumber(player.economy.stock[resource])}`;
      ui.resourceList.appendChild(item);
    }
  }

  function renderRiskIndicators(state: GameState): void {
    const player = getPlayerKingdom(state);
    const ownedRegions = Object.keys(state.world.regions)
      .sort()
      .filter((regionId) => state.world.regions[regionId].ownerId === player.id)
      .map((regionId) => state.world.regions[regionId]);

    const foodNeed = player.population.total / 8_000;
    const famine = foodNeed <= 0 ? 0 : Math.max(0, (foodNeed - player.economy.stock.food) / foodNeed);
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

  function renderRegionInfo(state: GameState): void {
    if (!selectedRegionId) {
      ui.regionInfo.textContent = "Selecione uma região no mapa.";
      ui.regionActions.innerHTML = "";
      return;
    }

    const region = state.world.regions[selectedRegionId];
    const regionDef = state.world.definitions[selectedRegionId];

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

    ui.regionInfo.innerHTML = `
      <div class="summary-grid">
        <span>Nome</span><strong>${regionDef.name}</strong>
        <span>Dono</span><strong>${owner?.name ?? "-"}</strong>
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

  function renderTechnology(state: GameState): void {
    const player = getPlayerKingdom(state);
    ui.techFocusSelect.value = player.technology.researchFocus;

    ui.techSummary.innerHTML = `
      <span>Pesquisa ativa</span><strong>${player.technology.activeResearchId ?? "-"}</strong>
      <span>Acúmulo</span><strong>${formatNumber(player.technology.accumulatedResearch)}</strong>
      <span>Taxa</span><strong>${formatNumber(player.technology.researchRate)}</strong>
      <span>Tecnologias desbloqueadas</span><strong>${player.technology.unlocked.length}</strong>
    `;
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

  function renderDiplomacy(state: GameState): void {
    const player = getPlayerKingdom(state);
    const neighborIds = new Set<string>();

    for (const regionId of Object.keys(state.world.regions).sort()) {
      const region = state.world.regions[regionId];
      if (region.ownerId !== player.id) {
        continue;
      }

      const definition = state.world.definitions[regionId];
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
      <span>${slot.playerKingdomName} • Tick ${slot.tick}</span>
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

    item.appendChild(metadata);
    item.appendChild(loadButton);
    return item;
  }

  function renderState(state: GameState): void {
    renderHeader(state);
    renderResources(state);
    renderRiskIndicators(state);
    renderRegionInfo(state);
    renderGovernmentInputs(state);
    renderTechnology(state);
    renderDiplomacy(state);
    renderMilitary(state);
    renderEventLog(state);
    mapRenderer.render(state.world, state.kingdoms);
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

  ui.manualSaveButton.addEventListener("click", async () => {
    try {
      await session.saveManual();
      await renderSaveSlots();
      showToast("Save manual concluído.");
    } catch {
      showToast("Falha ao salvar.");
    }
  });

  ui.safetySaveButton.addEventListener("click", async () => {
    try {
      await session.saveSafety("ação crítica manual");
      await renderSaveSlots();
      showToast("Save de segurança concluído.");
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
    mapRenderer.setLayer(layer);
    mapRenderer.render(session.getState().world, session.getState().kingdoms);
  });

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

    showToast("Políticas de governo aplicadas.");
  });

  ui.techApplyButton.addEventListener("click", () => {
    const focus = ui.techFocusSelect.value as TechnologyDomain;
    session.setResearchFocus(focus);
    showToast(`Foco de pesquisa atualizado para ${focus}.`);
  });

  const initialState = await session.bootstrap(createInitialState());
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
