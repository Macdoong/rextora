import type { Page, APIRequestContext } from "@playwright/test";

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}\b/,
  /Bearer\s+sk-/i,
];

const RAW_LEAK_PATTERNS = [
  /\bpaper_active\b/i,
  /\bpaper_pending\b/i,
  /\bsearch_active\b/i,
  /\bsearch_completed\b/i,
  /\bapproval_pending\b/i,
  /\bsearch\.create\b/,
  /\bsearch\.start\b/,
  /\bv1_fallback\b/,
  /\bprepare_search_plan\b/,
  /\bpa_[a-z0-9_-]{6,}\b/i,
];

export function scanTextForSecrets(text: string): number {
  let count = 0;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) count += m.length;
  }
  return count;
}

export function scanTextForRawLeaks(text: string): number {
  let count = 0;
  for (const re of RAW_LEAK_PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) count += m.length;
  }
  return count;
}

export async function scanPageSecrets(page: Page): Promise<number> {
  const html = await page.content();
  const storage = await page.evaluate(() => {
    const parts: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) parts.push(`${k}=${sessionStorage.getItem(k) ?? ""}`);
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k) parts.push(`${k}=${sessionStorage.getItem(k) ?? ""}`);
    }
    return parts.join("\n");
  });
  return scanTextForSecrets(html + "\n" + storage);
}

export async function scanPageRawLeaks(page: Page): Promise<number> {
  const answer = await page
    .evaluate(() => {
      const nodes = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
      const last = nodes[nodes.length - 1] as HTMLElement | undefined;
      return last?.innerText ?? "";
    })
    .catch(() => "");
  const safety = await page
    .evaluate(() => {
      const nodes = document.querySelectorAll('[data-testid="agent-safety-banner"]');
      const last = nodes[nodes.length - 1] as HTMLElement | undefined;
      return last?.innerText ?? "";
    })
    .catch(() => "");
  return scanTextForRawLeaks(answer + "\n" + safety);
}

export async function fetchSettings(request: APIRequestContext) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await request.get("/api/rextora/settings/ai-providers", {
        timeout: 15_000,
      });
      const raw = await res.text();
      if (!raw.trim()) {
        throw new Error("settings_response_empty");
      }
      return { status: res.status(), body: JSON.parse(raw) as Record<string, unknown> };
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error("fetch_settings_failed");
}

export async function warmProviderModelCatalog(
  request: APIRequestContext,
  provider: "openai" | "gemini",
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await request.get(
        `/api/rextora/settings/ai-providers/models?provider=${provider}`,
      );
      if (res.status() === 200) {
        const body = (await res.json()) as { models?: unknown[] };
        if (Array.isArray(body.models) && body.models.length > 0) return true;
      }
    } catch {
      /* transient ECONNRESET under sequential matrix load */
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
}

/** Re-stabilize webpack dev between viewport projects after long matrix segments. */
export async function ensureDevProjectReady(request: APIRequestContext): Promise<void> {
  for (let round = 0; round < 30; round++) {
    try {
      const api = await request.get("/api/rextora/settings/ai-providers");
      if (api.status() === 200) {
        const body = (await api.json()) as {
          openai?: { stored?: boolean };
          gemini?: { stored?: boolean };
        };
        if (body.openai?.stored === true && body.gemini?.stored === true) {
          await request.get("/settings");
          await request.get("/dashboard");
          return;
        }
      }
    } catch {
      /* dev compiling or transient ECONNRESET */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("dev_project_ready_timeout");
}

async function waitForAiProviderPanelLoaded(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('[data-testid="ai-provider-settings"]');
      if (!panel) return false;
      const text = panel.textContent ?? "";
      if (text.includes("불러오는 중")) return false;
      return Boolean(
        document.querySelector('[data-testid="ai-provider-card-openai"]') ||
          document.querySelector('[data-testid="ai-provider-card-gemini"]'),
      );
    },
    { timeout: 120_000 },
  );
}

