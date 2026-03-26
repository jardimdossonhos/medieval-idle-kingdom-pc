# 🗺️ Mapa Mental e Arquitetura da Base de Código (Deep Dive)

Este documento mapeia a utilidade de **toda a extensão da árvore de diretórios e padrões de arquivos** do projeto `medieval-idle-kingdom-pc` (abrangendo seus mais de 1.000 arquivos). 
Devido ao rigor da **Clean Architecture** e **Threads Separadas (Web Worker)**, use este guia como bússola para entender onde inserir novos códigos e prever o impacto das suas alterações.

---

## Nível 0: Arquivos e Pastas Raiz do Repositório
*   **`/` (Raiz)**: Contém arquivos de configuração que ditam o ambiente, build e linters. Edite com extremo cuidado.
    *   `package.json`, `tsconfig.json`, `vite.config.ts`: Definição de dependências e bundling (Vite).
    *   `.eslintrc.json`, `.prettierrc`: Regras estritas de qualidade de código.
    *   `ARCHITECTURE.md`, `MANUAL.md`, `README.md`, `CODEBASE_MAP.md`: Documentação viva do projeto.
*   **`docs/`**: Contém a documentação estendida, planos de execução (execution plans) das fases de desenvolvimento e detalhamentos de arquitetura mais profundos.
*   **`public/assets/maps/`**: Contém artefatos estáticos. O arquivo `world-countries-v1.geojson` é usado na renderização final e ditou os metadados do mundo do jogo.
*   **`scripts/`**: Utilitários Node.js executados fora do escopo do jogo (ex: build do GeoJSON e tipagens auto-geradas `generate-world-geojson.mjs`).
*   **`tests/`**: A suíte de testes automatizados utilizando **Vitest** (`npm run test`). É aqui que a integridade do jogo é garantida, focando principalmente em testar as funções puras matemáticas do *Core* e os contratos do ECS sem depender da interface visual.
*   **`desktop/`**: Invólucro **Electron** (`main.js`, `preload.js`) para transformar o jogo web num `.exe` nativo de PC com acesso offline real aos arquivos do `%APPDATA%`.
*   **`node_modules/`** *(Gerado automaticamente)*: Armazena todas as bibliotecas de terceiros listadas no `package.json` (Vite, MapLibre, Electron). **Intocável:** Nunca edite arquivos aqui dentro, pois eles são sobrescritos a cada instalação.

---

## Nível 1: Camada de UI e Visualização (A Superfície)
A casca visual que o usuário interage. **Nenhuma lógica de negócios reside aqui.**
*   **`src/styles/`**:
    *   `global.css`: Todas as definições de responsividade, CSS variables, painéis (DOM) e do canvas do mapa.
*   **`src/ui/`**: 
    *   `i18n/messages.ts`, `types.ts`: Dicionários de traduções e internacionalização (en-US, pt-BR).
*   **`src/main.ts`**: O Maestro. 
    *   Monta a DOM.
*   **`src/application/god-mode.ts`**: Ferramenta de auditoria do Desenvolvedor. Um console injetável que ignora as regras do jogo e permite manipular o Worker diretamente (cheat menu).
    *   Instancia a `GameSession` (Aplicação).
    *   Controla a **Splash Screen** e o **Auto-Boot**.
    *   **Ponto Crítico:** Orquestra a comunicação entre a UI e o Worker. É o responsável por enviar os comandos de restauração (`RESTORE_ECS_STATE`) e início (`START`). O protocolo de comunicação original não aguardava confirmação do Worker, sendo a causa principal da falha no carregamento de jogos. *(Ver Seção 4.1 do ARCHITECTURE.md).*
    *   Processa a ponte visual de dados (recebe os `TICK`s do worker e atualiza a `GameSession`).

---

