﻿# Arquitetura - Epochs Idle

Este documento serve como a "memória" central do projeto, registrando os princípios arquiteturais, a estrutura e a evolução das decisões de engenharia.

## 1. Visão Geral e Princípios Fundamentais

"Epochs Idle" é um jogo de grande estratégia com foco em simulação sistêmica profunda, projetado para ser executado primariamente no navegador (`local-first`).

Os pilares da arquitetura são:

*   **Local-First:** O jogo é totalmente funcional offline. A persistência de dados é feita no cliente (IndexedDB ou arquivos locais na versão Desktop), garantindo que o estado do jogador nunca seja perdido.
*   **Performance da UI:** A simulação principal e mais pesada (economia, população, etc. para 241 nações) é delegada a um **Web Worker**. Isso mantém a thread principal livre, garantindo que a interface do usuário (UI) permaneça sempre fluida e responsiva.
*   **Arquitetura Limpa (Clean Architecture):** O código é estritamente separado em camadas com responsabilidades claras:
    *   `core`: A lógica de negócio e as regras do jogo.
    *   `application`: A orquestração dos casos de uso.
    *   `infrastructure`: Os detalhes de implementação (renderização, persistência, etc.).
*   **Simulação baseada em ECS (Entity Component System):** A simulação no Worker utiliza uma abordagem de ECS para gerenciar o estado de centenas de entidades (nações) de forma eficiente, usando arrays tipados (`Float64Array`) para máxima performance.

### 1.1 Guia de Impacto e Navegação (CODEBASE_MAP)

Como a base de código emprega separação estrita de camadas e processamento em multithread (Main UI vs Web Worker), qualquer alteração estrutural exige cuidado. 

Para isso, o projeto mantém o documento obrigatório **`CODEBASE_MAP.md`**. Ele funciona como um "Mapa Mental" detalhando 100% dos arquivos do projeto, suas responsabilidades, integrações e, mais importante, o **Raio de Impacto** de cada arquivo. Todo desenvolvedor deve consultar o Mapa antes de criar, excluir ou modificar lógicas do jogo.

### 1.2 Política de Zero-Presunção (Engenharia Baseada em Evidências)

Para manter a estabilidade da base de código e evitar "remendos" que escalonam problemas sistêmicos, o desenvolvimento deste projeto obedece a uma regra de conduta inegociável: **Jamais presuma o estado de um contrato, tipagem ou arquivo de arquitetura.**
*   **Verificação Obrigatória:** Nenhuma linha de código deve ser escrita (ou refatorada) com base em suposições ou convenções genéricas de mercado se o arquivo de contrato original (interface, classe base ou hook) não tiver sido lido previamente.
*   **Solicitação Ativa (Fail-Fast):** Se uma dependência cruzada, interface ou lógica de terceiros não estiver disponível no contexto de desenvolvimento imediato, a execução da tarefa deve ser **pausada e paralisada imediatamente**. O desenvolvedor ou assistente deve solicitar acesso explícito aos arquivos ausentes antes de sugerir qualquer alteração de código. Tentativas de "adivinhação" (guessing) de APIs violam este princípio e inserem débito técnico inaceitável.

### 1.3 Protocolo Operacional do Assistente de IA (Prompt de Sistema)

Para manter o rigor imposto pela seção anterior, qualquer uso de Inteligência Artificial para refatoração ou geração de código neste projeto deve operar estritamente sob o seguinte *System Prompt*:

**Contexto e Papel:** Atuação como Engenheiro de Software Sênior especializado em TypeScript de alta complexidade. Foco absoluto em estabilidade, escalabilidade e segurança. Objetivo: propor melhorias com risco zero de regressão.

**Restrições Operacionais Técnicas (Críticas):**
* **Acesso a Arquivos:** A IA não possui visão onisciente. Se um arquivo, dependência ou contrato for mencionado e não estiver no contexto, a IA deve **PARAR E EXIGIR** o código antes de prosseguir.
* **Proibição de Suposições:** Nunca inferir implementações. Basear-se exclusivamente no código explícito.
* **Alteração de Código:** Nunca emitir blocos de código finais antes de ter o plano aprovado pelo desenvolvedor humano.
* **Padrão TypeScript:** Presumir `strict: true`. Terminantemente proibido o uso de `any`. Priorizar *Discriminated Unions*, *Type Guards*, *Generics* estritos. Impor tipagem de retorno explícita.

**Fluxo de Trabalho Obrigatório (4 Fases):**
1. **Fase 1: Diagnóstico e Mapeamento:** Descrever tecnicamente o código, listar a Árvore de Impacto e apontar Lacunas de Informação (arquivos que faltam).
2. **Fase 2: Proposta e Plano:** Estratégia técnica, Plano de Execução (Step-by-step), Matriz de Risco e Plano de Rollback.
3. **Fase 3: Validação e Testes:** Garantia de integridade e edge cases.
4. **Fase 4: Checkpoint de Autorização:** Encerrar solicitando autorização ("*A análise está correta? Posso prosseguir com a geração do código do Passo 1?*").

**Diretrizes de Comunicação:**
A IA deve ser clínica, direta e focada em engenharia. Sem saudações ou didática júnior. Falhas estruturais devem ser apontadas diretamente.

### 1.4 Filosofia de Game Design: Simulador Histórico Sistêmico

O jogo rejeita o formato de "roteiro fixo" (eventos atrelados a datas exatas do mundo real) e adota um modelo de **História Probabilística guiada por forças estruturais**.
*   **Sem Roteiros, Apenas Vetores:** O surgimento de eras, guerras mundiais ou revoluções (como a Industrial) não ocorre no "Ano X". Elas são engatilhadas quando as condições sistêmicas do motor matemático (Centralização, Tecnologia, Pressão Demográfica) são atingidas. O jogador atua como uma "força de desvio" dentro dessas tendências.
*   **Inércia Histórica:** O mapa não é um tabuleiro passivo. Hexágonos funcionam como "Containers Históricos Vivos" possuindo atrito (Assimilação, Cultura, Religião). Mudar a natureza de uma região leva tempo e gera reação orgânica. O ECS tentará "voltar ao padrão histórico" se o jogador não mantiver o esforço.
*   **Fog of Truth (Neblina da Verdade/Desinformação):** O jogador não deve possuir onisciência. A UI ocultará ou "borrará" dados precisos de impérios distantes ou eras antigas (ex: exibir "População Desconhecida" ou "Exército: 1k~10k" em vez de números absolutos), forçando a necessidade de tecnologias de Espionagem, Embaixadas e Exploração para revelar os cálculos exatos do Worker.
*   **IA de Agentes Historicamente Coerentes:** NPCs não buscam jogadas matemáticas "ótimas". Eles sofrem de **Racionalidade Limitada**: tomam decisões com base em informações parciais (percepção distorcida da força inimiga) e restrições estruturais (fome, tecnologia).
*   **Memória e Psicologia:** NPCs possuem memória com fator de decaimento (lembrarão de traições ou guerras antigas). Suas decisões são um cabo de guerra entre a Vontade do Líder (Agressividade/Zelo) e a Psicologia Coletiva (Opinião pública, elites, revoltas travando ações do governante).
*   **Adaptação por Era:** A heurística de decisão da IA muda de acordo com o Zeitgeist. Na Idade da Pedra, o vetor sobrevivência/comida pesa mais; na Idade Média, o zelo religioso; na era Industrial, a classe e comércio.

