import { test, expect } from "@playwright/test";
import {
  fetchSettings,
  hasProviderKeys,
  openAiProviderTab,
  scanPageSecrets,
  scanTextForSecrets,
} from "./helpers";

test.describe("Settings AI provider browser matrix", () => {
  test("configured status, DOM/network secret hygiene, and persistence", async ({
    page,
    request,
  }) => {
    const before = await fetchSettings(request);
    expect(before.status).toBe(200);
    const bodyStr = JSON.stringify(before.body);
    expect(scanTextForSecrets(bodyStr)).toBe(0);
    expect(bodyStr).not.toMatch(/"apiKey"/);

    await openAiProviderTab(page);
    expect(await scanPageSecrets(page)).toBe(0);

    await expect(page.getByTestId("ai-provider-card-openai")).toBeVisible();
    await expect(page.getByTestId("ai-provider-card-gemini")).toBeVisible();

    const openaiKeyInput = page.getByTestId("ai-provider-key-openai");
    await expect(openaiKeyInput).toHaveValue("");

    if (
      hasProviderKeys() &&
      before.body.openai?.stored !== true
    ) {
      await openaiKeyInput.fill(process.env.OPENAI_API_KEY!);
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
      await expect(page.getByText(/저장되었습니다/)).toBeVisible({
        timeout: 90_000,
      });
    }

    if (
      hasProviderKeys() &&
      before.body.gemini?.stored !== true
    ) {
      await page.getByTestId("ai-provider-key-gemini").fill(process.env.GEMINI_API_KEY!);
      await page.getByTestId("ai-provider-save-gemini").click();
      await expect(page.getByText(/저장되었습니다/)).toBeVisible({
        timeout: 90_000,
      });
    }

    const after = await fetchSettings(request);
    expect(after.body.openai?.configured).toBe(true);
    expect(after.body.gemini?.configured).toBe(true);
    if (hasProviderKeys()) {
      expect(after.body.openai?.stored).toBe(true);
      expect(after.body.gemini?.stored).toBe(true);
      expect(after.body.openai?.envFallback).toBe(false);
      expect(after.body.gemini?.envFallback).toBe(false);
      expect(after.body.openai?.fingerprint).toBeTruthy();
      expect(after.body.gemini?.fingerprint).toBeTruthy();
    }
    expect(after.body.openai?.selectedModel).toMatch(/gpt-5-mini/);
    expect(String(after.body.gemini?.selectedModel ?? "")).toMatch(/gemini.*flash/i);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBe(false);

    await page.keyboard.press("Tab");
    expect(await scanPageSecrets(page)).toBe(0);
  });

  test("connection test buttons respond without leaking secrets", async ({
    page,
    request,
  }) => {
    test.skip(!hasProviderKeys(), "Provider keys required");
    await openAiProviderTab(page);
    await page.getByTestId("ai-provider-key-openai").fill(process.env.OPENAI_API_KEY!);
    await page.getByTestId("ai-provider-test-openai").click();
    await page.waitForTimeout(3000);
    await page.getByTestId("ai-provider-key-openai").fill("");
    const settings = await fetchSettings(request);
    expect(scanTextForSecrets(JSON.stringify(settings.body))).toBe(0);
    expect(await scanPageSecrets(page)).toBe(0);
  });
});
