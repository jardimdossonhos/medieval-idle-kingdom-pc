# Implementation Plan

## Stage 2 - Runtime baseline

- Wire Vite + TypeScript + Pixi shell map
- Create `GameSession` loop with pause/resume/speed
- Implement `ClockService` and `TickPipeline`
- Build local repositories with IndexedDB
- Implement save slots and autosave rotation
- Build minimal HUD with resource strip + event list

## Stage 3 - Core systems

- Economy/resource production and upkeep formulas
- Population classes and unrest dynamics
- Technology tree progress and unlock modifiers
- Religion cohesion and conversion pressure
- Diplomacy matrix, treaties, coalition pressure
- War resolution loop with supply and distance modifiers
- NPC AI heuristic layer (personality + context + memory)
- Automation policies (manual/assisted/almost-auto)

## Stage 4 - Playable UI

- Start screen and campaign setup
- Main map + kingdom dashboard
- Panels: economy, military, diplomacy, religion, tech, administration
- Message feed with templated narrative events
- Save manager screen with summaries and restore
- Risk indicators, tooltips, and advisor hints

## Stage 5 - Refinement

- Initial balancing pass for progression and victory pacing
- Offline progression simulation on reopen
- Save recovery hardening and corruption handling
- Performance profiling and tick budget control
- Explicit sync serialization contracts for future multiplayer mode
