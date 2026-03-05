# Medieval Idle Kingdom

Browser-first grand strategy idle game architecture focused on local simulation depth.

## Stage status

- Stage 1 complete: architecture, contracts, domain model, and implementation plan.
- Stage 2 onward: simulation runtime, persistence adapters, and full gameplay systems.

## Design goals

- Local-first single-player runtime
- Static hosting compatibility (GitHub Pages and similar)
- Deep systemic simulation over click-heavy gameplay
- Explicit clean boundaries for a future async multiplayer layer

## Run (after installing dependencies)

```bash
npm install
npm run dev
```

## Structure

- `src/core`: domain model and simulation contracts
- `src/application`: orchestration and use-case boundaries
- `src/infrastructure`: adapters (save, clock, sync, rendering)
- `src/ui`: screen/view-model contracts
- `docs`: architecture and execution plan
