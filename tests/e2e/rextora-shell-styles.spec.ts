import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  "/strategy-search",
  "/market-watch",
  "/paper-trading",
  "/live-trading",
  "/trades",
  "/ai-reports",
  "/risk",
  "/settings",
  "/system-status",
] as const;

async function assertStyledShell(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "networkidle" });
  expect(response?.ok() ?? false).toBe(true);

  const stylesheets = page.locator('link[rel="stylesheet"]');
  await expect(stylesheets.first()).toHaveCount(1);
  const href = await stylesheets.first().getAttribute("href");
  expect(href).toBeTruthy();
  const cssRes = await page.request.get(href!);
  expect(cssRes.status()).toBe(200);

  await expect(page.locator(".dashboard-shell")).toBeVisible();
  await expect(page.locator("main.dashboard-main")).toBeVisible();
  await expect(page.getByTestId("main-nav")).toBeVisible();

  const body = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      fontFamily: style.fontFamily,
      backgroundImage: style.backgroundImage,
      color: style.color,
    };
  });
  expect(body.fontFamily.toLowerCase()).toContain("jakarta");
  expect(body.backgroundImage).not.toBe("none");
  // Dark theme text should not be browser-default black on white
  expect(body.color).not.toBe("rgb(0, 0, 0)");
}

test.describe("Rextora shell styles (production)", () => {
  for (const route of ROUTES) {
    test(`${route} loads styled shell on direct entry`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("response", (res) => {
        if (res.url().includes(".css") && res.status() >= 400) {
          errors.push(`css ${res.status()} ${res.url()}`);
        }
      });
      await assertStyledShell(page, route);
      expect(errors, errors.join(" | ")).toEqual([]);
    });
  }

  test("client navigation between affected routes keeps shell", async ({
    page,
  }) => {
    await page.goto("/strategy-search", { waitUntil: "networkidle" });
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await page.getByTestId("nav-market-watch").click();
    await expect(page).toHaveURL(/\/market-watch/);
    await expect(page.locator(".dashboard-shell")).toBeVisible();
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".dashboard-shell")).toBeVisible();
    await expect(page.getByTestId("main-nav")).toBeVisible();
  });
});
