import "./styles/global.css";
import "maplibre-gl/dist/maplibre-gl.css";
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
import { GodModeConsole } from "./application/god-mode";
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
import { calculateTechnologyBonuses } from "./core/models/technology-effects-service";

// ============================================================================
// SISTEMA DE DIAGNÓSTICO ESTRITO (TELEMETRIA F12)
// ============================================================================
export const Diagnostic = {
  trace: (code: string, message: string, data?: any) => {
    console.log(`%c[${code}]%c ${message}`, "color: #bada55; background: #222; padding: 2px 4px; border-radius: 3px; font-weight: bold;", "color: inherit;", data !== undefined ? data : "");
  },
  system: (code: string, message: string, data?: any) => {
    console.log(`%c[${code}]%c ${message}`, "color: #00e5ff; background: #002233; padding: 2px 4px; border-radius: 3px; font-weight: bold;", "color: inherit;", data !== undefined ? data : "");
  },
  warn: (code: string, message: string, data?: any) => {
    console.warn(`[${code}] ${message}`, data !== undefined ? data : "");
  },
  error: (code: string, message: string, data?: any) => {
    console.error(`[${code}] ${message}`, data !== undefined ? data : "");
  }
};

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
  refreshSavesButton: HTMLButtonElement;
  exitToMenuBtn: HTMLButtonElement;
  toastArea: HTMLElement;
  devTickLastValue: HTMLElement | null;
  devTickAvgValue: HTMLElement | null;
  devOfflineValue: HTMLElement | null;
  mapCanvas: HTMLElement;
  mapLayerSelect: HTMLSelectElement;
  mapLegend: HTMLElement;
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
  appVersion: HTMLElement;
  tabButtons: HTMLButtonElement[];
  tabPanels: HTMLElement[];
  splashScreen: HTMLElement;
  splashContinueBtn: HTMLButtonElement;
  splashNewBtn: HTMLButtonElement;
  splashForm: HTMLElement;
  splashMonarchInput: HTMLInputElement;
  splashCountrySelect: HTMLSelectElement;
  splashStartBtn: HTMLButtonElement;
}

type TabId = "mapa" | "governo" | "diplomacia" | "religiao" | "tecnologia" | "militar" | "eventos" | "saves" | "configuracoes";

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

