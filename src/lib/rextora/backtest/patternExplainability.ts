/**
 * Operator-facing Korean labels for multi-pattern block evidence.
 * Consumes persisted trace fields only — no inference.
 */

import type { PatternBlockEvidence } from "../strategy/eventSequenceBacktest";
import { normalizePatternBlockRole } from "../strategy/definition/eventSequence";
import { formatPenetrationKo } from "./tradeEventTrace";
import { displaySignalReason } from "../displayLabels";

const FAMILY_KO: Record<string, string> = {
  order_block: "오더블럭",
  fvg: "공정가치갭",
  trendline: "추세선",
  support_resistance: "지지·저항",
  supply_demand: "공급·수요",
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
  detected: "통과",
  missing: "미도달",
  failed: "실패",
  optional_skipped: "선택 사항",
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
  if (!Object.keys(MEASURED_LABEL_KO).length) return null;
  const entries = Object.entries(block.thresholds ?? {});
  if (!entries.length) return null;
  return entries
    .map(([k, v]) => `${MEASURED_LABEL_KO[k] ?? k} ${fmtNum(v)}`)
    .join(" · ");
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
void ROLE_SECTION_ORDER;

const MEASURED_LABEL_KO: Record<string, string> = {
  sourceBody: "기준 몸통 크기",
  impulseBody: "충격 몸통 크기",
  displacementBodyMult: "몸통 배율",
  bodyEngulfPct: "몸통 장악률",
  sourceBodyPct: "기준 몸통 %",
  sourceBodyAtrMult: "기준 몸통 ATR",
  sourceBodyRangeRatio: "기준 몸통/전체",
  sourceUpperWickPct: "기준 위꼬리 %",
  sourceLowerWickPct: "기준 아래꼬리 %",
  impulseBodyRangeRatio: "충격 몸통/전체",
  impulseAtrMult: "충격 ATR 배율",
  impulsePct: "충격 변동 %",
  volumeMult: "거래량 배율",
  zoneHeight: "영역 높이",
  zoneHeightPct: "영역 높이 %",
  zoneHeightAtrMult: "영역 높이 ATR",
  zoneBasis: "영역 기준",
  structureBreak: "구조 돌파",
  penetrationPct: "되돌림 깊이",
  detected: "감지",
};

function fmtNum(v: unknown, digits = 4): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Math.abs(v) >= 100) return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    return v.toFixed(digits).replace(/\.?0+$/, "");
  }
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (v == null) return "기록 없음";
  return String(v);
}

function sliceTime(iso: string | null | undefined): string {
  if (!iso) return "기록 없음";
  return iso.slice(0, 19).replace("T", " ");
}

export type PatternSummaryGroup = {
  id: string;
  title: string;
  rows: Array<{ label: string; value: string; status?: string }>;
};

