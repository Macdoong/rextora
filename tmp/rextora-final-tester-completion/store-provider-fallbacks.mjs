import fs from "node:fs";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";

const env = loadProjectEnv(process.cwd());
const base = "http://127.0.0.1:3100";
const cases = [
  { provider: "openai", apiKey: env.OPENAI_API_KEY, model: "gpt-5-mini" },
  { provider: "gemini", apiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY, model: "gemini-2.5-flash" },
];
const results = [];

for (const item of cases) {
  if (!item.apiKey) {
    results.push({ provider: item.provider, submitted: false, ok: false, reason: "missing_environment_credential" });
    continue;
  }
  const response = await fetch(`${base}/api/rextora/settings/ai-providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: item.provider,
      apiKey: item.apiKey,
      model: item.model,
      saveOnSuccess: true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  results.push({
    provider: item.provider,
    submitted: true,
    httpStatus: response.status,
    ok: body.ok === true,
    saved: body.saved === true,
    structuredOutputValid: body.structuredOutputValid === true,
    writeToolAuditCount: body.writeToolAuditCount ?? null,
  });
}

const verificationResponse = await fetch(`${base}/api/rextora/settings/ai-providers`);
const verification = await verificationResponse.json();
const report = {
  results,
  verification: Object.fromEntries(["openai", "gemini"].map((provider) => [provider, {
    configured: verification?.[provider]?.configured === true,
    stored: verification?.[provider]?.stored === true,
    enabled: verification?.[provider]?.enabled === true,
    envFallback: verification?.[provider]?.envFallback === true,
  }])),
};
report.passed = results.every((entry) => entry.ok && entry.saved && entry.structuredOutputValid && entry.writeToolAuditCount === 0) &&
  Object.values(report.verification).every((entry) => entry.configured && entry.stored && entry.enabled && !entry.envFallback);
fs.writeFileSync("tmp/rextora-final-tester-completion/provider-storage-verification.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, results: results.map(({ provider, ok, saved }) => ({ provider, ok, saved })), verification: report.verification }));
process.exitCode = report.passed ? 0 : 1;
