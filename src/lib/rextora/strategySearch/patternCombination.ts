/**
 * Canonical multi-pattern combination model (additive).
 * Legacy single-family eventSequences remain valid when combination is absent.
 */

import {
  buildFvgSequence,
  buildOrderBlockLongSequence,
  buildSupportResistanceSequence,
  buildSupplyDemandSequence,
  buildTrendlineSequence,
  normalizePatternBlockRole,
  type PatternFamily,
  type PatternFailurePolicy,
  type PatternBlockRole,
  type StrategyEventSequence,
} from "../strategy/definition/eventSequence";
import {
  ORDER_BLOCK_BASE_PARAMS,
  FVG_BASE_PARAMS,
  TRENDLINE_BASE_PARAMS,
  SUPPORT_RESISTANCE_BASE_PARAMS,
  SUPPLY_DEMAND_BASE_PARAMS,
  type PatternSearchFamilyId,
  isPatternSearchSpaceId,
  readFvgParams,
  readOrderBlockParams,
  readSupportResistanceParams,
  readSupplyDemandParams,
  readTrendlineParams,
} from "./patternSearchSpaces";
import { resolvePatternConfirmation } from "./patternConfirmation";
import {
  catalogForPatternFamily,
  type PatternParameterValue,
} from "./patternParameterCatalog";
import type { StrategySearchParameterRange } from "./types";

export const PATTERN_COMBINATION_VERSION = 1 as const;

export type { PatternBlockRole };

export type PatternCombinationOperator =
  | "and"
  | "or"
  | "sequence"
  | "weighted_score"
  | "priority";

export type PatternInvalidationMode = "any" | "all";
export type PatternCombinationFailurePolicy = PatternFailurePolicy;

export type PatternCombinationTemplateId =
  | "single"
  | "confluence"
  | "entry_confirmation"
  | "ordered_sequence"
  | "breakout_retest"
  | "zone_confluence"
  | "invalidation_composite";

export interface PatternCombinationBlock {
  id: string;
  family: PatternSearchFamilyId;
  role: PatternBlockRole;
  /** Ascending sequence order (0-based). */
  order: number;
  required: boolean;
  weight: number;
  priority: number;
  params: Record<string, number | string | boolean | null>;
}

export interface PatternCombinationSpec {
  version: typeof PATTERN_COMBINATION_VERSION;
  templateId: PatternCombinationTemplateId;
  operator: PatternCombinationOperator;
  failurePolicy: PatternCombinationFailurePolicy;
  /** Compatibility alias for pre-failurePolicy records. */
  invalidationMode: PatternInvalidationMode;
  weightedThreshold?: number;
  blocks: PatternCombinationBlock[];
}

/** Search-plan / candidate identity fields for combinations. */
export interface PatternCombinationPlanFields {
  patternCombinationTemplate: PatternCombinationTemplateId | null;
  patternCombinationOperator: PatternCombinationOperator | null;
  patternCombinationInvalidationMode: PatternInvalidationMode | null;
  patternCombinationFailurePolicy?: PatternCombinationFailurePolicy | null;
  /** Ordered pattern family ids (1–4). */
  patternCombinationFamilies: PatternSearchFamilyId[] | null;
  patternCombinationSpec?: PatternCombinationSpec | null;
}

const BLOCK_PARAM_PREFIX = "block.";

export function blockParameterKey(blockId: string, key: string): string {
  return `${BLOCK_PARAM_PREFIX}${blockId}.${key}`;
}

function readNamespacedBlockParams(
  params: Record<string, unknown>,
  blockId: string,
): Record<string, PatternParameterValue> {
  const prefix = `${BLOCK_PARAM_PREFIX}${blockId}.`;
  const out: Record<string, PatternParameterValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith(prefix)) continue;
    const field = key.slice(prefix.length);
    if (
      field &&
      (typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean")
    ) {
      out[field] = value;
    }
  }
  return out;
}

