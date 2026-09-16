/**
 * Read-only production Research forensic helpers.
 * Historical missing IDs and the leaked fossil are identity invariants.
 * Live index hash / job count / updatedAt are not frozen across operator sessions.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LEAKED_FOSSIL_JOB_ID =
  "search_43ccb40b-8069-4829-a337-c54cdcef4a59";

export const HISTORICAL_MISSING_JOB_IDS = [
  "search_30d6cef4-d1e9-4d74-b6bd-b4f5e725315c",
  "search_5bedd873-2e89-4604-ab27-07a9dff27e74",
  "search_78e8dd3f-5fea-4955-8535-7578338a18e1",
  "search_6b0b920d-e45b-4101-8f2d-2013380d86a5",
  "search_e47a902f-5ee3-484f-88ca-73313de44cc6",
  "search_1683a734-341d-4da8-99c7-476ad80c078d",
  "search_6b527e08-d01d-49b8-b398-1ad27482182f",
] as const;

export const HISTORICAL_MISSING_JOB_ID_SET = new Set<string>(
  HISTORICAL_MISSING_JOB_IDS,
);

/** Historical F2B dry-run artifact only — not live checkout authority. */
export const HISTORICAL_F2B_PROPOSED_INDEX_SHA256 =
  "9395b5faaff412abb59fba81deb419871574324d812d7cdc293272d9aced3437";

export function productionRextoraRoot(): string {
  return path.join(process.cwd(), "data", "rextora");
}

export function productionStrategySearchRoot(): string {
  return path.join(productionRextoraRoot(), "strategy-search");
}

export function productionResearchIndexPath(): string {
  return path.join(productionStrategySearchRoot(), "index.json");
}

export function sha256ProductionFile(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function currentProductionResearchIndexSha256(): string {
  return sha256ProductionFile(productionResearchIndexPath());
}

export function readProductionResearchIndex(): {
  version?: number;
  updatedAt?: string;
  jobs: Array<{ id: string; status?: string }>;
} {
  return JSON.parse(
    fs.readFileSync(productionResearchIndexPath(), "utf8"),
  ) as {
    version?: number;
    updatedAt?: string;
    jobs: Array<{ id: string; status?: string }>;
  };
}

export function currentProductionIndexedJobCount(): number {
  return readProductionResearchIndex().jobs.length;
}

export function productionPaperSessionsRoot(): string {
  return path.join(productionRextoraRoot(), "paper-sessions");
}

export function productionBacktestsRoot(): string {
  return path.join(productionRextoraRoot(), "backtests");
}

export function isHistoricalMissingJobId(id: string): boolean {
  return HISTORICAL_MISSING_JOB_ID_SET.has(id);
}

export function ownerFilesExcludingKnownFossil(ownersDir: string): string[] {
  if (!fs.existsSync(ownersDir)) return [];
  return fs
    .readdirSync(ownersDir)
    .filter((name) => name.endsWith(".owner.json"))
    .filter((name) => name !== `${LEAKED_FOSSIL_JOB_ID}.owner.json`);
}

export function overrideRextoraDataDir(dir: string): () => void {
  const prev = process.env.REXTORA_DATA_DIR;
  process.env.REXTORA_DATA_DIR = dir;
  return () => {
    if (prev === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = prev;
  };
}
