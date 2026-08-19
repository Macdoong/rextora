import { test, expect } from "@playwright/test";
import {
  hasProviderKeys,
  openAgentDashboard,
  scanPageSecrets,
  selectOpenAiMini,
  sendAgentQuery,
  waitForAgentAnswer,
  waitForAnswerStreamComplete,
} from "./helpers";

/**
 * Focused regression for 390px model-switch failure.
 * Root cause: StreamingAnswer still animating when innerText was read.
 */
test.describe("390px model-switch streaming regression", () => {
  test.skip(!hasProviderKeys(), "Provider keys required");

  test("waits for streaming completion before asserting typo answer", async ({ page }) => {
    await openAgentDashboard(page);
    await selectOpenAiMini(page);
    await sendAgentQuery(page, "백태스트가 뭐야?");

    const answer = page.getByTestId("agent-conversational-answer").last();
    await answer.waitFor({ timeout: 120_000 });
    await waitForAnswerStreamComplete(page);

    const a = await waitForAgentAnswer(page);
    expect(a).toMatch(/백테스트|과거|검증/i);
    expect(a.trim().length).toBeGreaterThan(0);
    expect(await scanPageSecrets(page)).toBe(0);
  });
});