## 2. Estrutura de Diretórios

A organização do projeto reflete os princípios da Arquitetura Limpa.

*   `src/core`: **O Coração.** Contém os modelos de dados (`game-state.ts`), as regras de simulação (`systems/`) e os componentes do ECS (`components/`). Não tem conhecimento sobre UI, banco de dados ou a web.
*   `src/application`: **O Orquestrador.** Define os casos de uso e gerencia o estado da sessão de jogo (`game-session.ts`). Serve como a ponte entre a UI e o `core`.
*   `src/infrastructure`: **Os Adaptadores.** Contém as implementações concretas que interagem com o mundo exterior.
    *   `persistence/`: Lógica para salvar/carregar o jogo (IndexedDB, arquivos).
    *   `rendering/`: Lógica para desenhar o mapa e a UI.
    *   `worker/`: O código do Web Worker que executa a simulação do ECS.
    *   `runtime/`: Serviços como o relógio do jogo (`clock`) e o barramento de eventos (`event-bus`).
*   `main.ts`: **O Ponto de Entrada.** É o arquivo que "monta" todas as peças: inicializa a `GameSession`, o Worker, a UI e conecta todos os eventos.
*   `desktop/`: Código específico para a versão Desktop (Electron), incluindo a ponte de comunicação com o sistema de arquivos local.

## 3. Log de Evolução Arquitetural

### Fase 1: Fundação e Persistência (Concluída)
*   Definição da arquitetura em camadas (`core`, `application`, `infrastructure`).
*   Implementação do loop de jogo principal (`GameSession`, `TickPipeline`) na thread principal.
*   Criação de um sistema de persistência robusto com versionamento de saves (`save-schema.ts`) e múltiplos repositórios (IndexedDB, Arquivos).

### Fase 2: Integração da Simulação do Worker (Concluída)
*   **Decisão:** Mover a simulação de economia para um Web Worker para garantir a performance da UI.
*   **Implementação:**
    *   Criação do `EconomyComponent` e `EconomySystem` no `core`.
    *   Criação do `simulation.worker.ts` na `infrastructure`.
    *   **Integração com Save/Load:**
        1.  Adicionada a interface `EcsState` ao `game-state.ts` para que o estado do worker pudesse ser salvo.
        2.  Worker aprendeu os comandos `EXTRACT_SAVE_STATE` (para salvar) e `RESTORE_ECS_STATE` (para carregar).
        3.  `main.ts` e `GameSession` foram ajustados para orquestrar o envio e recebimento desses dados durante o início, salvamento e carregamento do jogo.

### Fase 3: Unificação da Fonte da Verdade (Concluída)
*   **Problema Identificado:** O jogo possuía duas fontes de dados para a economia: uma antiga na `GameSession` e a nova no Worker, causando inconsistências na UI e na lógica.
*   **Solução:** Tornar o estado do ECS no Worker a **única fonte da verdade**.
*   **Implementação:**
    1.  O Worker passou a enviar um `TICK` com os dados econômicos completos a cada segundo.
    2.  A UI (`main.ts`) foi refatorada para calcular e exibir os totais de recursos do jogador somando os valores de todas as suas regiões, vindos diretamente do Worker.
    3.  A lógica de custo (`canAfford`, `applyCost`) na `GameSession` foi refatorada para ler e escrever na cópia local do `state.ecs`, eliminando a dependência do estado antigo.

### Fase 4: Expansão da Simulação no Worker (Concluída)
*   **Objetivo:** Mover mais sistemas para o Worker para melhorar a performance.
*   **Implementação (Crescimento Populacional):**
    1.  Criação do `PopulationComponent` e `PopulationSystem`.
    2.  Integração completa no ciclo de vida do Worker (init, save, load, tick).
    3.  UI (`main.ts`) atualizada para consumir os dados de população do Worker, corrigindo o cálculo de risco de fome.
    4.  Remoção do antigo `PopulationSystem` da `TickPipeline` da thread principal.

### Fase 5: Melhorias de Usabilidade e Gerenciamento de Saves (Concluída)
*   **Problema Identificado:** O sistema de saves era confuso, com múltiplos botões e a criação de arquivos desnecessários, sem uma forma clara de excluir saves individuais.
*   **Solução:** Simplificar o sistema de saves para ser mais intuitivo e robusto, preparando o terreno para múltiplas campanhas.
*   **Implementação:**
    1.  **Simplificação dos Slots:** O sistema agora utiliza apenas dois slots por campanha: um `autosave` que se sobrescreve e um `manual` que também se sobrescreve. O botão "Save de Segurança" foi removido para evitar confusão.
    2.  **Exclusão de Saves:** Cada slot de save na UI agora possui um botão "Excluir", protegido por uma caixa de diálogo de confirmação, permitindo ao jogador gerenciar seus saves de forma limpa.
    3.  **Preparação para Múltiplas Campanhas:** O botão "Novo Jogo" foi temporariamente removido. A funcionalidade de reiniciar a campanha atual foi removida para dar lugar a um futuro sistema de gerenciamento de campanhas, onde o jogador poderá criar, carregar e excluir campanhas inteiras de forma independente.

### Fase 6: Identidade, Seamless Transition e Auto-Boot (Concluída)
*   **Problema Identificado:** Recarregar a página (F5) causava perda dos recursos no Worker (ECS vazio). Além disso, iniciar uma "Nova Campanha" por cima de um save existente exigia um Hard Reset (`window.location.reload()`) que falhava por lock no IndexedDB. O país do jogador também não recebia a identidade correta (nome do império).
*   **Solução:** 
    1.  **Auto-Boot:** O `main.ts` agora verifica ativamente se existe um `currentState` salvo no boot. Se sim, ele pula a tela de "Splash" e carrega a simulação instantaneamente (F5 perfeito).
    2.  **Identidade Dinâmica:** Na criação do mundo, a entidade selecionada pelo jogador recebe o prefixo "Império de [Nome]" e uma tag visual "(Você)".
    3.  **Seamless Transition:** Ao invés de recarregar a página, uma Nova Campanha agora encerra o Worker (`session.stop()`), faz uma limpeza nativa no banco (`clearAll()`) e injeta o `freshState` sem telas de carregamento.
    4.  **Fagulha Vital Robusta:** Criado um "Fallback" no payload do `game.loaded`. Se o estado do ECS chegar vazio por qualquer motivo, dados básicos (5.000 pop, 500 ouro/comida) são injetados para impedir o travamento matemático (Crescimento Zero).

