import fs from "node:fs";
import path from "node:path";
import safeStrategyFile from "@/data/strategies/SAFE_v44_i4060.json";
import { CONTEXT_FALLBACK_PARAMS, mergeSafeParams } from "./safeV44Params";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  SAFE_STRATEGY_NAME,
  type SafeV44StrategyMetadata,
  type StrategySourceStatus
} from "./strategyTypes";

const RESEARCH_CANDIDATES = [
  "research/results/v44/locked_final_i4060.json",
  "research/results/v44/locked_final_i4060_v445.json"
] as const;

const DATA_STRATEGY_FILE = "data/strategies/SAFE_v44_i4060.json";

export class SafeStrategyHashMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`SAFE strategy params_hash mismatch: expected ${expected}, actual ${actual}`);
    this.name = "SafeStrategyHashMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

function readResearchJsonIfExists(relativePath: string): Record<string, unknown> | null {
  const full = path.join(/* turbopackIgnore: true */ process.cwd(), relativePath);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractHash(raw: Record<string, unknown>): string | null {
  const hash = raw.params_hash ?? raw.paramsHash;
  return typeof hash === "string" ? hash : null;
}

function extractParams(raw: Record<string, unknown>): Record<string, unknown> {
  const params = raw.params;
  return params && typeof params === "object" ? (params as Record<string, unknown>) : {};
}

/**
 * Load SAFE_v44_i4060 with explicit source status.
 * Never invent params silently: missing research JSON → context_fallback merge.
 * Hash mismatch throws (does not proceed) when throwOnHashMismatch is true.
 */
export function loadSafeV44Strategy(options?: { throwOnHashMismatch?: boolean }): SafeV44StrategyMetadata {
  const throwOnHashMismatch = options?.throwOnHashMismatch !== false;
  const notes: string[] = [];

  let lockedRaw: Record<string, unknown> | null = null;
  let lockedPath: string | null = null;
  for (const candidate of RESEARCH_CANDIDATES) {
    const raw = readResearchJsonIfExists(candidate);
    if (raw) {
      lockedRaw = raw;
      lockedPath = candidate;
      break;
    }
  }

  const dataRaw = safeStrategyFile as unknown as Record<string, unknown>;
  const lockedResearchFilesFound = Boolean(lockedRaw);
  const dataStrategyFileFound = Boolean(dataRaw);

  if (!lockedResearchFilesFound) {
    notes.push(
      "research/results/v44/locked_final_i4060.json and locked_final_i4060_v445.json are missing."
    );
  }

  const preferred = lockedRaw ?? dataRaw;
  const preferredPath = lockedPath ?? (dataRaw ? DATA_STRATEGY_FILE : null);

  if (!preferred) {
    notes.push("No strategy JSON found on disk. Using operator context fallback params.");
    return {
      name: SAFE_STRATEGY_NAME,
      paramsHash: EXPECTED_SAFE_PARAMS_HASH,
      params: { ...CONTEXT_FALLBACK_PARAMS },
      sourceFile: null,
      sourceStatus: "context_fallback",
      lockedResearchFilesFound: false,
      dataStrategyFileFound: false,
      hashVerified: false,
      notes
    };
  }

  const actualHash = extractHash(preferred);
  if (!actualHash) {
    notes.push(`Strategy file ${preferredPath} has no params_hash.`);
    if (throwOnHashMismatch) {
      throw new SafeStrategyHashMismatchError(EXPECTED_SAFE_PARAMS_HASH, "(missing)");
    }
    return {
      name: SAFE_STRATEGY_NAME,
      paramsHash: EXPECTED_SAFE_PARAMS_HASH,
      params: { ...CONTEXT_FALLBACK_PARAMS },
      sourceFile: preferredPath,
      sourceStatus: "hash_mismatch",
      lockedResearchFilesFound,
      dataStrategyFileFound,
      hashVerified: false,
      notes
    };
  }

  if (actualHash !== EXPECTED_SAFE_PARAMS_HASH) {
    notes.push(`params_hash mismatch in ${preferredPath}.`);
    if (throwOnHashMismatch) {
      throw new SafeStrategyHashMismatchError(EXPECTED_SAFE_PARAMS_HASH, actualHash);
    }
    return {
      name: SAFE_STRATEGY_NAME,
      paramsHash: actualHash,
      params: { ...CONTEXT_FALLBACK_PARAMS },
      sourceFile: preferredPath,
      sourceStatus: "hash_mismatch",
      lockedResearchFilesFound,
      dataStrategyFileFound,
      hashVerified: false,
      notes
    };
  }

  const fileParams = extractParams(preferred);
  const merged = mergeSafeParams(fileParams);
  const fileParamKeys = Object.keys(fileParams).length;
  const fullKeys = Object.keys(CONTEXT_FALLBACK_PARAMS).length;

  let sourceStatus: StrategySourceStatus;
  if (lockedResearchFilesFound) {
    sourceStatus = "locked_file";
    notes.push(`Loaded locked research file: ${lockedPath}`);
  } else if (fileParamKeys < fullKeys * 0.6) {
    sourceStatus = "context_fallback";
    notes.push(
      `data/strategies/SAFE_v44_i4060.json found with verified hash ${actualHash}, but params are incomplete (${fileParamKeys}/${fullKeys}). Merged with context fallback params.`
    );
  } else {
    sourceStatus = "data_file";
    notes.push(`Loaded ${DATA_STRATEGY_FILE} with verified hash ${actualHash}.`);
  }

  return {
    name: typeof preferred.name === "string" ? preferred.name : SAFE_STRATEGY_NAME,
    paramsHash: actualHash,
    params: merged,
    sourceFile: preferredPath,
    sourceStatus,
    lockedResearchFilesFound,
    dataStrategyFileFound,
    hashVerified: true,
    notes
  };
}

export function getSafeV44Params() {
  return loadSafeV44Strategy().params;
}

export function validateSafeV44ParamsHash(): {
  ok: boolean;
  expected: string;
  actual: string;
  message: string;
  metadata: SafeV44StrategyMetadata;
} {
  const metadata = loadSafeV44Strategy({ throwOnHashMismatch: false });
  const ok = metadata.hashVerified && metadata.paramsHash === EXPECTED_SAFE_PARAMS_HASH;
  return {
    ok,
    expected: EXPECTED_SAFE_PARAMS_HASH,
    actual: metadata.paramsHash,
    message: ok
      ? `SAFE 전략 해시 검증 통과 (${metadata.sourceStatus}).`
      : `SAFE 전략 해시 검증 실패: expected ${EXPECTED_SAFE_PARAMS_HASH}, actual ${metadata.paramsHash}`,
    metadata
  };
}