/** Fully Korean Pattern Summary groups for normal UI. */
export function buildPatternSummaryGroups(
  block: PatternBlockEvidence,
): PatternSummaryGroup[] {
  const mv = block.measuredValues ?? {};
  const legacy =
    block.detectorParams?.institutionalQuality !== true &&
    block.detectorParams?.zoneBasis == null &&
    block.detectorParams?.bodyOnly != null;
  const groups: PatternSummaryGroup[] = [
    {
      id: "detect",
      title: "패턴 감지",
      rows: [
        { label: "패턴 종류", value: patternFamilyKo(block.family) },
        { label: "역할", value: patternBlockRoleKo(block.role) },
        { label: "상태", value: patternBlockStatusKo(block.status) },
        {
          label: "생성 시각",
          value: sliceTime(block.creationTime),
        },
        ...(legacy
          ? [{ label: "증거 유형", value: "레거시 실행 (저장된 존 유지)" }]
          : []),
      ],
    },
    {
      id: "creation",
      title: "생성 조건",
      rows: [
        { label: "기준 몸통 크기", value: fmtNum(mv.sourceBody) },
        { label: "충격 몸통 크기", value: fmtNum(mv.impulseBody) },
        { label: "몸통 배율", value: fmtNum(mv.displacementBodyMult, 2) },
        {
          label: "몸통 장악률",
          value:
            typeof mv.bodyEngulfPct === "number"
              ? `${fmtNum(mv.bodyEngulfPct, 1)}%`
              : "기록 없음",
        },
        { label: "ATR 배율", value: fmtNum(mv.impulseAtrMult, 2) },
        { label: "거래량 배율", value: fmtNum(mv.volumeMult, 2) },
        {
          label: "구조 돌파",
          value:
            mv.structureBreak == null
              ? "기록 없음"
              : mv.structureBreak
                ? "통과"
                : "실패",
        },
      ],
    },
    {
      id: "zone",
      title: "오더블럭 영역",
      rows: [
        {
          label: "영역 기준",
          value:
            typeof mv.zoneBasis === "string"
              ? mv.zoneBasis === "BODY"
                ? "몸통"
                : mv.zoneBasis === "FULL_CANDLE"
                  ? "전체 봉"
                  : "몸통 + 꼬리 %"
              : block.detectorParams?.bodyOnly === false
                ? "전체 봉 (레거시)"
                : "몸통",
        },
        { label: "상단", value: fmtNum(block.zoneHigh) },
        { label: "하단", value: fmtNum(block.zoneLow) },
        {
          label: "영역 높이",
          value:
            block.zoneHigh != null && block.zoneLow != null
              ? fmtNum(block.zoneHigh - block.zoneLow)
              : "기록 없음",
        },
        {
          label: "유효 기간",
          value:
            block.creationTime && (block.exitTime || block.invalidationTime)
              ? `${sliceTime(block.creationTime)} → ${sliceTime(block.exitTime ?? block.invalidationTime)}`
              : sliceTime(block.creationTime),
        },
      ],
    },
    {
      id: "entry",
      title: "진입 검증",
      rows: [
        {
          label: "되돌림 깊이",
          value:
            typeof mv.penetrationPct === "number"
              ? formatPenetrationKo(mv.penetrationPct)
              : "기록 없음",
        },
        { label: "되돌림 시각", value: sliceTime(block.revisitTime) },
        { label: "확인 시각", value: sliceTime(block.confirmationTime) },
        { label: "진입 시각", value: sliceTime(block.entryTime) },
      ],
    },
    {
      id: "risk",
      title: "위험 관리",
      rows: [
        {
          label: "무효화",
          value: block.invalidationTime
            ? sliceTime(block.invalidationTime)
            : "기록 없음",
        },
        { label: "손절", value: fmtNum(block.stopPrice) },
        { label: "익절", value: fmtNum(block.targetPrice) },
        {
          label: "청산 사유",
          value: block.exitReason
            ? displaySignalReason(block.exitReason)
            : "기록 없음",
        },
      ],
    },
  ];
  return groups;
}

