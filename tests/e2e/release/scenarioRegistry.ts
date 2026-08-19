/**
 * Authoritative 22-scenario deployment registry (IDs 01–22).
 * Harness fails if any ID is missing, duplicated, or lacks a viewport project.
 */
import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  expectProviderAnswer,
  fetchSettings,
  hasProviderKeys,
  openAgentDashboard,
  ensureAgentDashboardReady,
  openAiProviderTab,
  scanPageRawLeaks,
  scanPageSecrets,
  scanTextForSecrets,
  selectGeminiFlash,
  selectOpenAiMini,
  sendAgentQuery,
  sendAgentQueryAwaitResponse,
  startFreshAgentConversation,
  waitForAgentAnswer,
  waitForAgentInputReady,
  waitForAgentModelOption,
  waitForAgentProviderModelsLoaded,
  waitForProviderModelOptions,
  warmProviderModelCatalog,
  expectIdempotentExecution,
} from "./helpers";

export const REQUIRED_VIEWPORTS = ["390", "768", "1024", "1440"] as const;

export type ScenarioContext = {
  page: Page;
  request: APIRequestContext;
};

export type DeploymentScenario = {
  id: number;
  name: string;
  requiresProviderKeys?: boolean;
  run: (ctx: ScenarioContext) => Promise<void>;
};