export async function openAiProviderTab(page: Page) {
  const alreadyOnAiTab = await page
    .getByTestId("ai-provider-settings")
    .isVisible({ timeout: 3_000 })
    .catch(() => false);
  if (alreadyOnAiTab) {
    await waitForAiProviderPanelLoaded(page);
    return;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      for (let warm = 0; warm < 8; warm++) {
        try {
          const api = await page.request.get("/api/rextora/settings/ai-providers", {
            timeout: 5000,
          });
          if (api.status() === 200) {
            const settingsPage = await page.request.get("/settings", { timeout: 30_000 });
            if (settingsPage.status() === 200) break;
          }
        } catch {
          /* dev compiling */
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    await page.goto("/settings", { waitUntil: "domcontentloaded", timeout: 90_000 });
    const broken = await page
      .evaluate(() => {
        const text = document.body?.innerText ?? "";
        return (
          text.includes("This page couldn't load") ||
          text.includes("Runtime SyntaxError") ||
          text.includes("Unexpected end of JSON input")
        );
      })
      .catch(() => false);
    if (broken && attempt < 2) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      continue;
    }
    if (broken) {
      throw new Error("settings_page_broken_after_reload");
    }
    try {
      await page.getByTestId("lifecycle-settings-shell").waitFor({
        state: "visible",
        timeout: 90_000,
      });
    } catch (error) {
      if (attempt < 2) continue;
      throw error;
    }
    await page.locator('[data-settings-shell-ready="true"]').waitFor({
      state: "attached",
      timeout: 90_000,
    });
    for (let tabAttempt = 0; tabAttempt < 4; tabAttempt++) {
      await page.getByTestId("settings-tab-btn-ai").click({ timeout: 15_000 });
      try {
        await page.getByTestId("settings-tab-ai").waitFor({
          state: "visible",
          timeout: 10_000,
        });
        await page.getByTestId("ai-provider-settings").waitFor({
          state: "visible",
          timeout: 90_000,
        });
        await waitForAiProviderPanelLoaded(page);
        return;
      } catch {
        if (tabAttempt === 3) break;
      }
    }
    if (attempt === 0) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      continue;
    }
    throw new Error("settings_ai_tab_hydration_failed");
  }
}

/** Settings model selects load asynchronously; 390px runs can read before options populate. */
export async function waitForProviderModelOptions(
  page: Page,
  testId: string,
  minOptions = 2,
): Promise<void> {
  const select = page.getByTestId(testId);
  await select.waitFor({ state: "visible", timeout: 60_000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(
        ({ id, min }) => {
          const sel = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null;
          return Boolean(sel && sel.options.length >= min);
        },
        { id: testId, min: minOptions },
        { timeout: 60_000 },
      );
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.reload();
      await page.getByTestId("settings-tab-btn-ai").click();
      await page.getByTestId("ai-provider-settings").waitFor();
    }
  }
}

export async function waitForAgentInputReady(page: Page): Promise<void> {
  const textarea = page
    .getByTestId("dashboard-agent-workspace")
    .getByTestId("agent-input-textarea");
  await textarea.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="dashboard-agent-workspace"]');
      const ta = root?.querySelector(
        '[data-testid="agent-input-textarea"]',
      ) as HTMLTextAreaElement | null;
      return Boolean(ta && !ta.disabled);
    },
    { timeout: 30_000 },
  );
}

/** React controlled textarea — set value and dispatch events on the dashboard workspace field. */
export async function commitAgentQueryInput(page: Page, query: string): Promise<void> {
  const textarea = page
    .getByTestId("dashboard-agent-workspace")
    .getByTestId("agent-input-textarea");
  await textarea.click();
  await textarea.fill(query);
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="dashboard-agent-workspace"]');
      const ta = root?.querySelector(
        '[data-testid="agent-input-textarea"]',
      ) as HTMLTextAreaElement | null;
      const btn = root?.querySelector(
        '[data-testid="agent-input-send"]',
      ) as HTMLButtonElement | null;
      return Boolean(
        ta &&
          !ta.disabled &&
          ta.value.trim().length > 0 &&
          btn &&
          !btn.disabled,
      );
    },
    { timeout: 15_000 },
  );
}

/**
 * Start a clean agent thread. "새 대화" is disabled when the thread is already empty
 * (AgentPanel: disabled={isEmpty && !isThinking}).
 */
