# Dados de mapa (Milestone 2)

Arquivo principal:
- `public/assets/maps/world-countries-v1.geojson`

Arquivo fallback:
- `public/assets/maps/world-countries-v0.geojson`

Status atual:
- `v1` é gerado automaticamente a partir de `world-atlas/countries-50m.json`.
- Total atual: **241 países**.
- Países da campanha inicial são mapeados para `regionId` existentes (`r_iberia_north`, etc.).
- Países fora da campanha aparecem no mapa com status "Fora da campanha inicial" ao clicar.

## Origem e licença
- Fonte: pacote `world-atlas` (derivado de Natural Earth, uso aberto para dados geográficos públicos).
- Uso no projeto: conversão TopoJSON -> GeoJSON para render local-first em MapLibre.

## Pipeline de geração
1. Instalar dependências (`topojson-client`, `world-atlas`).
2. Rodar:
   - `npm run map:build`
3. O script `scripts/generate-world-geojson.mjs` gera/atualiza `public/assets/maps/world-countries-v1.geojson`.

## Propriedades esperadas por feature
- `regionId`: ID estável usado pelo jogo
- `name`: nome do país
- `isoN3`: código ISO numérico quando disponível
- `campaignMapped`: `true` quando mapeado para região jogável inicial
- `source`: origem do dado (`world-atlas-50m`)

Observação:
- O projeto permanece compatível com hospedagem estática; os assets ficam em `public/assets/maps`.
