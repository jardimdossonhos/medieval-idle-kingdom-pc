# Manual do Usuário e Guia de Testes (Criador)

Bem-vindo ao **Medieval Idle Kingdom**. Este manual tem o objetivo de eliminar a "caixa preta" do jogo. Ele explica as regras de funcionamento, os significados visuais e as mecânicas exatas para que você possa jogar, testar e guiar o desenvolvimento com clareza.

---

## 1. Interface e Mapa Estratégico

O mapa é a sua principal visão do mundo. Por padrão, você verá dezenas de nações coloridas.

*   **Meus Territórios:** Na aba "Resumo" da Lista de Saves, a contagem "Territórios" indica quantas regiões você possui. No futuro, o mapa terá uma camada específica onde seu reino sempre será destacado em Azul, facilitando a identificação imediata.
*   **Camadas do Mapa (Seletor no topo do mapa):**
    *   **Domínio:** Mostra cada reino com uma cor única aleatória. Ajuda a ver fronteiras.
    *   **Diplomacia:** *(Em desenvolvimento)* Seu reino em Azul, aliados em tons claros, inimigos declarados em Vermelho.
    *   **Instabilidade:** Áreas verdes estão calmas. Áreas laranjas e vermelhas indicam alto risco de revolta civil na província.
    *   **Guerra/Contestado:** Zonas rachadas e vermelhas mostram onde batalhas e cercos estão ocorrendo no momento.

---

## 2. Governo e Economia

O painel de Governo é onde você controla as alavancas do seu império. Todos os recursos (Ouro, Comida, etc.) são atualizados por ciclo (1 tick = 1 segundo de simulação).

### Taxas (Impostos)
Os impostos definem a extração de riqueza da sua população. Taxas altas geram Ouro rápido, mas aumentam a "Instabilidade" (Risco de Revoltas).
*   **Taxa Base:** É o imposto geral sobre a população comum.
    *   *Mínimo permitido:* `0.05` (5%) - Deixa a população feliz.
    *   *Máximo permitido:* `0.60` (60%) - Gera muito ouro, mas corre risco extremo de revolução.
*   **Alívio Nobre:** Desconto dado aos nobres. (Varia de `0.00` a `0.40`). Aumenta a Legitimidade, mas reduz a arrecadação.
*   **Isenção Clero:** Desconto à igreja (Varia de `0.00` a `0.40`). Aumenta a produção de Fé, mas custa ouro.
*   **Tarifa Comercial:** Imposto sobre fronteiras e feiras (Max `0.50`).

### Orçamento (%)
Todo imposto arrecadado vai para um "Pote de Orçamento". Você deve dividir 100% deste pote nas seguintes áreas:
*   **Economia:** Investimento que aumenta a produção futura de Comida e Ouro.
*   **Militar:** Necessário para pagar o salário dos exércitos (Manutenção).
*   **Religião / Administração / Tecnologia:** Financiam a pesquisa e expansão.
*   *Regra:* A soma dos orçamentos deve idealmente ser 100.

---

## 3. Painel Militar e Diplomacia

*   **Pontuação Militar (Military Power):** É um número matemático que resume a sua força bélica total. Ele é calculado somando a quantidade de soldados ativos (Manpower), o nível da sua Tecnologia Militar e os Bônus de Qualidade de Tropa. A Inteligência Artificial (NPCs) usa este número para decidir se vai te atacar ou se deve ter medo de você.
*   **Reserva (Manpower):** Soldados disponíveis para repor as baixas após uma guerra.
*   **Diplomacia (Rivalidade vs Confiança):** Interações na aba Diplomacia afetam o que as outras nações pensam de você. Acima de 60% de confiança, a chance de aliança é alta.

---

## 4. Salvamento e Proteção de Dados (Persistência)

O jogo foi projetado para rodar localmente no seu navegador.
*   **Autosave:** O jogo salva a si mesmo automaticamente a cada 5 ciclos (5 segundos).
*   **Atualizar a Página (F5):** *No momento (Fase 7 de Dev), há um bug reconhecido onde apertar F5 zera os recursos temporariamente até o próximo cálculo completo. Isso está no topo da lista de correções da equipe.* O comportamento correto no futuro será que apertar F5 não causará perda de nenhum dado.
*   **Save Manual:** A qualquer momento, na aba "Saves", você pode clicar em "Salvar Jogo". Isso cria um marco definitivo que não será apagado pelo Autosave.
*   **Fechamento:** Ao fechar a aba, o jogo fará um "Catch-up" na próxima vez que você abrir (tentará simular o que aconteceu enquanto você esteve fora, até um limite de tempo).

---

## 5. Guia para o Criador / Testador (Uso do Painel Dev)

Ao rodar o jogo localmente com `npm run dev`, você terá acesso ao **Painel de Depuração** no canto inferior da tela. Este painel existe apenas para testar sistemas sem precisar esperar horas.

*   **Adicionar 1000 de Ouro:** Aperte para contornar gargalos financeiros durante os testes.
*   **Log GameState:** Útil para debugar no "Console" (F12 no navegador).

### Dicas de Teste Padrão
1. **Testando a Economia:** Altere a Taxa Base para 0.6. Aguarde 10 segundos e veja se o seu ouro sobe violentamente, mas acompanhe na barra lateral se o Risco de Revolta subiu junto.
2. **Testando o Save:** Clique em "Salvar Jogo Manual". Altere a velocidade do jogo. Feche a aba e abra de novo. Carregue o save. A velocidade deve voltar a ser a de antes do F5.