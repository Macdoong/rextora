import { test, expect } from "@playwright/test";
import {
  hasProviderKeys,
  scanPageSecrets,
  selectGeminiFlash,
  selectOpenAiMini,
  sendAgentQuery,
  sendAgentQueryAwaitResponse,
  startFreshAgentConversation,
  waitForAgentAnswer,
  warmProviderModelCatalog,
} from "./helpers";

test.describe("Agent model switching browser matrix", () => {
  test.skip(!hasProviderKeys(), "Provider keys required");

  test("OpenAI → Gemini switch with persistence", async ({ page, request }) => {
    await warmProviderModelCatalog(request, "openai");
    await warmProviderModelCatalog(request, "gemini");
    await startFreshAgentConversation(page);
    await selectOpenAiMini(page, request);

    const { body: b1 } = await sendAgentQueryAwaitResponse(page, "백태스트가 뭐야?");
    expect(String(b1.conclusionKo ?? "")).toMatch(/백테스트|과거|검증/i);
    expect(await scanPageSecrets(page)).toBe(0);

    await sendAgentQuery(page, "지금 난 뭘 해야 하지?");
    await waitForAgentAnswer(page);

    await selectGeminiFlash(page, request);
    const model = await page.getByTestId("agent-model-select").inputValue();
    expect(model).toMatch(/gemini.*flash/i);

    const { body: b3 } = await sendAgentQueryAwaitResponse(
      page,
      "그 이유를 좀 더 쉽게 설명해줘.",
    );
    expect(String(b3.conclusionKo ?? "").trim().length).toBeGreaterThan(0);

    await page.reload();
    await page.getByTestId("dashboard-agent-workspace").waitFor({ timeout: 60_000 });
    await page.waitForFunction(
      () =>
        (
          document.querySelector(
            '[data-testid="agent-provider-select"]',
          ) as HTMLSelectElement | null
        )?.value === "gemini",
      { timeout: 60_000 },
    );

    const newBtn = page.getByTestId("agent-new-conversation");
    if (await newBtn.isEnabled({ timeout: 5_000 }).catch(() => false)) {
      await newBtn.click();
    }
    await sendAgentQueryAwaitResponse(page, "너는 뭘 할 수 있어?");
    expect(await scanPageSecrets(page)).toBe(0);
  });
});
