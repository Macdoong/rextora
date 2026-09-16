import { expect, test, type Page, type Response } from "@playwright/test";

const ROUTES = [
  "/dashboard",
  "/strategy-search",
  "/results",
  "/backtest",
  "/paper-trading",
  "/live-trading",
  "/settings",
] as const;

type StylesheetLoadRecord = {
  url: string;
  status: number;
};

async function readBuildId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const nextData = (window as unknown as { __NEXT_DATA__?: { buildId?: string } })
      .__NEXT_DATA__;
    return nextData?.buildId ?? null;
  });
}

function stylesheetResponses(responses: StylesheetLoadRecord[]): StylesheetLoadRecord[] {
  return responses.filter(
    (item) => item.url.includes(".css") || item.url.includes("/_next/static/css/"),
  );
}

async function assertStyledShell(page: Page, route: string) {
  const cssResponses: StylesheetLoadRecord[] = [];
  const onResponse = (response: Response) => {
    const request = response.request();
    if (request.resourceType() === "stylesheet" || response.url().includes(".css")) {
      cssResponses.push({ url: response.url(), status: response.status() });
    }
  };
  page.on("response", onResponse);

  try {
    const waitUntil = route === "/live-trading" ? "domcontentloaded" : "networkidle";
    const response = await page.goto(route, { waitUntil });
    expect(response?.ok() ?? false).toBe(true);

    if (route === "/live-trading") {
      await expect(page.locator(".dashboard-shell")).toBeVisible();
      await expect(page.locator("main.dashboard-main")).toBeVisible();
      await expect(page.getByTestId("main-nav")).toBeVisible();
      await expect(page.getByTestId("sidebar-lifecycle-nav")).toBeVisible();
      await expect(page.getByTestId("shell-lifecycle-navigation")).toBeVisible();
    }

    const stylesheets = page.locator('link[rel="stylesheet"]');
    await expect(stylesheets.first()).toHaveCount(1);
    const href = await stylesheets.first().getAttribute("href");
    expect(href).toBeTruthy();

    const loadedStylesheets = stylesheetResponses(cssResponses);
    const hrefTail = href!.split("/").pop()?.split("?")[0] ?? href!;
    const matchedStylesheet = loadedStylesheets.find(
      (item) => item.url.includes(hrefTail) || item.url.endsWith(href!),
    );

    expect(
      matchedStylesheet?.status,
      JSON.stringify(
        {
          route,
          pageUrl: page.url(),
          buildId: await readBuildId(page),
          stylesheetHref: href,
          browserStylesheetResponses: loadedStylesheets,
          note: "Stylesheet must load via browser navigation, not a redundant apiRequestContext fetch",
        },
        null,
        2,
      ),
    ).toBe(200);

    await expect(page.locator(".dashboard-shell")).toBeVisible();
    await expect(page.locator("main.dashboard-main")).toBeVisible();
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await expect(page.getByTestId("sidebar-lifecycle-nav")).toBeVisible();
    await expect(page.getByTestId("shell-lifecycle-navigation")).toBeVisible();

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
    expect(body.color).not.toBe("rgb(0, 0, 0)");
  } finally {
    page.off("response", onResponse);
  }
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

  test("client navigation between lifecycle routes keeps shell", async ({
    page,
  }) => {
    await page.goto("/strategy-search", { waitUntil: "networkidle" });
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await expect(page.getByTestId("shell-lifecycle-nav-research")).toHaveAttribute(
      "data-active",
      "true",
    );
    await page.getByTestId("shell-lifecycle-nav-strategy").click();
    await expect(page).toHaveURL(/\/results/);
    await expect(page.getByTestId("shell-lifecycle-nav-strategy")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator(".dashboard-shell")).toBeVisible();
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".dashboard-shell")).toBeVisible();
    await expect(page.getByTestId("main-nav")).toBeVisible();
    await expect(page.getByTestId("shell-lifecycle-nav-strategy")).toHaveAttribute(
      "data-active",
      "true",
    );
  });
});