## 4. Análise de Falhas Críticas de Persistência

Apesar dos mecanismos de persistência e recuperação descritos na Fase 6, uma investigação aprofundada revelou duas falhas arquiteturais críticas no protocolo de comunicação entre a thread principal (UI) e o Web Worker (simulação). Estas falhas são a causa raiz da instabilidade sistêmica no salvamento e carregamento.

### 4.1. Causa Raiz: Falha no Carregamento de Jogo (Handshake Quebrado)

A falha completa ao carregar um jogo salvo origina-se de um protocolo de inicialização incompleto, que não possui etapas de confirmação (handshake).

*   **Fluxo Falho:**
    1.  A `GameSession` lê o estado do IndexedDB e publica um evento `game.loaded`.
    2.  O orquestrador (`main.ts`) ouve o evento e envia o `EcsState` para o Worker via `RESTORE_ECS_STATE`.
    3.  O Worker recebe o estado, preenche seus dados internos e **não envia nenhuma confirmação** de que o processo foi bem-sucedido.
    4.  A thread principal, operando no escuro, envia um comando `START` para o Worker e inicia sua própria simulação (`TickPipeline`), assumindo que o Worker está pronto.

*   **Ponto de Quebra:** A simulação na thread principal começa sem a garantia de que o Worker está sincronizado. Isso leva a um estado de inconsistência catastrófica, onde a `GameSession` pode operar com dados de ECS vazios ou dessincronizados, resultando no travamento ou comportamento indefinido do jogo. A "Fagulha Vital" (Fase 6) falha porque não há um aperto de mãos para confirmar que a fagulha foi recebida e acendeu a simulação no Worker.

### 4.2. Causa Raiz: Perda de Recursos no Autosave (Race Condition)

A perda de recursos ao usar a função "Continuar" (que carrega o último autosave) é causada por uma clássica **condição de corrida (race condition)**.

*   **Fluxo Falho:**
    1.  **Simulação Paralela:** O Worker calcula a economia e envia uma mensagem `TICK` a cada segundo com os novos totais de recursos. A `GameSession` na thread principal recebe esses dados e atualiza sua cópia local do `EcsState`.
    2.  **Gatilho de Save Dessincronizado:** O `autosave` é disparado pela `GameSession` com base nos seus próprios ciclos de tick, que não têm sincronia com os ticks do Worker.
    3.  **A Condição de Corrida:** Se o `autosave` é executado *depois* do último recebimento de dados, mas *antes* que a nova mensagem `TICK` do Worker chegue, a `GameSession` salva uma **cópia desatualizada do `EcsState`**.
    4.  **Resultado:** Todos os recursos gerados pelo Worker nesse intervalo de 1 segundo são perdidos no arquivo de save. Ao continuar, o jogador é efetivamente revertido para o estado econômico do segundo anterior. O "acoplamento atômico" mencionado na Fase 6 é, na prática, um **acoplamento eventualmente consistente**, vulnerável a essa condição de corrida.

## 5. Solução Arquitetural: Protocolos de Comunicação Robustos

Para resolver essas falhas, serão implementados protocolos de comunicação explícitos e sequenciais, transformando as operações de persistência em transações atômicas e confirmadas.

### 5.1. Protocolo de Carregamento Robusto

O carregamento seguirá um fluxo sequencial com confirmação, garantindo a sincronia total antes do início do jogo.

1.  **Parada e Restauração:** Após o `game.loaded`, o orquestrador (`main.ts`) enviará, em sequência:
    *   `STOP` para o Worker (garante que qualquer simulação anterior pare).
    *   `INIT` para alocar a memória.
    *   `RESTORE_ECS_STATE` com os dados do save.
2.  **Confirmação do Worker:** Após aplicar o estado, o Worker enviará uma nova mensagem: `WORKER_STATE_RESTORED`.
3.  **Início Sincronizado:** A thread principal **aguardará** pela mensagem `WORKER_STATE_RESTORED`. Somente após recebê-la, ela:
    *   Enviará o comando `START` para o Worker.
    *   Iniciará a `TickPipeline` da `GameSession` e habilitará a UI.

*   **Benefício:** Garante que ambas as threads partam de um estado idêntico e confirmado, eliminando a inconsistência.

### 5.2. Protocolo de Save Atômico

O salvamento se tornará uma operação transacional que requisita o estado ao invés de usar uma cópia local.

1.  **Requisição de Estado:** Ao iniciar um save, a `GameSession` enviará uma mensagem `PAUSE_AND_EXTRACT_STATE` ao Worker.
2.  **Extração no Worker:** O Worker para sua simulação, extrai seu estado atual e o envia de volta em uma mensagem `SAVE_STATE_DATA`.
3.  **Salvamento Centralizado:** A `GameSession` aguardará por `SAVE_STATE_DATA`. Ao receber, ela usa esses dados frescos para construir o snapshot do save e escrevê-lo no disco.
4.  **Retomada da Simulação:** Após a conclusão da escrita, a `GameSession` envia uma mensagem `RESUME` para o Worker.

*   **Benefício:** Garante que o estado salvo seja uma fotografia perfeita do momento da simulação, eliminando a condição de corrida.

## 6. Planejamento Futuro

Esta seção descreve as próximas grandes funcionalidades e suas diretrizes arquiteturais.

### 6.0. Roteiro de Execução (A Rota Crítica)

Para garantir a integridade da base de código e evitar retrabalho, o desenvolvimento seguirá uma ordem estritamente baseada no Gráfico de Dependências (Infraestrutura -> Mecânica -> Apresentação -> Metagame):

*   **Fase 1: Infraestrutura de Efeitos (O Motor de Regras)**
    *   **Alvo A: Reforma do Sistema de Tecnologia (6.2).** Implementar o cálculo de "Modificadores Passivos" (ex: +10% Comida) no motor ECS, conectando a árvore de tecnologias atual à simulação.
    *   **Alvo B: Sistema de Desastres e Crises (6.3).** Criar o canal de comunicação reversa (`APPLY_ECS_EFFECTS`), permitindo que a Thread Principal aplique danos instantâneos (Ativos) na Memória do Worker (ex: Terremoto reduz população).
*   **Fase 2: Profundidade Sistêmica (As Mecânicas Sociais)**
    *   **Alvo A: Religião (6.4).** Consome a Fase 1. Usar a infraestrutura de modificadores passivos para dar buffs aos devotos e a infraestrutura de crises para gastar Fé lançando Maldições.
    *   **Alvo B: Diplomacia e Guerra (6.5).** Consome a Fase 1. Estados de bloqueio comercial, alianças e o desgaste ativo de tropas via ECS.
