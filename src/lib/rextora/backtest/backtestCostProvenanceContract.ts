/**
 * P3-A6.1 read-only forensic contract: Backtest cost-assumption provenance,
 * result-identity compatibility, and eligibility cost semantics.
 *
 * Does not mutate production arithmetic, SAFE, Research, Paper/Live, or saved JSON.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionReadonlyHashes } from "./backtestCostAssumptionsDiagnosis";
import {
  BACKTEST_COST_OF_GROSS_CRITICAL,
  evaluateBacktestEligibility,
} from "./backtestEligibility";
import { computeCostRatios } from "./costRatios";
import { resolveSlippageModelVersion } from "./executionSlippage";
import { backtestResultHash } from "./backtestStore";
import type { SavedBacktestResult } from "./backtestTypes";
import { RETIRED_SAFE_FILE_NAME, RETIRED_SAFE_PARAMS_HASH } from "../strategy/retiredSafeBaseline";

export const P3A61_ARTIFACT_TS = "2026-09-03T14-20-00-000Z";

export const LEGACY_SAVED_IDS = [
  "bt_mt1kh58k_762ad9",
  "bt_msjp47sr_7c3663",
  "bt_msadwkg5_7018c5",
] as const;

export const COST_ASSUMPTIONS_VERSION_V1 = "cost_assumptions_v1" as const;
export const IDENTITY_SCHEMA_P3A52 = "identity_p3a52" as const;
export const IDENTITY_SCHEMA_COST_V1 = "identity_cost_assumptions_v1" as const;

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function getCostInputAuthorities() {
  return {
    feeRate: {
      inputField: "feeRate",
      canonicalRuntimeUnit: "decimal_fraction_of_price (0.0004 = 4 bps)",
      currentDefault: 0.0004,
      authority: "API route ?? 0.0004 then engine ?? 0.0004",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: "multiplies by costStress baseMult / stress mult",
      engineConsumes: true,
      reportStores: false,
      hashIncludes: true,
      eligibilityDepends: "indirect via totalCostUsdt after run",
    },
    slippageRate: {
      inputField: "slippageRate",
      canonicalRuntimeUnit: "decimal_fraction_of_price (0.0002 = 2 bps)",
      currentDefault: 0.0002,
      authority: "API ?? 0.0002 then engine ?? 0.0002",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: "multiplies by stress multiplier",
      engineConsumes: true,
      reportStores: "slippageModelVersion only; rate absent",
      hashIncludes: true,
      eligibilityDepends: "indirect; v1 attribution excluded from totalCostUsdt",
    },
    slippageModelVersion: {
      inputField: "report.slippageModelVersion",
      canonicalRuntimeUnit: "enum execution_price_v1 | legacy_v0",
      currentDefault: "SAFE stamps execution_price_v1; absent → legacy_v0",
      authority: "SAFE engine stamp / read-time resolveSlippageModelVersion",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: false,
      runnerOverridesOrScales: false,
      engineConsumes: "SAFE only",
      reportStores: "SAFE yes; event-sequence/condition omit → legacy_v0",
      hashIncludes: true,
      eligibilityDepends: "hard gate === execution_price_v1",
    },
    fundingRate: {
      inputField: "fundingRate",
      canonicalRuntimeUnit: "decimal_fraction_per_trade (not per 8h)",
      currentDefault: 0.0001,
      authority: "API ?? 0.0001; engine effective = applyFunding ? rate : 0",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: "NOT multiplied in Backtest stress",
      engineConsumes: "only when applyFunding",
      reportStores: false,
      hashIncludes: "config.fundingRate always (dormant rate included)",
      eligibilityDepends: "indirect when applied",
    },
    applyFunding: {
      inputField: "applyFunding",
      canonicalRuntimeUnit: "boolean",
      currentDefault: false,
      authority: "API ?? false",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: false,
      engineConsumes: true,
      reportStores: "validation.fundingApplied only",
      hashIncludes: false,
      eligibilityDepends: false,
    },
    spreadRate: {
      inputField: "spreadRate",
      canonicalRuntimeUnit: "decimal_fraction_of_price",
      currentDefault: 0.0001,
      authority: "API ?? 0.0001; runner effective = applySpread ? rate : 0",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: "multiplied when applySpread",
      engineConsumes: "only when applySpread",
      reportStores: false,
      hashIncludes: false,
      eligibilityDepends: "indirect when applied",
    },
    applySpread: {
      inputField: "applySpread",
      canonicalRuntimeUnit: "boolean",
      currentDefault: false,
      authority: "API ?? false",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: false,
      engineConsumes: true,
      reportStores: "validation.spreadApplied only",
      hashIncludes: false,
      eligibilityDepends: false,
    },
    costGuardK: {
      inputField: "costGuardK / params.cost_guard_k",
      canonicalRuntimeUnit: "dimensionless multiplier",
      currentDefault: "API ?? 3; SAFE params.cost_guard_k = 3",
      authority: "API default or strategy params",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: false,
      engineConsumes: true,
      reportStores: false,
      hashIncludes: true,
      eligibilityDepends: "indirect via tradeCount",
    },
    cost_guard: {
      inputField: "params.cost_guard",
      canonicalRuntimeUnit: "boolean",
      currentDefault: true,
      authority: "STRATEGY_CONFIG / SAFE params",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: false,
      runnerOverridesOrScales: false,
      engineConsumes: true,
      reportStores: false,
      hashIncludes: false,
      eligibilityDepends: "indirect via tradeCount",
    },
    costStressMultipliers: {
      inputField: "costStressMultipliers",
      canonicalRuntimeUnit: "array of scalars",
      currentDefault: [1, 1.5, 2],
      authority: "API default when body omits",
      userSuppliedOnWorkbench: false,
      workbenchSends: false,
      apiResolves: true,
      runnerOverridesOrScales: "first element scales primary (normally 1)",
      engineConsumes: false,
      reportStores: "costStress rows; SAFE rows now include slippageRate+version",
      hashIncludes: false,
      eligibilityDepends: "hasCostStress warning-only",
    },
  };
}

export function classifyResultDeterminingFields() {
  return {
    feeRate: "RESULT_DETERMINING",
    slippageRate: "RESULT_DETERMINING",
    slippageModelVersion: "RESULT_DETERMINING",
    applyFunding: "RESULT_DETERMINING",
    fundingRate: "RESULT_DETERMINING when applyFunding; otherwise dormant configured rate is hashed today but does not change primary PnL",
    fundingModel: "PROVENANCE_ONLY (currently implicit SYNTHETIC_FLAT_PER_TRADE)",
    applySpread: "RESULT_DETERMINING",
    spreadRate: "RESULT_DETERMINING when applySpread; otherwise NOT_RELEVANT to PnL",
    costGuardK: "RESULT_DETERMINING",
    cost_guard: "RESULT_DETERMINING",
    costStressMultipliers: "STRESS_ONLY except multipliers[0] which scales the primary run",
    engineVersion: "PROVENANCE_ONLY (hashed, does not switch math)",
    totalDeductedCostUsdt: "PROVENANCE_ONLY / report metric (derived)",
    totalEconomicFrictionUsdt: "PROVENANCE_ONLY / report metric (derived)",
  } as const;
}

export function getPrimaryCostAssumptions() {
  return {
    PRIMARY_COST_ASSUMPTIONS: {
      feeRate: "config.feeRate * multipliers[0] (normally 1 → 0.0004)",
      slippageRate: "config.slippageRate * multipliers[0] (normally 0.0002)",
      slippageModelVersion: "SAFE execution_price_v1; other engines unresolved → legacy_v0",
      applyFunding: "config.applyFunding (API default false)",
      fundingRate: "config.fundingRate unchanged (0.0001 configured; effective 0 if disabled)",
      applySpread: "config.applySpread (API default false)",
      spreadRate: "applySpread ? config.spreadRate * multipliers[0] : 0",
      costGuard: "params.cost_guard + costGuardK; guard slippageCost = slippageRate * 2",
      fundingMultiplied: false,
    },
    source:
      "src/lib/rextora/backtest/backtestRunner.ts baseMult = multipliers[0]; app/api/rextora/backtest/run/route.ts defaults",
  };
}

export function getStressCostAssumptions() {
  return {
    STRESS_COST_ASSUMPTIONS: {
      feeRate: "config.feeRate * multiplier",
      slippageRate: "config.slippageRate * multiplier",
      slippageModelVersion: "SAFE rows stamp execution_price_v1 + resolved slippageRate",
      applyFunding: "unchanged from primary",
      fundingRate: "NOT multiplied (Backtest runner)",
      applySpread: "unchanged",
      spreadRate: "applySpread ? config.spreadRate * multiplier : 0",
      costMultiplier: "[1, 1.5, 2] default",
      costGuardInputs: "scaled fee/slip/spread rates; fundingRate unscaled",
      researchDivergence:
        "src/lib/rextora/strategySearch/costStress.ts DOES multiply fundingRate",
    },
    recommendedRepresentation: "B",
    recommendedRepresentationDetail:
      "base costAssumptions + multiplier, plus resolved per-row rate snapshot for audit (SAFE already snapshots slippageRate)",
  };
}

export function getCostAssumptionsTypeDesign() {
  return {
    COST_ASSUMPTIONS_VERSION_REQUIRED: "YES" as const,
    reason:
      "fee/funding/spread models can change independently of slippageModelVersion (P3-A5.2 already isolated slippage).",
    recommendedVersion: COST_ASSUMPTIONS_VERSION_V1,
    recommendedType: {
      version: COST_ASSUMPTIONS_VERSION_V1,
      fee: {
        rate: 0.0004,
        model: "round_trip_taker_2x",
        unit: "decimal_fraction_of_price",
        legCount: 2,
      },
      slippage: {
        rate: 0.0002,
        modelVersion: "execution_price_v1",
        unit: "decimal_fraction_of_price",
      },
      funding: {
        enabled: false,
        configuredRate: 0.0001,
        effectiveRate: 0,
        model: "synthetic_flat_per_trade",
        unit: "decimal_fraction_per_trade",
      },
      spread: {
        enabled: false,
        configuredRate: 0.0001,
        effectiveRate: 0,
        model: "flat_fraction_per_trade",
        unit: "decimal_fraction_of_price",
      },
      costGuard: {
        enabled: true,
        k: 3,
        slippageEstimateModel: "rate_times_two",
      },
    },
    rejectedFields: {
      historicalFundingSeries: "not on Backtest path",
      makerTakerSplit: "engine uses single feeRate",
      settingsTakerFeePct: "percent-points; not Backtest input",
    },
    evidence:
      "backtestEngine feePct=feeRate*2; funding SYNTHETIC_FLAT_PER_TRADE; spreadRate gated by applySpread; costGuard computeSlippageCost=rate*2",
  };
}

export function getNormalizationContract() {
  return {
    RECOMMENDED_COST_ASSUMPTION_NORMALIZATION_POINT:
      "E — dedicated normalizer invoked by the Backtest API route (and any other caller) BEFORE backtestRunner. Runner and engine receive explicit immutable assumptions only.",
    evaluated: {
      A_workbench: "rejected — production Workbench omits rates",
      B_api_route: "partial — currently the silent default site; must call normalizer, not hide defaults inline",
      C_runner: "too late if API already defaulted; runner also scales stress",
      D_engine: "forbidden as authority — second hidden ?? fallback",
      E_normalizer: "selected — single resolve, then pass-through",
    },
    hiddenDownstreamDefaultsP3A62MustBypass: [
      "app/api/rextora/backtest/run/route.ts body.feeRate ?? 0.0004 (and slip/fund/spread/apply*/stress/costGuardK)",
      "src/lib/rextora/backtest/backtestEngine.ts input.feeRate ?? 0.0004 / slippageRate ?? 0.0002 / fundingRate ?? 0.0001 / spreadRate ?? 0.0001",
      "src/lib/rextora/strategy/eventSequenceBacktest.ts feeRate ?? 0.0004",
      "Workbench settings.cost.feeRate/takerFee/slippageRate display (absent keys)",
    ],
    invariant:
      "Once a Backtest run starts, resolved costAssumptions are immutable and must be the only rates the runner/engine see.",
  };
}