export const PATTERN_COMBINATION_TEMPLATES: Record<
  PatternCombinationTemplateId,
  {
    labelKo: string;
    operator: PatternCombinationOperator;
    invalidationMode: PatternInvalidationMode;
    roles: PatternBlockRole[];
    descriptionKo: string;
  }
> = {
  single: {
    labelKo: "단일 패턴",
    operator: "and",
    invalidationMode: "any",
    roles: ["entry_zone"],
    descriptionKo: "선택한 패턴 하나와 확인·진입·손절·익절을 사용합니다.",
  },
  confluence: {
    labelKo: "패턴 중첩",
    operator: "and",
    invalidationMode: "any",
    roles: ["entry_zone", "trend_filter"],
    descriptionKo: "진입 존과 방향 필터가 동시에 만족해야 합니다.",
  },
  entry_confirmation: {
    labelKo: "진입 + 확인",
    operator: "and",
    invalidationMode: "any",
    roles: ["entry_zone", "confirmation"],
    descriptionKo: "진입 존과 확인 패턴이 함께 충족되어야 합니다.",
  },
  ordered_sequence: {
    labelKo: "순서 시퀀스",
    operator: "sequence",
    invalidationMode: "any",
    roles: ["entry_zone", "confirmation"],
    descriptionKo: "패턴 A 생성 → 패턴 B 재방문 → 확인 → 진입 순서를 따릅니다.",
  },
  breakout_retest: {
    labelKo: "돌파 후 재진입",
    operator: "sequence",
    invalidationMode: "any",
    roles: ["entry_zone", "confirmation"],
    descriptionKo: "추세선·지지저항 돌파 후 재접촉·확인으로 진입합니다.",
  },
  zone_confluence: {
    labelKo: "존 중첩",
    operator: "and",
    invalidationMode: "any",
    roles: ["entry_zone", "trend_filter", "confirmation"],
    descriptionKo: "OB·FVG·지지저항이 정렬된 후 확인으로 진입합니다.",
  },
  invalidation_composite: {
    labelKo: "복합 무효화",
    operator: "and",
    invalidationMode: "any",
    roles: ["entry_zone", "invalidation"],
    descriptionKo: "설정된 무효화 조건이 충족되면 손절합니다.",
  },
};

const STRUCTURAL_FAMILIES: PatternSearchFamilyId[] = [
  "order_block",
  "fvg",
  "trendline",
  "support_resistance",
  "supply_demand",
];

const BLOCK_ROLES: readonly PatternBlockRole[] = [
  "trend_filter",
  "entry_zone",
  "confirmation",
  "invalidation",
  "stop_placement",
  "take_profit",
  "exit_filter",
];

