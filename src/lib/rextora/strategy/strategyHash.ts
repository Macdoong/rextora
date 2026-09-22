import { createHash } from "node:crypto";
import type { CanonicalStrategyDefinition, ConditionNode } from "./definition/types";
import { normalizePatternBlockRole } from "./definition/eventSequence";
import type { SafeV44Params } from "./strategyTypes";

/** Stable params_hash for strategy snapshots (12 hex chars). */
export function computeParamsHash(params: SafeV44Params | Record<string, unknown>): string {
  const keys = Object.keys(params).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = (params as Record<string, unknown>)[key];
  }
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 12);
}

/** Retired. Canonical SAFE hash lock is no longer used at runtime. */
export function isLockedSafeHash(_hash: string): boolean {
  return false;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function identityCondition(node: ConditionNode): unknown {
  if (node.type === "group") {
    return {
      type: "group",
      operator: node.operator,
      enabled: node.enabled,
      timeframeOverride: node.timeframeOverride ?? null,
      children: node.children.map(identityCondition),
    };
  }
  return {
    type: node.type,
    category: node.category,
    enabled: node.enabled,
    timeframeOverride: node.timeframeOverride ?? null,
    parameters: stableValue(node.parameters),
    comparison: node.comparison,
    value: stableValue(node.value),
  };
}

function identityEventSequence(
  sequence: CanonicalStrategyDefinition["eventSequence"],
): unknown {
  if (!sequence) return null;
  const combination = sequence.combination;
  return {
    version: sequence.version,
    direction: sequence.direction,
    steps: sequence.steps.map((step) => ({
      kind: step.kind,
      patternFamily: step.patternFamily ?? null,
      params: stableValue(step.params),
    })),
    combination: combination
      ? {
          version: combination.version,
          templateId: combination.templateId,
          operator: combination.operator,
          failurePolicy:
            combination.failurePolicy ?? combination.invalidationMode ?? "any",
          invalidationMode: combination.invalidationMode ?? "any",
          weightedThreshold: combination.weightedThreshold ?? null,
          blocks: [...combination.blocks]
            .map((block, index) => ({
              id: block.id,
              family: block.family,
              role:
                normalizePatternBlockRole(block.role) ?? String(block.role),
              order: block.order,
              required: block.required ?? true,
              weight: block.weight ?? 1,
              priority: block.priority ?? index,
              params: stableValue(block.params),
            }))
            .sort(
              (a, b) =>
                a.order - b.order ||
                String(a.id).localeCompare(String(b.id)),
            ),
        }
      : null,
  };
}

const VOLATILE_METADATA_KEYS = new Set([
  "alias",
  "displayAlias",
  "displayName",
  "name",
  "strategyName",
  "createdAt",
  "updatedAt",
  "timestamp",
]);

/**
 * Definition-based behavior identity. It deliberately excludes ids, editable
 * names/descriptions, provenance, validation labels, and volatile timestamps.
 */
export function canonicalStrategyIdentity(
  definition: CanonicalStrategyDefinition,
): Record<string, unknown> {
  const metadata = Object.fromEntries(
    Object.entries(definition.metadata ?? {}).filter(
      ([key]) => !VOLATILE_METADATA_KEYS.has(key),
    ),
  );
  return stableValue({
    schemaVersion: definition.schemaVersion,
    strategyType: definition.strategyType,
    version: definition.version,
    timeframe: definition.timeframe,
    symbols: [...definition.symbols],
    longEnabled: definition.longEnabled,
    shortEnabled: definition.shortEnabled,
    entryConditions: {
      long: identityCondition(definition.entryConditions.long),
      short: identityCondition(definition.entryConditions.short),
    },
    exitConditions: {
      long: identityCondition(definition.exitConditions.long),
      short: identityCondition(definition.exitConditions.short),
    },
    filters: definition.filters,
    risk: definition.risk,
    positionSizing: definition.positionSizing,
    execution: definition.execution,
    metadata,
    safeParams: definition.safeParams ?? null,
    eventSequence: identityEventSequence(definition.eventSequence),
  }) as Record<string, unknown>;
}

/** Stable full-length SHA-256 hash of canonical strategy behavior. */
export function computeStrategyHash(
  definition: CanonicalStrategyDefinition,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalStrategyIdentity(definition)))
    .digest("hex");
}