function preA52HashPayload(result: Omit<SavedBacktestResult, "id" | "createdAt">) {
  const symbol =
    result.report.symbol ?? result.config.symbols?.[0] ?? "";
  return {
    strategyId: result.report.strategyId,
    paramsHash: result.report.strategyHash,
    symbol: String(symbol).toUpperCase(),
    timeframe: result.report.timeframe,
    fromDate: result.report.fromDate,
    toDate: result.report.toDate,
    fromOpenTime: result.config.fromOpenTime ?? null,
    toOpenTime: result.config.toOpenTime ?? null,
    feeRate: result.config.feeRate,
    slippageRate: result.config.slippageRate,
    fundingRate: result.config.fundingRate,
    costGuardK: result.config.costGuardK,
    engineVersion: result.engineVersion ?? "rextora-backtest-1",
    dataVersion: result.dataVersion ?? result.report.dataSource ?? null,
    totalReturn: result.report.totalReturn,
    mdd: result.report.mdd,
    tradeCount: result.report.tradeCount,
    endingBalance: result.report.endingBalance,
  };
}

export function reconstructPreA52Hash(
  result: Omit<SavedBacktestResult, "id" | "createdAt">,
): string {
  return createHash("sha256")
    .update(JSON.stringify(preA52HashPayload(result)))
    .digest("hex")
    .slice(0, 16);
}

