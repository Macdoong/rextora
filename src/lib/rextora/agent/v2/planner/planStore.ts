import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";
import { sanitizeSessionId } from "../session/sessionPersistence";
import type { PlanV2 } from "./planTypes";
import { diffPlans } from "./planService";

interface PlanLedger {
  sessionId: string;
  plans: PlanV2[];
}

function filePath(sessionId: string): string {
  const root = process.env.REXTORA_AGENT_PLANS_DIR?.trim()
    ? path.resolve(process.env.REXTORA_AGENT_PLANS_DIR)
    : path.join(rextoraDataRoot(), "agent-plans-v2");
  return path.join(root, `${sanitizeSessionId(sessionId)}.json`);
}

export function readPlanLedger(sessionId: string): PlanLedger {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(sessionId), "utf8")) as PlanLedger;
    if (parsed.sessionId === sessionId && Array.isArray(parsed.plans)) return parsed;
  } catch {
    // Empty ledger on first use.
  }
  return { sessionId, plans: [] };
}

export function savePlanV2(plan: PlanV2): void {
  const ledger = readPlanLedger(plan.sessionId);
  const plans = ledger.plans.filter((item) => item.planId !== plan.planId);
  plans.push(plan);
  const file = filePath(plan.sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ sessionId: plan.sessionId, plans }, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function findPlanV2(sessionId: string, planId: string): PlanV2 | null {
  return readPlanLedger(sessionId).plans.find((plan) => plan.planId === planId) ?? null;
}

export function latestPlanComparison(sessionId: string): {
  available: boolean;
  summaryKo: string;
  meaningfulChanged: boolean;
} {
  const plans = readPlanLedger(sessionId).plans;
  if (plans.length < 2) {
    return { available: false, summaryKo: "비교할 이전 계획이 아직 없습니다.", meaningfulChanged: false };
  }
  const before = plans[plans.length - 2];
  const after = plans[plans.length - 1];
  const diff = diffPlans(before, after);
  const naturalNames = new Set<string>();
  for (const entry of diff.entries.filter((item) => item.meaningful)) {
    if (entry.path.includes("timeframe")) naturalNames.add("시간봉");
    else if (entry.path.includes("selectedSpaceIds") || entry.path.includes("patterns")) naturalNames.add("패턴 조합");
    else if (entry.path.includes("symbol")) naturalNames.add("대상 종목");
    else if (entry.path.includes("toolId")) naturalNames.add("실행 순서");
    else naturalNames.add("탐색 조건");
  }
  const fields = [...naturalNames];
  return {
    available: true,
    meaningfulChanged: diff.meaningfulChanged,
    summaryKo: diff.meaningfulChanged
      ? `이전 계획과 비교해 ${fields.join("·") || "탐색 조건"}이 달라졌습니다. 변경된 계획은 다시 승인이 필요합니다.`
      : "표시 방식만 달라졌고 실제 실행 조건은 같습니다. 기존 승인은 그대로 유효합니다.",
  };
}
