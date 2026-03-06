# Medieval Idle Kingdom

Browser-first grand strategy idle game architecture focused on local simulation depth.

## Stage status

- Stage 1 complete: architecture, contracts, domain model, and implementation plan.
- Stage 2 complete: runtime loop, local persistence, autosave slots, and playable HUD/map shell.
- Stage 3 in progress: economy/population/technology + religion/administration/war/automation + NPC heuristics.

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

Para testar no celular (mesma rede local):

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## Structure

- `src/core`: domain model and simulation contracts
- `src/application`: orchestration and use-case boundaries
- `src/infrastructure`: adapters (save, clock, sync, rendering)
- `src/ui`: screen/view-model contracts
- `docs`: architecture and execution plan
