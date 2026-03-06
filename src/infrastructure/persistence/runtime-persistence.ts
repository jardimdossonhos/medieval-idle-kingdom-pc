import type {
  CommandLogRepository,
  GameStateRepository,
  SaveRepository,
  SnapshotRepository
} from "../../core/contracts/game-ports";
import {
  DesktopFileCommandLogRepository,
  DesktopFileGameStateRepository,
  DesktopFileSaveRepository,
  DesktopFileSnapshotRepository
} from "./desktop-file-repositories";
import {
  IndexedDbCommandLogRepository,
  IndexedDbGameStateRepository,
  IndexedDbSaveRepository,
  IndexedDbSnapshotRepository
} from "./indexeddb-repositories";
import { getDesktopBridge } from "../runtime/desktop-bridge";

export interface RuntimePersistenceBundle {
  mode: "desktop" | "browser";
  gameStateRepository: GameStateRepository;
  saveRepository: SaveRepository;
  commandLogRepository: CommandLogRepository;
  snapshotRepository: SnapshotRepository;
}

export function createRuntimePersistenceBundle(): RuntimePersistenceBundle {
  const bridge = getDesktopBridge();

  if (bridge) {
    return {
      mode: "desktop",
      gameStateRepository: new DesktopFileGameStateRepository(bridge),
      saveRepository: new DesktopFileSaveRepository(bridge),
      commandLogRepository: new DesktopFileCommandLogRepository(bridge),
      snapshotRepository: new DesktopFileSnapshotRepository(bridge)
    };
  }

  return {
    mode: "browser",
    gameStateRepository: new IndexedDbGameStateRepository(),
    saveRepository: new IndexedDbSaveRepository(),
    commandLogRepository: new IndexedDbCommandLogRepository(),
    snapshotRepository: new IndexedDbSnapshotRepository()
  };
}