export function inspectLegacySavedRecord(id: string, cwd = process.cwd()) {
  const full = path.join(cwd, "data", "rextora", "backtests", `${id}.json`);
  const fileSha256 = sha256File(full);
  if (!fs.existsSync(full)) {
    return {
      id,
      present: false as const,
      fileSha256: null,
      storedHash: null,
      slippageModelVersionPresent: false,
      currentRecomputedHash: null,
      preA52RecomputedHash: null,
      matchesCurrent: false,
      matchesPreA52: false,
      readResult: "missing",
      approvalLookup: "getSavedBacktest JSON.parse only — no hash recompute",
    };
  }
  const saved = JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
  const { id: _id, createdAt: _c, ...rest } = saved;
  const currentRecomputedHash = backtestResultHash(rest);
  const preA52RecomputedHash = reconstructPreA52Hash(rest);
  const storedHash = saved.resultHash ?? null;
  return {
    id,
    present: true as const,
    fileSha256,
    storedHash,
    slippageModelVersionPresent: saved.report.slippageModelVersion != null,
    resolvedSlippageModelVersion: resolveSlippageModelVersion(
      saved.report.slippageModelVersion,
    ),
    costAssumptionsPresent: "costAssumptions" in saved.report,
    currentRecomputedHash,
    preA52RecomputedHash,
    matchesCurrent: storedHash === currentRecomputedHash,
    matchesPreA52: storedHash === preA52RecomputedHash,
    readResult: "readable via getSavedBacktest; stored resultHash displayed as-is",
    approvalLookup:
      "Workbench/API GET trust stored record. findPriorByResultHash only on NEW save. Deep-link ?runId= loads JSON without recomputing hash.",
    configRates: {
      feeRate: saved.config.feeRate,
      slippageRate: saved.config.slippageRate,
      fundingRate: saved.config.fundingRate,
      applyFunding: saved.config.applyFunding,
      applySpread: saved.config.applySpread,
      spreadRate: saved.config.spreadRate,
    },
    cwdUsed: cwd,
  };
}

