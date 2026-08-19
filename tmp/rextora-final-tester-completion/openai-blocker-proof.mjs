import fs from "node:fs";

const response = await fetch("http://127.0.0.1:3000/api/rextora/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "백테스트가 무엇인지 한 문장으로 설명해 주세요. 어떤 작업도 실행하지 마세요.",
    turnId: `openai-blocker-${Date.now()}`,
    history: [],
    providerSelection: { provider: "openai", model: "gpt-5-mini" },
    entityMemory: {},
    pendingApprovals: [],
    context: { route: "/dashboard", symbol: "BTCUSDT", timeframe: "15m" },
  }),
});
const body = await response.json().catch(() => ({}));
const meta = body.reasoningMeta ?? body.providerMeta ?? {};
const errorText = `${meta.errorKo ?? ""} ${body.errorKo ?? ""}`;
const report = {
  httpStatus: response.status,
  requestedProvider: "openai",
  requestedModel: "gpt-5-mini",
  providerAttempted: meta.providerAttempted ?? true,
  selectedProvider: meta.provider ?? null,
  selectedModel: meta.model ?? null,
  fallbackUsed: meta.fallbackUsed ?? body.interpretationSource === "local",
  structuredOutputValid: Boolean(body.conclusionKo && body.conversationRoute),
  writeToolCount: (body.toolAudit ?? []).filter((entry) => entry?.approved === true).length,
  billingOrQuotaFailure: /credit|billing|quota|잔액|결제/i.test(errorText),
  errorCategory: meta.errorCategory ?? null,
};
report.providerSucceeded = report.selectedProvider === "openai" && report.fallbackUsed !== true;
fs.writeFileSync("tmp/rextora-final-tester-completion/openai-blocker-proof.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
