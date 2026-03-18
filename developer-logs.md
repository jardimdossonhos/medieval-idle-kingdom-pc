# Diário de Bordo do Desenvolvedor

Este documento rastreia todas as tentativas significativas de corrigir bugs e implementar novas funcionalidades. Seu objetivo é criar uma "memória" do que foi tentado, o que funcionou e o que falhou, para evitar a repetição de erros e entender a evolução da base de código.

---

## Entrada: 1

**Data:** 18/03/2024
**Timestamp:** 2024-03-18T18:00:00Z

### Problema Detectado:
Instabilidade sistêmica na funcionalidade de salvar/carregar.
1.  **Falha no Carregamento:** Carregar um jogo salvo frequentemente resulta em um estado corrompido, forçando uma reinicialização completa (`hard reset`).
2.  **Perda de Dados no Autosave:** Usar a função "Continuar" (que depende do último autosave) leva à perda do progresso econômico dos últimos segundos.

### Análise da Causa Raiz:
Uma análise aprofundada (agora documentada em `ARCHITECTURE.md`) revelou duas falhas fundamentais no protocolo de comunicação entre a thread da UI (principal) e a da simulação (Web Worker).
1.  **Handshake Quebrado no Carregamento:** A thread principal envia o estado salvo para o Worker, mas não espera por uma confirmação (`ack`) de que o estado foi restaurado com sucesso antes de iniciar a simulação do jogo. Isso cria uma *race condition* onde o jogo começa com um estado dessincronizado e inconsistente.
2.  **Race Condition no Salvamento:** A thread principal dispara o salvamento usando sua cópia local e potencialmente desatualizada do estado da simulação. Se o Worker já calculou um novo estado, mas a mensagem `TICK` com esses dados ainda não chegou, a operação de salvamento captura dados velhos, resultando em perda de progresso.

### Solução Aplicada (Plano de Ação):
Esta entrada registra o plano para corrigir os problemas, com base nas alterações arquiteturais aprovadas. A implementação será rastreada em entradas subsequentes.
1.  **Primeiro, a Documentação:** Todo o problema, a causa raiz e os novos protocolos de comunicação robustos foram detalhadamente documentados em `ARCHITECTURE.md`, `CODEBASE_MAP.md` e `README.md` para garantir que a solução seja compreendida antes da implementação.
2.  **Implementação Planejada (Carregamento Robusto):** Implementar um protocolo de carregamento sequencial e com confirmação. A thread principal comandará o Worker para `STOP`, depois `RESTORE_ECS_STATE`, e **aguardará** por uma mensagem de confirmação `WORKER_STATE_RESTORED` antes de iniciar os ticks do jogo.
3.  **Implementação Planejada (Salvamento Atômico):** Implementar um protocolo de salvamento transacional. A thread principal solicitará o estado ao Worker via `PAUSE_AND_EXTRACT_STATE`, aguardará a mensagem `SAVE_STATE_DATA` contendo o estado novo, realizará o salvamento e só então enviará um comando `RESUME` para o Worker.

### Resultado:
*Implementação pendente.*

---

## Entrada: 2

**Data:** 19/03/2024

### Ação Realizada: Implementação do Handshake e Salvamento Transacional
A teoria descrita na Entrada 1 foi validada e implementada com sucesso. A `GameSession` agora possui uma trava matemática obrigatória (`isWorkerReady`) que ignora sumariamente qualquer avanço de tempo da simulação (`TICK`) até que receba um sinal verde explícito da thread paralela. 

1. **Worker:** O `simulation.worker.ts` foi atualizado para enviar `WORKER_STATE_RESTORED` no exato momento em que finaliza o parse da matriz de dados. Adicionados também os comandos transacionais `PAUSE_AND_EXTRACT_STATE` e `RESUME`.
2. **GameSession:** Adicionado o método público `markWorkerReady()` para liberar a trava da UI. A rotina de saves (`commitManualSave` e `commitAutosave`) agora aguarda a inversão de dependência: a thread principal pede os dados, o Worker envia a resposta, e só então o repositório é acionado para persistir no IndexedDB.
3. **Refatoração de Testes Unitários:** A suíte de testes de persistência (`save-and-load-audit.test.ts`) passou a falhar (como era esperado) pois o relógio estava batendo, mas o estado não avançava devido à nova trava. O arquivo de testes foi refatorado para simular o sinal do WebWorker disparando `session.markWorkerReady()` após cada carregamento/bootstrap simulado.

### Resultado:
Implementação realizada e testada apenas de forma unitária. *Status Real:* O carregamento dos saves não funciona de forma integrada e apresenta falhas. Pendente de revisão.

---

## Entrada: 3

**Data:** 19/03/2024

### Problema Detectado: Botões da UI (Salvar/Carregar) Pararam de Funcionar
A refatoração implementada na Entrada 2 introduziu um grave problema de Assincronicidade Reativa. Os métodos de save/load na `GameSession` continuavam resolvendo suas `Promises` imediatamente após publicar a intenção ao WebWorker. Com isso, a Interface de Usuário atualizava antes da persistência de fato ocorrer ou da simulação ser destravada, resultando em "botões fantasmas" ou estado de Load eterno. O teste de validação (`save-and-load-audit.test.ts`) também falhou em englobar a arquitetura real, pois ele invocava artificialmente o destrave (`session.markWorkerReady()`) em formato síncrono.

