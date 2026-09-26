import { expect, type Page } from "@playwright/test";

/** Matches tests/e2e/global-setup.ts and tests/helpers/authSession.ts temp CEO. */
export const E2E_CEO_USERNAME = "temp_ceo";
export const E2E_CEO_PASSWORD = "ceo-temp-pass-9f3a";

export async function loginAsE2eCeo(page: Page, baseURL?: string) {
  const origin = baseURL ?? "http://127.0.0.1:3100";
  const response = await page.request.post(`${origin}/api/rextora/auth/login`, {
    data: {
      username: E2E_CEO_USERNAME,
      password: E2E_CEO_PASSWORD,
    },
    headers: { Origin: origin },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok).toBe(true);
}