*   **Fase 3: O Tabuleiro Vivo (Apresentação Visual)**
    *   **Alvo Único: Camadas do Mapa Estratégico (6.1).** Com as mecânicas gerando dados ricos, o renderizador WebGL (MapLibre) receberá as rotinas para pintar a tela com as zonas de influência diplomática, religiosa e rotas comerciais oceânicas.
*   **Fase 4: A Visão Épica (Metagame)**
    *   **Alvo Único: Multi-Eras (6.7) e UI Dinâmica (6.8).** Com a base matemática inquebrável, implementar a passagem de tempo, mutação das labels de recursos e a interface preditiva final.

### 6.0.1. Ferramentas de Desenvolvedor (Console de Dev / Modo Deus)

Para auxiliar no balanceamento de longo prazo e limpar a UI para o jogador final, o painel de debug estático será substituído por um **Developer Console ("Modo Deus")** oculto.
*   **Acesso:** Abordagem "Android-style". O menu é ativado exclusivamente ao clicar rápida e sequencialmente **5 vezes** sobre a label de Versão do jogo na interface.
*   **Utilidade Estrutural:** O Modo Deus servirá como o grande ambiente de testes para o canal `APPLY_ECS_EFFECTS`.
*   **Capacidades Planejadas:**
    *   **Recursos & Demografia:** Injeção massiva ou dizimação para engatilhar cenários de crise ou testar transbordos.
    *   **Meta & Tempo:** Desbloqueio imediato de toda a árvore de Tecnologias, saltos de Eras e manipulação de saltos no relógio da simulação (Time Travel).
    *   **Estado & Debug:** Monitoramento de saúde do Worker, FPS e Hard Reset profundo de Banco de Dados.

### 6.1. Camadas do Mapa Estratégico

O mapa é a principal ferramenta de visualização do jogador. As seguintes camadas estão planejadas para fornecer insights estratégicos:

*   **Camada Diplomática (Aliados e Inimigos):**
    *   **Objetivo:** Visualizar rapidamente a postura diplomática do mundo em relação ao jogador.
    *   **Fonte de Dados:** `GameState.kingdoms[player.id].diplomacy.relations`.
    *   **Lógica:** As regiões serão coloridas com base na relação entre o jogador e o dono da região (ex: azul para aliados, vermelho para inimigos, cinza para neutros).

*   **Camada de Conflito (Zonas de Paz e Guerra):**
    *   **Objetivo:** Identificar focos de instabilidade e guerra no mapa.
    *   **Fonte de Dados:** `GameState.wars` e `GameState.world.regions[regionId].unrest`.
    *   **Lógica:** A camada `"war"` existente será aprimorada. Regiões em guerra ativa ficarão em vermelho vibrante. Regiões com alta instabilidade (`unrest`), mas sem guerra, ficarão em laranja/amarelo. Zonas pacíficas terão uma cor neutra.

*   **Camada Religiosa:**
    *   **Objetivo:** Entender a distribuição das fés pelo mundo e identificar oportunidades de expansão religiosa.
    *   **Fonte de Dados:** `GameState.world.regions[regionId].dominantFaith`.
    *   **Lógica:** Cada religião (`ReligionId`) terá uma cor designada. As regiões serão coloridas de acordo com sua fé dominante.
    *   **Benefícios (Game Design):** A expansão da religião estatal aumentará a estabilidade em províncias convertidas, gerará mais recurso de `Fé` e poderá desbloquear ações especiais, como Guerras Santas, contra reinos de outra fé.

*   **Camada Econômica (Riqueza e Pobreza):**
    *   **Objetivo:** Visualizar a força econômica de cada região individualmente.
    *   **Fonte de Dados:** `EcsState.gold` (do Worker).
    *   **Lógica:** A riqueza de uma região será calculada com base no seu estoque de ouro (`gold`) na simulação do ECS. Será criado um gradiente de cores (ex: do amarelo pálido ao dourado intenso) para representar a faixa de riqueza, do mais pobre ao mais rico. Isso permitirá ao jogador identificar alvos econômicos valiosos para conquista ou comércio.

### 6.2. Reforma do Sistema de Tecnologia

*   **Problema Identificado:** A progressão tecnológica é muito rápida, o impacto das tecnologias no jogo é mínimo ou nulo, e os benefícios não são claros para o jogador. O sistema atual não suporta campanhas de longo prazo.
*   **Solução:** Realizar uma reforma completa no balanceamento, impacto e apresentação do sistema de tecnologia.
*   **Plano de Implementação:**
    1.  **Clareza e Impacto (Definição de Dados):**
        *   Adicionar um campo `description` à definição de cada tecnologia, explicando seus benefícios mecânicos (ex: "+10% de produção de comida", "-5% de custo de manutenção do exército").
        *   Adicionar um campo `effects` estruturado (ex: `{ "modifier": "food_production", "value": 0.10 }`).
    2.  **Integração com a Simulação (Impacto Real):**
        *   Refatorar os sistemas de simulação (`EconomySystem`, `WarSystem`, etc.) para que eles consultem as tecnologias desbloqueadas do jogador e apliquem os modificadores correspondentes. Por exemplo, o `EconomySystem` deve calcular um bônus de produção de comida com base nas tecnologias relevantes.
    3.  **Apresentação na UI:**
        *   Atualizar a UI da árvore tecnológica (`main.ts`) para exibir a nova `description` de cada tecnologia, permitindo que o jogador tome decisões informadas.
    4.  **Balanceamento e Pacing (Longo Prazo):**
        *   Revisar e aumentar drasticamente o `cost` de todas as tecnologias, implementando uma curva de custo exponencial para garantir uma progressão mais lenta e recompensadora.
        *   Introduzir o conceito de **Eras Tecnológicas**. O avanço para uma nova era exigirá o desbloqueio de tecnologias-chave da era anterior.
        *   Adicionar **tecnologias repetíveis/infinitas** no final de cada ramo, que fornecem pequenos bônus cumulativos a um custo crescente, garantindo que sempre haja algo para pesquisar.
    5.  **Profundidade Estratégica:**
        *   Expandir o sistema de **Doutrinas**. Certas tecnologias-chave não darão um bônus direto, mas desbloquearão uma escolha entre duas ou mais doutrinas mutuamente exclusivas, forçando o jogador a se especializar e adaptar sua estratégia.

### 6.3. Sistema de Efeitos Maléficos (Desastres e Crises)