## Nível 2: Aplicação e Orquestração (A Ponte)
Sistemas de controle de fluxo de estado. Eles ditam "o quê" fazer, orquestrando as regras puras do *Core*.
*   **`src/application/`**:
    *   `game-session.ts`: A super-classe da API do Jogo. Mantém uma cópia do `currentState`.
    *   **Ponto Crítico:** Dispara o `autosave` com base em seus próprios ticks, usando uma cópia local do estado do Worker. Essa dessincronia causa a **race condition** que resulta na perda de recursos. *(Ver Seção 4.2 do ARCHITECTURE.md).*
    *   Despacha as intenções do jogador (ex: botões de Diplomacia ou Governo) e verifica custos (`canAfford`) usando sua cópia local (e potencialmente desatualizada) do `EcsState`.
    *   **`boot/`**: Rotinas para construir a campanha "do zero".
        *   `create-initial-state.ts`, `static-world-data.ts`: Fabricas que constroem a árvore inicial JSON.
        *   `generated/world-definitions-v1.ts`: A lista *hardcoded* final de regiões. **O length deste arquivo dita a alocação do Worker de alta performance.**
    *   **`save/`**: Rotinas exclusivas de snapshots.
        *   `build-save-summary.ts`: Fabrica os metadados (Tamanho do exército, Nome do Monarca, Tempo jogado) legíveis no Menu de Saves sem precisar carregar o mapa inteiro na RAM.

---

## Nível 3: Infraestrutura (Os Adaptadores Concretos)
Arquivos acoplados a frameworks externos (IndexDB, MapLibre, WebWorkers) que implementam as "Ports" (contratos) exigidos pelo *Core*.
*   **`src/infrastructure/worker/`**:
    *   `simulation.worker.ts`: A Segunda Thread matemática. Isola 100% dos cálculos do ECS para impedir congelamentos de interface (UI bloqueada).
    *   **Ponto Crítico:** Ao receber `RESTORE_ECS_STATE`, ele restaura seu estado interno mas, no protocolo original, **não enviava nenhuma mensagem de confirmação (handshake)** para a thread principal. Essa ausência de confirmação era a causa raiz da falha no carregamento de jogos. *(Ver Seção 4.1 do ARCHITECTURE.md).*
*   **`src/infrastructure/rendering/`**:
    *   `hybrid-map-renderer.ts`, `maplibre-world-renderer.ts`: Consumidores da biblioteca MapLibre GL. Traduzem o estado dos reinos do `GameSession` em preenchimentos (polígonos e cores) no canvas geográfico.
*   **`src/infrastructure/persistence/`**:
    *   `runtime-persistence.ts`, `save-slots.ts`: Repositórios reais (LocalStorage/IndexedDB). Gravam e leem os JSONs imensos e lidam com limpeza de memória de saves antigos.
*   **`src/infrastructure/runtime/`**:
    *   `browser-clock-service.ts`: O "coração batendo" do jogo (requestAnimationFrame/setInterval).
    *   `local-event-bus.ts`: Mensageria síncrona (pub/sub) que avisa ao sistema que algo ocorreu (ex: "guerra_declarada", "vitoria_alcancada").
*   **`src/infrastructure/diplomacy/`, `npc/`, `war/`**: 
    *   `npc/`: Onde habita a **Utility AI** (Racionalidade Limitada). Avalia vetores de personalidade, memória histórica com decaimento, percepção vs realidade (Fog) e adaptação por Era.

---

## Nível 4: Core Domain (O "Graal" - Lógica Pura Multithread)
O núcleo intocável do jogo. Agnostico de JS, Web ou Bancos de Dados. Representa centenas de arquivos divididos na sub-arquitetura ECS e POO (Orientada a Objetos).

### 4.1. Modelos (A Base de Dados Viva)
*   **`src/core/models/game-state.ts`**: O Santo Graal. A Interface Typescript gigante que diz o que é salvo no disco. **Alterar um campo aqui requer refatorar leituras/escritas em quase todas as camadas.**
*   **`src/core/models/*.ts` (Mais dezenas de arquivos)**: Divide a árvore JSON em partes legíveis.
    *   `economy.ts`, `population.ts`, `military.ts`, `religion.ts`, `diplomacy.ts`, `technology.ts`, `npc.ts`, `world.ts`, `events.ts`, `victory.ts`
    *   `enums.ts` e `identifiers.ts`: Constantes (ex: `ResourceType.Gold`, geradores de Hash).