/** Deep-clone, deterministically order, and freeze a combination snapshot. */
export function normalizePatternCombinationSpec(
  raw: unknown,
): PatternCombinationSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (
    source.version !== PATTERN_COMBINATION_VERSION ||
    !isPatternCombinationTemplateId(source.templateId) ||
    !isPatternCombinationOperator(source.operator) ||
    !Array.isArray(source.blocks) ||
    source.blocks.length < 1 ||
    source.blocks.length > 4 ||
    (source.failurePolicy !== undefined &&
      source.failurePolicy !== "any" &&
      source.failurePolicy !== "all" &&
      source.failurePolicy !== "majority") ||
    (source.invalidationMode !== undefined &&
      source.invalidationMode !== "any" &&
      source.invalidationMode !== "all")
  ) {
    return null;
  }
  const blocks: PatternCombinationBlock[] = [];
  for (const [index, value] of source.blocks.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const block = value as Record<string, unknown>;
    if (
      typeof block.family !== "string" ||
      !isPatternSearchSpaceId(block.family)
    ) {
      return null;
    }
    const role = normalizePatternBlockRole(String(block.role ?? ""));
    if (!role || !BLOCK_ROLES.includes(role)) return null;
    if (
      (block.required !== undefined && typeof block.required !== "boolean") ||
      (block.weight !== undefined &&
        (typeof block.weight !== "number" ||
          !Number.isFinite(block.weight) ||
          block.weight <= 0 ||
          block.weight > 100)) ||
      (block.priority !== undefined &&
        (typeof block.priority !== "number" ||
          !Number.isInteger(block.priority) ||
          block.priority < 0)) ||
      (block.order !== undefined &&
        (typeof block.order !== "number" ||
          !Number.isInteger(block.order) ||
          block.order < 0))
    ) {
      return null;
    }
    const paramsSource =
      block.params && typeof block.params === "object" && !Array.isArray(block.params)
        ? (block.params as Record<string, unknown>)
        : {};
    const params: Record<string, number | string | boolean | null> = {};
    for (const key of Object.keys(paramsSource).sort()) {
      const item = paramsSource[key];
      if (
        typeof item === "number" ||
        typeof item === "string" ||
        typeof item === "boolean" ||
        item === null
      ) {
        if (typeof item !== "number" || Number.isFinite(item)) params[key] = item;
      }
    }
    blocks.push(
      Object.freeze({
        id:
          typeof block.id === "string" && block.id.trim()
            ? block.id.trim().slice(0, 80)
            : blockId(block.family, index),
        family: block.family,
        role,
        order:
          typeof block.order === "number"
            ? block.order
            : index,
        required: typeof block.required === "boolean" ? block.required : true,
        weight:
          typeof block.weight === "number" && Number.isFinite(block.weight)
            ? block.weight
            : 1,
        priority:
          typeof block.priority === "number"
            ? block.priority
            : index,
        params: Object.freeze(params),
      }),
    );
  }
  blocks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const normalized: PatternCombinationSpec = {
    version: PATTERN_COMBINATION_VERSION,
    templateId: source.templateId,
    operator: source.operator,
    failurePolicy:
      source.failurePolicy === "any" ||
      source.failurePolicy === "all" ||
      source.failurePolicy === "majority"
        ? source.failurePolicy
        : source.invalidationMode === "all"
          ? "all"
          : "any",
    invalidationMode: source.invalidationMode === "all" ? "all" : "any",
    ...(typeof source.weightedThreshold === "number"
      ? { weightedThreshold: source.weightedThreshold }
      : {}),
    blocks,
  };
  const valid = validatePatternCombination(normalized);
  if (!valid.ok) return null;
  Object.freeze(blocks);
  return Object.freeze(normalized);
}

export function isPatternCombinationTemplateId(
  v: unknown,
): v is PatternCombinationTemplateId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(PATTERN_COMBINATION_TEMPLATES, v)
  );
}

export function isPatternCombinationOperator(
  v: unknown,
): v is PatternCombinationOperator {
  return (
    v === "and" ||
    v === "or" ||
    v === "sequence" ||
    v === "weighted_score" ||
    v === "priority"
  );
}

export function baseParamsForFamily(
  family: PatternSearchFamilyId,
): Record<string, number | boolean | string> {
  switch (family) {
    case "fvg":
      return { ...FVG_BASE_PARAMS };
    case "trendline":
      return { ...TRENDLINE_BASE_PARAMS };
    case "support_resistance":
      return { ...SUPPORT_RESISTANCE_BASE_PARAMS };
    case "supply_demand":
      return { ...SUPPLY_DEMAND_BASE_PARAMS };
    default:
      return { ...ORDER_BLOCK_BASE_PARAMS };
  }
}

export function materializePatternCombinationSpec(
  spec: PatternCombinationSpec,
): PatternCombinationSpec {
  const normalized = normalizePatternCombinationSpec({
    ...spec,
    blocks: spec.blocks.map((block) => ({
      ...block,
      params: {
        ...baseParamsForFamily(block.family),
        ...block.params,
      },
    })),
  });
  if (!normalized) {
    throw new Error("invalid pattern combination spec");
  }
  return normalized;
}

function blockId(family: PatternSearchFamilyId, order: number): string {
  return `${family}_${order}`;
}

