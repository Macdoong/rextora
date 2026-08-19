import fs from "node:fs";

const base = "http://127.0.0.1:3000";
const buildId = fs.readFileSync(".next/BUILD_ID", "utf8").trim();
const settingsResponse = await fetch(`${base}/api/rextora/settings/ai-providers`);
const settings = await settingsResponse.json().catch(() => null);
const gemini = {
  httpStatus: settingsResponse.status,
  configured: settings?.gemini?.configured === true,
  enabled: settings?.gemini?.enabled === true,
  stored: settings?.gemini?.stored === true,
  envFallback: settings?.gemini?.envFallback === true,
};

const response = await fetch(`${base}/api/rextora/agent`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "백테스트가 무엇인지 한 문장으로 설명해 주세요. 어떤 작업도 실행하지 마세요.",
    turnId: `openai-recovery-${Date.now()}`,
    history: [],
    providerSelection: { provider: "openai", model: "gpt-5-mini" },
    entityMemory: {},
    pendingApprovals: [],
    context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
  }),
});
const body = await response.json().catch(() => null);
const meta = body?.reasoningMeta ?? body?.providerMeta ?? {};
const sanitizedError = String(meta?.errorKo ?? body?.errorKo ?? body?.messageKo ?? "")
  .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]")
  .replace(/\bAIza[A-Za-z0-9_-]+\b/g, "[REDACTED]")
  .slice(0, 500);
const serializedPublic = JSON.stringify({
  conclusionKo: body?.conclusionKo,
  conversationRoute: body?.conversationRoute,
  reasoningMeta: meta,
  errorKo: body?.errorKo,
});
const secretExposureCount = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /Bearer\s+sk-/gi,
].reduce((total, pattern) => total + (serializedPublic.match(pattern)?.length ?? 0), 0);
const providerAttempted = meta?.providerAttempted ?? Boolean(meta?.provider);
const providerSucceeded = meta?.provider === "openai" && meta?.fallbackUsed !== true;
const fallbackUsed = meta?.fallbackUsed ?? body?.interpretationSource === "local";
const structuredOutputValid = Boolean(body?.conclusionKo && body?.conversationRoute);
const writeToolCount = (body?.toolAudit ?? []).filter((entry) => entry?.approved === true).length;
const billingOrQuotaError = /billing|quota|credit|credits|잔액|결제|할당량/i.test(sanitizedError);
const report = {
  buildId,
  requestedProvider: "openai",
  requestedModel: "gpt-5-mini",
  httpStatus: response.status,
  providerAttempted,
  providerSucceeded,
  fallbackUsed,
  structuredOutputValid,
  writeToolCount,
  billingOrQuotaError,
  secretExposureCount,
  selectedProvider: meta?.provider ?? null,
  selectedModel: meta?.model ?? null,
  error: sanitizedError || null,
  gemini,
};
report.passed =
  buildId === "AKGGYNTPCkYoh0VM3fvnU" &&
  response.status === 200 &&
  providerAttempted === true &&
  providerSucceeded === true &&
  fallbackUsed === false &&
  structuredOutputValid === true &&
  writeToolCount === 0 &&
  billingOrQuotaError === false &&
  secretExposureCount === 0 &&
  settingsResponse.status === 200 &&
  gemini.configured === true &&
  gemini.enabled === true;
fs.writeFileSync(
  "tmp/rextora-final-tester-completion/openai-recovery-canary.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
process.exitCode = report.passed ? 0 : 1;