export function inspectLegacyHashForensic(cwd = process.cwd()) {
  const rows = LEGACY_SAVED_IDS.map((id) => inspectLegacySavedRecord(id, cwd));
  const present = rows.filter((r) => r.present);
  const mismatchCurrent = present.filter((r) => !r.matchesCurrent).length;
  const matchPreA52 = present.filter((r) => r.matchesPreA52).length;
  return {
    loadContract: "A — trust stored resultHash without recomputation on read",
    saveContract: "recompute only inside saveBacktestResult for dedup",
    LEGACY_HASH_RECOMPUTATION_MISMATCH_COUNT: mismatchCurrent,
    preA52SchemaMatchCount: matchPreA52,
    LEGACY_RESULT_HASH_COMPATIBILITY:
      mismatchCurrent === 0 ? ("RESTORED" as const) : ("PARTIAL" as const),
    compatibilityDetail:
      mismatchCurrent === 0
        ? "P3-A6.2 HASH-B: absent costAssumptions + absent slippageModelVersion uses the original pre-A5.2 payload. Stored hashes are never rewritten. Read/view/deep-link still trust stored hash."
        : "Read/view/deep-link/approval are SAFE (stored hash). Recompute-vs-stored is BROKEN after P3-A5.2 added slippageModelVersion (absent → legacy_v0). Dedup on new save will not reuse pre-A5.2 artifacts.",
    rows,
  };
}

export function getHashModelComparison() {
  return {
    HASH_A: {
      name: "Always hash canonical current object; omitted fields → defaults",
      assessment:
        "Rejected. Resolving absent slippageModelVersion to legacy_v0 already mismatches stored pre-A5.2 hashes. Future costAssumptions defaults would keep breaking historical recomputes.",
    },
    HASH_B: {
      name: "Version-aware hashing: identity schema selected by persisted version",
      assessment:
        "Selected. Records without costAssumptionsVersion keep identity_p3a52 (current function). New runs with cost_assumptions_v1 hash the canonical object. Stored hashes are never rewritten or used as a load-time invalidation.",
    },
    HASH_C: {
      name: "Hash persisted report exactly",
      assessment:
        "Rejected. Report contains derived/UI fields (monthly labels, traces) that are not result-determining and would be unstable.",
    },
    HASH_D: {
      name: "Trust stored hash forever; stop hashing costs",
      assessment:
        "Rejected. New materially different assumptions must diverge. Dedup still needs a deterministic new-run identity.",
    },
    RECOMMENDED_HASH_MODEL: "HASH-B",
    identitySchemas: {
      identity_p3a52: "current backtestResultHash payload including resolved slippageModelVersion",
      identity_cost_assumptions_v1:
        "p3a52 fields + costAssumptionsVersion + fee.model + slippage.modelVersion + funding.enabled/configured/effective + spread.enabled/configured/effective + costGuard.k",
    },
  };
}

export function getInactiveFieldIdentity() {
  return {
    fundingRule: "C",
    fundingFrozen:
      "Identity includes funding.enabled, funding.configuredRate, and funding.effectiveRate. applyFunding=false + 0.0001 is not equivalent to applyFunding=false + 0.0005. Today fundingRate is already hashed; applyFunding is not — P3-A6.2 must add the flag.",
    spreadRule: "C",
    spreadFrozen:
      "Identity includes spread.enabled, spread.configuredRate, and spread.effectiveRate. Today neither applySpread nor spreadRate is hashed unless outcomes differ.",
    criteria: {
      reproducibility: "configured dormant rate is part of the operator recipe",
      auditability: "disabled-but-configured 5 bps must be visible",
      semanticIdentity: "effectiveRate documents that primary PnL ignored the dormant rate",
      avoidingAccidentalEquivalence: "do not treat distinct configs as the same run",
      avoidingFalseDistinction: "effectiveRate=0 when disabled prevents claiming funding was charged",
    },
  };
}

export function getReportOnlyReproducibilityTarget() {
  return {
    REPORT_ONLY_COST_REPRODUCIBILITY_TARGET: {
      feeRate: "required",
      feeModel: "round_trip_taker_2x",
      feeLegCount: 2,
      slippageRate: "required",
      slippageModelVersion: "required",
      fundingEnabled: "required",
      fundingConfiguredRate: "required",
      fundingEffectiveRate: "required",
      fundingModel: "synthetic_flat_per_trade",
      spreadEnabled: "required",
      spreadConfiguredRate: "required",
      spreadEffectiveRate: "required",
      costGuardEnabledAndK: "required",
      costGuardSlippageEstimate: "rate_times_two",
      stressBasePlusMultiplierAndResolvedRates: "required when costStress present",
      units: "decimal_fraction documented on the object",
    },
    notRequired: [
      "historical Binance funding series",
      "Settings takerFeePct percent-points",
      "chart sampling metadata",
    ],
  };
}