export function validatePatternCombination(
  spec: PatternCombinationSpec,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (spec.version !== PATTERN_COMBINATION_VERSION) {
    errors.push(`unsupported combination version: ${String(spec.version)}`);
  }
  if (!isPatternCombinationTemplateId(spec.templateId)) {
    errors.push("invalid combination template");
  }
  if (!isPatternCombinationOperator(spec.operator)) {
    errors.push("invalid combination operator");
  }
  if (spec.invalidationMode !== "any" && spec.invalidationMode !== "all") {
    errors.push("invalid invalidation mode");
  }
  if (
    spec.failurePolicy !== "any" &&
    spec.failurePolicy !== "all" &&
    spec.failurePolicy !== "majority"
  ) {
    errors.push("invalid failure policy");
  }
  if (!Array.isArray(spec.blocks) || spec.blocks.length < 1) {
    errors.push("combination requires at least one pattern block");
    return { ok: false, errors };
  }
  if (spec.blocks.length > 4) {
    errors.push("combination supports at most four pattern blocks");
  }
  const families = new Set<string>();
  const ids = new Set<string>();
  let entryZones = 0;
  const orders = new Set<number>();
  const priorities = new Set<number>();
  let totalWeight = 0;
  for (const b of spec.blocks) {
    if (!isPatternSearchSpaceId(b.family)) {
      errors.push(`unsupported pattern family: ${b.family}`);
      continue;
    }
    if (!STRUCTURAL_FAMILIES.includes(b.family)) {
      errors.push(`family not combinable: ${b.family}`);
    }
    if (families.has(b.family)) {
      errors.push(`duplicate pattern block: ${b.family}`);
    }
    families.add(b.family);
    if (!b.id.trim() || ids.has(b.id)) {
      errors.push(`duplicate or missing block id: ${b.id}`);
    }
    ids.add(b.id);
    if (!BLOCK_ROLES.includes(b.role)) {
      errors.push(`invalid block role: ${b.role}`);
    }
    if (!isRoleFamilyAllowed(b.role, b.family)) {
      errors.push(`role ${b.role} is not valid for family ${b.family}`);
    }
    if (typeof b.required !== "boolean") {
      errors.push(`block required must be boolean: ${b.id}`);
    }
    if (!Number.isFinite(b.weight) || b.weight <= 0 || b.weight > 100) {
      errors.push(`block weight must be > 0 and <= 100: ${b.id}`);
    } else {
      totalWeight += b.weight;
    }
    if (!Number.isInteger(b.priority) || b.priority < 0) {
      errors.push(`block priority must be a nonnegative integer: ${b.id}`);
    } else if (spec.operator === "priority" && priorities.has(b.priority)) {
      errors.push(`duplicate block priority: ${b.priority}`);
    }
    priorities.add(b.priority);
    if (orders.has(b.order)) {
      errors.push(`duplicate block order: ${b.order}`);
    }
    orders.add(b.order);
    if (b.role === "entry_zone") entryZones += 1;
  }
  if (entryZones !== 1) {
    errors.push("combination requires exactly one entry_zone block");
  }
  if (spec.operator === "or" && spec.blocks.length < 2) {
    errors.push("OR combination requires at least two blocks");
  }
  if (spec.operator === "sequence" && spec.blocks.length < 2) {
    errors.push("SEQUENCE combination requires at least two blocks");
  }
  if (spec.operator === "sequence") {
    const sortedOrders = [...orders].sort((a, b) => a - b);
    if (sortedOrders.some((order, index) => order !== index)) {
      errors.push("SEQUENCE block order must be contiguous from zero");
    }
  }
  if (
    spec.operator === "weighted_score" &&
    (!Number.isFinite(spec.weightedThreshold) ||
      (spec.weightedThreshold ?? 0) <= 0 ||
      (spec.weightedThreshold ?? 0) > totalWeight)
  ) {
    errors.push("weighted_score requires threshold > 0 and <= total block weight");
  }
  return { ok: errors.length === 0, errors };
}

