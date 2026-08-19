import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";

export interface ResearchAuditRecord {
  at: string;
  sessionId: string | null;
  action: "evidence_loaded" | "gap_analyzed" | "plan_generated" | "failure_analyzed" | "compared" | "recommended";
  evidenceRefs: string[];
  outputHash: string;
}

export function writeResearchAudit(record: ResearchAuditRecord): void {
  const root = process.env.REXTORA_AGENT_RESEARCH_AUDIT_DIR?.trim()
    ? path.resolve(process.env.REXTORA_AGENT_RESEARCH_AUDIT_DIR)
    : path.join(rextoraDataRoot(), "agent-research-audit");
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(path.join(root, "research.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}