export function getEligibilitySourceTrace() {
  return {
    gate: "evaluateBacktestEligibility.totalCostPctOfGrossProfit >= 0.5 → excessive_cost_ratio",
    threshold: BACKTEST_COST_OF_GROSS_CRITICAL,
    labelKo: "부적격 - 비용 비율 과다",
    actionKo: "비용 설정을 점검하고 진입 빈도를 줄인 뒤 재검증하세요.",
    workbench:
      "computeCostRatios({ totalCostUsdt: report.costs.totalCostUsdt })",
    uiCopy:
      "BacktestAnalysisView cost-critical-warning: 수익 대부분이 수수료와 슬리피지로 줄어들었습니다.",
    tests:
      "backtestEligibilityUx / backtestUxFinal use 748.31/1006.04 where 748.31 = 704.66 fee + 43.65 slip",
    preA52Formula: "totalCostUsdt = fee + slippage + funding + spread",
    v1Formula: "totalCostUsdt = fee + funding + spread (attribution excluded)",
    ELIGIBILITY_COST_RATIO_SEMANTIC_CHANGED_BY_P3_A5_2: "YES" as const,
    PROVEN_ELIGIBILITY_COST_RATIO_INTENT:
      "B/C hybrid — implementation used totalCostUsdt, but that field historically included slippage and UI/tests treat the gate as economic trading friction (수수료와 슬리피지), not deducted-ledger-only.",
  };
}

export function getEligibilityMicroComparison() {
  const gross = 1000;
  const fee = 300;
  const funding = 50;
  const spread = 50;
  const slip = 200;
  const deducted = fee + funding + spread;
  const economic = deducted + slip;
  const deductedRatio = deducted / gross;
  const economicRatio = economic / gross;
  const threshold = BACKTEST_COST_OF_GROSS_CRITICAL;
  return {
    grossProfit: gross,
    fee,
    funding,
    spread,
    slippageAttribution: slip,
    deductedRatio,
    economicFrictionRatio: economicRatio,
    legacyTotalCostRatio: economicRatio,
    threshold,
    deductedPasses: deductedRatio < threshold,
    economicFails: economicRatio >= threshold,
    currentV1GateUses: "deducted totalCostUsdt → would PASS this case",
    copyAndLegacyImply: "economic friction including slippage → would FAIL",
  };
}

export function getRecommendedEligibilityCostModel() {
  return {
    RECOMMENDED_ELIGIBILITY_COST_MODEL: "ELIG-B",
    detail:
      "Use totalEconomicFrictionUsdt / gross for excessive_cost_ratio. Keep net = gross − totalDeductedCostUsdt. Restores pre-A5.2 economic meaning and UI 슬리피지 copy without deducting attribution from net.",
    models: {
      "ELIG-A": "current v1 deducted-only — silently hides execution-price slippage",
      "ELIG-B": "selected — economic friction",
      "ELIG-C": "separate slippage threshold — no source threshold exists",
      "ELIG-D": "none",
    },
    P3_A6_2_READY_FOR_ELIGIBILITY: "YES",
  };
}

export function getApprovalProvenanceGate() {
  return {
    requiredBeforeNewAdvancement: [
      "costAssumptions present",
      `costAssumptions.version === ${COST_ASSUMPTIONS_VERSION_V1}`,
      "slippage.modelVersion === execution_price_v1",
      "all rates finite and >= 0",
      "funding.model recognized (synthetic_flat_per_trade)",
      "spread.model recognized (flat_fraction_per_trade)",
      "fee.model recognized (round_trip_taker_2x)",
      "primary assumptions present",
      "if costStress rows exist, each row has multiplier + resolved rates or base+multiplier",
    ],
    blockerCodes: [
      "missing_cost_assumptions",
      "unsupported_cost_assumptions_version",
      "legacy_slippage_model",
      "invalid_cost_rate",
      "unrecognized_funding_model",
      "unrecognized_spread_model",
      "unrecognized_fee_model",
      "missing_stress_cost_assumptions",
    ],
    notRequired: [
      "historical funding realism",
      "Settings unit conversion",
      "making robustness_missing a hard blocker (remains warning unless stress rows exist without snapshots)",
    ],
  };
}

export function getLegacyResultPolicy() {
  return {
    view: "allowed — do not rewrite, do not invalidate display",
    compare: "allowed — compare stored metrics; do not recompute hash as a fail-closed check",
    deepLink: "allowed — GET runId returns stored JSON",
    approvalReview: "viewable; new advancement blocked until provenance+v1 gates pass",
    newPaper: "blocked without costAssumptions v1 + execution_price_v1",
    newLive: "blocked without costAssumptions v1 + execution_price_v1",
    activeSessions: "unaffected — do not terminate Paper/Live",
  };
}