function isRoleFamilyAllowed(
  role: PatternBlockRole,
  family: PatternSearchFamilyId,
): boolean {
  if (role === "entry_zone" || role === "invalidation" || role === "stop_placement" || role === "take_profit") {
    return STRUCTURAL_FAMILIES.includes(family);
  }
  return isPatternSearchSpaceId(family);
}

export function buildCombinationSpec(input: {
  templateId: PatternCombinationTemplateId;
  families: PatternSearchFamilyId[];
  operator?: PatternCombinationOperator | null;
  invalidationMode?: PatternInvalidationMode | null;
  failurePolicy?: PatternCombinationFailurePolicy | null;
  weightedThreshold?: number | null;
  sharedParams?: Record<string, unknown>;
}): PatternCombinationSpec {
  const tpl = PATTERN_COMBINATION_TEMPLATES[input.templateId];
  const families = input.families
    .filter(isPatternSearchSpaceId)
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .slice(0, 4);
  const blocks: PatternCombinationBlock[] = families.map((family, order) => {
    const role =
      tpl.roles[Math.min(order, tpl.roles.length - 1)] ?? "entry_zone";
    const base = baseParamsForFamily(family);
    const shared = input.sharedParams ?? {};
    const params: Record<string, number | string | boolean | null> = {};
    for (const [k, v] of Object.entries({ ...base, ...shared })) {
      if (
        typeof v === "number" ||
        typeof v === "string" ||
        typeof v === "boolean" ||
        v == null
      ) {
        params[k] = v as number | string | boolean | null;
      }
    }
    return {
      id: blockId(family, order),
      family,
      role,
      order,
      required: true,
      weight: 1,
      priority: order,
      params,
    };
  });
  const built = {
    version: PATTERN_COMBINATION_VERSION,
    templateId: input.templateId,
    operator: input.operator ?? tpl.operator,
    invalidationMode: input.invalidationMode ?? tpl.invalidationMode,
    failurePolicy:
      input.failurePolicy ?? input.invalidationMode ?? tpl.invalidationMode,
    ...((input.operator ?? tpl.operator) === "weighted_score"
      ? {
          weightedThreshold:
            input.weightedThreshold ?? Math.max(1, Math.ceil(blocks.length / 2)),
        }
      : {}),
    blocks,
  };
  return built;
}

/** Merge combination identity keys into candidate params (for hashing). */
export function combinationParamsForCandidate(
  spec: PatternCombinationSpec,
): Record<string, number | boolean | string> {
  const exact = materializePatternCombinationSpec(spec);
  const sorted = [...exact.blocks].sort((a, b) => a.order - b.order);
  const identityBlocks = sorted.map((b) => ({
    id: b.id,
    family: b.family,
    role: b.role,
    order: b.order,
    required: b.required,
    weight: b.weight,
    priority: b.priority,
    params: Object.fromEntries(
      Object.keys(b.params)
        .sort()
        .map((key) => [key, b.params[key]]),
    ),
  }));
  const namespaced: Record<string, number | boolean | string> = {};
  for (const block of sorted) {
    for (const [key, value] of Object.entries(block.params)) {
      if (
        typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean"
      ) {
        namespaced[blockParameterKey(block.id, key)] = value;
      }
    }
  }
  return {
    combinationTemplate: exact.templateId,
    combinationOperator: exact.operator,
    combinationInvalidationMode: exact.invalidationMode,
    combinationFailurePolicy: exact.failurePolicy,
    combinationWeightedThreshold: exact.weightedThreshold ?? 0,
    combinationFamilies: sorted.map((b) => b.family).join("+"),
    combinationRoles: sorted.map((b) => `${b.family}:${b.role}`).join("|"),
    combinationOrders: sorted.map((b) => `${b.family}:${b.order}`).join("|"),
    combinationBlocks: JSON.stringify(identityBlocks),
    ...namespaced,
  };
}