function formatNumber(value: number, decimals = 0): string {
  const safeValue = decimals === 0 ? Math.floor(value) : value;
  const absValue = Math.abs(safeValue);

  // Compactação de numeração estilo RPG (K, M, B, T) para Late-Game
  if (absValue >= 1_000_000_000_000) {
    return (safeValue / 1_000_000_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "T";
  }
  if (absValue >= 1_000_000_000) {
    return (safeValue / 1_000_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "B";
  }
  if (absValue >= 1_000_000) {
    return (safeValue / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "M";
  }
  if (absValue >= 1_000) {
    return (safeValue / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "K";
  }

  return new Intl.NumberFormat("pt-BR", { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  }).format(safeValue);
}

function formatCalendarTime(tick: number): string {
  // Diluição do tempo: 12 ciclos do Worker = 1 Ano de Simulação
  const year = Math.floor(tick / 12) + 1;
  
  // Futuramente, esta string mudará baseada nas Tecnologias descobertas (Ex: Era do Bronze)
  const eraName = "Era da Aurora"; 
  return `Ano ${formatNumber(year)} (${eraName})`;
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

// Cache de Índice O(1) para abolir o findIndex em arrays de 62k posições
const REGION_INDEX_MAP = new Map<string, number>();
const STATIC_IS_WATER = new Uint8Array(WORLD_DEFINITIONS_V1.length);
const STATIC_BIOME = new Uint8Array(WORLD_DEFINITIONS_V1.length);

for (let i = 0; i < WORLD_DEFINITIONS_V1.length; i++) {
  const def = WORLD_DEFINITIONS_V1[i];
  REGION_INDEX_MAP.set(def.id, i);
  
  // Tradução Data-Oriented: Arrays compactos de 8-bits para transporte ultrarrápido ao Worker
  STATIC_IS_WATER[i] = def.isWater ? 1 : 0;
  switch (def.biome) {
    case "ocean": STATIC_BIOME[i] = 0; break;
    case "desert": STATIC_BIOME[i] = 1; break;
    case "tundra": STATIC_BIOME[i] = 2; break;
    case "temperate": STATIC_BIOME[i] = 3; break;
    case "tropical": STATIC_BIOME[i] = 4; break;
    default: STATIC_BIOME[i] = 0;
  }
}

async function bootstrapApp(): Promise<void> {
  Diagnostic.system("SYS-BOOT", "Iniciando sequência de ignição da Engine (Main Thread)...");

  const appRoot = document.getElementById("app");

  if (!appRoot) {
    throw new Error("Elemento #app não encontrado.");
  }

  document.documentElement.lang = "pt-BR";
  document.title = "Epochs Idle PC";
  const showDevMetrics = import.meta.env.DEV;

  appRoot.innerHTML = `
    <style>
      .splash-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(10, 10, 15, 0.95); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px); }
      .splash-overlay.is-hidden { display: none !important; }
      .splash-card { background: var(--surface-color, #1e1e24); border: 1px solid var(--border-color, #333); padding: 2.5rem; border-radius: 12px; width: 100%; max-width: 450px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
      .splash-card h1 { color: var(--primary-color, #d4af37); margin-bottom: 0.5rem; font-size: 2.2rem; font-family: serif; }
      .splash-actions { display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; }
      .splash-actions button { flex: 1; padding: 0.8rem; font-size: 1.05rem; }
      .splash-form { margin-top: 2rem; text-align: left; animation: fadeIn 0.3s ease; }
      .splash-form hr { border-color: var(--border-color, #333); margin-bottom: 1.5rem; }
      .splash-form label { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.2rem; font-weight: bold; color: #ccc; }
      .splash-form input, .splash-form select { width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color, #444); color: white; border-radius: 4px; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      
      /* Map Legend Styles */
      .map-legend { position: absolute; bottom: 20px; left: 20px; background: rgba(20, 20, 25, 0.9); border: 1px solid var(--border-color, #444); border-radius: 8px; padding: 12px; font-size: 0.85rem; color: #ddd; z-index: 10; pointer-events: none; backdrop-filter: blur(4px); box-shadow: 0 4px 15px rgba(0,0,0,0.6); }
      .map-legend-title { font-weight: bold; margin-bottom: 8px; color: #fff; font-size: 0.95rem; border-bottom: 1px solid #333; padding-bottom: 4px; }
      .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
      .legend-color { width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15); box-sizing: border-box; }
    </style>
    <div id="splash-screen" class="splash-overlay">
      <div class="splash-card card">
        <h1>Epochs Idle PC</h1>
        <p style="color: #aaa;">A forja de um novo império aguarda o seu comando.</p>
        <div class="splash-actions">
          <button id="splash-continue-btn" class="primary" style="display: none;">Continuar Jornada</button>
          <button id="splash-new-btn">Nova Campanha</button>
        </div>
        <div id="splash-form" class="splash-form is-hidden">
          <hr />
          <h3 style="margin-bottom: 1rem; text-align: center;">Fundar Novo Império</h3>
          <label>Nome do Monarca
            <input id="splash-monarch" type="text" value="${loadLocalProfile().name || 'Soberano'}" maxlength="30">
          </label>
          <label>Nação Inicial
            <select id="splash-country"></select>
          </label>
          <button id="splash-start-btn" class="primary" style="width: 100%; margin-top: 0.5rem; font-size: 1.1rem; padding: 0.8rem;">Fundar Império</button>
        </div>
      </div>
    </div>

    <main class="app-shell">
      <header class="app-header card">
        <div class="header-title">
          <h1>Epochs Idle PC <span id="app-version" style="font-size: 14px; color: #666; font-weight: normal; user-select: none;">v0.1.0</span></h1>
          <p>Grand strategy idle local-first com foco em decisões de alto nível.</p>
        </div>
        <div class="status-grid">
          <div><span>Jogador</span><strong id="player-value">-</strong></div>
          <div><span>Época</span><strong id="tick-value">Ano 1</strong></div>
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
            <option value="5">5x</option>
            <option value="10">10x</option>
          </select>
        </label>
        <button id="open-saves-btn">Menu de saves</button>
        <span id="toast-area" class="toast"></span>
      </section>

      <section class="map-workspace">
        <article class="card map-card" style="display: flex; flex-direction: column;">
          <div class="map-toolbar">
            <h2>Mapa estratégico</h2>
            <label>
              Camada
              <select id="map-layer-select">
                <option value="owner" selected>Domínio</option>
                <option value="unrest">Instabilidade</option>
                <option value="war">Contestado/Guerra</option>
                <option value="religion">Religião</option>
                <option value="diplomacy">Diplomacia (Jogador)</option>
                <option value="economy">Economia (Ouro)</option>
              </select>
            </label>
          </div>
          <p class="map-hint">Use scroll/pinch para zoom e arraste para mover o mapa.</p>
          <div style="position: relative; flex: 1; min-height: 450px; display: flex; flex-direction: column; border-radius: 6px; overflow: hidden;">
            <div id="map-canvas" class="map-canvas" style="flex: 1; width: 100%;"></div>
            <div id="map-legend" class="map-legend"></div>
          </div>
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
        <button class="tab-btn" data-tab="religiao">Religião</button>
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
            <label>Taxa base (%) <input id="tax-base" type="number" min="5" max="60" step="1"></label>
            <label>Alívio nobre (%) <input id="tax-noble" type="number" min="0" max="40" step="1"></label>
            <label>Isenção clero (%) <input id="tax-clergy" type="number" min="0" max="40" step="1"></label>
            <label>Tarifa comercial (%) <input id="tax-tariff" type="number" min="0" max="50" step="1"></label>
          </div>
          <p class="hint-text" style="grid-column: 1 / -1; margin-top: 0.5rem; margin-bottom: 1.5rem;">
            Valores em porcentagem (%). Taxas altas aumentam a arrecadação de ouro significativamente, mas elevam o risco de revoltas populares.
          </p>
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

        <article class="card tab-panel is-hidden" data-tab-panel="religiao">
          <h2>Fé e Poderes Divinos</h2>
          <p>O acúmulo de Fé permite canalizar milagres que transcendem a lógica mortal, afetando diretamente a malha do mundo (Motor Físico).</p>
          <div class="summary-grid">
            <span>Fé Disponível</span><strong id="faith-pool-value">0</strong>
          </div>
          <div class="action-grid" style="margin-top: 15px;">
            <button id="btn-bless-crops" style="background: #002200; border-color: #00ff00; color: #00ff00;">Bênção da Colheita (-500 Fé)</button>
            <button id="btn-smite-rebels" style="background: #220000; border-color: #ff3333; color: #ff3333;">Expurgo (Em breve)</button>
          </div>
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
            <button id="exit-to-menu-btn" class="danger" style="margin-left: auto;">Sair para o Menu</button>
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
            <span>Tempo da simulação</span><strong>12 ciclos = 1 Ano Histórico</strong>
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
    exitToMenuBtn: queryElement(appRoot, "#exit-to-menu-btn"),
    toastArea: queryElement(appRoot, "#toast-area"),
    devTickLastValue: queryOptionalElement(appRoot, "#dev-tick-last"),
    devTickAvgValue: queryOptionalElement(appRoot, "#dev-tick-avg"),
    devOfflineValue: queryOptionalElement(appRoot, "#dev-offline"),
    mapCanvas: queryElement(appRoot, "#map-canvas"),
    mapLayerSelect: queryElement(appRoot, "#map-layer-select"),
    mapLegend: queryElement(appRoot, "#map-legend"),
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
    appVersion: queryElement(appRoot, "#app-version"),
    tabButtons: Array.from(appRoot.querySelectorAll<HTMLButtonElement>(".tab-btn")),
    tabPanels: Array.from(appRoot.querySelectorAll<HTMLElement>(".tab-panel")),
    splashScreen: queryElement(appRoot, "#splash-screen"),
    splashContinueBtn: queryElement(appRoot, "#splash-continue-btn"),
    splashNewBtn: queryElement(appRoot, "#splash-new-btn"),
    splashForm: queryElement(appRoot, "#splash-form"),
    splashMonarchInput: queryElement(appRoot, "#splash-monarch"),
    splashCountrySelect: queryElement(appRoot, "#splash-country"),
    splashStartBtn: queryElement(appRoot, "#splash-start-btn")
  };

  const simulationWorker = new Worker(
    new URL("./infrastructure/worker/simulation.worker.ts", import.meta.url),
    { type: "module" }
  );
  
  // Interceptador O(1) de Tráfego de Saída (Main -> Worker)
  const originalWorkerPost = simulationWorker.postMessage.bind(simulationWorker);
  simulationWorker.postMessage = (msg: any) => {
    if (msg.type !== "SET_TIME_SCALE" && msg.type !== "START" && msg.type !== "STOP" && msg.type !== "UPDATE_MODIFIERS") {
      Diagnostic.trace("WRK-TX", `Ordem enviada ao Motor Físico: ${msg.type}`, msg.type === "RESTORE_ECS_STATE" ? "[Matrizes ECS Omitidas por Performance]" : msg.payload);
    }
    originalWorkerPost(msg);
  };

  simulationWorker.onmessage = (event: MessageEvent) => {
    if (Date.now() < ignoreWorkerTicksUntil) {
      return; // Descarta ticks fantasmas/velhos gerados antes do carregamento
    }

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
    if (data?.type === "TICK" || data?.type === "INITIAL_STATE") {
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
          gold: payload.goldData ?? new Float64Array(),
          food: payload.foodData ?? new Float64Array(),
          wood: payload.woodData ?? new Float64Array(),
          iron: payload.ironData ?? new Float64Array(),
          faith: payload.faithData ?? new Float64Array(),
          legitimacy: payload.legitimacyData ?? new Float64Array(),
          populationTotal: payload.populationTotalData ?? new Float64Array(),
          populationGrowthRate: payload.populationGrowthRateData ?? new Float64Array()
        });
      }

      updateUIPanel();
    } else {
      Diagnostic.trace("WRK-RX", `Resposta recebida do Motor Físico: ${data?.type}`, data?.payload);
    }
  };

  const totalCountries = WORLD_DEFINITIONS_V1.length;
  simulationWorker.postMessage({ 
    type: "INIT" as const, 
    payload: { entityCount: totalCountries, isWaterData: STATIC_IS_WATER, biomeData: STATIC_BIOME } 
  });

  // Impede o travamento do DOM listando apenas as 300 regiões de terra com maior valor estratégico
  const playableDefs = WORLD_DEFINITIONS_V1
    .filter(def => !def.isWater)
    .sort((a, b) => (b.economyValue + b.strategicValue) - (a.economyValue + a.strategicValue))
    .slice(0, 300);
    
  for (const def of playableDefs) {
    const opt = document.createElement("option");
    opt.value = def.id;
    opt.textContent = `${def.name} (Riqueza Eco: ${def.economyValue})`;
    ui.splashCountrySelect.appendChild(opt);
  }

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

  let profile = loadLocalProfile();
  
  const activeCampaignId = `campaign:${profile.id}`;
  const staticWorldData = createStaticWorldData();
  const eventBus = new LocalEventBus();
  const npcDecisionService = new RuleBasedNpcDecisionService();
  const diplomacyResolver = new LocalDiplomacyResolver();
  const warResolver = new LocalWarResolver(staticWorldData);
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
      warResolver,
      eventBus,
      staticData: staticWorldData
    }),
    autosaveEveryTicks: 5,
    maxOfflineTicks: 12_000,
    snapshotEveryTicks: 25,
    maxSnapshots: 20
  });

  let selectedRegionId: string | null = null;
  let selectedMapLabel: string | null = null;
  let toastTimeout: number | null = null;
  let isGovernmentFormDirty = false;
  let hideCompletedTechnologies = true;
  let ignoreWorkerTicksUntil = 0;
  let currentWorkerSpeed = 1;
  let currentWorkerPaused = false;
  
  let playerFaithCache = 0;

  // CACHE DE TERRITÓRIO: Evita varrer 62.400 regiões múltiplas vezes por segundo
  let cachedPlayerRegionIndices: number[] | null = null;

  function getPlayerRegionIndicesCached(state: GameState, player: KingdomState): number[] {
    if (cachedPlayerRegionIndices !== null) {
      return cachedPlayerRegionIndices;
    }
    
    cachedPlayerRegionIndices = [];
    for (const regionId in state.world.regions) {
      if (state.world.regions[regionId].ownerId === player.id) {
        const idx = REGION_INDEX_MAP.get(regionId);
        if (idx !== undefined) cachedPlayerRegionIndices.push(idx);
      }
    }
    return cachedPlayerRegionIndices;
  }

  // Extrai índices geográficos dinâmicos para aplicar efeitos em qualquer nação (Player ou NPC)
  function getKingdomRegionIndices(state: GameState, kingdomId: string): number[] {
    const indices: number[] = [];
    for (const regionId in state.world.regions) {
      if (state.world.regions[regionId].ownerId === kingdomId) {
        const idx = REGION_INDEX_MAP.get(regionId);
        if (idx !== undefined) indices.push(idx);
      }
    }
    return indices;
  }

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

  // FAGULHA VITAL 3.0: Compila e despacha a soma de todos os bônus tecnológicos para o Motor Matemático
  function syncModifiersToWorker(state: GameState): void {
    const expectedLength = WORLD_DEFINITIONS_V1.length;
    const modifiers: Record<string, Float64Array> = {
      "economy.food_production_multiplier": new Float64Array(expectedLength),
      "economy.tax_income_multiplier": new Float64Array(expectedLength),
      "population.growth_rate_multiplier": new Float64Array(expectedLength),
      "population.carrying_capacity_multiplier": new Float64Array(expectedLength),
    };

    const kingdomBonuses = new Map<string, Map<string, number>>();
    for (const kingdomId in state.kingdoms) {
      kingdomBonuses.set(kingdomId, calculateTechnologyBonuses(state.kingdoms[kingdomId].technology));
    }

    // Roteia cada Bônus Nacional para as células geográficas que ele governa O(N)
    for (let i = 0; i < expectedLength; i++) {
      const regionId = WORLD_DEFINITIONS_V1[i].id;
      const ownerId = state.world.regions[regionId]?.ownerId;
      if (ownerId) {
        const bonuses = kingdomBonuses.get(ownerId);
        if (bonuses) {
          modifiers["economy.food_production_multiplier"][i] = bonuses.get("economy.food_production_multiplier") ?? 0;
          modifiers["economy.tax_income_multiplier"][i] = bonuses.get("economy.tax_income_multiplier") ?? 0;
          modifiers["population.growth_rate_multiplier"][i] = bonuses.get("population.growth_rate_multiplier") ?? 0;
          modifiers["population.carrying_capacity_multiplier"][i] = bonuses.get("population.carrying_capacity_multiplier") ?? 0;
        }
      }
    }

    simulationWorker.postMessage({ type: "UPDATE_MODIFIERS", payload: modifiers });
  }

  // Efeito Visual de Feedback (Animação de Pulso de Cores)
  function flashUIElement(el: HTMLElement | null, color: string) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.color = color;
    el.style.textShadow = `0 0 10px ${color}`;
    // Força o reflow do DOM para garantir que a transição comece de imediato
    void el.offsetWidth;
    el.style.transition = 'color 1.2s ease-out, text-shadow 1.2s ease-out';
    el.style.color = '';
    el.style.textShadow = '';
  }

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
  
  // highlight-start
  // Envia o estado do ECS para o worker quando um jogo é carregado
  eventBus.subscribe("game.loaded", (event: any) => {
    // Suporta tanto a injeção antiga quanto o objeto de DomainEvent nativo
    const state = (event.payload || event) as GameState;
    
    const len = WORLD_DEFINITIONS_V1.length;

    // FAGULHA VITAL 2.0: Proteção contra saves mortos (Ausentes ou População Zerada)
    if (!state.ecs) {
      state.ecs = {
        gold: Array.from(new Float64Array(len).fill(500)) as any,
        food: Array.from(new Float64Array(len).fill(1000)) as any,
        wood: Array.from(new Float64Array(len).fill(500)) as any,
        iron: Array.from(new Float64Array(len).fill(100)) as any,
        faith: Array.from(new Float64Array(len).fill(50)) as any,
        legitimacy: Array.from(new Float64Array(len).fill(50)) as any,
        populationTotal: Array.from(new Float64Array(len).fill(5000)) as any,
        populationGrowthRate: Array.from(new Float64Array(len).fill(0.00015)) as any
      };
    } else {
      // Vacina: Se o save veio com População morta (artefato de testes antigos), revive o mundo
      const pop = state.ecs.populationTotal as any;
      let isWorldDead = true;
      
      if (pop && pop.length > 0) {
        for (let i = 0; i < Math.min(pop.length, len); i++) {
          if (pop[i] > 0) {
            isWorldDead = false;
            break;
          }
        }
      }

      if (isWorldDead) {
        Diagnostic.warn("PERS-003", "Fagulha Vital: Save antigo corrompido detectado (Mundo Morto). Injetando sobreviventes apenas em terra firme.");
        const safePop = new Float64Array(len);
        const safeGrowth = new Float64Array(len);
        for (let i = 0; i < len; i++) {
          if (STATIC_IS_WATER[i] === 0) {
            safePop[i] = 5000;
            safeGrowth[i] = 0.00015;
          }
        }
        state.ecs.populationTotal = Array.from(safePop) as any;
        state.ecs.populationGrowthRate = Array.from(safeGrowth) as any;
      }
    }

    if (state.ecs) {
      const expectedLength = WORLD_DEFINITIONS_V1.length;
      const toFloat = (data: any) => {
        const arr = new Float64Array(expectedLength);
        if (!data) return arr;

        if (data instanceof Float64Array || Array.isArray(data)) {
          const limit = Math.min(data.length, expectedLength);
          for (let i = 0; i < limit; i++) {
            arr[i] = data[i] || 0;
          }
          return arr;
        }

        if (typeof data === 'object') {
          for (let i = 0; i < expectedLength; i++) {
            arr[i] = data[i] || 0;
          }
        }
        return arr;
      };
      
      // Evita race conditions pausando o worker durante a restauração
      simulationWorker.postMessage({ type: "STOP" });
      simulationWorker.postMessage({ 
        type: "INIT", 
        payload: { entityCount: expectedLength, isWaterData: STATIC_IS_WATER, biomeData: STATIC_BIOME } 
      });
      
      const payload = {
        gold: toFloat(state.ecs.gold),
        food: toFloat(state.ecs.food),
        wood: toFloat(state.ecs.wood),
        iron: toFloat(state.ecs.iron),
        faith: toFloat(state.ecs.faith),
        legitimacy: toFloat(state.ecs.legitimacy),
        populationTotal: toFloat(state.ecs.populationTotal),
        populationGrowthRate: toFloat(state.ecs.populationGrowthRate),
        
        // Duplicado com sufixo Data para garantir compatibilidade com diferentes versões do Worker
        goldData: toFloat(state.ecs.gold),
        foodData: toFloat(state.ecs.food),
        woodData: toFloat(state.ecs.wood),
        ironData: toFloat(state.ecs.iron),
        faithData: toFloat(state.ecs.faith),
        legitimacyData: toFloat(state.ecs.legitimacy),
        populationTotalData: toFloat(state.ecs.populationTotal),
        populationGrowthRateData: toFloat(state.ecs.populationGrowthRate),
      };

      simulationWorker.postMessage({ type: "RESTORE_ECS_STATE", payload });
      syncModifiersToWorker(state); // Injeta a tecnologia no carregamento do Save
      simulationWorker.postMessage({ type: "START" });

      ignoreWorkerTicksUntil = Date.now() + 500;

      currentSimulationState.goldData = payload.gold;
      currentSimulationState.foodData = payload.food;
      currentSimulationState.woodData = payload.wood;
      currentSimulationState.ironData = payload.iron;
      currentSimulationState.faithData = payload.faith;
      currentSimulationState.legitimacyData = payload.legitimacy;
      currentSimulationState.populationTotalData = payload.populationTotal;
      currentSimulationState.populationGrowthRateData = payload.populationGrowthRate;
      
      playerFaithCache = getPlayerTotalResource(state, ResourceType.Faith);

      updateUIPanel();
    }
  });

  // Evento assíncrono caso uma nova região seja capturada via guerra e necessite de recálculo
  eventBus.subscribe("war.region_captured", () => {
    const state = session.getState();
    if (state) syncModifiersToWorker(state);
  });

  // ALVO B: Ouve eventos da simulação POO e dispara danos instantâneos na Memória ECS (Desastres)
  eventBus.subscribe("disaster.plague", (event: any) => {
    const state = session.getState();
    if (!state) return;
    const kingdomId = event.payload?.actorKingdomId || event.actorKingdomId;
    const indices = getKingdomRegionIndices(state, kingdomId);
    if (indices.length === 0) return;
    simulationWorker.postMessage({
      type: "APPLY_ECS_EFFECTS",
      payload: { target: "population", operation: "subtract", value: 1000, indices }
    });
  });

  eventBus.subscribe("disaster.drought", (event: any) => {
    const state = session.getState();
    if (!state) return;
    const kingdomId = event.payload?.actorKingdomId || event.actorKingdomId;
    const indices = getKingdomRegionIndices(state, kingdomId);
    if (indices.length === 0) return;
    simulationWorker.postMessage({
      type: "APPLY_ECS_EFFECTS",
      payload: { target: "food", operation: "subtract", value: 2000, indices }
    });
  });

  // Escuta os poderes divinos POO e aplica o benefício nas matrizes ECS
  eventBus.subscribe("religion.blessing", (event: any) => {
    const state = session.getState();
    if (!state) return;
    const kingdomId = event.payload.kingdomId || event.kingdomId;
    const indices = getKingdomRegionIndices(state, kingdomId);
    if (indices.length === 0) return;

    simulationWorker.postMessage({
      type: "APPLY_ECS_EFFECTS",
      payload: { 
        target: "food", 
        operation: "add_empire_total", 
        value: event.payload.amount, 
        indices
      }
    });
    const foodEl = ui.resourceList.querySelector<HTMLLIElement>(`li[data-resource="food"]`);
    flashUIElement(foodEl, "#00ff00");
    showToast(`As colheitas de ${state.kingdoms[kingdomId]?.name} florescem (+${formatNumber(event.payload.amount)} Comida)!`);
  });

  // Escuta as Ordens Sociais (Migração Orgânica) e converte em mutações de Worker
  eventBus.subscribe("population.migration", (event: any) => {
    const state = session.getState();
    if (!state) return;
    const { sourceId, targetId, amount, kingdomId } = event.payload;
    const sourceIdx = REGION_INDEX_MAP.get(sourceId);
    const targetIdx = REGION_INDEX_MAP.get(targetId);

    if (sourceIdx !== undefined && targetIdx !== undefined) {
      // O trânsito atômico exige dedução da origem e injeção no alvo
      simulationWorker.postMessage({
        type: "APPLY_ECS_EFFECTS",
        payload: { target: "population", operation: "subtract", value: amount, indices: [sourceIdx] }
      });
      simulationWorker.postMessage({
        type: "APPLY_ECS_EFFECTS",
        payload: { target: "population", operation: "add", value: amount, indices: [targetIdx] }
      });

      // Atualiza o Motor com as capacidades geográficas da nova região
      syncModifiersToWorker(state);

      // Log narrativo se for a sua civilização que migrou
      if (state.kingdoms[kingdomId]?.isPlayer) {
        const def = staticWorldData.definitions[targetId];
        state.events.unshift({
          id: `mig_${state.meta.tick}_${targetId}`,
          title: "Expansão Tribal Orgânica",
          details: `O excesso populacional transbordou as fronteiras, assentando os nossos nômades na região de ${def?.name ?? targetId}.`,
          severity: "info",
          occurredAt: Date.now()
        });
        if (state.events.length > 50) state.events.pop(); // Limpeza de Memória
      }
    }
  });

  // highlight-end
  const mapRenderer = new HybridMapRenderer(ui.mapCanvas, staticWorldData, (selection: MapSelection) => {
    selectedRegionId = selection.regionId;
    selectedMapLabel = selection.label ?? selection.regionId;

    renderRegionInfo(session.getState());
    setActiveTab("mapa");
    updateUIPanel();
  });

  eventBus.subscribe("victory.achieved", () => {
    showToast("Caminho de vitória alcançado. O império segue em modo contínuo.");
  });

  function renderHeader(state: GameState): void {
    ui.playerValue.textContent = profile.name;
    ui.tickValue.textContent = formatCalendarTime(state.meta.tick);
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

    ui.devTickLastValue.textContent = formatNumber(metrics.tickMsLast, 2);
    ui.devTickAvgValue.textContent = formatNumber(metrics.tickMsAverage, 2);
    ui.devOfflineValue.textContent = `${formatNumber(metrics.offlineCatchUpMs, 2)} ms / ${metrics.offlineTicks} ticks`;
  }

  function renderResources(): void {
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
    
    const playerRegionIndices = getPlayerRegionIndicesCached(state, player);

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

      if (resource === ResourceType.Faith) playerFaithCache = total;

      const item = ui.resourceList.querySelector<HTMLLIElement>(`li[data-resource="${resource}"]`);
      if (item) {
        item.textContent = `${resourceLabels[resource]}: ${formatNumber(totals[resource])}`;
      }
    }

    const faithEl = appRoot!.querySelector("#faith-pool-value");
    if (faithEl) {
      faithEl.textContent = formatNumber(playerFaithCache);
    }
  }

  function getPlayerTotalPopulation(state: GameState): number {
    const player = getPlayerKingdom(state);
    
    const playerRegionIndices = getPlayerRegionIndicesCached(state, player);

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
    
    const playerRegionIndices = getPlayerRegionIndicesCached(state, player);

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
    
    const ownedRegions = [];
    for (const regionId in state.world.regions) {
      const region = state.world.regions[regionId];
      if (region.ownerId === player.id) ownedRegions.push(region);
    }

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

    let highUnrestRegions = 0;
    for (const regionId in state.world.regions) {
      const region = state.world.regions[regionId];
      if (region.ownerId === player.id && region.unrest > 0.45) {
        highUnrestRegions++;
      }
    }

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

    const player = getPlayerKingdom(state);
    const owner = state.kingdoms[region.ownerId];
    const isPlayer = owner?.isPlayer;
    const ownerName = owner ? `${owner.name}${isPlayer ? " (Você)" : ""}` : "-";
    const dominantFaith = staticWorldData.religions[region.dominantFaith];
    const minorityFaith = region.minorityFaith ? staticWorldData.religions[region.minorityFaith] : null;
    const minorityText = region.minorityFaith && typeof region.minorityShare === "number"
      ? `${minorityFaith?.name ?? region.minorityFaith} (${formatNumber(region.minorityShare * 100)}%)`
      : "Sem minoria relevante";

    // Tradução e mapeamento de dados do Bioma
    const biomeLabels: Record<string, string> = { ocean: "Oceano", desert: "Deserto", tundra: "Tundra", temperate: "Temperado", tropical: "Tropical" };
    const biomeCapacity: Record<string, number> = { ocean: 0, desert: 50, tundra: 20, temperate: 250, tropical: 150 };
    const regionBiomeLabel = biomeLabels[regionDef.biome] ?? "Desconhecido";
    const baseCapacity = biomeCapacity[regionDef.biome] ?? 0;

    // Extração populacional local (do ECS)
    const regionIndex = REGION_INDEX_MAP.get(selectedRegionId);
    const currentPop = (regionIndex !== undefined && currentSimulationState.populationTotalData) 
      ? currentSimulationState.populationTotalData[regionIndex] 
      : 0;

    ui.regionInfo.innerHTML = `
      <div class="summary-grid">
        <span>Nome</span><strong>${regionDef.name}</strong>
        <span>Dono</span><strong>${ownerName}</strong>
        <span>Bioma</span><strong>${regionBiomeLabel}</strong>
        <span>População</span><strong>${formatNumber(currentPop)} / ${formatNumber(baseCapacity)} (Máx. Natural)</strong>
        <span>Fé dominante</span><strong>${dominantFaith?.name ?? region.dominantFaith} (${formatNumber(region.dominantShare * 100)}%)</strong>
        <span>Minoria religiosa</span><strong>${minorityText}</strong>
        <span>Tensão de fé</span><strong>${formatNumber(region.faithUnrest * 100)}%</strong>
        <span>Instabilidade</span><strong>${formatNumber(region.unrest * 100)}%</strong>
        <span>Autonomia</span><strong>${formatNumber(region.autonomy * 100)}%</strong>
        <span>Assimilação</span><strong>${formatNumber(region.assimilation * 100)}%</strong>
        <span>Devastação</span><strong>${formatNumber(region.devastation * 100)}%</strong>
      </div>
    `;

    ui.regionActions.innerHTML = "";

    if (isPlayer) {
      const actions: Array<{ id: RegionActionType; label: string }> = [
        { id: "invest_agriculture", label: "Investir em agricultura" },
        { id: "invest_infrastructure", label: "Investir em infraestrutura" },
        { id: "garrison", label: "Reforçar guarnição" },
        { id: "pacify", label: "Pacificar" }
      ];

      if (region.regionId !== owner.capitalRegionId) {
        actions.push({ id: "change_capital", label: "Mudar Sede (Tornar Capital)" });
      }

      for (const action of actions) {
        const config = session.getRegionActionConfig(action.id);
        const costStrings = Object.entries(config.cost).map(([res, val]) => `${val} ${resourceLabels[res as ResourceType]}`);

        const button = document.createElement("button");
        button.innerHTML = `<span>${action.label}</span><small style="display:block; font-size:0.75em; color:#bbb; margin-top:2px;">Custo: ${costStrings.join(", ")}</small>`;
        button.addEventListener("click", () => {
          const result = session.executeRegionAction(selectedRegionId ?? "", action.id);
          showToast(result.message);
        });
        ui.regionActions.appendChild(button);
      }
    } else if (region.ownerId === "k_nature") {
      const isAdjacent = regionDef.neighbors.some(nid => state.world.regions[nid]?.ownerId === player.id);
      
      const config = session.getRegionActionConfig("colonize");
      const costStrings = Object.entries(config.cost).map(([res, val]) => `${val} ${resourceLabels[res as ResourceType]}`);

      const button = document.createElement("button");
      button.className = "primary";
      button.innerHTML = `<span>${config.label}</span><small style="display:block; font-size:0.75em; color:#bbb; margin-top:2px;">Custo: ${costStrings.join(", ")} | -50 População da Capital</small>`;
      
      if (!isAdjacent) {
        button.disabled = true;
        button.innerHTML += `<small style="display:block; font-size:0.75em; color:#ff5555; margin-top:2px;">Requer fronteira vizinha</small>`;
      }

      button.addEventListener("click", () => {
        const result = session.executeRegionAction(selectedRegionId ?? "", "colonize");
        showToast(result.message);
      });
      ui.regionActions.appendChild(button);
    } else {
      const targetId = region.ownerId;
      
      const warConfig = session.getDiplomaticConfig(state, player.id, targetId, "war");
      const warCostStrings = Object.entries(warConfig.cost).map(([res, val]) => `${val} ${resourceLabels[res as ResourceType]}`);
      const warBtn = document.createElement("button");
      warBtn.className = "danger";
      warBtn.innerHTML = `<span>Declarar Guerra</span><small style="display:block; font-size:0.75em; color:#bbb; margin-top:2px;">Custo: ${warCostStrings.join(", ")}</small><small style="display:block; font-size:0.75em; color:#bbb; margin-top:2px;">Chance de Sucesso na Corte: ${formatNumber(warConfig.chance * 100)}%</small>`;
      warBtn.addEventListener("click", () => {
        const result = session.executeDiplomaticAction(targetId, "war");
        showToast(result.message);
      });
      ui.regionActions.appendChild(warBtn);

      const relConfig = session.getReligiousActionConfig(player.id, targetId, "send_missionaries");
      const relCostStrings = Object.entries(relConfig.cost).map(([res, val]) => `${val} ${resourceLabels[res as ResourceType]}`);
      const relBtn = document.createElement("button");
      relBtn.innerHTML = `<span>Enviar Missionários</span><small style="display:block; font-size:0.75em; color:#bbb; margin-top:2px;">Custo: ${relCostStrings.join(", ")}</small><small style="display:block; font-size:0.75em; color:#bbb; margin-top:2px;">Chance de Sucesso: ${formatNumber(relConfig.chance * 100)}%</small>`;
      relBtn.addEventListener("click", () => {
        const result = session.executeReligiousAction(targetId, "send_missionaries");
        showToast(result.message);
      });
      ui.regionActions.appendChild(relBtn);
    }
  }

  function renderGovernmentInputs(state: GameState): void {
    if (isGovernmentFormDirty || isGovernmentInputFocused()) {
      return;
    }

    const player = getPlayerKingdom(state);

    ui.taxInputs.baseRate.value = String(round(player.economy.taxPolicy.baseRate * 100, 0));
    ui.taxInputs.nobleRelief.value = String(round(player.economy.taxPolicy.nobleRelief * 100, 0));
    ui.taxInputs.clergyExemption.value = String(round(player.economy.taxPolicy.clergyExemption * 100, 0));
    ui.taxInputs.tariffRate.value = String(round(player.economy.taxPolicy.tariffRate * 100, 0));

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
      <span>Tecnologias desbloqueadas</span><strong>${player.technology.unlocked.length}</strong>
    `;

    renderTechnologyTree(choices);
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

    for (const regionId in state.world.regions) {
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
    const playerAlliedRegionIds = new Set<string>();
    const playerEnemyRegionIds = new Set<string>();
    const regionWealthRatio: Record<string, number> = {};
    const recentCaptureWindowMs = Math.max(30_000, state.meta.tickDurationMs * 24);

    for (const warId of Object.keys(state.wars).sort()) {
      const war = state.wars[warId];

      for (const front of [...war.fronts].sort((left, right) => left.regionId.localeCompare(right.regionId))) {
        contestedRegionIds.add(front.regionId);
        activeWarMarkerRegionIds.add(front.regionId);
      }
    }

    for (const regionId in state.world.regions) {
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

    const player = getPlayerKingdom(state);
    const enemyIds = new Set<string>();

    // 1. Mapeia quem são os inimigos de guerras ativas
    for (const warId in state.wars) {
      const war = state.wars[warId];
      if (war.attackers.includes(player.id)) {
        war.defenders.forEach((id) => enemyIds.add(id));
      } else if (war.defenders.includes(player.id)) {
        war.attackers.forEach((id) => enemyIds.add(id));
      }
    }

    // 2. Avalia a posse e sentimento de cada região
    for (const regionId in state.world.regions) {
      const region = state.world.regions[regionId];
      const ownerId = region.ownerId;

      if (ownerId === player.id) {
        playerAlliedRegionIds.add(regionId);
      } else if (enemyIds.has(ownerId)) {
        playerEnemyRegionIds.add(regionId);
      } else {
        const relation = player.diplomacy.relations[ownerId];
        if (relation) {
          if (relation.score.trust > 0.6) {
            playerAlliedRegionIds.add(regionId);
          } else if (relation.score.rivalry > 0.6) {
            playerEnemyRegionIds.add(regionId);
          }
        }
      }
    }

    // 3. Calcula a Riqueza Econômica Relativa com base nos dados do Worker (ECS)
    const goldData = currentSimulationState.goldData;
    if (goldData && goldData.length > 0) {
      let maxGold = Number.NEGATIVE_INFINITY;
      let minGold = Number.POSITIVE_INFINITY;

      for (let i = 0; i < goldData.length; i++) {
        if (goldData[i] > maxGold) {
          maxGold = goldData[i];
        }
        if (goldData[i] < minGold) {
          minGold = goldData[i];
        }
      }

      const range = maxGold - minGold;

      for (let i = 0; i < goldData.length; i++) {
        const def = WORLD_DEFINITIONS_V1[i];
        if (def) {
          if (range <= 0.001) {
            // Se não há desigualdade no mundo (todos produzem igual),
            // exibe uma cor média em vez do cinza de pobreza extrema.
            regionWealthRatio[def.id] = 0.3;
          } else {
            let ratio = (goldData[i] - minGold) / range;
            if (!Number.isFinite(ratio)) ratio = 0; // Proteção WebGL (Evita mapa cinza/rosa por NaN)
            regionWealthRatio[def.id] = Math.max(0, Math.min(1, ratio));
          }
        }
      }
    }

    return {
      contestedRegionIds: Array.from(contestedRegionIds).sort(),
      recentlyCapturedRegionIds: Array.from(recentlyCapturedRegionIds).sort(),
      activeWarMarkerRegionIds: Array.from(activeWarMarkerRegionIds).sort(),
      playerAlliedRegionIds: Array.from(playerAlliedRegionIds).sort(),
      playerEnemyRegionIds: Array.from(playerEnemyRegionIds).sort(),
      regionWealthRatio,
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
      <span>${slot.playerKingdomName} • ${formatCalendarTime(slot.tick)}</span>
      <span>${formatDate(slot.savedAt)}</span>
      <span>Territórios: ${slot.territoryCount} | Militar: ${formatNumber(slot.militaryPower)}</span>
    `;

    const loadButton = document.createElement("button");
    loadButton.textContent = "Carregar";
    loadButton.addEventListener("click", async () => {
      Diagnostic.trace("CMD-UI", `Intenção de Carregamento Solicitada via UI. Slot alvo: ${slot.slotId}`);
      
      const saveState = await session.peekSaveSlot(slot.slotId);
      if (!saveState) {
        showToast("Erro: O save está corrompido ou vazio.");
        return;
      }

      const player = Object.values(saveState.kingdoms).find(k => k.isPlayer);
      const ciclo = formatCalendarTime(saveState.meta.tick);
      const tecnologias = player?.technology.unlocked.length ?? 0;
      const territorios = Object.values(saveState.world.regions).filter(r => r.ownerId === player?.id).length;
      
      let ouro = 0, comida = 0, popTotal = 0;
      if (saveState.ecs && player) {
        const capitalIndex = REGION_INDEX_MAP.get(player.capitalRegionId);
        
        if (capitalIndex !== undefined && capitalIndex !== -1) {
          ouro = saveState.ecs.gold[capitalIndex] ?? 0;
          comida = saveState.ecs.food[capitalIndex] ?? 0;
          popTotal = saveState.ecs.populationTotal[capitalIndex] ?? 0;
        }
      }

      const msg = `Deseja carregar este jogo?\n\n` +
                  `Ciclo: ${ciclo}\n` +
                  `Domínios: ${territorios}\n` +
                  `Tecnologias: ${tecnologias}\n` +
                  `Ouro na Capital: ${Math.floor(ouro)} | Comida: ${Math.floor(comida)}\n` +
                  `População (Capital): ${Math.floor(popTotal)}\n`;

      if (!confirm(msg)) {
        return;
      }

      try {
        const result = await session.loadSlot(slot.slotId);
        await renderSaveSlots();
        showToast("Save restaurado com sucesso.");
        Diagnostic.system("PERS-002", "Substituição do Mundo via Carregamento concluída com sucesso.", result);
      } catch (e) {
        Diagnostic.error("ERR-SYS", "Falha catastrófica ao carregar save da persistência local.", e);
        showToast("Falha ao carregar save. Verifique o console para detalhes.");
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
        Diagnostic.error("ERR-SYS", "Falha de IO ao tentar excluir save no Banco de Dados.", e);
        showToast("Falha ao excluir o save.");
      }
    });

    item.appendChild(metadata);
    item.appendChild(loadButton);
    item.appendChild(deleteButton);
    return item;
  }
  
  function updateMapLegend(layer: string): void {
    if (!ui.mapLegend) return;
    let html = "";
    switch(layer) {
      case "owner":
        html = `
          <div class="map-legend-title">Domínio Estratégico</div>
          <div class="legend-item"><span class="legend-color" style="background: #3b453b;"></span> Terra Selvagem (Inabitada)</div>
          <div class="legend-item"><span class="legend-color" style="background: #8d816e;"></span> Reinos e Tribos NPC</div>
          <div class="legend-item"><span class="legend-color" style="background: #ffffff; height: 3px;"></span> Fronteira Selecionada</div>
        `;
        break;
      case "unrest":
        html = `
          <div class="map-legend-title">Instabilidade Civil</div>
          <div class="legend-item"><span class="legend-color" style="background: #3e6b57;"></span> Calmo (0%)</div>
          <div class="legend-item"><span class="legend-color" style="background: #bb7a2a;"></span> Tensão Média (~45%)</div>
          <div class="legend-item"><span class="legend-color" style="background: #ad2a24;"></span> Rebelião Iminente (75%+)</div>
        `;
        break;
      case "war":
        html = `
          <div class="map-legend-title">Estado de Conflito</div>
          <div class="legend-item"><span class="legend-color" style="background: #8d816e; opacity: 0.5;"></span> Paz / Sem Disputa</div>
          <div class="legend-item"><span class="legend-color" style="background: #a31f1f; border: 1px dashed #fff;"></span> Guerra Ativa / Fronteira em Cerco</div>
        `;
        break;
      case "religion":
        html = `
          <div class="map-legend-title">Religiões Dominantes</div>
          <div class="legend-item"><span class="legend-color" style="background: #4a463c;"></span> Cultos Ancestrais (Nativos)</div>
          <div class="legend-item"><span class="legend-color" style="background: #75624a;"></span> Fé Estrangeira</div>
          <div style="margin-top: 6px; font-size: 0.75rem; color: #999;">Cores Vivas = Alta conversão</div>
        `;
        break;
      case "economy":
        html = `
          <div class="map-legend-title">Riqueza Relativa</div>
          <div class="legend-item"><span class="legend-color" style="background: #8d816e;"></span> Pobreza / Subsistência</div>
          <div class="legend-item"><span class="legend-color" style="background: #cca43b;"></span> Economia Estável</div>
          <div class="legend-item"><span class="legend-color" style="background: #f2d067;"></span> Polo de Riqueza Global</div>
        `;
        break;
      case "diplomacy":
        html = `
          <div class="map-legend-title">Postura Diplomática</div>
          <div class="legend-item"><span class="legend-color" style="background: #3e6b8c;"></span> Você e Aliados</div>
          <div class="legend-item"><span class="legend-color" style="background: #a32a2a;"></span> Inimigos Declarados</div>
          <div class="legend-item"><span class="legend-color" style="background: #8d816e;"></span> Países Neutros</div>
        `;
        break;
    }
    ui.mapLegend.innerHTML = html;
  }

  function renderState(state: GameState): void {
    // Limpa o cache todo início de render (1x por segundo) para forçar recálculo caso tenha anexado territórios
    cachedPlayerRegionIndices = null;

    if (currentWorkerSpeed !== state.meta.speedMultiplier || currentWorkerPaused !== state.meta.paused) {
      currentWorkerSpeed = state.meta.speedMultiplier;
      currentWorkerPaused = state.meta.paused;
      simulationWorker.postMessage({
        type: "SET_TIME_SCALE",
        payload: { speedMultiplier: currentWorkerSpeed, isPaused: currentWorkerPaused }
      });
    }

    // Sincronização passiva: Garante que os bônus de pesquisa cheguem ao motor global
    // A cada ~10 segundos (para não sobrecarregar as rotinas UI), varremos o status de Techs concluídas
    if (state.meta.tick > 0 && state.meta.tick % 10 === 0) {
       syncModifiersToWorker(state);
    }

    renderHeader(state);
    renderRuntimeMetrics(session.getRuntimeMetrics());
    renderResources();
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
      Diagnostic.system("PERS-001", "Salvamento Manual Requisitado.");
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

  ui.exitToMenuBtn.addEventListener("click", () => {
    session.stop(true);
    window.location.href = window.location.pathname + "?menu=1";
  });

  ui.mapLayerSelect.addEventListener("change", () => {
    const layer = ui.mapLayerSelect.value as MapLayerMode;
    const state = session.getState();
    mapRenderer.setLayer(layer);
    mapRenderer.render(state.world, state.kingdoms, buildMapRenderContext(state));
    updateMapLegend(layer);
  });

  for (const input of governmentInputs) {
    input.addEventListener("input", () => {
      isGovernmentFormDirty = true;
    });
  }

  ui.governmentApplyButton.addEventListener("click", () => {
    Diagnostic.trace("CMD-UI", "Aplicando novas Políticas Fiscais e Orçamentárias.", { baseRate: ui.taxInputs.baseRate.value });
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

  // Botões de Religião (Poderes Divinos Diretos)
  const btnBlessCrops = appRoot!.querySelector("#btn-bless-crops");
  if (btnBlessCrops) {
    btnBlessCrops.addEventListener("click", () => {
      const state = session.getState();
      if (!state) return;
      const player = getPlayerKingdom(state);
      const indices = getPlayerRegionIndicesCached(state, player);
      if (indices.length === 0) return;
      
      if (playerFaithCache >= 500) {
        // 1. Atualização Otimista (Optimistic UI): Dá o feedback visual instantâneo e impede spam de cliques
        playerFaithCache -= 500;
        const faithEl = appRoot!.querySelector("#faith-pool-value");
        if (faithEl) faithEl.textContent = formatNumber(playerFaithCache);
        const faithListEl = ui.resourceList.querySelector<HTMLLIElement>(`li[data-resource="faith"]`);
        if (faithListEl) faithListEl.textContent = `Fé: ${formatNumber(playerFaithCache)}`;

        // 2. Subtrai 500 de Fé reais da Memória RAM do império (Custo Proporcional Percentual)
        simulationWorker.postMessage({
          type: "APPLY_ECS_EFFECTS",
          payload: { target: "faith", operation: "subtract_empire_total", value: 500, indices }
        });
        
        flashUIElement(faithEl as HTMLElement, "#ff3333");
        
        // 3. Invoca a Bênção para explodir +2.000 de Comida Instantânea
        eventBus.publish({ type: "religion.blessing", payload: { kingdomId: player.id, amount: 2000 } } as any);
      } else {
        showToast("Fé insuficiente. Seus sacerdotes não foram ouvidos.");
      }
    });
  }

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

  new GodModeConsole(ui.appVersion, (command) => {
    const state = session.getState();
    if (!state) return;
    
    const player = getPlayerKingdom(state);
    const playerRegionIndices = getPlayerRegionIndicesCached(state, player);

    switch (command) {
      case "gold_10k":
        if (playerRegionIndices.length > 0) {
          simulationWorker.postMessage({
            type: "APPLY_ECS_EFFECTS",
            payload: { target: "gold", operation: "add", value: 10000, indices: playerRegionIndices }
          });
          flashUIElement(ui.resourceList.querySelector<HTMLLIElement>(`li[data-resource="gold"]`), "#00ff00");
        }
        showToast("Modo Deus: +10.000 Ouro injetado.");
        break;
      case "food_10k":
        if (playerRegionIndices.length > 0) {
          simulationWorker.postMessage({
            type: "APPLY_ECS_EFFECTS",
            payload: { target: "food", operation: "add", value: 10000, indices: playerRegionIndices }
          });
          flashUIElement(ui.resourceList.querySelector<HTMLLIElement>(`li[data-resource="food"]`), "#00ff00");
        }
        showToast("Modo Deus: +10.000 Comida injetada.");
        break;
      case "ruin_economy":
        simulationWorker.postMessage({
          type: "APPLY_ECS_EFFECTS",
          payload: { target: "gold", operation: "set", value: 0, indices: playerRegionIndices }
        });
        simulationWorker.postMessage({
          type: "APPLY_ECS_EFFECTS",
          payload: { target: "food", operation: "set", value: 0, indices: playerRegionIndices }
        });
        showToast("Modo Deus: APOCALIPSE. Recursos zerados.");
        break;
      case "unlock_tech":
        showToast("Modo Deus: Desbloqueio requer rotina na GameSession. Em breve.");
        break;
    }
  });
  syncProfileUi();

  // Check for sync state first and move it to async if it exists
  const syncState = persistence.gameStateRepository.loadCurrentSync();
  if (syncState) {
    persistence.gameStateRepository.clearCurrentSync();
    await persistence.gameStateRepository.saveCurrent(syncState);
  }

  const currentState = await persistence.gameStateRepository.loadCurrent();
  const initialSlots = await persistence.saveRepository.listSlots();

  if (initialSlots.length > 0 || currentState) {
    ui.splashContinueBtn.style.display = "inline-block";
  }

  ui.splashNewBtn.addEventListener("click", () => {
    ui.splashForm.classList.remove("is-hidden");
    ui.splashNewBtn.style.display = "none";
    ui.splashContinueBtn.style.display = "none";
  });

  ui.splashContinueBtn.addEventListener("click", async () => {
    // `currentState` and `initialSlots` are from the outer scope and already loaded.
    let stateToBoot: GameState | null = currentState;

    if (!stateToBoot && initialSlots.length > 0) {
      Diagnostic.system("SYS-BOOT", "Sem estado em memória. Auto-selecionando o save mais recente...");
      // No active session, but there are saved slots. Load the most recent one.
      const mostRecentSlot = [...initialSlots].sort((a, b) => b.savedAt - a.savedAt)[0];

      try {
        // `loadSlot` will place the session in the correct state and return the state object.
        stateToBoot = await session.loadSlot(mostRecentSlot.slotId);
        showToast(`Continuando do save: ${mostRecentSlot.slotId}`);
      } catch (e) {
        Diagnostic.error("ERR-SYS", "Auto-Boot falhou ao extrair o save mais recente.", e);
        showToast("Falha ao carregar save. Verifique o console.");
        return; // Abort on failure
      }
    }

    if (stateToBoot) {
      await startGameplay(stateToBoot);
    } else {
      // This case should not be reached if the button is only visible when there's something to load.
      // As a fallback, show the new game form.
      ui.splashForm.classList.remove("is-hidden");
      ui.splashNewBtn.style.display = "none";
      ui.splashContinueBtn.style.display = "none";
    }
  });

  ui.splashStartBtn.addEventListener("click", async () => {
    const currentSlots = await persistence.saveRepository.listSlots();
    if (currentSlots.length > 0 && !confirm("ATENÇÃO: Fundar um novo império apagará TODO o seu progresso da campanha atual. Deseja continuar?")) {
      return;
    }

    ui.splashStartBtn.disabled = true;
    ui.splashStartBtn.textContent = "Forjando mundo...";

    profile = { ...profile, name: ui.splashMonarchInput.value.trim() || "Soberano" };
    saveLocalProfile(profile);

    session.stop();
    await (persistence.saveRepository as any).clearAll();
    await persistence.gameStateRepository.clearCurrent();
    
    const selectedRegionId = ui.splashCountrySelect.value;
    const freshState = createInitialState(staticWorldData, selectedRegionId);

    const playerKingdom = freshState.kingdoms["k_player"];
    if (playerKingdom) {
      const def = WORLD_DEFINITIONS_V1.find(d => d.id === selectedRegionId);
      const monarchName = ui.splashMonarchInput.value.trim() || "Soberano";
      playerKingdom.name = `Tribo de ${monarchName}`;
      playerKingdom.adjective = def ? def.name : "Nativo";
    }

    await persistence.gameStateRepository.saveCurrent(freshState);

    ui.splashStartBtn.disabled = false;
    ui.splashStartBtn.textContent = "Fundar Império";
    await startGameplay(freshState);
  });

  async function startGameplay(stateToBoot: GameState | null) {
    ui.splashScreen.classList.add("is-hidden");
    
    const bootState = stateToBoot ?? createInitialState(staticWorldData);
    const finalState = await session.bootstrap(bootState);
    
    mapRenderer.setLayer("owner");
    updateMapLegend("owner");
    await mapRenderer.mount(finalState.world, finalState.kingdoms);

    session.subscribe((state) => {
      renderState(state);
    });

    (window as any).__DEBUG_SESSION = session;
    (window as any).__WORLD_DEFS = WORLD_DEFINITIONS_V1;

    await renderSaveSlots();
    session.start();
    simulationWorker.postMessage({ type: "START" as const });
  }

  window.addEventListener("beforeunload", () => {
    session.stop(true);
    mapRenderer.destroy();
  });
}

void bootstrapApp().catch((error: unknown) => {
  Diagnostic.error("ERR-SYS", "Falha irreversível na injeção principal do arquivo Bootstrap.", error);

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