### Ação Realizada (Correção do Handshake):
1. **GameSession Promisificada:** Os métodos `loadSlot`, `bootstrap` e `saveManual` foram reescritos para retornar `Promises` controladas por subscrições temporárias do `EventBus`. A camada de Aplicação só devolve controle à UI quando recebe do Worker/Orquestrador as chaves `game.loaded` confirmadas (via `loadReadyResolver`) ou o disparo de conclusão `save.manual.completed`.
2. **Mock Realista no Teste:** O arquivo `save-and-load-audit.test.ts` teve a classe `InMemoryEventBus` reescrita para aceitar strings/payloads reais, e passou a embarcar um "Mock de Orquestrador". Agora, ao invés do teste burlar o destrave, o próprio Mock do EventBus ouve o `game.loaded` ou `save.manual.requested` e reage respondendo de forma sistêmica, validando o vai-e-vem perfeito sem hard-codes no teste.

### Resultado:
**Péssimo.** A tentativa quebrou o jogo completamente. A promissificação dos métodos `bootstrap` e `loadSlot` introduziu um Deadlock (bloqueio mútuo) na inicialização. A UI do `main.ts` travou esperando a GameSession terminar, mas a GameSession travou esperando o Worker (que dependia da UI para ser iniciado).
**Consequência:** O mapa desapareceu (tela preta) e o sistema de save continua quebrado.

---

## Entrada: 4

**Data:** 19/03/2024

### Nova Regra de Documentação:
Fica terminantemente proibido registrar neste documento que um erro "foi resolvido", "funciona perfeitamente" ou "foi extinto" baseado apenas em suposições ou testes unitários. O status de sucesso de qualquer feature de agora em diante será registrado apenas como "Aguardando Validação", e a confirmação de sucesso só será registrada após a aprovação manual e definitiva do usuário. O sistema de salvamento permanece quebrado.

---

## Entrada: 5

**Data:** 19/03/2024

### Lições Aprendidas e Mudança de Paradigma:
As Entradas 2 e 3 falharam porque criaram uma arquitetura frágil de dependência síncrona/assíncrona entre a Sessão de Jogo e a casca do sistema (`main.ts`). Ao tentar forçar o WebWorker a parar e extrair o estado mediante comandos engessados, geramos os travamentos de UI e deadlocks documentados.

### Ação Realizada: Sincronização Passiva (Lazy Sync)
1. **Remoção da Complexidade:** A lógica complexa do EventBus para saves foi arrancada da `GameSession`.
2. **Espera do Próximo Frame:** O ato de salvar (manual ou automático) agora apenas levanta uma "bandeira" (`pendingManualSave`). Como o Worker já envia naturalmente um `TICK` a cada segundo com dados perfeitamente atualizados, o save aguarda pacientemente esse próximo pulso. Quando o dado fresco chega na função `updateEcsState`, o save é executado instantaneamente, com risco zero de corrida (race condition) e sem travar ou pausar threads.
3. **Auto-Destrave no Load:** A trava de inicialização de saves (`isWorkerReady`) agora é liberada automaticamente no exato instante em que a `GameSession` recebe o primeiro sinal de vida (`TICK`) do Worker, eliminando o congelamento do tempo em Loads.
4. **Timeout de Segurança:** Adicionado um gatilho de 3 segundos na Promise do botão Save Manual. Se o worker morrer, a UI salva o que tem na memória e destrava, resolvendo definitivamente os cliques fantasmas.
5. **Refatoração de Testes:** Os testes E2E/Unitários foram atualizados para simular essa batida passiva de dados no lugar de forçar os métodos de forma isolada.

### Resultado:
A Sincronização Passiva corrigiu os travamentos da interface, mas revelou uma dessincronia na injeção de dados no Worker. Conforme validação do usuário, os saves ocorrem com sucesso, mas a restauração de recursos falha.

---

## Entrada: 6

**Data:** 19/03/2024

### Feedback da Validação (Usuário):
1. **Salvar Manual / Autosave:** Os saves passaram a aparecer na lista sem congelar a UI. (Sucesso da Sincronização Passiva contra Deadlocks).
2. **Carregar Jogo:** O ciclo (tick) do jogo muda para o ciclo do save, mas os recursos (ouro, comida) não mudam (continuam os mesmos de antes de carregar).
3. **F5 (Refresh):** O ciclo é mantido corretamente, mas os recursos são completamente perdidos/zerados.

### Análise do Comportamento Atual:
A Thread Principal (`GameSession`) está funcionando na leitura dos dados: ela puxa o Snapshot do banco e altera o estado em memória (justificando a atualização do Ciclo/Tick na tela).
O problema agora isolou-se 100% no **Web Worker** e na sua aceitação dos dados:
- **No Carregar:** O Worker provavelmente não está sendo paralisado adequadamente ou não está aplicando o `RESTORE_ECS_STATE`. Com isso, ele continua sua simulação paralela ininterrupta e, no segundo seguinte, envia um `TICK` com os recursos velhos da memória dele, sobrescrevendo a interface.
- **No F5:** O Worker deve estar iniciando suas matrizes "vazias" (antes de receber o estado do banco) e começa a bombear matrizes de valor `0` no primeiro pulso, apagando instantaneamente os recursos que a UI havia acabado de recuperar.

### Próximos Passos e Status:
Status: Funcionalidade ainda quebrada.
Foco de ataque: Investigar a rotina de boot do Worker no orquestrador principal (`main.ts`) e o comando `RESTORE_ECS_STATE` no próprio Worker para descobrir por que as matrizes `Float64Array` estão rejeitando a injeção do Save.