export function combinationLabelKo(spec: PatternCombinationSpec): string {
  const sorted = [...spec.blocks].sort((a, b) => a.order - b.order);
  const fams = sorted.map((b) => familyShortKo(b.family));
  const op =
    spec.operator === "and"
      ? " AND "
      : spec.operator === "or"
        ? " OR "
        : spec.operator === "sequence"
          ? " → "
          : spec.operator === "weighted_score"
            ? " SCORE "
            : " PRIORITY ";
  return fams.join(op);
}

function familyShortKo(family: PatternSearchFamilyId): string {
  switch (family) {
    case "order_block":
      return "OB";
    case "fvg":
      return "FVG";
    case "trendline":
      return "TL";
    case "support_resistance":
      return "SR";
    case "supply_demand":
      return "SD";
    default:
      return family;
  }
}

function buildSingleFamilySequence(
  family: PatternSearchFamilyId,
  params: Record<string, unknown>,
): StrategyEventSequence {
  switch (family) {
    case "fvg":
      return buildFvgSequence(readFvgParams(params));
    case "trendline":
      return buildTrendlineSequence(readTrendlineParams(params));
    case "support_resistance":
      return buildSupportResistanceSequence(readSupportResistanceParams(params));
    case "supply_demand":
      return buildSupplyDemandSequence(readSupplyDemandParams(params));
    default:
      return buildOrderBlockLongSequence(readOrderBlockParams(params));
  }
}

/**
 * Build a canonical eventSequence with optional combination sidecar.
 * Primary steps come from the entry_zone (or first) block for shared entry/stop/TP.
 */
export function buildCombinedEventSequence(
  spec: PatternCombinationSpec,
  sharedParams: Record<string, unknown> = {},
): StrategyEventSequence | null {
  const exact = materializePatternCombinationSpec(spec);
  const validated = validatePatternCombination(exact);
  if (!validated.ok) return null;
  const sorted = [...exact.blocks].sort((a, b) => a.order - b.order);
  const entry =
    sorted.find((b) => b.role === "entry_zone") ?? sorted[0];
  if (!entry) return null;
  const merged = { ...entry.params, ...sharedParams };
  const confirm = resolvePatternConfirmation({
    confirmationMode:
      typeof merged.confirmationMode === "string"
        ? merged.confirmationMode
        : null,
    confirmationCandleCount:
      typeof merged.confirmationCandleCount === "number"
        ? merged.confirmationCandleCount
        : null,
    confirmationWindow:
      typeof merged.confirmationWindow === "number"
        ? merged.confirmationWindow
        : null,
    requireCloseInDirection:
      typeof merged.requireCloseInDirection === "boolean"
        ? merged.requireCloseInDirection
        : null,
  });
  const withConfirm = {
    ...merged,
    confirmationMode: confirm.confirmationMode,
    confirmationCandleCount: confirm.confirmationCandleCount,
    confirmationWindow: confirm.confirmationWindow,
    requireCloseInDirection: confirm.confirmationMode !== "none",
  };
  const seq = buildSingleFamilySequence(entry.family, withConfirm);
  return {
    ...seq,
    combination: {
      version: PATTERN_COMBINATION_VERSION,
      templateId: exact.templateId,
      operator: exact.operator,
      invalidationMode: exact.invalidationMode,
      failurePolicy: exact.failurePolicy,
      ...(exact.weightedThreshold != null
        ? { weightedThreshold: exact.weightedThreshold }
        : {}),
      blocks: sorted.map((b) => ({
        id: b.id,
        family: b.family as PatternFamily,
        role: b.role,
        order: b.order,
        required: b.required,
        weight: b.weight,
        priority: b.priority,
        params: b.params,
      })),
    },
  };
}