export function getSettingsUnitMismatch() {
  return {
    classification: "DISPLAY_ONLY_DEBT",
    settings: {
      file: "src/lib/rextora/settings/defaultSettings.ts",
      takerFeePct: 0.04,
      makerFeePct: 0.02,
      slippageBasePct: 0.05,
      unit: "percent-points (0.04 means 0.04%)",
    },
    engine: {
      feeRate: 0.0004,
      unit: "decimal fraction",
    },
    workbench: {
      file: "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      reads: "settings.cost.feeRate ?? takerFee ?? slippageRate — keys absent on defaultSettings",
      displayed: "수수료 — · 슬리피지 — (시스템 설정)",
      postsRates: false,
    },
    p3a62MinimalCorrection:
      "Disclose resolved costAssumptions from the report/normalizer. Do not bind Settings takerFeePct into Backtest. Do not redesign Settings.",
    notReproduced: "Workbench does not currently send 0.04 into the engine",
  };
}

export function getResearchProvenanceBoundary() {
  return {
    RESEARCH_CAN_REUSE_PROVENANCE_SCHEMA: "PARTIAL" as const,
    shared: "same costAssumptions object shape + version field",
    notShared: "arithmetic / stress funding multiply / engine fill model",
    recommendedEngineCostModelField: {
      safe: "safe_execution_price_v1",
      eventSequence: "event_sequence_ledger_v0",
      conditionBuilder: "condition_builder_ledger_v0",
    },
    p3a62Scope:
      "Backtest Workbench provenance only. Do not change Research lifecycle or claim parity. Optional type-share is allowed; Research stamping is out of scope unless a report is already built.",
  };
}

export function getDefectClassification() {
  const sev = (s: string) => s;
  return {
    MISSING_PRIMARY_COST_ASSUMPTIONS: {
      status: "PROVEN",
      severity: sev("high"),
      pnlImpact: "none (rates still applied via hidden defaults)",
      approvalImpact: "operator cannot prove which rates were used",
      identityImpact: "hash has config rates but report does not persist them",
      p3a62Blocker: "YES",
    },
    MISSING_STRESS_COST_ASSUMPTIONS: {
      status: "PROVEN",
      severity: sev("medium"),
      pnlImpact: "none on primary; stress tradeCount already diverges",
      approvalImpact: "stress rows lack rates except SAFE slippageRate snapshot",
      identityImpact: "multipliers not hashed",
      p3a62Blocker: "YES",
    },
    HIDDEN_API_COST_DEFAULTS: {
      status: "PROVEN",
      severity: sev("high"),
      pnlImpact: "Workbench runs always use API defaults",
      approvalImpact: "looks like Settings but is not",
      identityImpact: "hashed defaults are invisible on the report",
      p3a62Blocker: "YES",
    },
    INCOMPLETE_RESULT_IDENTITY: {
      status: "PROVEN",
      severity: sev("high"),
      pnlImpact: "applyFunding/spread can change PnL; applyFunding not hashed",
      approvalImpact: "two recipes can share a hash if outcomes coincide",
      identityImpact: "direct",
      p3a62Blocker: "YES",
    },
    LEGACY_HASH_COMPATIBILITY_RISK: {
      status: "PROVEN",
      severity: sev("high"),
      pnlImpact: "none",
      approvalImpact: "none on read; dedup broken vs pre-A5.2 stored hashes",
      identityImpact: "recompute ≠ stored after slippageModelVersion",
      p3a62Blocker: "YES — must choose HASH-B, never rewrite",
    },
    ELIGIBILITY_COST_RATIO_SEMANTIC_DRIFT: {
      status: "PROVEN",
      severity: sev("high"),
      pnlImpact: "none (gate only)",
      approvalImpact: "v1 runs can pass a deducted-only ratio that would fail economic friction",
      identityImpact: "none",
      p3a62Blocker: "YES",
    },
    SETTINGS_ENGINE_UNIT_MISMATCH: {
      status: "PROVEN",
      severity: sev("medium"),
      pnlImpact: "none today (not wired)",
      approvalImpact: "display shows em-dash, not 0.04 vs 0.0004",
      identityImpact: "none",
      p3a62Blocker: "NO — DISPLAY_ONLY_DEBT",
    },
    MISSING_COST_MODEL_VERSION: {
      status: "PROVEN",
      severity: sev("medium"),
      pnlImpact: "none",
      approvalImpact: "cannot version fee/funding/spread independently",
      identityImpact: "future model changes collide with slippageModelVersion",
      p3a62Blocker: "YES",
    },
    RESEARCH_COST_PARITY_GAP: {
      status: "PROVEN",
      severity: sev("medium"),
      pnlImpact: "Research ≠ SAFE arithmetic (known)",
      approvalImpact: "out of P3-A6.2 Backtest scope",
      identityImpact: "none if Research not stamped",
      p3a62Blocker: "NO",
    },
  };
}

