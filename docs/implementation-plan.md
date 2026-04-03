
## Stage 2 - Runtime baseline

- Wire Vite + TypeScript + Pixi shell map
- Create `GameSession` loop with pause/resume/speed
- Implement `ClockService` and `TickPipeline`
- Build local repositories with IndexedDB
- Implement save slots and autosave rotation
- Build minimal HUD with resource strip + event list

## Stage 3 - Core systems

- [x] Economy/resource production and upkeep formulas
- [x] Religion cohesion, conversion pressure, custom beliefs and border osmosis
- Diplomacy matrix, treaties, coalition pressure
- [x] War resolution loop with supply and logistic distance modifiers
- [x] NPC AI heuristic layer (personality + context + memory + fog of truth)
- [x] Automation policies (manual/assisted/almost-auto)

## Stage 4 - Playable UI
- Start screen and campaign setup
- Main map + kingdom dashboard
- Panels: economy, military, diplomacy, religion, tech, administration
- Message feed with templated narrative events
- Save manager screen with summaries and restore
- [x] Risk indicators, tooltips, and advisor hints (Context-Aware Council)

## Stage 5 - Refinement

- Initial balancing pass for progression and victory pacing
- [x] Offline progression simulation on reopen
- Save recovery hardening and corruption handling
- Performance profiling and tick budget control
- Explicit sync serialization contracts for future multiplayer mode