export function resolveCombinationFromParams(
  params: Record<string, unknown>,
): PatternCombinationSpec | null {
  if (typeof params.combinationBlocks === "string") {
    try {
      const parsed = JSON.parse(params.combinationBlocks) as unknown;
      if (Array.isArray(parsed)) {
        const templateId = isPatternCombinationTemplateId(
          params.combinationTemplate,
        )
          ? params.combinationTemplate
          : "confluence";
        const operator = isPatternCombinationOperator(
          params.combinationOperator,
        )
          ? params.combinationOperator
          : PATTERN_COMBINATION_TEMPLATES[templateId].operator;
        const invalidationMode =
          params.combinationInvalidationMode === "all" ? "all" : "any";
        const raw = {
          version: PATTERN_COMBINATION_VERSION,
          templateId,
          operator,
          invalidationMode,
          failurePolicy:
            params.combinationFailurePolicy === "all" ||
            params.combinationFailurePolicy === "majority"
              ? params.combinationFailurePolicy
              : invalidationMode,
          weightedThreshold:
            typeof params.combinationWeightedThreshold === "number"
              ? params.combinationWeightedThreshold
              : undefined,
          blocks: parsed.map((item) => {
            if (!item || typeof item !== "object") return item;
            const block = item as Record<string, unknown>;
            const id = typeof block.id === "string" ? block.id : "";
            return {
              ...block,
              params: {
                ...(block.params &&
                typeof block.params === "object" &&
                !Array.isArray(block.params)
                  ? block.params
                  : {}),
                ...readNamespacedBlockParams(params, id),
              },
            };
          }),
        };
        const normalized = normalizePatternCombinationSpec(raw);
        if (normalized) return normalized;
      }
    } catch {
      // Legacy family fields below remain the compatibility fallback.
    }
  }
  const familiesRaw = params.combinationFamilies;
  let families: PatternSearchFamilyId[] = [];
  if (typeof familiesRaw === "string" && familiesRaw.trim()) {
    families = familiesRaw
      .split("+")
      .map((s) => s.trim())
      .filter(isPatternSearchSpaceId);
  } else if (Array.isArray(familiesRaw)) {
    families = familiesRaw.filter(isPatternSearchSpaceId);
  }
  if (families.length === 0) return null;
  const templateId = isPatternCombinationTemplateId(
    params.combinationTemplate,
  )
    ? params.combinationTemplate
    : families.length === 1
      ? "single"
      : "confluence";
  const operator = isPatternCombinationOperator(params.combinationOperator)
    ? params.combinationOperator
    : PATTERN_COMBINATION_TEMPLATES[templateId].operator;
  const invalidationMode =
    params.combinationInvalidationMode === "all" ? "all" : "any";
  const failurePolicy =
    params.combinationFailurePolicy === "all" ||
    params.combinationFailurePolicy === "majority"
      ? params.combinationFailurePolicy
      : invalidationMode;
  return buildCombinationSpec({
    templateId,
    families,
    operator,
    invalidationMode,
    failurePolicy,
    weightedThreshold:
      typeof params.combinationWeightedThreshold === "number"
        ? params.combinationWeightedThreshold
        : null,
    sharedParams: params,
  });
}

export function combinationMutationRanges(
  spec: PatternCombinationSpec,
): StrategySearchParameterRange[] {
  return spec.blocks.flatMap((block) =>
    catalogForPatternFamily(block.family)
      .filter((entry) => entry.mutationEligible)
      .map((entry) => ({
        key: blockParameterKey(block.id, entry.key),
        min: entry.min,
        max: entry.max,
        step: entry.step,
        valueType:
          entry.type === "int"
            ? ("integer" as const)
            : entry.type === "bool"
              ? ("boolean" as const)
              : entry.type,
        ...(entry.allowedEnumValues
          ? { enumValues: [...entry.allowedEnumValues] }
          : {}),
        defaultValue:
          block.params[entry.key] === null ||
          block.params[entry.key] === undefined
            ? entry.default
            : (block.params[entry.key] as PatternParameterValue),
      })),
  );
}

