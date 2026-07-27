/**
 * Operator-facing Korean labels for multi-pattern block evidence.
 * Consumes persisted trace fields only — no inference.
 */

import type { PatternBlockEvidence } from "../strategy/eventSequenceBacktest";
import { normalizePatternBlockRole } from "../strategy/definition/eventSequence";
import { formatPenetrationKo } from "./tradeEventTrace";

const FAMILY_KO: Record<string, string> = {
  order_block: "Order Block",
  fvg: "FVG",
  trendline: "Trendline",
  support_resistance: "Support / Resistance",
  supply_demand: "Supply / Demand",
};

const ROLE_KO: Record<string, string> = {
  entry_zone: "진입 구역",
  trend_filter: "방향 필터",
  direction_filter: "방향 필터",
  confirmation: "확인",
  invalidation: "무효화",
  stop_placement: "손절 기준",
  take_profit: "익절 기준",
  exit_filter: "청산 필터",
};

const STATUS_KO: Record<string, string> = {
  detected: "감지 완료",
  missing: "미달성",
  failed: "실패",
  optional_skipped: "선택 생략",
};

export function patternFamilyKo(family: string): string {
  return FAMILY_KO[family] ?? family;
}

export function patternBlockRoleKo(role: string): string {
  const normalized = normalizePatternBlockRole(role) ?? role;
  return ROLE_KO[role] ?? ROLE_KO[normalized] ?? role;
}

export function patternBlockStatusKo(status: string): string {
  return STATUS_KO[status] ?? status;
}

export function formatBlockMeasuredKo(block: PatternBlockEvidence): string | null {
  const penetration = block.measuredValues?.penetrationPct;
  if (typeof penetration === "number") {
    return formatPenetrationKo(penetration);
  }
  if (block.measured != null && block.threshold != null) {
    return `측정 ${block.measured} · 기준 ${block.threshold}`;
  }
  if (block.touchCount != null) {
    return `접촉 ${block.touchCount}회`;
  }
  return null;
}

export function formatBlockThresholdKo(block: PatternBlockEvidence): string | null {
  const entries = Object.entries(block.thresholds ?? {});
  if (!entries.length) return null;
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(" · ");
}

export type PatternBlockSection = {
  id: string;
  title: string;
  role: string;
  items: string[];
};

const ROLE_SECTION_ORDER = [
  "entry_zone",
  "trend_filter",
  "direction_filter",
  "confirmation",
  "invalidation",
  "stop_placement",
  "take_profit",
  "exit_filter",
];

export function buildPatternBlockSections(
  blocks: PatternBlockEvidence[],
): PatternBlockSection[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  return sorted.map((block) => {
    const roleKey = normalizePatternBlockRole(block.role) ?? block.role;
    const items: string[] = [];
    items.push(patternBlockStatusKo(block.status));
    const measured = formatBlockMeasuredKo(block);
    if (measured) items.push(measured);
    const threshold = formatBlockThresholdKo(block);
    if (threshold) items.push(`조건 ${threshold}`);
    if (block.creationTime) items.push(`생성 ${block.creationTime.slice(0, 19).replace("T", " ")}`);
    if (block.revisitTime) items.push(`리테스트 ${block.revisitTime.slice(0, 19).replace("T", " ")}`);
    if (block.confirmationTime)
      items.push(`확인 ${block.confirmationTime.slice(0, 19).replace("T", " ")}`);
    if (block.invalidationTime)
      items.push(`무효화 ${block.invalidationTime.slice(0, 19).replace("T", " ")}`);
    if (block.zoneHigh != null && block.zoneLow != null) {
      items.push(`존 ${block.zoneLow}–${block.zoneHigh}`);
    }
    if (block.lineAnchors?.length) {
      items.push(`추세선 앵커 ${block.lineAnchors.length}개`);
    }
    if (block.operatorPassed === true) items.push("조합 조건 통과");
    if (block.reasonCode) items.push(`사유 ${block.reasonCode}`);
    if (block.stopPrice != null) items.push(`손절 ${block.stopPrice}`);
    if (block.targetPrice != null) items.push(`익절 ${block.targetPrice}`);
    if (block.exitReason) items.push(`청산 ${block.exitReason}`);
    return {
      id: block.blockId,
      title: `${patternFamilyKo(block.family)} · ${patternBlockRoleKo(block.role)}`,
      role: roleKey,
      items,
    };
  });
}

export function combinationOperatorKo(operator: string | null | undefined): string {
  if (operator === "and") return "AND (모두 충족)";
  if (operator === "or") return "OR (하나 이상)";
  if (operator === "sequence") return "SEQUENCE (순서)";
  if (operator === "weighted_score") return "가중 점수";
  if (operator === "priority") return "우선순위";
  return operator ?? "단일";
}