export function getFrozenP3A62Contract() {
  return {
    P3_A6_2_READY: "YES" as const,
    A_CANONICAL_COST_ASSUMPTIONS_TYPE: getCostAssumptionsTypeDesign().recommendedType,
    B_COST_ASSUMPTIONS_VERSION: COST_ASSUMPTIONS_VERSION_V1,
    C_NORMALIZATION_POINT: getNormalizationContract()
      .RECOMMENDED_COST_ASSUMPTION_NORMALIZATION_POINT,
    D_HASH_VERSIONING_RULE: "HASH-B identity_p3a52 vs identity_cost_assumptions_v1",
    E_LEGACY_HASH_RULE:
      "Never rewrite stored resultHash. Never recompute on load to invalidate. New saves without costAssumptionsVersion keep identity_p3a52.",
    F_ELIGIBILITY_COST_RATIO_RULE:
      "excessive_cost_ratio uses totalEconomicFrictionUsdt / grossPnLBeforeCosts; threshold remains 0.5; net identity stays gross − deducted",
    G_APPROVAL_PROVENANCE_GATE: getApprovalProvenanceGate().blockerCodes,
    H_LEGACY_RESULT_POLICY: getLegacyResultPolicy(),
  };
}

export function getP3A62FilePlan() {
  return {
    newFile: "src/lib/rextora/backtest/costAssumptions.ts — type, normalizeCostAssumptions, resolveEffectiveRates",
    types: "src/lib/rextora/backtest/backtestTypes.ts — report.costAssumptions; costStress resolved snapshot",
    runner: "src/lib/rextora/backtest/backtestRunner.ts — consume normalized object; stamp stress snapshots; do not change arithmetic",
    report: "src/lib/rextora/backtest/backtestReport.ts — persist costAssumptions",
    store: "src/lib/rextora/backtest/backtestStore.ts — HASH-B branch; do not rewrite files",
    eligibility: "src/lib/rextora/backtest/backtestEligibility.ts — ELIG-B + provenance blockers",
    api: "app/api/rextora/backtest/run/route.ts — call normalizer; stop being the hidden default authority",
    workbench:
      "components/rextora/backtest/BacktestReviewWorkbench.tsx — disclose resolved assumptions; pass version into eligibility; do not send Settings percent-points",
    optionalUi: "BacktestAnalysisView cost panel — label economic friction vs deducted if required for the gate copy",
    doNotEdit: [
      "backtestEngine fee/funding/spread/slippage formulas",
      "costGuard computeSlippageCost",
      "eventSequenceBacktest / conditionBacktest arithmetic",
      "SAFE JSON",
      "Paper/Live runtime",
    ],
  };
}

function identityDemoPayload(overrides: {
  feeRate?: number;
  slippageRate?: number;
  fundingRate?: number;
  applyFunding?: boolean;
  applySpread?: boolean;
  spreadRate?: number;
  slippageModelVersion?: string;
}) {
  return {
    config: {
      strategyId: "P3A61",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: 1,
      toOpenTime: 2,
      balance: 10_000,
      feeRate: overrides.feeRate ?? 0.0004,
      slippageRate: overrides.slippageRate ?? 0.0002,
      fundingRate: overrides.fundingRate ?? 0.0001,
      applyFunding: overrides.applyFunding ?? false,
      applySpread: overrides.applySpread ?? false,
      spreadRate: overrides.spreadRate ?? 0.0001,
      costStressMultipliers: [1, 1.5, 2],
      costGuardK: 3,
    },
    report: {
      strategyId: "P3A61",
      strategyHash: "abc",
      strategyName: "x",
      sourceStatus: "user_created",
      symbol: "BTCUSDT",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromDate: "2026-01-01",
      toDate: "2026-01-02",
      requestedFrom: null,
      requestedTo: null,
      actualFirstCandleTime: null,
      actualLastCandleTime: null,
      candleCount: 10,
      processedCandleCount: 10,
      dataSource: "synthetic-test" as const,
      totalReturn: 0.01,
      mdd: -0.01,
      tradeCount: 1,
      winRate: 1,
      averageTrade: 0.01,
      profitFactor: 1,
      maxConsecutiveLosses: 0,
      feeImpact: 0,
      feeTotal: 0,
      slippageTotal: 0,
      fundingTotal: 0,
      spreadTotal: 0,
      costs: {
        fees: 0,
        slippage: 0,
        funding: 0,
        spread: 0,
        totalTradingCost: 0,
        totalCostUsdt: 1,
        grossPnLBeforeCosts: 10,
        netPnLAfterCosts: 9,
      },
      monthlyReturns: [],
      negativeMonths: 0,
      startingBalance: 10_000,
      endingBalance: 10_100,
      slippageModelVersion: overrides.slippageModelVersion,
      validation: {
        paramsHashVerified: true,
        feesApplied: true,
        slippageApplied: true,
        fundingApplied: Boolean(overrides.applyFunding),
        spreadApplied: Boolean(overrides.applySpread),
        noRealOrders: true as const,
      },
    },
    trades: [],
    engineVersion: "rextora-backtest-1",
  } as Parameters<typeof backtestResultHash>[0];
}