*   **Objetivo:** Introduzir eventos negativos e aleatórios para criar desafios dinâmicos e testar a resiliência do império do jogador.
*   **Arquitetura Proposta:**
    1.  **Novo Canal de Comunicação:** Será criado um novo tipo de comando para o Worker (`APPLY_ECS_EFFECTS`), permitindo que a thread principal modifique diretamente o estado da simulação (ex: reduzir a população de uma região, aplicar um modificador negativo à produção).
    2.  **Novos Sistemas de Simulação:** Serão criados novos sistemas na `TickPipeline` da thread principal (ex: `DisasterSystem`, `PlagueSystem`) responsáveis por gerar esses eventos com uma certa probabilidade a cada ciclo.
    3.  **Integração com o ECS:** Os sistemas no Worker (`EconomySystem`, `PopulationSystem`) serão atualizados para reconhecer e aplicar os efeitos e modificadores enviados pela thread principal.

*   **Planejamento de Efeitos:**
    *   **Desastres Naturais (Enchentes, Terremotos, etc.):**
        *   **Gatilho:** Eventos aleatórios com probabilidade baseada na geografia da região.
        *   **Efeitos:** Aumento drástico da `devastation` na região; redução imediata da população (`population.total`) e dos estoques de recursos (`economy.*`) no Worker.

    *   **Doenças e Pragas:**
        *   **Gatilho:** Evento aleatório que pode se espalhar para regiões vizinhas.
        *   **Efeitos:** Aplicação de um modificador negativo severo na taxa de crescimento populacional (`population.growthRate`) no Worker. Pragas aplicariam um modificador negativo na produção de comida (`economy.food`).

    *   **Cerco Militar e Bloqueio Econômico:**
        *   **Gatilho:** Não é aleatório. É uma consequência direta da guerra. Quando uma região se torna um front de batalha no `WarSystem`, ela está efetivamente sob cerco.
        *   **Efeitos:** O `WarSystem` enviará um comando ao Worker para aplicar um modificador negativo massivo em toda a produção de recursos (`gold`, `food`, etc.) daquela entidade. O efeito é removido quando a guerra termina ou o front se move. Isso conecta diretamente a simulação de guerra da thread principal com a simulação econômica do Worker.

### 6.4. Reforma do Sistema de Religião

*   **Problema Identificado:** O sistema de religião atual é passivo e carece de profundidade estratégica e impacto direto no jogo.
*   **Solução:** Transformar a religião em um sistema ativo de poder, influência e risco, com escolhas significativas para o jogador.
*   **Plano de Implementação:**
    1.  **Escolha e Consequências Dinâmicas:**
        *   Implementar a ação de "Adotar Religião Estatal" na `GameSession`.
        *   Mudar de religião causará um impacto imediato e severo na `estabilidade` e `legitimidade`, além de redefinir as relações diplomáticas com base na nova fé.
        *   Introduzir a opção "Irreligioso/Ateu" como uma escolha estratégica, que desabilita a geração de `Fé` mas concede bônus em outras áreas (ex: tecnologia).
    2.  **Rivalidade e Influência Inter-religiosa:**
        *   Adicionar uma matriz de `hostilidade` nas definições de cada religião para modelar o quão incompatíveis são com outras fés.
        *   O `DiplomacySystem` usará essa matriz para aplicar modificadores negativos às relações entre reinos de fés rivais.
    3.  **Bônus por Expansão (Poder da Fé):**
        *   O `EconomySystem` (ou um novo `ReligionBonusSystem`) calculará bônus passivos de `Fé` e `Legitimidade` com base na porcentagem de regiões do império que seguem a religião estatal.
    4.  **Sistema de Bênçãos e Maldições (Poderes Divinos):**
        *   Criar um novo `ReligionPowerSystem` na `TickPipeline`.
        *   Permitir que o jogador gaste grandes quantidades de `Fé` para ativar "Poderes Divinos" como ações especiais.
        *   **Bênçãos (em si mesmo):** Bônus diretos (ex: Bênção da Colheita) utilizando Padrão *Optimistic UI* na interface para mitigar a latência entre a ação do clique e a resposta do Worker.
        *   **Maldições (em um rival):** Efeitos negativos temporários na estabilidade, economia ou população de um inimigo. Isso utilizará o canal de comunicação `APPLY_ECS_EFFECTS` para o Worker.
    5.  **Integração com a Árvore Tecnológica:**
        *   A árvore de tecnologia religiosa se tornará crucial, desbloqueando novos Poderes Divinos, aumentando a eficácia dos missionários e podendo mitigar as penalidades de conversão religiosa.

### 6.5. Reforma do Sistema de Diplomacia

*   **Problema Identificado:** A diplomacia atual é transacional e carece de profundidade. As interações não criam narrativas ou consequências de longo prazo.
*   **Solução:** Evoluir a diplomacia para um sistema dinâmico baseado em relações, poder e influência, permitindo interações complexas como vassalagem, intimidação e ajuda coordenada.
*   **Plano de Implementação:**
    1.  **Sistema de Relações e Opinião:**
        *   O objeto `relation.score` será a base para um `opinion` score consolidado, visível para o jogador, que varia de -100 (Arqui-inimigo) a +100 (Aliado Leal).
        *   **Modificadores de Opinião:** Ações gerarão modificadores de opinião com decaimento ao longo do tempo. Exemplos: "Enviou ajuda" (+20), "Ameaçou nossas fronteiras" (-30), "Quebrou um pacto" (-50), "Guerreou contra nosso inimigo comum" (+15).
        *   Isso cria um histórico de relacionamento claro e dinâmico.
    2.  **Novas Ações Diplomáticas (Poder Brando e Agressivo):**
        *   **Ajuda e Suporte (Poder Brando):**
            *   `Enviar Ajuda`: Nova ação na `GameSession` que permite ao jogador enviar um pacote de recursos (`gold`, `food`, etc.) para um alvo. Custa recursos ao jogador e gera um grande bônus de `opinion`.
            *   `Emprestar Tropas`: Ação de fim de jogo que permite enviar um exército para auxiliar um aliado em suas guerras, controlado pela IA do aliado.
        *   **Coerção e Subjugação (Poder Agressivo):**
            *   `Intimidar Nação`: Nova ação. O sucesso será calculado com base na `militaryPower` relativa e na personalidade do alvo (um líder `cauteloso` cederá mais facilmente).
            *   `Vassalagem`: Um resultado possível da intimidação ou de uma oferta diplomática. Um `vassalo` é um novo status diplomático com as seguintes mecânicas:
                *   Paga um tributo regular em recursos, transferido via `EconomySystem`.
                *   Junta-se automaticamente às guerras do seu suserano.
                *   Pode receber ordens diretas, como "Atacar [outro reino]".
    3.  **IA Diplomática e Reações Contextuais:**
        *   A IA (`NpcDecisionSystem`) avaliará todas as propostas (aliança, paz, etc.) com base no `opinion` score, em sua personalidade e no contexto atual (ex: "Estou em guerra, não posso aceitar uma aliança agora").
        *   Será criado um `DiplomaticResponseGenerator` que construirá mensagens de resposta com base nesses fatores, evitando textos repetitivos e refletindo o estado do jogo.
    4.  **Dinâmicas de Aliança e Coalizão:**
        *   O `DiplomacySystem` será aprimorado para gerenciar "cascatas de reputação".
        *   **Agressão a Aliados:** Declarar guerra a um reino aplicará um modificador de opinião negativo severo ("Atacou nosso aliado") a todos os seus aliados.
        *   **Chamado às Armas:** Os aliados do reino atacado terão uma alta probabilidade de entrar na guerra contra o jogador, tornando as alianças pactos defensivos significativos e perigosos de se provocar.