### 4.2. Contratos e Dados Estáticos
*   **`src/core/contracts/`**: Interfaces (`game-ports.ts`, `services.ts`) que exigem que algo de fora (Infra) implemente comportamentos de repositório (I/O).
*   **`src/core/data/`**: Definições massivas e imutáveis.
    *   `technology-tree.ts`: A árvore complexa de pré-requisitos tecnológicos, custos e hard-codes das descrições.
*   **`src/core/utils/`**:
    *   `stable-hash.ts`, `state-fingerprint.ts`: Geradores algorítmicos para garantir determinismo, permitindo auditoria nos slots de save (anti-corrupção e anti-cheat).

### 4.3. Pipeline Principal (Tick Engine POO)
Roda os cálculos de alto nível estruturais não transferidos para a memória do Worker (como Guerras Globais).
*   **`src/core/simulation/`**:
    *   `tick-pipeline.ts`: O loop. Invoca em fila rigorosa todos os sistemas (AI, Eventos, Guerras).
    *   `create-default-systems.ts`: O Injetor de Dependência que agrupa todos os motores.

### 4.4. O Motor de Alta Performance (ECS Sub-Domain)
Centenas de megabytes rodando a cada segundo em arrays coladas e contínuas na Memória RAM (Data-Oriented Design).
*   **`src/core/ecs/World.ts`**: Gerencia IDs matemáticos das entidades.
*   **`src/core/components/`**: Ex: `EconomyComponent.ts`, `PopulationComponent.ts`. Repositórios de Matrizes tipadas de alta velocidade (`Float64Array`).
*   **`src/core/systems/`**: Ex: `EconomySystem.ts`, `PopulationSystem.ts`. Funções matemáticas rígidas que rodam os loops "For" multiplicando taxas para 241+ países na mesma fração de segundo.

---

## Cheatsheets Avançados (Manutenção Diária)

**Cenário A: Adicionar um novo recurso de economia (Ex: "Pedra"):**
    *   `enums.ts` (Adicionar ao ResourceType)
    *   `game-state.ts` / `EcsState` (Adicionar `stone: number[]`)
    *   `EconomyComponent.ts` (Criar o Float64Array de Pedra)
    *   `EconomySystem.ts` (Calcular a produção de Pedra)
    *   `simulation.worker.ts` (Extrair no `EXTRACT_SAVE_STATE` e restaurar no `RESTORE_ECS_STATE`)
    *   `main.ts` (Renderizar a Pedra na UI e receber do worker)
    *   `game-session.ts` (Atualizar o ECS backup com a Pedra)

**Cenário B: Criar um botão "Ação Global" (Ex: Decretar Édito):**
    *   `main.ts` (A UI invoca `session.executeEdito()`)
    *   `game-session.ts` (Aplica a lógica de negócios, paga custos do ECS copiados e salva logs)
    *   `models/events.ts` (Se o edito logar um evento)

**Cenário C: Alterar propriedades da malha hexagonal do mundo (Clima, Tamanho do Tabuleiro):**
    *   Alterar a lógica procedural (Turf.js) no `scripts/generate-world-geojson.mjs`.
    *   Rodar `npm run map:build` para fatiar o mundo e gerar os Vector Tiles (`.pbf`).
    *   O build reescreverá `world-definitions-v1.ts`. O ECS ajustará automaticamente a memória RAM com base no tamanho novo do Array.
    *   *Risco*: Qualquer alteração na quantidade de zonas geográficas corrompe os Saves antigos devido ao desalinhamento estrutural dos índices. O jogo precisará ser recomeçado.

---
> ⚠️ **Nota Crítica de Refatoração:** A arquitetura multithread exige espelhamento exato do Estado. Sempre valide o recarregamento do Browser (F5) para atestar a "Persistência ECS" após mexer em qualquer tipo, Array ou Interface do `core/models`.