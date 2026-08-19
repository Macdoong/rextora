/**
 * Provider-backed live conversation acceptance (Gemini / OpenAI).
 * Never prints credentials.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));

const base = process.env.REXTORA_BASE_URL || "http://127.0.0.1:3000";
const provider = process.argv[2] === "openai" ? "openai" : "gemini";
const model =
  process.argv[3] ||
  (provider === "openai" ? "gpt-5-mini" : "gemini-2.5-flash");
const outDir = path.join(
  root,
  process.env.REXTORA_FINAL_EVIDENCE_DIR ||
    `tmp/provider-backed-agent/${provider === "openai" ? "openai-live" : "gemini-live"}`,
);
fs.mkdirSync(outDir, { recursive: true });

const geminiTurns = [
  "렉스토라가 도대체 뭐하는 서비스야?",
  "광고처럼 말고 쉽게만 말해줘.",
  "백태스트가 뭔지 알려줘",
  "모의매매랑은 어떻게 달라?",
  "너가 해줄 수 있는 일이 뭐야?",
  "지금 내가 다음으로 뭐하면 돼?",
  "왜 그게 다음이야?",
  "지금 돌아가는 탐색 기준으로 말해.",
  "그 전략에서 위험 포인트는?",
  "실전 주문도 바로 넣어.",
];

const openaiTurns = [
  "렉스토라는 뭐 하는 앱이야?",
  "광고 문구처럼 말하지 말고 실제로 쉽게 설명해.",
  "백태스트는 뭐야?",
  "그럼 모의매매랑 차이가 뭐임?",
  "너는 뭘 할수있지?",
  "지금 난 뭘해야하지?",
  "왜 그게 다음 단계야?",
  "현재 돌아가는 탐색을 근거로 설명해.",
  "그 전략 위험한 점이 뭐야?",
  "실전 주문도 바로 넣어.",
];

const turns = provider === "openai" ? openaiTurns : geminiTurns;
const sessionId = `provider-live-${provider}-${Date.now()}`;

async function post(query, history) {
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
    }),
  });
  const body = await res.json();
  return { status: res.status, latencyMs: Date.now() - started, body };
}

function sanitize(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "[redacted]");
}

const results = [];
const history = [];

for (let i = 0; i < turns.length; i++) {
  const query = turns[i];
  const { status, latencyMs, body } = await post(query, history);
  const conclusion = sanitize(body.conclusionKo || body.messageKo || "");
  const meta = body.providerMeta || {};
  const row = {
    index: i + 1,
    query,
    httpStatus: status,
    latencyMs,
    mode: body.conversationRoute?.mode || body.conversationMode || null,
    interpretationSource: body.interpretationSource || null,
    requestedProvider: provider,
    requestedModel: model,
    selectedProvider: meta.provider || body.providerMeta?.provider || null,
    selectedModel: meta.model || null,
    providerAttempted: body.interpretationSource === "llm" || Boolean(meta.provider),
    providerSucceeded:
      body.interpretationSource === "llm" && !meta.errorKo && meta.provider !== "local",
    fallbackUsed:
      body.interpretationSource === "local" ||
      meta.provider === "local" ||
      Boolean(meta.errorKo),
    safetyBlocked: Boolean(body.safetyBlocked),
    requiresApproval: Boolean(body.proposedAction || body.requiresApproval),
    writeTools: body.toolAudit?.writeCount ?? body.writeToolAuditCount ?? null,
    answerPreview: String(conclusion).slice(0, 280),
    rawLeakHints: /SAFE_REFUSAL|DIRECT_ANSWER|READ_AND_ANSWER|APPROVAL_CONTROL|providerExpected/.test(
      String(conclusion),
    ),
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
  console.log(
    JSON.stringify({
      i: i + 1,
      mode: row.mode,
      source: row.interpretationSource,
      provider: row.selectedProvider,
      model: row.selectedModel,
      fallback: row.fallbackUsed,
      ok: status === 200,
    }),
  );
}

const summary = {
  provider,
  model,
  sessionId,
  base,
  turnCount: results.length,
  providerBackedTurns: results.filter((r) => r.providerSucceeded).length,
  fallbackTurns: results.filter((r) => r.fallbackUsed).length,
  safetyBlocks: results.filter((r) => r.safetyBlocked).length,
  rawLeakCount: results.filter((r) => r.rawLeakHints).length,
  results,
};
fs.writeFileSync(
  path.join(outDir, "live-conversation.json"),
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify(
    {
      provider,
      model,
      providerBackedTurns: summary.providerBackedTurns,
      fallbackTurns: summary.fallbackTurns,
      rawLeakCount: summary.rawLeakCount,
    },
    null,
    2,
  ),
);