### 6.6. Tabuleiro Procedural e Domínio Marítimo (O Novo Mundo)

*   **A Grande Visão:** O mapa do jogo abandonará fronteiras geopolíticas reais e modernas. O mundo será um tabuleiro contínuo gerado matematicamente (Grid Hexagonal/Voronoi), separando o globo entre **Províncias Terrestres** e **Zonas Marítimas**.
*   **Consequências Arquiteturais (Gerador e Clima):** O script de mapa será reescrito utilizando projeções geodésicas. Ele aplicará uma máscara de colisão (`land-50m`) para separar terra/água, e utilizará dados de latitude e algoritmos de ruído (Perlin/Simplex Noise) para gerar **Biomas e Climas** (Deserto, Tundra, Temperado, Tropical) para cada célula.
*   **Mecânicas Desbloqueadas (Oceano Ativo):** 
    1.  O oceano não é apenas um espaço vazio; é um território conquistável.
    2.  As Zonas Marítimas produzirão Ouro (Rotas Comerciais) e Comida (Pesca), mas não comportarão População ou Instabilidade civil.
    3.  A travessia e controle destas zonas serão estritamente atrelados a bloqueios da Árvore de Tecnologia Naval (permitindo o desenvolvimento fiel da Era das Grandes Navegações).
    4.  **Regra de Ouro (Sedes Terrestres):** Nenhuma nação, agrupamento ou entidade política poderá ter sua capital/sede em uma Zona Marítima. O berço da civilização e o controle administrativo central devem ser estritamente terrestres.
*   **Impacto Sistêmico do Clima:** Os biomas não serão puramente cosméticos. Regiões desérticas terão penalidades massivas em agricultura (Comida) e regiões gélidas sofrerão limites duros de População e maior atrito militar (Manpower), exigindo tecnologias de adaptação.
*   **Costura de Grafo e Limites Polares (Visão de Globo):** 
    1.  **East-West:** O mapa visual repete infinitamente, mas futuramente o gerador criará uma "Costura de Grafo" (Graph Stitching), adicionando os IDs da borda asiática na lista de vizinhos da borda americana, permitindo a circum-navegação matemática.
    2.  **North-South:** Os polos foram intencionalmente cortados (latitudes -65 / +75). Eles não se conectam "por cima". Em vez de uma parede invisível, as zonas de extremo norte (Tundra) aplicarão Atrito de Neve mortal, punindo exércitos e barrando a expansão organicamente.
*   **Patches Geográficos:** Como usamos Hexágonos largos (~150km) para manter a performance alta, eles falham em representar com fidelidade istmos ou estreitos reais muito finos. O gerador de mapas emprega Bounding Boxes manuais para forçar e corrigir passagens navais críticas (Gibraltar, Bósforo, Ormuz) e pontes de terra (Panamá).

### 6.7. Visão Épica: Da Aurora Humana à Infinidade (Multi-Eras)

*   **A Grande Visão:** O jogo deixará de ser restrito ao período Medieval e abarcará toda a existência da civilização. O jogador começará controlando a primeira tribo de caçadores-coletores e avançará até a exploração espacial e transcendência da espécie.
*   **Surgimento da Humanidade:** O jogo deve começar no início absoluto do processo civilizatório. O mapa será ocupado inicialmente por pequenos agrupamentos humanos. Essas populações irão se espalhar, se dividir e evoluir orgânica e socialmente pelas etapas de formação: **Clãs -> Tribos -> Cidades-Estado -> Reinos -> Grandes Impérios.**
*   **Ritmo Punitivo e Recompensador (Pacing de Longo Prazo):** Para garantir que uma era dure **cerca de 1 mês de jogo contínuo**, a progressão tecnológica utilizará um sistema de "Soft-Caps" (limites suaves) e "Paradigm Shifts" (Quebras de Paradigma). O avanço para a próxima Era exigirá um sacrifício monumental ou o acúmulo de um "Recurso de Transição" específico daquela era.

**Fases do Desdobramento Evolutivo:**

1.  **Era 1: A Aurora (Tribal / Nômade)**
    *   **O Mapa:** Sem fronteiras de países. O mapa é escuro (Fog of War).
    *   **Mecânicas Ativas:** Apenas "População", "Comida" e "Exploração".
    *   **Objetivo da Era:** Sobreviver à natureza, expandir a tribo e descobrir o fogo e a agricultura.
    *   **A Evolução:** Ao pesquisar "Sedentarismo", a tribo funda a primeira cidade. As fronteiras do seu país nascem no mapa.

2.  **Era 2: A Antiguidade (Idade do Bronze/Ferro)**
    *   **Desbloqueio:** O recurso "Madeira" e "Ouro" surgem. A aba "Diplomacia" é liberada (você encontra outras tribos que também se assentaram).
    *   **Mecânicas:** Primeiras guerras rudimentares (conquista territorial pura). Construção de Monumentos (Maravilhas).
    *   **A Evolução:** O desenvolvimento da "Escrita" e do "Estado de Direito" permite transicionar para governos formais.

3.  **Era 3: Idade Média (Nosso Core Atual)**
    *   **Desbloqueio:** O recurso "Fé" e "Legitimidade" surgem. A aba "Governo e Impostos" ganha complexidade.
    *   **Mecânicas:** Religião estatal, feudalismo, cruzadas, castelos.
    *   **A Evolução:** A "Prensa de Tipos Móveis" e o "Renascimento" quebram o monopólio da fé.

4.  **Era 4: Era Industrial**
    *   **Desbloqueio:** O recurso "Carvão" e "Aço" substituem "Madeira" e "Ferro". A aba de "Religião" é substituída por "Ideologia" (Capitalismo, Comunismo, Fascismo).
    *   **Mecânicas:** Explosão populacional. O status de `devastation` (devastação) nas províncias passa a ser alimentado por **Poluição**. Se a poluição sair do controle, ocorrem colapsos climáticos locais. Produção em massa de exércitos.
    *   **A Evolução:** A invenção da "Fissão Nuclear" e da "Computação".

5.  **Era 5: Era da Informação (Moderna)**
    *   **Desbloqueio:** O recurso "Urânio" e "Silício". O Mapa ganha satélites (visão perfeita do mundo).
    *   **Mecânicas:** Guerra Fria. O "Poder Militar" tradicional perde força para a **Destruição Mútua Assegurada (Armas Nucleares)**. As guerras passam a ser econômicas, cibernéticas e guerras por procuração (proxy wars). ONU e Sanções Globais.
    *   **A Evolução:** O domínio da "Fusão Nuclear" e "Inteligência Artificial Forte (AGI)".