export function getCurrentIdentityBehavior() {
  const base = identityDemoPayload({});
  return {
    feeChangeChangesHash:
      backtestResultHash(base) !==
      backtestResultHash(identityDemoPayload({ feeRate: 0.0008 })),
    slippageChangeChangesHash:
      backtestResultHash(base) !==
      backtestResultHash(identityDemoPayload({ slippageRate: 0.0004 })),
    modelVersionChangesHash:
      backtestResultHash(
        identityDemoPayload({ slippageModelVersion: "execution_price_v1" }),
      ) !==
      backtestResultHash(
        identityDemoPayload({ slippageModelVersion: "legacy_v0" }),
      ),
    applyFundingSameOutcomesSameHash:
      backtestResultHash(identityDemoPayload({ applyFunding: false })) ===
      backtestResultHash(identityDemoPayload({ applyFunding: true })),
    dormantFundingRateChangesHash:
      backtestResultHash(identityDemoPayload({ fundingRate: 0.0001 })) !==
      backtestResultHash(identityDemoPayload({ fundingRate: 0.0005 })),
    applySpreadSameOutcomesSameHash:
      backtestResultHash(identityDemoPayload({ applySpread: false })) ===
      backtestResultHash(identityDemoPayload({ applySpread: true })),
    dormantSpreadRateSameHash:
      backtestResultHash(identityDemoPayload({ spreadRate: 0.0001 })) ===
      backtestResultHash(identityDemoPayload({ spreadRate: 0.0005 })),
  };
}

export function buildP3A61Contract(cwd = process.cwd()) {
  const hashes = productionReadonlyHashes(cwd);
  const legacy = inspectLegacyHashForensic(cwd);
  const elig = getEligibilitySourceTrace();
  const micro = getEligibilityMicroComparison();
  return {
    hashes,
    authorities: getCostInputAuthorities(),
    resultDetermining: classifyResultDeterminingFields(),
    primary: getPrimaryCostAssumptions(),
    stress: getStressCostAssumptions(),
    typeDesign: getCostAssumptionsTypeDesign(),
    normalization: getNormalizationContract(),
    legacy,
    hashModels: getHashModelComparison(),
    inactive: getInactiveFieldIdentity(),
    reproducibility: getReportOnlyReproducibilityTarget(),
    eligibility: elig,
    eligibilityMicro: micro,
    eligibilityModel: getRecommendedEligibilityCostModel(),
    approval: getApprovalProvenanceGate(),
    legacyPolicy: getLegacyResultPolicy(),
    settings: getSettingsUnitMismatch(),
    research: getResearchProvenanceBoundary(),
    defects: getDefectClassification(),
    frozen: getFrozenP3A62Contract(),
    filePlan: getP3A62FilePlan(),
    identityNow: getCurrentIdentityBehavior(),
    expectedSafeParamsHash: RETIRED_SAFE_PARAMS_HASH,
    safety: {
      researchExecutions: 0,
      paperLive: 0,
      orders: 0,
    },
    costRatiosHelper: {
      identityUsesTotalCostUsdt: true,
      criticalThreshold: computeCostRatios({
        grossPnLBeforeCosts: 1000,
        netPnLAfterCosts: 500,
        totalCostUsdt: 500,
        feeCostUsdt: 400,
        slippageCostUsdt: 100,
      }).criticalThreshold,
    },
  };
}

export function writeP3A61Artifacts(cwd = process.cwd()) {
  const dir = path.join(
    cwd,
    ".validation/backtest-p3-a6-1-cost-provenance-contract",
    P3A61_ARTIFACT_TS,
  );
  fs.mkdirSync(dir, { recursive: true });
  const payload = buildP3A61Contract(cwd);
  const write = (name: string, data: unknown) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), "utf8");
  };
  write("cost-input-authorities.json", payload.authorities);
  write("result-determining-fields.json", payload.resultDetermining);
  write("primary-stress-assumptions.json", {
    primary: payload.primary,
    stress: payload.stress,
  });
  write("cost-assumptions-type-design.json", payload.typeDesign);
  write("normalization-contract.json", payload.normalization);
  write("legacy-hash-forensic.json", payload.legacy);
  write("hash-model-comparison.json", payload.hashModels);
  write("inactive-field-identity.json", payload.inactive);
  write("report-reproducibility-target.json", payload.reproducibility);
  write("eligibility-source-trace.json", payload.eligibility);
  write("eligibility-model-comparison.json", {
    micro: payload.eligibilityMicro,
    model: payload.eligibilityModel,
  });
  write("approval-provenance-gate.json", payload.approval);
  write("legacy-result-policy.json", payload.legacyPolicy);
  write("settings-unit-mismatch.json", payload.settings);
  write("research-provenance-boundary.json", payload.research);
  write("defect-classification.json", payload.defects);
  write("p3-a6-2-frozen-contract.json", payload.frozen);
  write("production-readonly-hashes.json", {
    ...payload.hashes,
    safeFileSha: sha256File(path.join(cwd, "data/strategies", RETIRED_SAFE_FILE_NAME)),
    legacyRecordShas: payload.legacy.rows.map((r) => ({
      id: r.id,
      fileSha256: r.fileSha256,
    })),
  });
  return { dir, hashes: payload.hashes, legacy: payload.legacy };
}
