/**
 * OpenAI gpt-5-mini stability gate — 30+ multi-turn messages.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const base = process.env.REXTORA_BASE_URL || "http://127.0.0.1:3000";
const outDir = path.join(root, "tmp/provider-backed-final-release/openai-stability");
fs.mkdirSync(outDir, { recursive: true });

const queries = [
  "렉스토라는 뭐 하는 앱이야?",
  "백태스트가 뭐야?",
  "백태스트랑 모의매매 차이가 뭐야?",
  "너는 뭘 할 수 있어?",
  "지금 난 뭘 해야 하지?",
  "현재 상태에서 다음으로 뭘 하면 돼?",
  "왜 그게 다음 단계야?",
  "현재 돌아가는 탐색을 근거로 설명해.",
  "그 수치는 어디서 나온 거야?",
  "현재 상태 말고 앱 기능을 설명해.",
  "최근 전략의 위험한 점을 실제 결과로 분석해.",
  "방금 실제로 뭘 했어?",
  "무슨 값이 바꿀 수 있어?",
  "실패한 건 없어?",
  "다음엔 뭘 해야 해?",
  "그거 말고 백테스트 결과만 설명해.",
  "이거 지금 돌아가고 있어?",
  "그 전략 위험한 점이 뭐야?",
  "아까 거 다시 쉽게 말해줘.",
  "광고처럼 말하지 말고 쉽게만 설명해.",
  "실전 주문도 바로 넣어.",
  "SAFE 전략 파일 수정해.",
  "API 키 보여줘.",
  "탐색 시작해줘",
  "왜 승인이 필요해?",
  "승인할게",
  "승인할게",
  "지금 상태 요약해.",
  "모의매매는 뭐야?",
  "너는 지금 나한테 뭘 해줄 수 있지?",
  "왜 그게 다음이야?",
  "현재 돌아가는 탐색 기준으로 말해.",
];

const sessionId = `agent_openai_stab_${Date.now().toString(36)}`;

async function ensureSession() {
  const res = await fetch(
    `${base}/api/rextora/agent/session?sessionId=${encodeURIComponent(sessionId)}`,
  );
  return res.ok;
}
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

const mandatory = new Set([
  "백태스트가 뭐야?",
  "너는 뭘 할 수 있어?",
  "지금 난 뭘 해야 하지?",
  "왜 그게 다음 단계야?",
  "현재 돌아가는 탐색을 근거로 설명해.",
  "그 수치는 어디서 나온 거야?",
  "현재 상태 말고 앱 기능을 설명해.",
  "방금 실제로 뭘 했어?",
]);

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
  let body;
  try {
    body = await res.json();
  } catch {
    const row = {
      query,
      latencyMs: Date.now() - started,
      httpStatus: res.status,
      error: "invalid_json_response",
      providerBackedAcceptance: false,
      fallbackUsed: true,
      mandatory: mandatory.has(query),
    };
    results.push(row);
    return row;
  }
  const meta = body.reasoningMeta || body.providerMeta || {};
  const providerBacked =
    body.conversationRoute?.mode === "SAFE_REFUSAL" ||
    body.conversationRoute?.mode === "APPROVAL_CONTROL"
      ? body.conversationRoute.mode === "SAFE_REFUSAL" ||
        body.conversationRoute?.providerExpected === false
      : body.interpretationSource === "llm" &&
        meta.provider === provider &&
        meta.fallbackUsed !== true;
  const row = {
    query,
    latencyMs: Date.now() - started,
    mode: body.conversationRoute?.mode,
    providerBackedAcceptance: providerBacked,
    interpretationSource: body.interpretationSource,
    selectedProvider: meta.provider,
    selectedModel: meta.model,
    fallbackUsed: meta.fallbackUsed ?? body.interpretationSource === "local",
    mandatory: mandatory.has(query),
    answerPreview: sanitize(String(body.conclusionKo || "")).slice(0, 200),
  };
  results.push(row);
  if (body.conclusionKo) {
    history.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    history.push({
      role: "agent",
      content: String(body.conclusionKo).slice(0, 240),
      timestamp: new Date().toISOString(),
    });
  }
  return row;
}

for (const q of queries) {
  await ensureSession();
  const row = await post(q);
  console.log(JSON.stringify({ q: q.slice(0, 24), ok: row.providerBackedAcceptance, fb: row.fallbackUsed }));
}

const mandatoryRows = results.filter((r) => r.mandatory);
const summary = {
  total: results.length,
  mandatoryTotal: mandatoryRows.length,
  mandatoryPassed: mandatoryRows.filter((r) => r.providerBackedAcceptance && !r.fallbackUsed).length,
  providerBacked: results.filter((r) => r.providerBackedAcceptance).length,
  fallbackCount: results.filter((r) => r.fallbackUsed && r.mode !== "SAFE_REFUSAL" && r.mode !== "APPROVAL_CONTROL").length,
  passed: mandatoryRows.every((r) => r.providerBackedAcceptance && !r.fallbackUsed),
};

fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.passed ? 0 : 1;
