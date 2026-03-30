# Roadmap de Desenvolvimento

Este documento serve como referência central para o planejamento das fases de desenvolvimento do jogo.

### Fase 1: Loop de Gameplay Militar
**Objetivo:** Implementar o núcleo da interação militar e conquista.
1.  **Exércitos e Movimentação:**
    -   Criar entidades de "Exército" no ECS.
    -   Implementar a movimentação de exércitos no mapa, utilizando o grafo de vizinhança já existente para o pathfinding.
2.  **Combate e Resolução de Batalhas:**
    -   Desenvolver um sistema de combate que resolva batalhas entre exércitos. A fórmula deve considerar tamanho do exército, bônus tecnológicos, terreno (bioma) e generais (futuro).
3.  **Conquista e Ocupação:**
    -   Implementar a mecânica de cercos (*sieges*) a regiões.
    -   Permitir a transferência de controle e posse de uma região após uma conquista bem-sucedida.

### Fase 2: Especialização Econômica (Edifícios)
**Objetivo:** Adicionar profundidade estratégica à gestão das regiões.
1.  **Sistema de Construção:**
    -   Permitir que o jogador construa "Edifícios" em suas regiões (ex: Mercado, Quartel, Mosteiro, Universidade).
    -   Cada edifício terá um custo em recursos e um tempo de construção.
2.  **Modificadores Regionais:**
    -   Edifícios aplicarão modificadores permanentes à região:
        -   `Mercado`: Aumenta a geração de ouro.
        -   `Quartel`: Acelera a recuperação de *manpower*.
        -   `Mosteiro`: Aumenta a geração de fé e a resistência a missionários.
        -   `Universidade`: Gera pontos de pesquisa passivos.

### Fase 3: Aprofundamento da Diplomacia e IA
**Objetivo:** Tornar as interações com outros reinos mais dinâmicas e significativas.
1.  **IA Diplomática:** Implementar uma IA que tome decisões diplomáticas com base em poder relativo e "agressividade".
2.  **Expansão de Tratados:** Adicionar acordos comerciais e pactos defensivos.
3.  **Interação Externa:** Permissão para financiar guerras de terceiros.

### Fase 4: Sistema de Eventos Dinâmicos
**Objetivo:** Narrativas emergentes e desafios imprevistos.
1.  **Motor de Eventos:** Gatilhos baseados no ECS (tempo, população, fé).
2.  **Cadeias Narrativas:** Desastres (pragas), boas colheitas, revoltas, intrigas.