export function buildPatternBlockSections(
  blocks: PatternBlockEvidence[],
  opts?: { developerMode?: boolean },
): PatternBlockSection[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  return sorted.map((block) => {
    const roleKey = normalizePatternBlockRole(block.role) ?? block.role;
    const groups = buildPatternSummaryGroups(block);
    const items: string[] = [];
    for (const g of groups) {
      items.push(`【${g.title}】`);
      for (const row of g.rows) {
        items.push(`${row.label}: ${row.value}`);
      }
    }
    const reason = formatRejectionReasonForDisplay(block.reasonCode, {
      developerMode: opts?.developerMode,
    });
    if (reason) items.push(`사유: ${reason}`);
    if (opts?.developerMode) {
      const params = Object.entries(block.detectorParams ?? {});
      if (params.length) {
        items.push(
          `개발자 파라미터 ${params.map(([k, v]) => `${k}=${String(v)}`).join(" · ")}`,
        );
      }
    }
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

/** Canonical operator-facing rejection / lifecycle labels (normal UI). */
const REJECTION_REASON_KO: Record<string, string> = {
  penetration_too_shallow: "되돌림 깊이 부족",
  sequence_order_failed: "패턴 순서 불일치",
  confirmation_timeout: "확인 조건 실패",
  entry_zone_not_valid_at_execution: "진입 시 영역 조건 불충족",
  touch_expired: "접촉 유효기간 만료",
  confirmation_expired: "확인 유효기간 만료",
  pattern_expired: "패턴 유효기간 만료",
  zone_invalidated: "영역 무효화",
  sequence_timeout: "순서 제한 시간 초과",
  entry_price_outside_tolerance: "진입가 허용 범위 초과",
  required_block_not_active: "필수 패턴 블록 비활성",
  operator_not_satisfied: "조합 조건 불충족",
  confirmation_failed: "확인 조건 실패",
  weighted_score_below_threshold: "설정 거절",
  priority_no_match: "설정 거절",
  pattern_invalidated: "실제 무효화",
  invalidation_triggered: "실제 무효화",
  lifecycle_invalidation: "실제 무효화",
  trend_filter_failed: "설정 거절",
  invalid_event_sequence: "패턴 순서 불일치",
  source_body_too_small: "기준 몸통 부족",
  source_body_quality_low: "기준 캔들 품질 부족",
  displacement_body_too_small: "충격 몸통 부족",
  body_engulf_failed: "몸통 장악 실패",
  zone_height_too_small: "존 높이 부족",
  zone_height_too_large: "존 높이 과다",
  structure_break_failed: "구조 돌파 실패",
  volume_expansion_failed: "거래량 확대 실패",
};

export const LIFECYCLE_LABEL_KO = {
  creation: "패턴 감지",
  revisit: "되돌림 확인",
  confirmation: "확인 조건 통과",
  entry: "진입",
  stop: "손절",
  target: "익절",
  exit: "청산",
  rejected: "설정 거절",
  invalidation: "실제 무효화",
  break: "돌파",
} as const;

function normalizeRejectionReasonKey(code: string): string {
  const trimmed = code.trim();
  const rejectedSuffix = trimmed.match(/(?:^|_)rejected[_:](.+)$/i);
  if (rejectedSuffix?.[1]) return rejectedSuffix[1];
  const missingSuffix = trimmed.match(/^([a-z_]+)_missing$/);
  if (missingSuffix) return `${missingSuffix[1]}_missing`;
  return trimmed;
}

/** Operator-facing rejection label — never shows raw enum prefixes on charts. */
export function formatRejectionReasonKo(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const key = normalizeRejectionReasonKey(code);
  if (REJECTION_REASON_KO[key]) return REJECTION_REASON_KO[key]!;
  if (key.endsWith("_missing")) {
    const family = key.replace(/_missing$/, "");
    return `${patternFamilyKo(family)} 미감지`;
  }
  return key.replace(/_/g, " ");
}

export function formatRejectionReasonForDisplay(
  code: string | null | undefined,
  opts?: { developerMode?: boolean },
): string | null {
  if (!code?.trim()) return null;
  const friendly = formatRejectionReasonKo(code);
  if (opts?.developerMode) {
    return friendly && friendly !== code ? `${friendly} (${code})` : code;
  }
  return friendly;
}

export function formatPatternZoneChartLabel(
  patternType: string | null | undefined,
  touchCount?: number | null,
): string {
  const name = patternFamilyKo(patternType ?? "");
  if (touchCount != null && Number.isFinite(touchCount)) {
    return `${name} · 접촉 ${touchCount}회`;
  }
  return name;
}

export function buildRejectionTooltipLines(
  reasonCode: string | null | undefined,
  extras: Array<string | null | undefined> = [],
  opts?: { developerMode?: boolean },
): string[] {
  const friendly = formatRejectionReasonKo(reasonCode);
  const lines = ["설정 거절"];
  if (friendly) lines.push(`사유: ${friendly}`);
  if (opts?.developerMode && reasonCode) lines.push(`enum: ${reasonCode}`);
  for (const extra of extras) {
    if (extra) lines.push(extra);
  }
  return lines;
}

/** True when a rejection code means real invalidation (not a shallow/timeout reject). */
export function isActualInvalidationReason(
  code: string | null | undefined,
): boolean {
  if (!code?.trim()) return false;
  const key = normalizeRejectionReasonKey(code);
  return (
    key === "pattern_invalidated" ||
    key === "invalidation_triggered" ||
    key === "lifecycle_invalidation"
  );
}
