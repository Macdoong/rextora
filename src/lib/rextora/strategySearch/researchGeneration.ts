/**
 * Research generation records for Strategy Search campaigns.
 * Sidecar: <root>/jobs/<jobId>.generations.json
 */

import fs from "node:fs";
import path from "node:path";
import {
  StrategySearchPersistenceError,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { assertStrategySearchJobId } from "./searchId";
import type { SearchSpaceMutationRecord } from "./searchSpaceMutation";
import type { StrategySearchParameterRange } from "./types";
import type {
  StrategySearchAdjustmentPlan,
  WeaknessAnalysisResult,
} from "./weaknessAnalysis";

export const RESEARCH_GENERATION_VERSION = 1 as const;

export interface ResearchGeneration {
  version: typeof RESEARCH_GENERATION_VERSION;
  id: string;
  jobId: string;
  generationNumber: number;
  parentGenerationId: string | null;
  spaceId: string;
  spaceLabelKo: string;
  searchSpaceConfig: {
    spaceId: string;
    labelKo: string;
    uniqueEvaluated: number;
    budgetAllocated: number | null;
    budgetSpent: number | null;
  };
  weaknessAnalysis: WeaknessAnalysisResult | null;
  adjustmentPlan: StrategySearchAdjustmentPlan | null;
  /** Optional: ranges after weakness-driven mutation for this generation. */
  mutatedParameterRanges?: StrategySearchParameterRange[] | null;
  /** Optional: audit record of search-space mutations applied. */
  searchSpaceMutation?: SearchSpaceMutationRecord | null;
  candidateHashes: string[];
  bestCandidateHash: string | null;
  qualifiedHashes: string[];
  seed: number | null;
  engineVersion: string;
  dataVersion: string;
  feeVersion: string;
  slippageVersion: string;
  startedAt: string;
  endedAt: string;
}

export interface ResearchGenerationFile {
  version: 1;
  jobId: string;
  updatedAt: string;
  generations: ResearchGeneration[];
}

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "strategy-search",
  );
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function generationsPath(root: string, jobId: string): string {
  assertStrategySearchJobId(jobId);
  return path.join(root, "jobs", `${jobId}.generations.json`);
}

function writeJsonAtomic(targetPath: string, value: unknown): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${targetPath}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, targetPath);
}

export function listResearchGenerations(
  jobId: string,
  options?: StrategySearchStoreOptions,
): ResearchGeneration[] {
  const root = resolveRoot(options);
  const fp = generationsPath(root, jobId);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as ResearchGenerationFile;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.generations)) return [];
    return raw.generations;
  } catch {
    throw new StrategySearchPersistenceError(
      "CORRUPTED",
      `unreadable research generations for ${jobId}`,
      fp,
    );
  }
}

export function appendResearchGeneration(
  generation: ResearchGeneration,
  options?: StrategySearchStoreOptions,
): ResearchGeneration {
  assertStrategySearchJobId(generation.jobId);
  const root = resolveRoot(options);
  const existing = listResearchGenerations(generation.jobId, options);
  const next: ResearchGenerationFile = {
    version: 1,
    jobId: generation.jobId,
    updatedAt: new Date().toISOString(),
    generations: [...existing.filter((g) => g.id !== generation.id), generation],
  };
  writeJsonAtomic(generationsPath(root, generation.jobId), next);
  return generation;
}

export function createResearchGenerationId(
  jobId: string,
  generationNumber: number,
): string {
  return `${jobId}_gen_${generationNumber}`;
}
