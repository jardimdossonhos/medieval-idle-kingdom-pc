import type { SaveSnapshot } from "../../core/contracts/game-ports";
import type { Treaty } from "../../core/models/diplomacy";
import { TechnologyDomain } from "../../core/models/enums";
import type { GameState } from "../../core/models/game-state";
import { buildTreatyId, buildWarIdFromSides, sortUniqueIds } from "../../core/models/identifiers";
import type { WarId } from "../../core/models/types";

export const SAVE_SCHEMA_VERSION = 2;

export interface SaveEnvelope {
  schemaVersion: number;
  storedAt: number;
  snapshot: SaveSnapshot;
}

export interface CurrentStateEnvelope {
  schemaVersion: number;
  storedAt: number;
  state: GameState;
}

export function toSaveEnvelope(snapshot: SaveSnapshot): SaveEnvelope {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    storedAt: Date.now(),
    snapshot
  };
}

export function isValidEnvelope(input: unknown): input is SaveEnvelope {
  return normalizeSaveEnvelope(input) !== null;
}

export function isValidGameStateShape(input: unknown): input is GameState {
  if (!input || typeof input !== "object") {
    return false;
  }

  const state = input as Partial<GameState>;
  return !!state.meta && !!state.campaign && !!state.world && !!state.kingdoms && !!state.victory;
}

function isKnownSchemaVersion(version: number): boolean {
  return Number.isInteger(version) && version >= 1 && version <= SAVE_SCHEMA_VERSION;
}

function migrateWars(state: GameState): void {
  const remappedWars: Record<WarId, GameState["wars"][string]> = {};
  const warIds = Object.keys(state.wars).sort();

  for (const [index, warId] of warIds.entries()) {
    const war = state.wars[warId];
    const attackers = sortUniqueIds(war.attackers);
    const defenders = sortUniqueIds(war.defenders);
    const stamp = Number.isFinite(war.startedAt) ? war.startedAt : state.meta.createdAt + index;
    const baseId = buildWarIdFromSides(attackers, defenders, stamp);

    let canonicalId = baseId;
    let collisionIndex = 1;
    while (remappedWars[canonicalId]) {
      canonicalId = `${baseId}~${collisionIndex}`;
      collisionIndex += 1;
    }

    remappedWars[canonicalId] = {
      ...war,
      id: canonicalId,
      attackers,
      defenders
    };
  }

  state.wars = remappedWars;
}

function migrateTreaties(state: GameState): void {
  const kingdomIds = Object.keys(state.kingdoms).sort();

  for (const kingdomId of kingdomIds) {
    const kingdom = state.kingdoms[kingdomId];
    const merged = new Map<string, Treaty>();

    for (const treaty of kingdom.diplomacy.treaties) {
      const parties = sortUniqueIds(treaty.parties);
      const signedAt = Number.isFinite(treaty.signedAt) ? treaty.signedAt : 0;
      const canonicalId = buildTreatyId(treaty.type, parties, signedAt);
      const normalized: Treaty = {
        ...treaty,
        id: canonicalId,
        parties,
        signedAt
      };

      const previous = merged.get(canonicalId);
      if (!previous || previous.signedAt <= normalized.signedAt) {
        merged.set(canonicalId, normalized);
      }
    }

    kingdom.diplomacy.treaties = Array.from(merged.values()).sort((left, right) => left.signedAt - right.signedAt);
  }
}

function migrateStateToCurrent(state: GameState): GameState {
  const migrated = structuredClone(state);
  migrateWars(migrated);
  migrateTreaties(migrated);

  for (const kingdomId of Object.keys(migrated.kingdoms).sort()) {
    const kingdom = migrated.kingdoms[kingdomId];
    if (!kingdom.technology.researchFocus) {
      kingdom.technology.researchFocus = TechnologyDomain.Administration;
    }
    if (typeof kingdom.technology.researchGoalId === "undefined") {
      kingdom.technology.researchGoalId = null;
    }

    for (const relationId of Object.keys(kingdom.diplomacy.relations).sort()) {
      const relation = kingdom.diplomacy.relations[relationId];
      if (!relation.actionCooldowns) {
        relation.actionCooldowns = {};
      }
    }
  }

  for (const regionId of Object.keys(migrated.world.regions).sort()) {
    const region = migrated.world.regions[regionId];
    if (!region.actionCooldowns) {
      region.actionCooldowns = {};
    }
  }

  migrated.meta.schemaVersion = SAVE_SCHEMA_VERSION;
  return migrated;
}

function extractSnapshot(input: unknown): SaveSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const snapshot = input as Partial<SaveSnapshot>;
  if (!snapshot.summary || !isValidGameStateShape(snapshot.state)) {
    return null;
  }

  return {
    summary: snapshot.summary,
    state: migrateStateToCurrent(snapshot.state)
  };
}

export function normalizeSaveEnvelope(input: unknown): SaveEnvelope | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const envelope = input as Partial<SaveEnvelope>;
  if (typeof envelope.schemaVersion !== "number" || !isKnownSchemaVersion(envelope.schemaVersion)) {
    return null;
  }

  if (typeof envelope.storedAt !== "number") {
    return null;
  }

  const snapshot = extractSnapshot(envelope.snapshot);
  if (!snapshot) {
    return null;
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    storedAt: envelope.storedAt,
    snapshot
  };
}

export function normalizeCurrentStateEnvelope(input: unknown): CurrentStateEnvelope | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const envelope = input as Partial<CurrentStateEnvelope>;

  if (typeof envelope.schemaVersion !== "number" || !isKnownSchemaVersion(envelope.schemaVersion)) {
    return null;
  }

  if (typeof envelope.storedAt !== "number" || !isValidGameStateShape(envelope.state)) {
    return null;
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    storedAt: envelope.storedAt,
    state: migrateStateToCurrent(envelope.state)
  };
}
