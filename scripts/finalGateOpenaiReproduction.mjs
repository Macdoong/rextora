/**
 * OpenAI READ_AND_ANSWER reproduction harness — no credential output.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const base = process.env.REXTORA_BASE_URL || "http://127.0.0.1:3000";
const outDir = path.join(root, "tmp/provider-backed-agent-final/openai-live");
fs.mkdirSync(outDir, { recursive: true });

const queries = [
  "지금 난 뭘해야하지?",
  "현재 상태에서 다음으로 뭘 하면 돼?",
  "현재 돌아가는 탐색을 근거로 설명해.",
  "최근 전략의 위험한 점을 실제 결과로 분석해.",
  "왜 그게 다음 단계야?",
  "방금 보고한 수치가 어디서 나온 거야?",
  "현재 상태 말고 앱 기능을 설명해.",
  "백태스트가 뭐야?",
  "너는 지금 나한테 뭘 해줄 수 있지?",
];

const sessionId = `openai-repro-${Date.now()}`;
const provider = "openai";
const model = "gpt-5-mini";
const history = [];
const results = [];

function sanitize(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "[redacted]");
}

async function post(query) {
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
    }),
  });
  const body = await res.json();
  const latencyMs = Date.now() - started;
  const meta = body.reasoningMeta || body.providerMeta || {};
  const row = {
    query,
    httpStatus: res.status,
    latencyMs,
    conversationMode: body.conversationRoute?.mode || body.conversationMode || null,
    interpretationSource: body.interpretationSource || null,
    requestedProvider: provider,
    requestedModel: model,
    selectedProvider: meta.provider || null,
    selectedModel: meta.model || null,
    providerAttempted: body.interpretationSource === "llm" || Boolean(meta.provider),
    providerSucceeded:
      body.interpretationSource === "llm" &&
      meta.provider === provider &&
      meta.fallbackUsed !== true &&
      !meta.providerErrorKo,
    structuredOutputValid: meta.validationOk === true,
    fallbackUsed:
      body.interpretationSource === "local" ||
      meta.fallbackUsed === true ||
      meta.provider === "local" ||
      Boolean(meta.providerErrorKo),
    fallbackReason: meta.fallbackReason || meta.providerErrorKo || null,
    tokenUsage: meta.tokenUsage || null,
    readTools: body.toolAudit?.readCount ?? null,
    writeTools: body.toolAudit?.writeCount ?? body.writeToolAuditCount ?? 0,
    answerPreview: sanitize(String(body.conclusionKo || body.interpretationKo || "")).slice(0, 320),
    rawLeakCount: body.rawLeakCount ?? null,
  };
  results.push(row);
  if (body.conclusionKo || body.interpretationKo) {
    history.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    history.push({
      role: "agent",
      content: String(body.conclusionKo || body.interpretationKo || "").slice(0, 280),
      timestamp: new Date().toISOString(),
    });
  }
  return row;
}

for (const query of queries) {
  const row = await post(query);
  console.log(
    JSON.stringify({
      query: query.slice(0, 24),
      mode: row.conversationMode,
      providerSucceeded: row.providerSucceeded,
      fallbackUsed: row.fallbackUsed,
      latencyMs: row.latencyMs,
    }),
  );
}

const summary = {
  total: results.length,
  providerSucceeded: results.filter((r) => r.providerSucceeded).length,
  fallbackUsed: results.filter((r) => r.fallbackUsed).length,
  readAndAnswer: results.filter((r) => r.conversationMode === "READ_AND_ANSWER").length,
  passed: results.every((r) => r.providerSucceeded && !r.fallbackUsed && (r.writeTools ?? 0) === 0),
};

fs.writeFileSync(path.join(outDir, "reproduction.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.passed ? 0 : 1;