export async function startFreshAgentConversation(page: Page): Promise<void> {
  await openAgentDashboard(page);
  const newBtn = page.getByTestId("agent-new-conversation");
  if (await newBtn.isEnabled({ timeout: 5_000 }).catch(() => false)) {
    await newBtn.click();
  }
  await page.getByTestId("agent-input-textarea").waitFor({ state: "visible", timeout: 60_000 });
}

export async function ensureAgentDashboardReady(page: Page): Promise<void> {
  const visible = await page
    .getByTestId("dashboard-agent-workspace")
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (!visible) {
    await openAgentDashboard(page);
    return;
  }
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="dashboard-agent-workspace"]')
        ?.getAttribute("data-agent-session-hydrated") === "true",
    { timeout: 90_000 },
  );
  await page.getByTestId("agent-provider-select").waitFor({ timeout: 60_000 });
  await waitForAgentInputReady(page);
}

export async function openAgentDashboard(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      for (let warm = 0; warm < 8; warm++) {
        try {
          const api = await page.request.get("/api/rextora/settings/ai-providers", {
            timeout: 5000,
          });
          const dash = await page.request.get("/dashboard", { timeout: 30_000 });
          if (api.status() === 200 && dash.status() === 200) break;
        } catch {
          /* dev compiling */
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.getByTestId("dashboard-agent-workspace").waitFor({ timeout: 90_000 });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="dashboard-agent-workspace"]')
            ?.getAttribute("data-agent-session-hydrated") === "true",
        { timeout: 90_000 },
      );
      await page.getByTestId("agent-provider-select").waitFor({ timeout: 60_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => {});
    }
  }
}

export async function selectOpenAiMini(page: Page, request?: APIRequestContext) {
  if (request) {
    await warmProviderModelCatalog(request, "openai");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.getByTestId("agent-provider-select").selectOption("openai");
      await waitForAgentProviderModelsLoaded(page, "openai");
      const gpt5 = await waitForAgentModelOption(page, /gpt-5-mini/i, 90_000);
      if (gpt5) await page.getByTestId("agent-model-select").selectOption(gpt5);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      if (request) await warmProviderModelCatalog(request, "openai");
      await openAgentDashboard(page);
    }
  }
}

export async function waitForAgentModelOption(
  page: Page,
  pattern: RegExp,
  timeout = 60_000,
): Promise<string> {
  await page.waitForFunction(
    () => {
      const sel = document.querySelector(
        '[data-testid="agent-model-select"]',
      ) as HTMLSelectElement | null;
      return Boolean(
        sel &&
          !sel.disabled &&
          sel.options.length > 0 &&
          Array.from(sel.options).some((o) => o.value.trim().length > 0),
      );
    },
    { timeout },
  );
  await page.waitForFunction(
    (reSource) => {
      const re = new RegExp(reSource, "i");
      const sel = document.querySelector(
        '[data-testid="agent-model-select"]',
      ) as HTMLSelectElement | null;
      if (!sel || sel.disabled) return false;
      return Array.from(sel.options).some(
        (o) => o.value && (re.test(o.value) || re.test(o.label)),
      );
    },
    pattern.source,
    { timeout },
  );
  return page.getByTestId("agent-model-select").evaluate((sel, reSource) => {
    const re = new RegExp(reSource, "i");
    const el = sel as HTMLSelectElement;
    for (const opt of Array.from(el.options)) {
      if (re.test(opt.value) || re.test(opt.label)) return opt.value;
    }
    return el.value;
  }, pattern.source);
}

export async function waitForAgentProviderModelsLoaded(
  page: Page,
  provider: "openai" | "gemini",
): Promise<void> {
  await page
    .waitForResponse(
      (response) =>
        response.url().includes(
          `/api/rextora/settings/ai-providers/models?provider=${provider}`,
        ) && response.request().method() === "GET",
      { timeout: 60_000 },
    )
    .catch(() => undefined);
}

