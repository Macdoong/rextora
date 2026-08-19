/**
 * Final provider sanity for release validation — never prints credentials.
 */
import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const base = process.env.REXTORA_BASE_URL || "http://127.0.0.1:3000";
const outDir = path.join(root, "tmp/rextora-deployment-release/final-validation");
fs.mkdirSync(outDir, { recursive: true });

const BUILD_ID = fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
const sessionId = `final_sanity_${Date.now().toString(36)}`;
const history = [];

async function post(query, selection) {
  const started = Date.now();
  const res = await fetch(`${base}/api/rextora/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      turnId: `turn-${Date.now()}`,
      history,
      sessionId,
      providerSelection: selection,
      entityMemory: {},
      pendingApprovals: [],
      context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
    }),
  });
  const body = await res.json();
  const meta = body.reasoningMeta || body.providerMeta || {};
  history.push({ role: "user", content: query, timestamp: new Date().toISOString() });
  history.push({
    role: "agent",
    content: String(body.conclusionKo ?? "").slice(0, 500),
    timestamp: new Date().toISOString(),
  });
  return {
    httpStatus: res.status,
    latencyMs: Date.now() - started,
    body,
    meta,
    providerAttempted: meta.providerAttempted ?? Boolean(meta.provider),
    providerSucceeded:
      meta.provider === selection.provider && meta.fallbackUsed !== true,
    fallbackUsed: meta.fallbackUsed ?? body.interpretationSource === "local",
    structuredOutputValid: Boolean(body.conclusionKo && body.conversationRoute),
    writeToolCount: (body.toolAudit ?? []).filter((t) => t.approved).length,
  };
}

const openaiQuery =
  "백태스트가 뭔지 쉽게 설명해주시고, 현재 렉스토라 상태를 기준으로 제가 다음에 무엇을 하면 좋은지도 알려주세요.";
const geminiQuery = "방금 말씀하신 다음 단계가 왜 필요한지 더 쉽게 설명해주세요.";

const openai = await post(openaiQuery, { provider: "openai", model: "gpt-5-mini" });
const gemini = await post(geminiQuery, { provider: "gemini", model: "gemini-2.5-flash" });

const report = {
  buildId: BUILD_ID,
  sessionId,
  openai: {
    ...openai,
    body: undefined,
    answerPreview: String(openai.body.conclusionKo ?? "").slice(0, 300),
    selectedProvider: openai.meta.provider,
    selectedModel: openai.meta.model,
    pass:
      openai.httpStatus === 200 &&
      openai.providerAttempted === true &&
      openai.providerSucceeded === true &&
      openai.fallbackUsed === false &&
      openai.structuredOutputValid === true &&
      openai.writeToolCount === 0,
  },
  gemini: {
    ...gemini,
    body: undefined,
    answerPreview: String(gemini.body.conclusionKo ?? "").slice(0, 300),
    selectedProvider: gemini.meta.provider,
    selectedModel: gemini.meta.model,
    contextPreserved: history.length >= 4,
    pass:
      gemini.httpStatus === 200 &&
      gemini.providerAttempted === true &&
      gemini.providerSucceeded === true &&
      gemini.fallbackUsed === false &&
      gemini.writeToolCount === 0 &&
      history.length >= 4,
  },
  passed: false,
};

report.passed = report.openai.pass && report.gemini.pass;
fs.writeFileSync(path.join(outDir, "provider-sanity.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, openai: report.openai.pass, gemini: report.gemini.pass }, null, 2));
process.exitCode = report.passed ? 0 : 1;
