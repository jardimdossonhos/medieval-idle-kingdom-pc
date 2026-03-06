# Medieval Idle Kingdom

Browser-first grand strategy idle game architecture focused on local simulation depth.

## Stage status

- Stage 1 complete: architecture, contracts, domain model, and implementation plan.
- Stage 2 complete: runtime loop, local persistence, autosave slots, and playable HUD/map shell.
- Stage 3 in progress: economy/population/technology + religion/administration/war/automation + NPC heuristics.
- Milestone M1 complete: world map/state with 200+ countries, owner/unrest/war layers, click-to-select, and zoom/pan.
- Milestone M2 started: NPC↔NPC decision expansion + aggregated world-activity events.

## Design goals

- Local-first single-player runtime
- Static hosting compatibility (GitHub Pages and similar)
- Deep systemic simulation over click-heavy gameplay
- Explicit clean boundaries for a future async multiplayer layer

## Run (after installing dependencies)

```bash
npm install
npm run map:build
npm run dev
```

## Desktop local (Windows)

O projeto agora pode rodar como aplicativo desktop offline com `Electron`.

Executar localmente:

```bash
npm install
npm run build
npm run desktop
```

Atalho equivalente:

```bash
npm run desktop:run
```

Gerar build Windows:

```bash
npm run desktop:dist
```

Saída do pacote:

- `release/Medieval Idle Kingdom Setup *.exe`
- `release/Medieval Idle Kingdom *.exe` (portable)

Persistência desktop:

- os saves deixam de depender de `IndexedDB`
- o app grava JSON local em `%APPDATA%/Medieval Idle Kingdom/game-data`
- isso prepara import/export, backup e futura sincronização LAN/internet

Para testar no celular (mesma rede local):

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## World map data source

- Source: `world-atlas` (`countries-50m`) and `topojson-client` neighbors.
- Generated outputs:
  - `public/assets/maps/world-countries-v1.geojson`
  - `public/assets/maps/world-definitions-v1.json`
  - `src/application/boot/generated/world-definitions-v1.ts`
- Generator: `scripts/generate-world-geojson.mjs` (`npm run map:build`).

## Structure

- `src/core`: domain model and simulation contracts
- `src/application`: orchestration and use-case boundaries
- `src/infrastructure`: adapters (save, clock, sync, rendering)
- `src/ui`: screen/view-model contracts
- `desktop`: shell Electron, preload bridge e persistência local em arquivo
- `docs`: architecture and execution plan
