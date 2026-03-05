import type { SyncAdapter, SyncEnvelope } from "../../core/contracts/services";
import type { GameState } from "../../core/models/game-state";

export class LocalOnlySyncAdapter implements SyncAdapter {
  async push(_state: GameState): Promise<void> {
    return;
  }

  async pull(): Promise<SyncEnvelope | null> {
    return null;
  }

  async merge(localState: GameState, _remoteEnvelope: SyncEnvelope): Promise<GameState> {
    return localState;
  }
}