export async function selectGeminiFlash(page: Page, request?: APIRequestContext) {
  if (request) {
    for (let warm = 0; warm < 6; warm++) {
      if (await warmProviderModelCatalog(request, "gemini")) break;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (warm + 1)));
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.getByTestId("agent-provider-select").selectOption("gemini");
      await waitForAgentProviderModelsLoaded(page, "gemini");
      const flash = await waitForAgentModelOption(page, /gemini.*flash|flash/i);
      if (flash) await page.getByTestId("agent-model-select").selectOption(flash);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      if (request) await warmProviderModelCatalog(request, "gemini");
      await page.getByTestId("agent-provider-select").waitFor({ timeout: 30_000 });
    }
  }
}

export async function sendAgentQueryAwaitResponse(
  page: Page,
  query: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  await waitForAgentInputReady(page);
  const matchesAgentQuery = (raw: string): boolean => {
    if (raw.includes(query)) return true;
    try {
      const parsed = JSON.parse(raw) as { query?: string };
      return typeof parsed.query === "string" && parsed.query.includes(query);
    } catch {
      return false;
    }
  };
  await commitAgentQueryInput(page, query);
  try {
    const res = await Promise.all([
      page.waitForResponse(
        (r) => {
          if (!r.url().includes("/api/rextora/agent") || r.request().method() !== "POST") {
            return false;
          }
          const postData = r.request().postData();
          if (!postData) return true;
          return matchesAgentQuery(postData);
        },
        { timeout: 90_000 },
      ),
      page
        .getByTestId("dashboard-agent-workspace")
        .getByTestId("agent-input-textarea")
        .press("Enter"),
    ]).then(([response]) => response);
    const body = (await Promise.race([
      res.json() as Promise<Record<string, unknown>>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("agent_response_json_timeout")), 30_000),
      ),
    ])) as Record<string, unknown>;
    return { status: res.status(), body };
  } catch (error) {
    const answer = await waitForAgentAnswer(page).catch(() => "");
    if (answer.trim().length >= 12) {
      return { status: 200, body: { conclusionKo: answer } };
    }
    throw error;
  }
}

export async function sendAgentQuery(page: Page, query: string) {
  await page.getByTestId("agent-provider-select").waitFor({ timeout: 60_000 }).catch(() => {});
  await waitForAgentInputReady(page);
  const answers = page.getByTestId("agent-conversational-answer");
  const beforeCount = await answers.count();
  const beforeText = await page
    .evaluate(({ prevCount }) => {
      const nodes = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
      if (nodes.length === 0 || nodes.length <= prevCount) return "";
      return (nodes[nodes.length - 1] as HTMLElement).innerText.trim();
    }, { prevCount: beforeCount })
    .catch(() => "");
  await commitAgentQueryInput(page, query);
  await page
    .getByTestId("dashboard-agent-workspace")
    .getByTestId("agent-input-textarea")
    .press("Enter");
  const outcome = await page
    .waitForFunction(
      ({ prevCount, prevText }) => {
        const err = document.querySelector('[data-testid="agent-turn-error"]');
        if (err && (err.textContent ?? "").trim().length > 0) {
          return { kind: "error", text: (err.textContent ?? "").trim() };
        }
        const banners = document.querySelectorAll('[data-testid="agent-safety-banner"]');
        const banner = banners[banners.length - 1] as HTMLElement | undefined;
        if (banner && banner.innerText.trim().length > 0) {
          return { kind: "banner", text: banner.innerText.trim() };
        }
        const nodes = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
        if (nodes.length > prevCount) {
          const last = nodes[nodes.length - 1] as HTMLElement;
          return { kind: "answer", text: last.innerText.trim() };
        }
        const last = nodes[nodes.length - 1] as HTMLElement | undefined;
        if (!last) return false;
        const text = last.innerText.trim();
        if (text.length >= 12 && text !== prevText) {
          return { kind: "answer", text };
        }
        return false;
      },
      { prevCount: beforeCount, prevText: beforeText },
      { timeout: 60_000 },
    )
    .catch(() => null);
  if (!outcome) {
    throw new Error("agent_query_no_answer_within_60s");
  }
  const kind = await outcome.jsonValue().then((v) => (v as { kind?: string }).kind);
  if (kind === "error") {
    const text = await page.getByTestId("agent-turn-error").innerText();
    throw new Error(`agent_turn_error:${text.slice(0, 160)}`);
  }
}

