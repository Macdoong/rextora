import fs from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";

const root = process.cwd();
const base = "http://127.0.0.1:3000";
const buildId = fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
const projectEnv = loadProjectEnv(root);
const secrets = [projectEnv.OPENAI_API_KEY, projectEnv.GEMINI_API_KEY]
  .map((value) => value?.trim())
  .filter((value) => value && value.length >= 8);
const sessionId = `final_provider_${Date.now().toString(36)}`;
const history = [];

function countLeaks(value) {
  const serialized = JSON.stringify(value);
  return secrets.filter((secret) => serialized.includes(secret)).length;
}

function countWrites(body) {
  const audit = Array.isArray(body.toolAudit) ? body.toolAudit : [];
  return audit.filter((entry) =>
    entry?.approved === true || entry?.executed === true || entry?.write === true
  ).length;
}

async function ask(query, provider, model) {
  const response = await fetch(`${base}/api/rextora/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      turnId: `turn_${Date.now().toString(36)}`,
      history,
      sessionId,
      providerSelection: { provider, model },
      entityMemory: {},
      pendingApprovals: [],
      context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
    }),
  });
  const body = await response.json();
  const meta = body.reasoningMeta || body.providerMeta || {};
  const answer = String(body.conclusionKo ?? "");
  const result = {
    httpStatus: response.status,
    selectedProvider: meta.provider ?? null,
    selectedModel: meta.model ?? null,
    providerAttempted: meta.providerAttempted ?? Boolean(meta.provider),
    providerSucceeded: meta.provider === provider && meta.fallbackUsed !== true,
    fallbackUsed: meta.fallbackUsed ?? body.interpretationSource === "local",
    structuredOutputValid: Boolean(answer && body.conversationRoute),
    writeToolCount: countWrites(body),
    billingOrQuotaError: /billing|quota|credit|insufficient_quota/i.test(JSON.stringify(body)),
    credentialError: /invalid.*(?:key|credential)|unauthorized|authentication/i.test(JSON.stringify(body)),
    secretExposureCount: countLeaks(body),
  };
  history.push({ role: "user", content: query, timestamp: new Date().toISOString() });
  history.push({ role: "agent", content: answer, timestamp: new Date().toISOString() });
  return result;
}

const openai = await ask(
  "백테스트가 무엇인지 쉽게 설명해주시고 현재 렉스토라 상태에서 제가 다음에 무엇을 하면 좋을지도 알려주세요.",
  "openai",
  "gpt-5-mini",
);
const historyBeforeGemini = history.length;
const gemini = await ask(
  "방금 설명한 다음 단계가 왜 필요한지 더 쉽게 설명해주세요.",
  "gemini",
  "gemini-2.5-flash",
);

openai.pass = openai.httpStatus === 200 && openai.providerAttempted === true &&
  openai.providerSucceeded === true && openai.fallbackUsed === false &&
  openai.structuredOutputValid === true && openai.writeToolCount === 0 &&
  openai.billingOrQuotaError === false && openai.credentialError === false &&
  openai.secretExposureCount === 0;
gemini.contextPreserved = historyBeforeGemini === 2;
gemini.pass = gemini.httpStatus === 200 && gemini.providerAttempted === true &&
  gemini.providerSucceeded === true && gemini.fallbackUsed === false &&
  gemini.structuredOutputValid === true && gemini.writeToolCount === 0 &&
  gemini.contextPreserved === true && gemini.credentialError === false &&
  gemini.secretExposureCount === 0;

const report = { buildId, sessionId, openai, gemini, passed: openai.pass && gemini.pass };
fs.writeFileSync(
  path.join(root, "tmp/rextora-final-tester-completion/final-provider-sanity.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({ buildId, openai: openai.pass, gemini: gemini.pass, passed: report.passed }));
process.exitCode = report.passed ? 0 : 1;