export function defaultFamiliesForTemplate(
  templateId: PatternCombinationTemplateId,
): PatternSearchFamilyId[] {
  switch (templateId) {
    case "single":
      return ["order_block"];
    case "confluence":
    case "entry_confirmation":
      return ["order_block", "fvg"];
    case "ordered_sequence":
      return ["order_block", "fvg"];
    case "breakout_retest":
      return ["trendline", "support_resistance"];
    case "zone_confluence":
      return ["order_block", "fvg", "support_resistance"];
    case "invalidation_composite":
      return ["order_block", "trendline"];
    default:
      return ["order_block"];
  }
}

const MUTATABLE_OPERATORS: PatternCombinationOperator[] = [
  "and",
  "or",
  "sequence",
];

/**
 * Structural mutation for combined-pattern candidates.
 * Never invents contradictory long/short roles; preserves entry_zone.
 */
export function mutateCombinationParams(
  params: Record<string, string | number | boolean>,
  random: { nextFloat: (min: number, max: number) => number },
): Record<string, string | number | boolean> {
  const combo = resolveCombinationFromParams(params);
  if (!combo || combo.blocks.length < 1) return params;
  const roll = random.nextFloat(0, 1);
  let blocks = combo.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((block) => ({ ...block, params: { ...block.params } }));
  let operator = combo.operator;
  let templateId = combo.templateId;
  let invalidationMode = combo.invalidationMode;
  let failurePolicy = combo.failurePolicy;

  if (roll < 0.25 && blocks.length < 4) {
    const missing = STRUCTURAL_FAMILIES.filter(
      (family) => !blocks.some((block) => block.family === family),
    );
    if (missing.length > 0) {
      const pick = missing[Math.floor(random.nextFloat(0, missing.length))]!;
      const order = blocks.length;
      blocks.push({
        id: blockId(pick, order),
        family: pick,
        role: "trend_filter",
        order,
        required: true,
        weight: 1,
        priority: order,
        params: baseParamsForFamily(pick),
      });
      if (templateId === "single") templateId = "confluence";
    }
  } else if (roll < 0.4 && blocks.length > 1) {
    const removable = blocks.filter((block) => block.role !== "entry_zone");
    const drop = removable[Math.floor(random.nextFloat(0, removable.length))];
    blocks = blocks
      .filter((block) => block.id !== drop?.id)
      .map((block, order) => ({ ...block, order }));
    if (blocks.length === 1) templateId = "single";
  } else if (roll < 0.55) {
    operator =
      MUTATABLE_OPERATORS[
        Math.floor(random.nextFloat(0, MUTATABLE_OPERATORS.length))
      ]!;
    if (operator === "sequence") templateId = "ordered_sequence";
    else if (operator === "or" && templateId === "ordered_sequence") {
      templateId = "confluence";
    }
  } else if (roll < 0.7 && blocks.length > 1) {
    const i = Math.floor(random.nextFloat(0, blocks.length));
    const j = Math.floor(random.nextFloat(0, blocks.length));
    if (i !== j) {
      const next = [...blocks];
      const tmp = next[i]!;
      next[i] = next[j]!;
      next[j] = tmp;
      blocks = next.map((block, order) => ({ ...block, order }));
    }
  } else if (roll < 0.85) {
    invalidationMode = invalidationMode === "any" ? "all" : "any";
    failurePolicy = invalidationMode;
  }

  const spec: PatternCombinationSpec = {
    version: PATTERN_COMBINATION_VERSION,
    operator,
    templateId,
    invalidationMode,
    failurePolicy,
    ...(operator === "weighted_score"
      ? {
          weightedThreshold: Math.min(
            combo.weightedThreshold ?? Math.max(1, Math.ceil(blocks.length / 2)),
            blocks.reduce((sum, block) => sum + block.weight, 0),
          ),
        }
      : {}),
    blocks,
  };
  const validated = validatePatternCombination(spec);
  if (!validated.ok) return params;
  return { ...params, ...combinationParamsForCandidate(spec) };
}