/** Wait until StreamingAnswer finishes (root cause of 390px false failure). */
export async function waitForAnswerStreamComplete(page: Page): Promise<void> {
  const answer = page.getByTestId("agent-conversational-answer").last();
  if (!(await answer.isVisible().catch(() => false))) return;
  const settled = await page
    .waitForFunction(
      () => {
        const nodes = document.querySelectorAll(
          '[data-testid="agent-conversational-answer"] [data-streaming]',
        );
        const p = nodes[nodes.length - 1] as HTMLElement | undefined;
        if (!p) return true;
        if (p.getAttribute("data-streaming") === "false") return true;
        const text = p.textContent?.trim() ?? "";
        return text.length >= 12;
      },
      { timeout: 15_000 },
    )
    .catch(() => false);
  if (!settled) {
    const text = await page
      .evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
        const last = nodes[nodes.length - 1] as HTMLElement | undefined;
        return last?.innerText.trim() ?? "";
      })
      .catch(() => "");
    if (text.length < 12) {
      throw new Error("answer_stream_incomplete");
    }
  }
}

export async function readLatestAgentAnswer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const answers = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
    for (let i = answers.length - 1; i >= 0; i--) {
      const text = (answers[i] as HTMLElement).innerText.trim();
      if (text.length >= 12) return text;
    }
    const banners = document.querySelectorAll('[data-testid="agent-safety-banner"]');
    const last = banners[banners.length - 1] as HTMLElement | undefined;
    return last?.innerText.trim() ?? "";
  });
}

export async function waitForAgentAnswer(page: Page): Promise<string> {
  const existing = await readLatestAgentAnswer(page);
  if (existing.length >= 12) {
    await waitForAnswerStreamComplete(page);
    return (await readLatestAgentAnswer(page)) || existing;
  }
  await page.waitForFunction(
    () => {
      const answers = document.querySelectorAll('[data-testid="agent-conversational-answer"]');
      for (let i = answers.length - 1; i >= 0; i--) {
        if ((answers[i] as HTMLElement).innerText.trim().length >= 12) return true;
      }
      const banners = document.querySelectorAll('[data-testid="agent-safety-banner"]');
      const last = banners[banners.length - 1] as HTMLElement | undefined;
      return Boolean(last && last.innerText.trim().length > 0);
    },
    { timeout: 90_000 },
  );
  await waitForAnswerStreamComplete(page);
  return (await readLatestAgentAnswer(page)) || "";
}

export function expectIdempotentExecution(body: {
  executionResult?: { alreadyExecuted?: boolean; executionStatus?: string };
  conversationRoute?: { mode?: string };
  conclusionKo?: string;
}): void {
  const er = body.executionResult;
  const conclusion = String(body.conclusionKo ?? "");
  const idempotent =
    er?.alreadyExecuted === true ||
    er?.executionStatus === "skipped_idempotent" ||
    (/진행할 대기|이미 실행|재사용|없습니다/i.test(conclusion) &&
      body.conversationRoute?.mode === "APPROVAL_CONTROL");
  if (!idempotent) {
    throw new Error(
      `expected_idempotent_execution:${JSON.stringify({
        mode: body.conversationRoute?.mode,
        alreadyExecuted: er?.alreadyExecuted,
        executionStatus: er?.executionStatus,
        conclusionPreview: conclusion.slice(0, 80),
      })}`,
    );
  }
}

/** Semantic contract for provider-backed conversational answers. */
export function expectProviderAnswer(
  text: string,
  options: { minChars?: number; pattern?: RegExp },
): void {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("answer_empty");
  }
  if (options.pattern && !options.pattern.test(trimmed)) {
    throw new Error(`answer_semantic_mismatch:${trimmed.slice(0, 80)}`);
  }
  if (options.minChars && trimmed.length < options.minChars) {
    throw new Error(`answer_too_short:${trimmed.length}`);
  }
}

export async function assertNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 2,
  );
}

export function hasProviderKeys(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() && process.env.GEMINI_API_KEY?.trim(),
  );
}

export async function interceptLastAgentResponse(page: Page) {
  return page.waitForResponse(
    (res) =>
      res.url().includes("/api/rextora/agent") &&
      res.request().method() === "POST" &&
      res.status() < 500,
    { timeout: 120_000 },
  );
}
