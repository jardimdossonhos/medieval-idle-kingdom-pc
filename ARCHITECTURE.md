﻿﻿# Arquitetura - Medieval Idle Kingdom

Este documento serve como a "memória" central do projeto, registrando os princípios arquiteturais, a estrutura e a evolução das decisões de engenharia.

## 1. Visão Geral e Princípios Fundamentais

"Medieval Idle Kingdom" é um jogo de grande estratégia com foco em simulação sistêmica profunda, projetado para ser executado primariamente no navegador (`local-first`).

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

## 4. Planejamento Futuro

Esta seção descreve as próximas grandes funcionalidades e suas diretrizes arquiteturais.

### 4.1 Camadas do Mapa Estratégico

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

### 4.2 Reforma do Sistema de Tecnologia

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

### 4.3 Sistema de Efeitos Maléficos (Desastres e Crises)

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

### 4.4 Reforma do Sistema de Religião

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
        *   **Bênçãos (em si mesmo):** Bônus temporários para economia, população ou militar.
        *   **Maldições (em um rival):** Efeitos negativos temporários na estabilidade, economia ou população de um inimigo. Isso utilizará o canal de comunicação `APPLY_ECS_EFFECTS` para o Worker.
    5.  **Integração com a Árvore Tecnológica:**
        *   A árvore de tecnologia religiosa se tornará crucial, desbloqueando novos Poderes Divinos, aumentando a eficácia dos missionários e podendo mitigar as penalidades de conversão religiosa.

### 4.5 Reforma do Sistema de Diplomacia

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

## 5. Problemas Conhecidos

Esta seção documenta problemas ativos na arquitetura que estão sob investigação.

### 5.1 Perda de Estado do ECS ao Recarregar a Página (F5)

*   **Sintoma:** Ao recarregar a página do navegador (F5), os recursos do jogador (ouro, comida, etc.), que são gerenciados pela simulação do ECS no Web Worker, são zerados. No entanto, outros dados do estado do jogo, como a contagem de ciclos (`tick`), são restaurados corretamente.
*   **Análise Preliminar:** O problema sugere uma falha no ciclo de vida de persistência e restauração do `EcsState`. Embora o `GameSession` salve o estado do jogo, incluindo um campo `ecs`, há uma provável condição de corrida ou um bug na serialização/desserialização que faz com que o estado do ECS seja perdido ou salvo em um estado vazio/nulo antes do recarregamento da página ser concluído. O `autosave` ou o salvamento no `beforeunload` pode estar gravando um `GameState` sem os dados do `EcsState` mais recentes vindos do Worker.
*   **Status:** **Crítico.** A correção deste problema é prioritária para garantir a integridade da principal premissa do jogo (`local-first`). A investigação está focada em garantir que a cópia mais recente do `EcsState` seja sempre atomicamente acoplada ao `GameState` antes de qualquer operação de escrita no IndexedDB.
