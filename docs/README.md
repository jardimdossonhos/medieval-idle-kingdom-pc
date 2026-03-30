# Base de Conhecimento: Medieval Idle Kingdom

Este é o Hub Central da documentação. Ele serve como o mapa roteador primário para a IA Assistant, garantindo que o contexto injetado na memória seja estritamente o necessário para a tarefa em execução.

## 🧭 Guia de Navegação Modular

Para evitar poluição de contexto, carregue apenas os documentos referentes ao domínio da tarefa atual:

*   **[Roadmap Macro](./roadmap.md)**
    *   **Uso:** GDD de alto nível. Leia para entender "Qual fase estamos construindo agora" (Ex: Militar, Econômica, Diplomática).
*   **📂 `1-planning/`** *(Plano Tático)*
    *   **Uso:** Arquivos de tarefas imediatas, checklists de implementação técnica passo a passo.
*   **📂 `2-architecture/`** *(A Fundação Técnica)*
    *   **Uso:** Como o motor funciona por baixo dos panos. Regras do ECS, comunicação em paralelo com Web Workers via TypedArrays e sistema de Save Atômico.
*   **📂 `3-mechanics/`** *(Regras de Negócio e Design)*
    *   **Uso:** A fonte da verdade para fórmulas de gameplay (ex: algoritmo de crescimento de população, matemática do combate, cálculo de isenções de taxas).
*   **📂 `4-engineering/`** *(Logs e Padrões)*
    *   **Uso:** Estratégia de testes E2E e o Histórico de Decisões Arquiteturais Críticas (ADRs) documentando grandes bugs resolvidos (ex: problemas no WebGL).

## 🤖 Diretrizes de Engenharia para a IA
1. **Motor ECS Blindado:** A Main Thread é apenas para UI. Nenhuma regra de jogo pesada roda nela.
2. **Single Source of Truth:** Nunca adivinhe uma fórmula matemática do jogo. Se não souber, peça para carregar o arquivo correspondente na pasta `/3-mechanics/`.
3. **Segurança de Tipos:** Respeite a arquitetura de alta performance adotada nos Float64Arrays do Worker.