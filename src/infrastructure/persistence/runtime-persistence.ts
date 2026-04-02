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
import { WebFsGameStateRepository, WebFsSaveRepository } from "./web-fs-repositories";

export interface RuntimePersistenceBundle {
  mode: "desktop" | "browser";
  gameStateRepository: GameStateRepository;
  saveRepository: SaveRepository;
  commandLogRepository: CommandLogRepository;
  snapshotRepository: SnapshotRepository;
}

export function createRuntimePersistenceBundle(campaignId: string, fsDirHandle?: any): RuntimePersistenceBundle {
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

  // Solução 3 (Web File System API): Escrita profunda em HD Bypassando a Sandbox
  if (fsDirHandle) {
    return {
      mode: "browser",
      gameStateRepository: new WebFsGameStateRepository(fsDirHandle),
      saveRepository: new WebFsSaveRepository(fsDirHandle),
      commandLogRepository: new IndexedDbCommandLogRepository(campaignId), // Logs pesados continuam temporários no navegador
      snapshotRepository: new IndexedDbSnapshotRepository(campaignId)
    };
  }

  return {
    mode: "browser",
    gameStateRepository: new IndexedDbGameStateRepository(campaignId),
    saveRepository: new IndexedDbSaveRepository(campaignId),
    commandLogRepository: new IndexedDbCommandLogRepository(campaignId),
    snapshotRepository: new IndexedDbSnapshotRepository(campaignId)
  };
}
