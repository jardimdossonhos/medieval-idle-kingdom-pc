import "./styles/global.css";
import { createInitialState } from "./application/boot/create-initial-state";
import { GameSession } from "./application/game-session";
import { createDefaultSimulationSystems } from "./core/simulation/create-default-systems";
import { ResourceType } from "./core/models/enums";
import type { SaveSummary } from "./core/contracts/game-ports";
import type { GameState } from "./core/models/game-state";
import { RuleBasedNpcDecisionService } from "./infrastructure/npc/rule-based-npc-decision-service";
import { IndexedDbGameStateRepository, IndexedDbSaveRepository } from "./infrastructure/persistence/indexeddb-repositories";
import { PixiMapRenderer } from "./infrastructure/rendering/pixi-map-renderer";
import { BrowserClockService } from "./infrastructure/runtime/browser-clock-service";
import { LocalEventBus } from "./infrastructure/runtime/local-event-bus";
import { createTranslator, getLocale, setLocale } from "./ui/i18n";

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
  resourceList: HTMLElement;
  kingdomSummary: HTMLElement;
  regionInfo: HTMLElement;
  saveList: HTMLElement;
  eventList: HTMLElement;
  mapCanvas: HTMLElement;
}

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

async function bootstrapApp(): Promise<void> {
  const appRoot = document.getElementById("app");

  if (!appRoot) {
    throw new Error("Elemento #app não encontrado.");
  }

  const locale = getLocale();
  setLocale(locale);
  const t = createTranslator(locale);

  document.documentElement.lang = locale;
  document.title = t("app.title");

  appRoot.innerHTML = `
    <main class="app-shell">
      <header class="app-header card">
        <div>
          <h1>${t("app.title")}</h1>
          <p>${t("app.subtitle")}</p>
        </div>
        <div class="status-grid">
          <div><span>${t("hud.tick")}</span><strong id="tick-value">0</strong></div>
          <div><span>${t("hud.date")}</span><strong id="updated-value">-</strong></div>
          <div><span>${t("hud.status")}</span><strong id="status-value">${t("hud.statusPaused")}</strong></div>
          <div><span>${t("hud.victory")}</span><strong id="victory-value">${t("hud.victoryNone")}</strong></div>
          <div><span>${t("hud.postVictory")}</span><strong id="post-victory-value">-</strong></div>
        </div>
      </header>

      <section class="control-row card">
        <button id="toggle-pause-btn">${t("hud.pause")}</button>
        <label>
          ${t("hud.speed")}
          <select id="speed-select">
            <option value="0.5">0.5x</option>
            <option value="1" selected>1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </label>
        <button id="manual-save-btn">${t("hud.saveManual")}</button>
        <button id="safety-save-btn">${t("hud.saveSafety")}</button>
        <button id="refresh-saves-btn">${t("hud.reloadSaves")}</button>
        <span id="toast-area" class="toast"></span>
      </section>

      <section class="top-grid">
        <article class="card map-card">
          <h2>${t("hud.map")}</h2>
          <div id="map-canvas" class="map-canvas"></div>
        </article>

        <aside class="side-column">
          <article class="card">
            <h2>${t("hud.regionInfo")}</h2>
            <div id="region-info">${t("hud.noRegionSelected")}</div>
          </article>
          <article class="card">
            <h2>${t("hud.resources")}</h2>
            <ul id="resource-list" class="list compact"></ul>
          </article>
          <article class="card">
            <h2>${t("hud.kingdom")}</h2>
            <div id="kingdom-summary"></div>
          </article>
        </aside>
      </section>

      <section class="bottom-grid">
        <article class="card">
          <h2>${t("hud.saveSlots")}</h2>
          <div id="save-list" class="save-list"></div>
        </article>
        <article class="card">
          <h2>${t("hud.events")}</h2>
          <ul id="event-list" class="list"></ul>
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
    resourceList: queryElement(appRoot, "#resource-list"),
    kingdomSummary: queryElement(appRoot, "#kingdom-summary"),
    regionInfo: queryElement(appRoot, "#region-info"),
    saveList: queryElement(appRoot, "#save-list"),
    eventList: queryElement(appRoot, "#event-list"),
    mapCanvas: queryElement(appRoot, "#map-canvas")
  };

  const resourceLabels = {
    [ResourceType.Gold]: locale === "pt-BR" ? "Ouro" : "Gold",
    [ResourceType.Food]: locale === "pt-BR" ? "Comida" : "Food",
    [ResourceType.Wood]: locale === "pt-BR" ? "Madeira" : "Wood",
    [ResourceType.Iron]: locale === "pt-BR" ? "Ferro" : "Iron",
    [ResourceType.Faith]: locale === "pt-BR" ? "Fé" : "Faith",
    [ResourceType.Legitimacy]: locale === "pt-BR" ? "Legitimidade" : "Legitimacy"
  };

  let selectedRegionId: string | null = null;
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

  const eventBus = new LocalEventBus();
  const npcDecisionService = new RuleBasedNpcDecisionService();
  const session = new GameSession({
    gameStateRepository: new IndexedDbGameStateRepository(),
    saveRepository: new IndexedDbSaveRepository(),
    clock: new BrowserClockService(1_000),
    eventBus,
    systems: createDefaultSimulationSystems(npcDecisionService),
    autosaveEveryTicks: 5,
    maxOfflineTicks: 1_800
  });

  const mapRenderer = new PixiMapRenderer(ui.mapCanvas, (regionId) => {
    selectedRegionId = regionId;
    renderRegionInfo(session.getState());
  });

  eventBus.subscribe("victory.achieved", () => {
    showToast("Caminho de vitória alcançado. O império segue em modo contínuo.");
  });

  function renderResources(state: GameState): void {
    const player = Object.values(state.kingdoms).find((kingdom) => kingdom.isPlayer);
    if (!player) {
      return;
    }

    ui.resourceList.innerHTML = "";

    for (const resource of Object.values(ResourceType)) {
      const li = document.createElement("li");
      li.textContent = `${resourceLabels[resource]}: ${formatNumber(player.economy.stock[resource])}`;
      ui.resourceList.appendChild(li);
    }
  }

  function renderKingdomSummary(state: GameState): void {
    const player = Object.values(state.kingdoms).find((kingdom) => kingdom.isPlayer);
    if (!player) {
      return;
    }

    ui.kingdomSummary.innerHTML = `
      <div class="summary-grid">
        <span>Reino</span><strong>${player.name}</strong>
        <span>Estabilidade</span><strong>${formatNumber(player.stability)}</strong>
        <span>Legitimidade</span><strong>${formatNumber(player.legitimacy)}</strong>
        <span>População</span><strong>${formatNumber(player.population.total)}</strong>
        <span>Capacidade administrativa</span><strong>${formatNumber(player.administration.usedCapacity)} / ${formatNumber(player.administration.adminCapacity)}</strong>
      </div>
    `;
  }

  function renderRegionInfo(state: GameState): void {
    if (!selectedRegionId) {
      ui.regionInfo.textContent = t("hud.noRegionSelected");
      return;
    }

    const region = state.world.regions[selectedRegionId];
    const regionDef = state.world.definitions[selectedRegionId];

    if (!region || !regionDef) {
      ui.regionInfo.textContent = t("hud.noRegionSelected");
      return;
    }

    const owner = state.kingdoms[region.ownerId];

    ui.regionInfo.innerHTML = `
      <div class="summary-grid">
        <span>Nome</span><strong>${regionDef.name}</strong>
        <span>${t("hud.owner")}</span><strong>${owner?.name ?? "-"}</strong>
        <span>${t("hud.unrest")}</span><strong>${formatNumber(region.unrest * 100)}%</strong>
        <span>${t("hud.autonomy")}</span><strong>${formatNumber(region.autonomy * 100)}%</strong>
        <span>${t("hud.assimilation")}</span><strong>${formatNumber(region.assimilation * 100)}%</strong>
      </div>
    `;
  }

  function renderEventLog(state: GameState): void {
    ui.eventList.innerHTML = "";

    if (state.events.length === 0) {
      const item = document.createElement("li");
      item.textContent = t("hud.noEvents");
      ui.eventList.appendChild(item);
      return;
    }

    for (const event of state.events.slice(0, 10)) {
      const item = document.createElement("li");
      item.innerHTML = `<strong>${event.title}</strong><span>${event.details}</span><small>${formatDate(event.occurredAt)}</small>`;
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
    loadButton.textContent = t("hud.load");
    loadButton.addEventListener("click", async () => {
      try {
        await session.loadSlot(slot.slotId);
        await renderSaveSlots();
        showToast(t("toast.recoveredSave"));
      } catch {
        showToast(t("toast.loadFailed"));
      }
    });

    item.appendChild(metadata);
    item.appendChild(loadButton);
    return item;
  }

  function renderState(state: GameState): void {
    ui.tickValue.textContent = String(state.meta.tick);
    ui.updatedValue.textContent = formatDate(state.meta.lastUpdatedAt);
    ui.statusValue.textContent = state.meta.paused ? t("hud.statusPaused") : t("hud.statusRunning");
    ui.pauseButton.textContent = state.meta.paused ? t("hud.resume") : t("hud.pause");
    ui.speedSelect.value = String(state.meta.speedMultiplier);

    ui.victoryValue.textContent = state.victory.achievedPath ?? t("hud.victoryNone");
    ui.postVictoryValue.textContent = state.victory.postVictoryMode
      ? `${formatNumber(state.victory.crisisPressure * 100)}%`
      : "-";

    renderResources(state);
    renderKingdomSummary(state);
    renderRegionInfo(state);
    renderEventLog(state);
    mapRenderer.render(state.world, state.kingdoms);
  }

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
      showToast(t("toast.manualSaved"));
    } catch {
      showToast(t("toast.saveFailed"));
    }
  });

  ui.safetySaveButton.addEventListener("click", async () => {
    try {
      await session.saveSafety("ação crítica manual");
      await renderSaveSlots();
      showToast(t("toast.safetySaved"));
    } catch {
      showToast(t("toast.saveFailed"));
    }
  });

  ui.refreshSavesButton.addEventListener("click", async () => {
    await renderSaveSlots();
    showToast(t("toast.savesReloaded"));
  });

  const initialState = await session.bootstrap(createInitialState());
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