6.  **Era 6: Era Estelar / A Infinidade (Sci-Fi)**
    *   **Desbloqueio:** Recursos alienígenas (Matéria Escura, Antimatéria). O conceito de "Planeta" se torna apenas uma capital; o jogador constrói Megaestruturas (Esferas de Dyson, Anéis Orbitais).
    *   **Mecânicas:** A tela principal se afasta do mapa terrestre. A população agora é contada em Trilhões. A diplomacia envolve federações galácticas. O crescimento se torna exponencial a níveis cósmicos (semelhante ao *endgame* extremo de jogos clicker como *Universal Paperclips* ou *Cookie Clicker*).
    *   **Objetivo Final:** Atingir a "Singularidade" ou criar um "Universo Simulado", recomeçando o jogo em uma nova dimensão com status de "Prestígio" (Deus).

**Impacto no Motor (Arquitetura necessária para suportar isso):**
*   **Dicionários Dinâmicos:** O arquivo de traduções da UI (`i18n`) precisará responder à Era. A variável `tax_clergy` na Idade Média será exibida como "Isenção do Clero", mas na Era da Informação será lida como "Isenção Corporativa" ou "Subsídio Tecnológico".
*   **Árvore Tecnológica Particionada:** A `technology-tree.ts` será dividida em matrizes gigantescas atreladas à `currentEra`. Tecnologias da próxima era terão custo definido como "Infinity" até que a Quebra de Paradigma seja atingida.
*   **Variáveis ECS Mutantes:** No `EcsState`, o array `faith` (Fé) continuará sendo uma matriz de `Float64Array`, mas a UI irá mascará-lo chamando-o de "Influência Tribal" na era 1 e de "Ideologia" na era 5. O motor matemático não muda, apenas a "pintura" sobre ele.

### 6.8. Evolução da Interface Gráfica (UI/UX)

*   **A Grande Visão:** A interface deve funcionar como um painel de controle estratégico vivo e transparente, baseando-se no princípio vital de que **"Todo sistema deve ser visível, compreensível e rastreável"**.
*   **Nova Estrutura Global (5 Camadas):** O layout atual será reestruturado para suportar a complexidade das Novas Eras e o motor procedural, dividindo o DOM em:
    1.  **HUD Superior (Visão Macro):** Indicadores numéricos resumidos de recursos (sempre visíveis). Serão adicionados **Indicadores de Tendência (setas ↑/↓)** comparando ativamente o último ciclo (`tick`) com o anterior para indicar crescimento ou recessão instantânea.
    2.  **Mapa Principal:** O motor MapLibre GL no fundo absoluto, recebendo as novas camadas visuais (Modo Climático, Modo Militar, Rotas Marítimas).
    3.  **Painel Lateral Dinâmico:** Contextual à seleção. Ao clicar em um Hexágono, em vez de dados globais, passará a extrair do ECS o Bioma, o Clima e a produção isolada daquele território exato.
    4.  **Painel Inferior (Log de Eventos):** Novo componente no rodapé. Um console/feed contínuo escutando o `EventBus` para renderizar o histórico recente, como notificações NPC, desastres e cascatas diplomáticas.
    5.  **Telas Modulares:** Aprofundamento da gestão macro.
*   **Mecânicas Visuais Planejadas (Qualidade de Vida):**
    *   **Numeração Estilo RPG (Compactação):** A exibição de valores numéricos na UI utilizará formatação encurtada com sufixos universais de jogos (1K para milhares, 1M para milhões, 1B para bilhões). Isso evita a poluição da interface em estágios avançados (*Late-Game* ou *Modo Deus*), onde a extração de recursos atinge escalas colossais.
    *   **Previsão de Causa e Efeito:** A UI protegerá o jogador de erros cegos. Mover *sliders* de controle (ex: Impostos no painel de Governo) calculará um "Delta" local e exibirá um texto flutuante preditivo (ex: `+150 Ouro / -5% Legitimidade`) antes que o jogador solte o mouse e confirme a ação.
    *   **Sistema de Tooltips Inteligentes:** Interceptação dos dados do Worker para explicar o "Porquê" das coisas. Passar o mouse sobre um ganho revelará a fórmula destrinchada (ex: *Produção Base + Bônus Tecnológico - Penalidade Climática*).
    *   **Automação (Modo Idle de Fim de Jogo):** A introdução de caixas de seleção estratégicas (`[x] Priorizar Defesa`, `[x] Focar Expansão`). Desbloqueáveis como "Burocracia de Estado" em Eras avançadas, permitindo que a própria thread principal faça o microgerenciamento dos *sliders* a cada ciclo, abraçando a natureza *Idle* do projeto.
    *   **Feedback Visual Imediato (Regra Global de UX):** Todas as ações do jogador que interagem com o Worker (e, portanto, possuem latência) devem seguir o padrão de *Optimistic UI*. A interface deve reagir instantaneamente (ex: desabilitando ou mudando a cor de um botão) para confirmar ao jogador que seu comando foi recebido, evitando cliques múltiplos e frustração.

### 6.9. Mecânicas de Sobrevivência Inicial (Êxodo Nômade e Clima Realista)

Esta seção detalha as soluções para falhas de game design que criam cenários de "softlock" para o jogador na Era da Aurora.

#### 6.9.1. Falha do Gerador Climático (Biomas Incorretos)

*   **Problema Identificado:** O gerador de mapa procedural (`generate-world-geojson.mjs`) distribui biomas baseando-se unicamente em latitude e ruído Perlin. Isso leva a anomalias geográficas, como a geração de biomas de "Deserto" em regiões de alta umidade como o Brasil, quebrando a imersão.
*   **Solução Planejada:** O script de geração será aprimorado para incluir uma segunda camada de ruído simulando **Umidade (Moisture)**. Biomas como "Deserto" só serão formados na intersecção de "Alta Temperatura" com "Baixa Umidade", garantindo uma distribuição climática mais realista.

#### 6.9.2. Softlock de Nômades e a Mecânica de Êxodo

