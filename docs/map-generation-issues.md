# Histórico de Problemas na Geração do Mapa (Resolvidos)

Este documento detalha os problemas que foram identificados no processo de geração do mapa procedural do mundo e como foram definitivamente resolvidos.

## 1. O Problema da Escala Hexagonal e Estreitos Fechados

**Descrição do Sintoma Anterior:** Estreitos críticos (Gibraltar, Bósforo, Ormuz, Bab el-Mandeb) apareciam fechados, fundindo continentes. Ao mesmo tempo, istmos finos (Canal do Panamá) apareciam abertos como mar, desconectando as Américas.
**A Causa:** O script utiliza um raio de `75.000m` (150km de diâmetro) para manter a excelente performance de rendering. Como o centro matemático destes hexágonos frequentemente caía do lado "errado" das linhas costeiras, passagens vitais eram obliteradas.

## 2. A Solução Definitiva (Implementada com Sucesso)

A resolução do problema envolveu uma dupla abordagem arquitetural que atingiu o estado ideal desejado:

1. **Upgrade de Resolução Base:** Substituímos o arquivo `ne_50m_land.geojson` original pela versão de altíssima fidelidade **`ne_10m_land.geojson`** (Natural Earth 1:10m). Isso corrigiu as inconsistências gerais do relevo costeiro global.
2. **Patches Cirúrgicos (Bounding Boxes):** A aplicação de zonas matemáticas forçadas no `generate-world-geojson.mjs`. Injetamos regras que forçam hexágonos a serem tratados como "Água" (para rasgar os estreitos fundidos artificialmente) ou "Terra" (para fechar falsos canais como o Panamá).

**Status Atual:** Validado. O mapa geográfico procedural agora reflete a fidelidade e as passagens de navegação do globo terrestre de forma contínua, coesa e com alto desempenho (combinado ao Expurgo Oceânico no ECS).

## 3. O Colapso de Renderização do WebGL (Linha de Corte MVT)

**Descrição do Sintoma Anterior:** O mapa parava de renderizar do meio para cima. Uma linha invisível cortava a Austrália, África e América do Sul na horizontal, deixando todo o resto da tela (Norte) preenchido com a cor de background (cinza).
**A Causa:** O formato Mapbox Vector Tiles (MVT) requer que os elementos geográficos (features) possuam um `id` numérico primário no nível de topo do protobuffer para otimização da Placa de Vídeo. Como não tínhamos explicitado qual propriedade usar, o MapLibre gerava IDs voláteis na memória. Ao chegar em latitudes centrais, ele engasgava no gerenciamento de memória e abortava silenciosamente o *shader pipeline*.
**A Solução Definitiva:** Acionamento do parâmetro `promoteId: "regionId"` direto na injeção da *source* de vector tiles do `maplibre-world-renderer.ts`. A Placa de Vídeo agora mapeia as chaves literais com sucesso, renderizando as ~20.000 massas de terra de uma só vez, revelando o mundo inteiro.
