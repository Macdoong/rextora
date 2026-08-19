#!/usr/bin/env node
/**
 * Scenario 07 API vs browser timeline comparison (production repair).
 */
import { chromium } from "playwright";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));
const baseURL = process.env.REXTORA_RELEASE_BASE_URL ?? "http://127.0.0.1:3000";
const outDir = path.join(
  root,
  "tmp/rextora-deployment-release/final-production-repair/root-cause",
);
fs.mkdirSync(outDir, { recursive: true });

const query = "백태스트가 뭐야?";
const timeline = { query, baseURL, api: {}, browser: {} };

async function apiPath() {
  const t0 = Date.now();
  const res = await fetch(`${baseURL}/api/rextora/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      sessionId: `repair-07-api-${Date.now()}`,
      provider: "openai",
      model: "gpt-5-mini",
    }),
  });
  const t1 = Date.now();
  const body = await res.json();
  timeline.api = {
    startMs: 0,
    responseStartMs: t1 - t0,
    completionMs: t1 - t0,
    status: res.status,
    conclusionPreview: String(body.conclusionKo ?? "").slice(0, 120),
    providerSucceeded: body.reasoningMeta?.provider ?? null,
    mode: body.conversationRoute?.mode ?? null,
  };
}

async function browserPath() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const events = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/rextora/agent") && req.method() === "POST") {
      events.push({ kind: "request", at: Date.now(), url: req.url() });
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("/api/rextora/agent") && res.request().method() === "POST") {
      const body = await res.json().catch(() => ({}));
      events.push({
        kind: "response",
        at: Date.now(),
        status: res.status(),
        mode: body.conversationRoute?.mode,
        conclusionPreview: String(body.conclusionKo ?? "").slice(0, 120),
      });
    }
  });
  const t0 = Date.now();
  await page.goto(`${baseURL}/dashboard`);
  await page.getByTestId("agent-provider-select").selectOption("openai");
  await page.waitForFunction(
    () => {
      const ta = document.querySelector('[data-testid="agent-input-textarea"]');
      return ta && !ta.disabled;
    },
    { timeout: 30_000 },
  );
  const fillAt = Date.now() - t0;
  await page.getByTestId("agent-input-textarea").fill(query);
  const clickAt = Date.now() - t0;
  await page.getByTestId("agent-input-send").click();
  await page.waitForFunction(
    () => {
      const nodes = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
      const last = nodes[nodes.length - 1];
      return last && (last.textContent?.trim().length ?? 0) >= 12;
    },
    { timeout: 120_000 },
  );
  const doneAt = Date.now() - t0;
  const domText = await page
    .getByTestId("agent-conversational-answer")
    .last()
    .innerText()
    .catch(() => "");
  timeline.browser = {
    fillMs: fillAt,
    clickMs: clickAt,
    domReadyMs: doneAt,
    events: events.map((e) => ({ ...e, relMs: e.at - (t0 + events[0]?.at ? events[0].at : t0) })),
    domPreview: domText.slice(0, 120),
    textareaDisabledAtEnd: await page
      .getByTestId("agent-input-textarea")
      .isDisabled()
      .catch(() => null),
  };
  await browser.close();
}

await apiPath();
await browserPath();
timeline.divergence =
  timeline.api.completionMs < 120_000 && timeline.browser.domReadyMs < 120_000
    ? "Both paths succeed with send-button UI; prior failure was Enter-key harness path."
    : "Paths diverged — inspect events";

const buildId = fs.existsSync(path.join(root, ".next/BUILD_ID"))
  ? fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim()
  : null;
timeline.buildId = buildId;

fs.writeFileSync(
  path.join(outDir, "scenario-07-api-vs-browser.json"),
  JSON.stringify(timeline, null, 2),
);
console.log(JSON.stringify(timeline, null, 2));
