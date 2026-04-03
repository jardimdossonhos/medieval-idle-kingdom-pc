# Roadmap de Desenvolvimento

Este documento serve como referência central para o planejamento das fases de desenvolvimento do jogo.

### Fase 1: Loop de Gameplay Militar
**Objetivo:** Implementar o núcleo da interação militar e conquista.
1.  **Exércitos e Movimentação:**
    -   Criar entidades de "Exército" no ECS.
    -   [Concluído] O Motor valida distâncias geográficas e impede Teletransporte Logístico intercontinental.
2.  **Combate e Resolução de Batalhas:**
    -   Desenvolver um sistema de combate que resolva batalhas entre exércitos. A fórmula deve considerar tamanho do exército, bônus tecnológicos, terreno (bioma) e generais (futuro).
3.  **Conquista e Ocupação:**
    -   [Concluído] Implementar a mecânica de cercos (*sieges*) baseada em frentes físicas.
    -   [Concluído] Colapso de terreno: populações exterminadas devolvem a terra à natureza.
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

### Fase 1.5: Religião Dinâmica (Concluída)
**Objetivo:** Uso da fé como instrumento de expansão ativa.
1.  [Concluído] Fundação orgânica com 100 pontos orçamentários.
2.  [Concluído] Cismas causando 250% de Instabilidade civil.
3.  [Concluído] Expansão passiva contínua nas fronteiras (Osmose).

### Fase 2.5: Sistema de Conselho Real (Concluída)
**Objetivo:** Humanizar o motor matemático e prover tutoria/automatização.
1.  [Concluído] Mercado de Ministros com personalidades, lealdade e habilidades.
2.  [Concluído] **Consciência Contextual e Geográfica**: IA de ministros que cruza `StaticWorldData` para propor construções táticas em fronteiras físicas reais e evitar *spam* de ações já resolvidas.

### Fase 3: Aprofundamento da Diplomacia e IA
**Objetivo:** Tornar as interações com outros reinos mais dinâmicas e significativas.
1.  [Concluído] **IA Diplomática:** IA toma decisões com poder relativo, distância espacial e limites lógicos (Utility AI).
2.  **Expansão de Tratados:** Adicionar acordos comerciais e pactos defensivos.
3.  **Interação Externa:** Permissão para financiar guerras de terceiros.

### Fase 4: Sistema de Eventos Dinâmicos
**Objetivo:** Narrativas emergentes e desafios imprevistos.
1.  **Motor de Eventos:** Gatilhos baseados no ECS (tempo, população, fé).
2.  **Cadeias Narrativas:** Desastres (pragas), boas colheitas, revoltas, intrigas.

### Fase 5: Vida Microscópica e Tática de Tempo Real
**Objetivo:** Renderizar a vida nas províncias e comandar batalhas em tempo real (Estilo *Total War* / *Age of Empires*).
1.  **Dual Engine:** Integração de um motor WebGL 3D/2D Isométrico avançado (Babylon.js / PixiJS) para instanciar a vida local.
2.  **Dilatação Temporal (Pausa):** Congelamento sincronizado entre o relógio Macro (Worker ECS) e a arena Micro (Engine Visual).
3.  **Tradução ECS-Visual:** Converter os arrays do ECS (População, Biomas, Ouro, Edifícios) em topografia gerada proceduralmente, vilas com camponeses trabalhando e Batalhões marchando.
4.  **Feedback Ativo:** Retornar as baixas de uma batalha tática ou recursos coletados localmente de volta para as matrizes matemáticas globais do WebWorker (via `APPLY_ECS_EFFECTS`).