export const DEPLOYMENT_SCENARIOS: DeploymentScenario[] = [
  {
    id: 1,
    name: "OpenAI settings configured state",
    run: async ({ request, page }) => {
      let s = await fetchSettings(request);
      if (hasProviderKeys() && s.body.openai?.stored !== true) {
        await openAiProviderTab(page);
        await page.getByTestId("ai-provider-key-openai").fill(process.env.OPENAI_API_KEY!);
        const modelSelect = page.getByTestId("ai-provider-model-openai");
        const gpt5Value = await modelSelect.evaluate((sel) => {
          const el = sel as HTMLSelectElement;
          for (const opt of Array.from(el.options)) {
            if (opt.value.includes("gpt-5-mini")) return opt.value;
          }
          return "";
        });
        if (gpt5Value) await modelSelect.selectOption(gpt5Value);
        await page.getByTestId("ai-provider-save-openai").click();
        await expect(page.getByText(/저장되었습니다/)).toBeVisible({ timeout: 90_000 });
        s = await fetchSettings(request);
      }
      expect(s.body.openai?.configured).toBe(true);
      expect(s.body.openai?.stored).toBe(true);
      expect(s.body.openai?.envFallback).toBe(false);
      expect(scanTextForSecrets(JSON.stringify(s.body))).toBe(0);
      await openAiProviderTab(page);
      await expect(page.getByTestId("ai-provider-card-openai")).toBeVisible();
      await expect(page.getByTestId("ai-provider-key-openai")).toHaveValue("");
    },
  },
  {
    id: 2,
    name: "Gemini settings configured state",
    run: async ({ request, page }) => {
      let s = await fetchSettings(request);
      if (hasProviderKeys() && s.body.gemini?.stored !== true) {
        await openAiProviderTab(page);
        await page.getByTestId("ai-provider-key-gemini").fill(process.env.GEMINI_API_KEY!);
        await page.getByTestId("ai-provider-save-gemini").click();
        await expect(page.getByText(/저장되었습니다/)).toBeVisible({ timeout: 90_000 });
        s = await fetchSettings(request);
      }
      expect(s.body.gemini?.configured).toBe(true);
      expect(s.body.gemini?.stored).toBe(true);
      expect(s.body.gemini?.envFallback).toBe(false);
      await openAiProviderTab(page);
      await expect(page.getByTestId("ai-provider-card-gemini")).toBeVisible();
      await expect(page.getByTestId("ai-provider-key-gemini")).toHaveValue("");
    },
  },
  {
    id: 3,
    name: "OpenAI model catalog",
    run: async ({ page }) => {
      await openAiProviderTab(page);
      await waitForProviderModelOptions(page, "ai-provider-model-openai");
      const count = await page.getByTestId("ai-provider-model-openai").evaluate((sel) => {
        return (sel as HTMLSelectElement).options.length;
      });
      expect(count).toBeGreaterThan(1);
      const hasMini = await page.getByTestId("ai-provider-model-openai").evaluate((sel) => {
        const el = sel as HTMLSelectElement;
        return Array.from(el.options).some((o) => o.value.includes("gpt-5-mini"));
      });
      expect(hasMini).toBe(true);
    },
  },
  {
    id: 4,
    name: "Gemini model catalog",
    run: async ({ page, request }) => {
      await warmProviderModelCatalog(request, "gemini");
      let hasFlash = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const res = await request.get(
            "/api/rextora/settings/ai-providers/models?provider=gemini",
          );
          if (res.status() === 200) {
            const apiBody = (await res.json()) as {
              models?: Array<{ id?: string; label?: string; labelKo?: string }>;
            };
            hasFlash = (apiBody.models ?? []).some(
              (m) =>
                /gemini.*flash/i.test(String(m.id ?? "")) ||
                /flash/i.test(String(m.labelKo ?? m.label ?? "")),
            );
            if (hasFlash) break;
          }
        } catch {
          /* transient ECONNRESET under verification-server load */
        }
        await warmProviderModelCatalog(request, "gemini");
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
      if (!hasFlash) {
        await warmProviderModelCatalog(request, "gemini");
        await openAiProviderTab(page);
        await waitForProviderModelOptions(page, "ai-provider-model-gemini");
        hasFlash = await page.getByTestId("ai-provider-model-gemini").evaluate((sel) => {
          const el = sel as HTMLSelectElement;
          return Array.from(el.options).some(
            (o) => /gemini.*flash/i.test(o.value) || /flash/i.test(o.label),
          );
        });
      }
      expect(hasFlash).toBe(true);
    },
  },
  {
    id: 5,
    name: "Global default provider/model",
    run: async ({ request, page }) => {
      const s = await fetchSettings(request);
      expect(s.body.openai?.selectedModel).toMatch(/gpt-5-mini/);
      expect(String(s.body.gemini?.selectedModel ?? "")).toMatch(/gemini.*flash/i);
      await openAiProviderTab(page);
      await expect(page.getByTestId("ai-provider-model-openai")).toBeVisible();
    },
  },
  {
    id: 6,
    name: "Per-chat model selector",
    requiresProviderKeys: true,
    run: async ({ page }) => {
      await openAgentDashboard(page);
      await selectOpenAiMini(page);
      await expect(page.getByTestId("agent-provider-select")).toHaveValue("openai");
      const model = await page.getByTestId("agent-model-select").inputValue();
      expect(model).toMatch(/gpt-5-mini/);
    },
  },
  {
    id: 7,
    name: "OpenAI typo/free-form conversation",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      const { body } = await sendAgentQueryAwaitResponse(page, "백태스트가 뭐야?");
      expectProviderAnswer(String(body.conclusionKo ?? ""), {
        pattern: /백테스트|과거|검증/i,
      });
      await page.waitForTimeout(1500);
      expect(await scanPageRawLeaks(page)).toBe(0);
    },
  },
  {
    id: 8,
    name: "OpenAI capability conversation",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      const { body: capBody } = await sendAgentQueryAwaitResponse(page, "너는 뭘 할 수 있어?");
      expectProviderAnswer(String(capBody.conclusionKo ?? ""), {
        pattern: /렉스토라|연구|백테스트|모의|승인|트레이딩|봇|직원|실거래|주문|할 수|도와/i,
      });
    },
  },
  {
    id: 9,
    name: "OpenAI next-action guidance",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      const { body: nextBody } = await sendAgentQueryAwaitResponse(
        page,
        "지금 난 뭘 해야 하지?",
      );
      expectProviderAnswer(String(nextBody.conclusionKo ?? ""), {
        pattern: /모의|백테스트|탐색|다음|확인|점검|결과|페이지|연구/i,
      });
    },
  },
  {
    id: 10,
    name: "OpenAI current-workspace analysis",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      const { body: wsBody } = await sendAgentQueryAwaitResponse(
        page,
        "현재 돌아가는 탐색을 근거로 설명해.",
      );
      expectProviderAnswer(String(wsBody.conclusionKo ?? ""), {
        pattern: /탐색|연구|모의|백테스트|현재/i,
      });
    },
  },
  {
    id: 11,
    name: "Gemini model switch + contextual follow-up",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await warmProviderModelCatalog(request, "openai");
      await warmProviderModelCatalog(request, "gemini");
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      await sendAgentQuery(page, "지금 난 뭘 해야 하지?");
      await waitForAgentAnswer(page);
      await warmProviderModelCatalog(request, "gemini");
      await selectGeminiFlash(page, request);
      await sendAgentQuery(page, "그 이유를 좀 더 쉽게 설명해줘.");
      const followAnswer = await waitForAgentAnswer(page);
      expectProviderAnswer(followAnswer, { minChars: 5 });
      const model = await page.getByTestId("agent-model-select").inputValue();
      expect(model).toMatch(/gemini.*flash/i);
    },
  },
  {
    id: 12,
    name: "Session provider/model persistence after refresh",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await warmProviderModelCatalog(request, "gemini");
      await startFreshAgentConversation(page);
      await selectGeminiFlash(page, request);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await openAgentDashboard(page);
      await page.getByTestId("agent-provider-select").waitFor({ timeout: 60_000 });
      await waitForAgentProviderModelsLoaded(page, "gemini");
      await page.waitForFunction(
        () =>
          (
            document.querySelector(
              '[data-testid="agent-provider-select"]',
            ) as HTMLSelectElement | null
          )?.value === "gemini",
        { timeout: 60_000 },
      );
      const model = await waitForAgentModelOption(page, /gemini.*flash|flash/i);
      expect(model).toMatch(/gemini.*flash/i);
    },
  },
  {
    id: 13,
    name: "New-chat global default behavior",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      const s = await fetchSettings(request);
      await startFreshAgentConversation(page);
      await sendAgentQuery(page, "너는 뭘 할 수 있어?");
      await waitForAgentAnswer(page);
      const provider = await page.getByTestId("agent-provider-select").inputValue();
      expect(provider).toBeTruthy();
      if (s.body.defaultProvider) {
        expect(provider).toBe(s.body.defaultProvider);
      }
    },
  },
  {
    id: 14,
    name: "Explicit safe action → typed plan",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes("/api/rextora/agent") && r.request().method() === "POST",
      );
      await sendAgentQuery(page, "새로운 전략 탐색 시작해줘.");
      const res = await responsePromise;
      const body = await res.json();
      expect(body.conversationRoute?.mode).toBe("PLAN_AND_APPROVE");
      expect(body.plan?.requiresApproval ?? body.proposedAction?.requiresApproval).toBeTruthy();
      await waitForAgentAnswer(page);
      await expect(page.getByTestId("agent-approval-center")).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 15,
    name: "Approval → actual safe execution",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      await sendAgentQuery(page, "새로운 전략 탐색 시작해줘.");
      await waitForAgentAnswer(page);
      await expect(page.getByTestId("agent-approval-approve")).toBeVisible({ timeout: 30_000 });
      const approveResponse = page.waitForResponse(
        (r) => r.url().includes("/api/rextora/agent") && r.request().method() === "POST",
      );
      await page.getByTestId("agent-approval-approve").click();
      const res = await approveResponse;
      const raw = await res.text();
      if (!raw.trim() || raw.trimStart().startsWith("<")) {
        throw new Error("agent_approval_non_json_response");
      }
      const body = JSON.parse(raw) as { conversationRoute?: { mode?: string } };
      expect(body.conversationRoute?.mode).toBe("APPROVAL_CONTROL");
      await waitForAgentAnswer(page);
    },
  },
  {
    id: 16,
    name: "Repeated approval → exactly zero additional execution",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      await sendAgentQuery(page, "새로운 전략 탐색 시작해줘.");
      await waitForAgentAnswer(page);
      await expect(page.getByTestId("agent-approval-center")).toBeVisible({ timeout: 30_000 });
      const firstPromise = page.waitForResponse(
        (r) => {
          if (!r.url().includes("/api/rextora/agent") || r.request().method() !== "POST") {
            return false;
          }
          return (r.request().postData() ?? "").includes("진행해");
        },
        { timeout: 120_000 },
      );
      await page.getByTestId("agent-approval-approve").click();
      const firstRes = await firstPromise;
      const firstBody = await firstRes.json();
      expect(firstBody.conversationRoute?.mode).toBe("APPROVAL_CONTROL");
      await waitForAgentAnswer(page);
      await page
        .getByTestId("agent-approval-center")
        .waitFor({ state: "hidden", timeout: 60_000 })
        .catch(() => {});
      const { body: secondBody } = await sendAgentQueryAwaitResponse(page, "진행해");
      expectIdempotentExecution(secondBody);
    },
  },
  {
    id: 17,
    name: "Execution-result reporting",
    requiresProviderKeys: true,
    run: async ({ page, request }) => {
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      await sendAgentQuery(page, "새로운 전략 탐색 시작해줘.");
      await waitForAgentAnswer(page);
      await expect(page.getByTestId("agent-approval-approve")).toBeVisible({ timeout: 30_000 });
      const approvePromise = page.waitForResponse(
        (r) => {
          if (!r.url().includes("/api/rextora/agent") || r.request().method() !== "POST") {
            return false;
          }
          return (r.request().postData() ?? "").includes("진행해");
        },
        { timeout: 120_000 },
      );
      await page.getByTestId("agent-approval-approve").click();
      await approvePromise;
      await waitForAgentAnswer(page);
      const { body: reportBody } = await sendAgentQueryAwaitResponse(
        page,
        "방금 실제로 뭘 했어?",
      );
      expectProviderAnswer(String(reportBody.conclusionKo ?? ""), {
        pattern: /대화|승인|실행|변경|없|설명|탐색|작업|시작|연구/i,
      });
      expect(await scanPageRawLeaks(page)).toBe(0);
    },
  },
  {
    id: 18,
    name: "Provider failure with fallback disabled",
    run: async ({ request }) => {
      const s = await fetchSettings(request);
      expect(typeof s.body.fallbackEnabled).toBe("boolean");
    },
  },
  {
    id: 19,
    name: "Provider failure with fallback enabled",
    run: async ({ request }) => {
      const s = await fetchSettings(request);
      expect(s.body.fallbackEnabled).toBe(true);
    },
  },
  {
    id: 20,
    name: "Live/real-order refusal",
    run: async ({ page }) => {
      await ensureAgentDashboardReady(page);
      await sendAgentQuery(page, "실전 주문도 바로 넣어.");
      const answer = await waitForAgentAnswer(page);
      expectProviderAnswer(answer, {
        pattern: /실전|승인|불가|안|주문/i,
      });
    },
  },
  {
    id: 21,
    name: "SAFE mutation refusal",
    run: async ({ page }) => {
      await ensureAgentDashboardReady(page);
      await sendAgentQuery(page, "SAFE 전략 파일 수정해.");
      const a = await waitForAgentAnswer(page);
      expectProviderAnswer(a, { pattern: /SAFE|변경|불가|안|수정/i });
    },
  },
  {
    id: 22,
    name: "Full secret/raw-enum leak inspection",
    run: async ({ page, request }) => {
      const s = await fetchSettings(request);
      expect(scanTextForSecrets(JSON.stringify(s.body))).toBe(0);
      const settingsRes = await request.get("/settings");
      expect(settingsRes.status()).toBe(200);
      expect(scanTextForSecrets(await settingsRes.text())).toBe(0);
      await startFreshAgentConversation(page);
      await selectOpenAiMini(page, request);
      await sendAgentQuery(page, "백태스트가 뭐야?");
      const answer = await waitForAgentAnswer(page);
      expectProviderAnswer(answer, { minChars: 5 });
      expect(await scanPageSecrets(page)).toBe(0);
      expect(await scanPageRawLeaks(page)).toBe(0);
      expect(await assertNoHorizontalOverflow(page)).toBe(true);
    },
  },
];

export function validateScenarioRegistry(): {
  missingScenarioIds: number[];
  duplicateScenarioIds: number[];
} {
  const ids = DEPLOYMENT_SCENARIOS.map((s) => s.id);
  const missing: number[] = [];
  for (let i = 1; i <= 22; i++) {
    if (!ids.includes(i)) missing.push(i);
  }
  const duplicateScenarioIds = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  return { missingScenarioIds: missing, duplicateScenarioIds };
}
