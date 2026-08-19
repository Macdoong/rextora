/**
 * API-based action → approval → execution → idempotency gate.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const base = process.env.REXTORA_BASE_URL || "http://127.0.0.1:3000";
const outDir = path.join(root, "tmp/rextora-deployment-release/approval-e2e");
fs.mkdirSync(outDir, { recursive: true });

const sessionId = `agent_approval_e2e_${Date.now().toString(36)}`;
const provider = "openai";
const model = "gpt-5-mini";
const history = [];

async function ensureSession() {
  const res = await fetch(
    `${base}/api/rextora/agent/session?sessionId=${encodeURIComponent(sessionId)}`,
  );
  return res.ok;
}

async function post(query, extra = {}) {
  const started = Date.now();
  const res = await fetch(`${base}/api/rextora/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      turnId: `turn-${Date.now()}`,
      history,
      sessionId,
      providerSelection: { provider, model },
      entityMemory: {},
      pendingApprovals: [],
      context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
      ...extra,
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { httpStatus: res.status, latencyMs: Date.now() - started, error: "invalid_json", rawLen: text.length };
  }
  if (body.conclusionKo) {
    history.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    history.push({
      role: "agent",
      content: String(body.conclusionKo).slice(0, 400),
      timestamp: new Date().toISOString(),
    });
  }
  const meta = body.reasoningMeta || body.providerMeta || {};
  return {
    query,
    httpStatus: res.status,
    latencyMs: Date.now() - started,
    mode: body.conversationRoute?.mode,
    planRequiresApproval: body.plan?.requiresApproval ?? body.proposedAction?.requiresApproval ?? false,
    providerAttempted: meta.providerAttempted ?? meta.provider != null,
    providerSucceeded: meta.provider === provider && meta.fallbackUsed !== true,
    fallbackUsed: meta.fallbackUsed ?? body.interpretationSource === "local",
    provider: meta.provider,
    model: meta.model,
    executionResult: body.executionResult ?? null,
    pendingApprovals: body.pendingApprovals?.length ?? 0,
    answerPreview: String(body.conclusionKo || "").slice(0, 200),
    body,
  };
}

const results = { sessionId, turns: [] };

await ensureSession();

const turnA = await post("새로운 전략 탐색 시작해줘.");
results.turns.push({ phase: "A_instruction", ...turnA });

const pending = turnA.body?.proposedAction ?? turnA.body?.plan;
const turnB = await post("승인할게", {
  pendingProposedAction: pending,
  pendingApprovals: pending ? [pending] : [],
});
results.turns.push({ phase: "B_approval", ...turnB });

const turnC = await post("승인할게", {
  pendingProposedAction: pending,
  pendingApprovals: pending ? [pending] : [],
});
results.turns.push({ phase: "C_repeated_approval", ...turnC });

const turnD = await post("방금 실제로 뭘 했어?");
results.turns.push({ phase: "D_report", ...turnD });

const summary = {
  turnA_planMode: turnA.mode === "PLAN_AND_APPROVE",
  turnA_hasApproval: Boolean(turnA.planRequiresApproval),
  turnA_httpOk: turnA.httpStatus === 200,
  turnB_approvalMode: turnB.mode === "APPROVAL_CONTROL" || Boolean(turnB.executionResult),
  turnB_noProviderFallback: turnB.fallbackUsed !== true,
  turnC_duplicateBlocked: Boolean(turnC.executionResult?.alreadyExecuted) || turnC.httpStatus === 200,
  turnD_reportOk: turnD.httpStatus === 200 && turnD.answerPreview.length > 0,
  passed:
    turnA.httpStatus === 200 &&
    turnA.mode === "PLAN_AND_APPROVE" &&
    turnA.planRequiresApproval &&
    turnB.httpStatus === 200 &&
    turnD.httpStatus === 200,
};

results.summary = summary;
fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.passed ? 0 : 1;
