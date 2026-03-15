﻿# Estratégia de Testes - Medieval Idle Kingdom

Este documento descreve os procedimentos e ferramentas de teste para garantir a estabilidade e a qualidade do jogo.

## 1. Tipos de Teste

*   **Testes Unitários:**
    *   **Ferramenta:** `vitest`.
    *   **Objetivo:** Validar pequenas unidades de lógica pura, principalmente dentro do diretório `src/core`.
    *   **Exemplo:** `technology-effects-service.test.ts` verifica se o cálculo de bônus de tecnologia está correto.

*   **Testes Automatizados de Ponta a Ponta (E2E - End-to-End):**
    *   **Ferramenta:** Playwright.
    *   **Objetivo:** Automatizar o "Checklist de Teste Manual". Simula um usuário real interagindo com o jogo para garantir que os fluxos principais (carregar, salvar, interagir com a UI) não sejam quebrados.
    *   **Localização:** `tests/e2e/`.
    *   **Exemplos:** `smoke.spec.ts`, `debug-panel.spec.ts`.
    *   **Comando para executar:** `npm run test:e2e`

*   **Testes Manuais Guiados (Checklist):**
    *   **Ferramenta:** O próprio jogo, utilizando o Painel de Depuração.
    *   **Objetivo:** Validar os principais fluxos do usuário após cada mudança significativa.

*   **Testes de Regressão Visual:**
    *   **Ferramenta:** Inspeção visual.
    *   **Objetivo:** Garantir que mudanças no CSS ou na estrutura HTML não quebrem o layout em diferentes partes da aplicação.

## 2. Checklist de Teste Manual (Smoke Test)

Antes de mesclar uma nova funcionalidade, os seguintes cenários devem ser verificados e passar sem erros:

1.  **Inicialização e Persistência:**
    *   [ ] O jogo carrega sem erros no console.
    *   [ ] Ao recarregar a página (`F5`), o jogo continua do estado em que parou (recursos, ciclo, etc.).
    *   [ ] O botão "Salvar Jogo" cria um save na lista.
    *   [ ] O botão "Carregar" em um save restaura o estado daquele save corretamente.
    *   [ ] O botão "Excluir" remove o save da lista.

2.  **Interação Básica da UI:**
    *   [ ] Clicar em uma região no mapa exibe suas informações corretamente.
    *   [ ] A troca de abas (Governo, Tecnologia, etc.) funciona e exibe o painel correto.
    *   [ ] Os botões de pausa/velocidade funcionam e o status na UI é atualizado.