*   **Problema Identificado:** Existe um travamento matemático (`softlock`) no início do jogo. Biomas hostis (ex: Deserto) têm um limite de suporte (`carryingCapacity`) de 50 habitantes. No entanto, o `MigrationSystem` exige 150 habitantes para acionar a colonização de um hexágono vizinho. Uma tribo que nasce em um deserto fica permanentemente presa, pois a fome a impede de atingir o limiar de migração.
*   **Solução Planejada (Êxodo Nômade):** Será criada uma nova Ação Regional chamada **"Êxodo Nômade"**, específica para a Era da Aurora.
    *   **Mecânica:** O jogador poderá selecionar um hexágono selvagem adjacente e mover toda a sua tribo para lá.
    *   **Custo:** A ação custará apenas um valor em Comida (para a jornada), sem exigir Ouro ou Legitimidade.
    *   **Efeito:** O hexágono de origem é abandonado e retorna ao estado de "Terra Selvagem" (`k_nature`). A totalidade da população e dos recursos do jogador é transferida para o novo hexágono, que se torna a nova capital.
    *   **Impacto no Design:** Isso não apenas resolve o softlock, mas também adiciona uma camada de jogabilidade historicamente coerente, simulando o comportamento nômade de caçadores-coletores em busca de terras mais férteis.

### 6.10. Configuração de Campanha Avançada (A Sala de Guerra)

**Status:** `Em desenvolvimento`

Para aumentar a rejogabilidade e dar ao jogador controle estratégico sobre a narrativa, será implementada uma tela de "Configuração Avançada". A interface principal terá duas opções: um botão de "Início Rápido" (que usa a configuração padrão) e um botão para este "Modo Avançado", que permitirá a personalização profunda do mundo antes do início de cada campanha.

*   **Contrato de Campanha (`CampaignConfig`):** O `create-initial-state.ts` será refatorado para ser uma "Fábrica de Mundos" que opera com base em um novo objeto `CampaignConfig`. Este objeto conterá todas as escolhas do jogador.

*   **Opções de Personalização Planejadas:**
    *   **Identidade dos Reinos:** O jogador poderá personalizar o nome e a cor do seu império e de cada um dos NPCs.
    *   **Personalidade da IA (Níveis de Dificuldade):** Em vez de bônus numéricos, a dificuldade será definida por perfis comportamentais no `NpcDecisionSystem`:
        *   **Fácil ("O Eremita"):** Perfil passivo, focado em economia e avesso a riscos. Pode realizar ações altruístas.
        *   **Moderado ("O Equilibrado"):** Comportamento padrão, balanceando todos os aspectos do jogo.
        *   **Difícil ("O Tirano"):** Perfil agressivo, expansionista e oportunista. Maior propensão a trair pactos e a explorar fraquezas militares.
    *   **Dinâmica Populacional dos NPCs:**
        *   **Fixo:** O número de NPCs no mundo é constante. Um império só desaparece se for conquistado.
        *   **Dinâmico:** O motor de "mitose" social é ativado. NPCs podem se fraturar, criando novos impérios, ou se fundir, alterando o cenário político de forma orgânica.
    *   **Ponto de Partida Histórico:**
        *   **Era Inicial:** O jogador poderá escolher a era de início (ex: "Aurora da Humanidade", "Era Medieval"). O sistema irá automaticamente desbloquear todas as tecnologias das eras anteriores e ajustar os recursos e população iniciais para um ponto de partida coerente.
    *   **Recursos Iniciais:** Sliders ou campos de entrada para definir a quantidade inicial de população e recursos, com uma opção de "Aplicar a todos" para garantir paridade.
    *   **Autopilot Inicial (Modo Idle Padrão):** Por padrão, a campanha do jogador começará com os sistemas de automação (pesquisa, expansão) ativados. O jogador poderá desativá-los a qualquer momento para assumir o controle manual, reforçando a natureza *idle* do jogo.

### 6.11. Imersão Sensorial (Arte e Som)

Para aumentar o fator de imersão, o planejamento futuro inclui a adição de elementos audiovisuais.
*   **Arte de Abertura:** Uma imagem de abertura para dar um tom mais profissional e polido ao jogo.
*   **Trilha Sonora:** Músicas de fundo para complementar a atmosfera de cada era do jogo.

## 7. Problemas Anteriores (Resolvidos)

Esta seção documenta problemas que foram identificados e corrigidos em fases anteriores do desenvolvimento, servindo como um registro histórico.

### 7.1. Perda de Estado do ECS ao Recarregar a Página (F5)

*   **Sintoma Antigo:** Ao recarregar a página (F5), os recursos do jogador (ouro, comida, etc.) vindos do Worker eram zerados devido a concorrência na gravação do IndexedDB.
*   **Solução Implementada (Fase 6):** Criado o mecanismo de **Auto-Boot** e injeção vital. O recarregamento intercepta a ausência de estado, injeta recursos garantidores e a `GameSession` agora acopla atomicamente o último espelho de `EcsState` a cada tick recebido. O F5 funciona nativamente como "Continuar Jogo" sem perda de dados.

### 7.2. Bug do Crescimento Zero

*   **Sintoma Antigo:** O mundo do jogo iniciava "morto" demograficamente em novas campanhas, com `populationTotal` e `populationGrowthRate` zerados, impedindo qualquer crescimento.
*   **Causa Arquitetural Antiga:** Em campanhas novas (`createInitialState`), o `state.ecs` subia nulo, fazendo com que o `Float64Array` no Worker assumisse seu valor padrão (`0`).
*   **Solução Implementada (Fase 6):** Injeção de estado reativo (*Fallback payload*) na inicialização da ponte visual (`main.ts`). Caso o `state.ecs` seja ausente na subida de um `game.loaded`, a UI empacota dados de crescimento mínimos e envia ao Worker, garantindo a "fagulha matemática" necessária.

### 7.3. Falha Sistêmica na Restauração de ECS (Zeroing no Load e F5)

*   **Sintoma Antigo:** Ao recarregar a página (F5) ou carregar um save manual, a interface e o ciclo avançavam corretamente, porém os recursos do Worker (Ouro, Comida, etc.) invariavelmente zeravam e recomeçavam seu crescimento a partir de zero.
*   **Causa Arquitetural Antiga:** Ocorria uma falha dupla interligada. 
    1.  O uso nativo de `structuredClone()` sobre objetos instanciados pelo WebWorker corrompia a cadeia de protótipos dos `Float64Array`, transformando os arrays em objetos vazios genéricos `{}` no momento da serialização em disco.
    2.  A implementação do `EventBus.publish` falhava silenciosamente devido a uma tipagem quebrada. A thread principal da UI nunca recebia o evento de `game.loaded` e, portanto, o comando `RESTORE_ECS_STATE` nunca era disparado ao Worker durante o load.
*   **Solução Implementada:** 
    1.  **Bypass de Serialização:** A extração do ECS no salvamento agora ignora o clone temporário e extrai os literais numéricos com `Array.from()` diretamente da fonte viva de dados.
    2.  **Handshake de Eventos e Fagulha 2.0:** Assinatura do `EventBus` estritamente padronizada para injeção. Além disso, o motor principal foi blindado com a *Fagulha Vital 2.0*, que detecta ativamente o carregamento de saves corrompidos (da era pré-fix, com população `0`) e reinjeta a vitalidade base mundial, protegendo a simulação contra estagnação de economia.
