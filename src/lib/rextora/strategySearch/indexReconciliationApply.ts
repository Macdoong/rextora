/**
 * P2-E2C allowlisted historical index reconciliation apply.
 * Writes index.json once. Never writes jobs, plans, or recovery artifacts.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeDurableJsonPayload } from "./durableJsonWrite";
import {
  APPROVED_P2_E2B_RECONCILE_IDS,
  buildIndexReconciliationPlan,
  sha256Text,
} from "./indexReconciliationPlan";
import { loadRawIndexReconciliationSnapshot } from "./indexReconciliationDryRun";

export const EXPECTED_PRE_APPLY_INDEX_SHA256 =
  "e0040d075d6ca771146e9574d8f7455daedb2b0c006df80ddc350ed3a6290ce9";
export const EXPECTED_POST_APPLY_INDEX_SHA256 =
  "db1a02d5b8e0d0c163e331cb10a68bb716f26c5c8b2b2e829fe6fbe40e5d8dcb";

export function serializeProposedIndex(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function applyApprovedIndexReconciliation(input: {
  rootDir: string;
  allowlist?: readonly string[];
  expectedIndexHash: string;
  expectedProposedHash: string;
  expectedJobFileHashes: Readonly<Record<string, string>>;
}): {
  wrote: boolean;
  afterHash: string;
  payload: string;
  changedRowCount: number;
  preconditionCode: string | null;
} {
  const allowlist = input.allowlist ?? APPROVED_P2_E2B_RECONCILE_IDS;
  const snapshot = loadRawIndexReconciliationSnapshot(input.rootDir);
  const plan = buildIndexReconciliationPlan({
    allowlist,
    index: snapshot.index,
    jobsById: snapshot.jobsById,
    authorities: snapshot.authorities,
    jobFileHashes: snapshot.jobFileHashes,
    planFileHashes: snapshot.planFileHashes,
    expectedJobFileHashes: input.expectedJobFileHashes,
    expectedIndexHash: input.expectedIndexHash,
    currentIndexHash: snapshot.indexHash,
    diskJobIds: snapshot.diskJobIds,
  });
  const payload = serializeProposedIndex(plan.proposedIndex);
  const proposedHash = sha256Text(payload);
  if (!plan.ok || proposedHash !== input.expectedProposedHash) {
    return {
      wrote: false,
      afterHash: snapshot.indexHash,
      payload,
      changedRowCount: plan.changedRowCount,
      preconditionCode:
        plan.preconditionCode ??
        (proposedHash !== input.expectedProposedHash
          ? "PROPOSED_HASH_MISMATCH"
          : "FAILED_PRECONDITION"),
    };
  }
  writeDurableJsonPayload(path.join(input.rootDir, "index.json"), payload);
  const after = fs.readFileSync(path.join(input.rootDir, "index.json"));
  const afterHash = crypto.createHash("sha256").update(after).digest("hex");
  return {
    wrote: true,
    afterHash,
    payload,
    changedRowCount: plan.changedRowCount,
    preconditionCode: null,
  };
}
