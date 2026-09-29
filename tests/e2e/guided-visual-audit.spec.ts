import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAsE2eCeo } from "./e2eAuth";

const OUT = path.join(process.cwd(), "guided-visual-audit-screenshots");

async function stepHeight(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el =
      document.querySelector("[data-testid='ss-guided-step-surface']") ??
      document.querySelector("[data-testid='ss-guided-final-review']");
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
}

async function goToStep(page: import("@playwright/test").Page, index: number) {
  await page.goto("/strategy-search");
  await expect(page.getByTestId("ss-guided-setup")).toBeVisible();
  for (let i = 0; i < index; i++) {
    await page.getByTestId("ss-guided-next").click();
  }
}

/** Step 5 content width vs guided body (catches sidebar-column auto-placement). */
async function guidedContentWidthRatio(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const body = document.querySelector(".ss-guided-setup__body");
    const content = document.querySelector(".ss-guided-setup__content");
    if (!body || !content) return null;
    const bodyWidth = body.getBoundingClientRect().width;
    const contentWidth = content.getBoundingClientRect().width;
    return {
      bodyWidth,
      contentWidth,
      ratio: bodyWidth > 0 ? contentWidth / bodyWidth : 0,
      hasDirectSidebarGuide: Boolean(
        body.querySelector(":scope > .ss-guided-guide"),
      ),
      guideAfterContent: body.classList.contains(
        "ss-guided-setup__body--guide-after-content",
      ),
    };
  });
}

const STEP5_MIN_CONTENT_BODY_WIDTH_RATIO = 0.75;

test.describe("guided visual audit", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsE2eCeo(page);
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      if (
        route.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search$/.test(
          route.request().url().replace(/\?.*$/, ""),
        )
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: [],
            meta: { ts: new Date().toISOString() },
            error: null,
          }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "{}" });
    });
  });

  test("capture screenshots and step heights", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(OUT, { recursive: true });
    const heights: Record<string, number> = {};

    await page.setViewportSize({ width: 1440, height: 900 });

    await goToStep(page, 0);
    heights.desktopStep1 = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "desktop-step1-1440.png"),
      fullPage: true,
    });

    await goToStep(page, 1);
    heights.desktopStep2 = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "desktop-step2-1440.png"),
      fullPage: true,
    });
    await expect(page.getByTestId("ss-guided-auto-time-budget")).toBeVisible();
    const step2Advanced = page.getByTestId("ss-guided-step2-deep");
    await expect(step2Advanced).not.toHaveAttribute("open");
    await page.screenshot({
      path: path.join(OUT, "desktop-step2-auto-final-1440.png"),
      fullPage: true,
    });
    await page.getByTestId("ss-duration").selectOption("custom");
    await page.getByTestId("ss-max-runtime-primary").fill("20");
    await page.screenshot({
      path: path.join(OUT, "desktop-step2-auto-custom-final-1440.png"),
      fullPage: true,
    });
    await step2Advanced.locator("summary").click();
    await page.screenshot({
      path: path.join(OUT, "desktop-step2-auto-advanced-final-1440.png"),
      fullPage: true,
    });

    await goToStep(page, 2);
    heights.desktopStep3Collapsed = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "desktop-step3-collapsed-1440.png"),
      fullPage: true,
    });

    const workspaceDeep = page.getByTestId("ss-guided-step3-workspace-deep");
    if (!(await workspaceDeep.getAttribute("open"))) {
      await workspaceDeep.locator("summary").click();
    }
    const deep = page.getByTestId("ss-guided-step3-deep");
    if ((await deep.count()) > 0 && !(await deep.getAttribute("open"))) {
      await deep.locator("summary").click();
    }
    heights.desktopStep3Expanded = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "desktop-step3-expanded-1440.png"),
      fullPage: true,
    });

    await goToStep(page, 3);
    heights.desktopStep4 = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "desktop-step4-1440.png"),
      fullPage: true,
    });
    const advancedTrigger = page.getByTestId("ss-validation-advanced-trigger");
    if ((await advancedTrigger.count()) > 0) {
      await advancedTrigger.click();
      await page.screenshot({
        path: path.join(OUT, "desktop-step4-advanced-1440.png"),
        fullPage: true,
      });
    }

    await goToStep(page, 4);
    heights.desktopStep5 = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "desktop-step5-1440.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await goToStep(page, 0);
    await page.screenshot({
      path: path.join(OUT, "mobile-step1-390.png"),
      fullPage: true,
    });

    await goToStep(page, 1);
    heights.mobileStep2 = await stepHeight(page);
    await expect(page.getByTestId("ss-guided-auto-time-budget")).toBeVisible();
    await expect(page.getByTestId("ss-guided-step2-deep")).not.toHaveAttribute(
      "open",
    );
    await page.screenshot({
      path: path.join(OUT, "mobile-step2-auto-final-390.png"),
      fullPage: true,
    });

    await goToStep(page, 2);
    heights.mobileStep3Collapsed = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "mobile-step3-collapsed-390.png"),
      fullPage: true,
    });
    const mobileWorkspace = page.getByTestId("ss-guided-step3-workspace-deep");
    if (!(await mobileWorkspace.getAttribute("open"))) {
      await mobileWorkspace.locator("summary").click();
    }
    const mobilePattern = page.getByTestId("ss-guided-step3-deep");
    if (
      (await mobilePattern.count()) > 0 &&
      !(await mobilePattern.getAttribute("open"))
    ) {
      await mobilePattern.locator("summary").click();
    }
    heights.mobileStep3Expanded = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "mobile-step3-expanded-390.png"),
      fullPage: true,
    });

    await goToStep(page, 3);
    heights.mobileStep4 = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "mobile-step4-390.png"),
      fullPage: true,
    });

    await goToStep(page, 4);
    heights.mobileStep5 = await stepHeight(page);
    await page.screenshot({
      path: path.join(OUT, "mobile-step5-390.png"),
      fullPage: true,
    });

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    const before = fs.existsSync(path.join(OUT, "heights-before.json"))
      ? JSON.parse(
          fs.readFileSync(path.join(OUT, "heights-before.json"), "utf8"),
        )
      : null;
    fs.writeFileSync(
      path.join(OUT, "heights-after.json"),
      JSON.stringify(
        { before, after: heights, horizontalOverflowMobile: overflow },
        null,
        2,
      ),
    );
  });

  test("Step 5 desktop content uses full guided body width", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const stepIndex of [0, 1, 2, 3]) {
      await goToStep(page, stepIndex);
      const layout = await guidedContentWidthRatio(page);
      expect(layout).not.toBeNull();
      expect(layout!.hasDirectSidebarGuide).toBe(true);
      expect(layout!.guideAfterContent).toBe(false);
    }

    await goToStep(page, 4);
    const step5Desktop = await guidedContentWidthRatio(page);
    expect(step5Desktop).not.toBeNull();
    expect(step5Desktop!.guideAfterContent).toBe(true);
    expect(step5Desktop!.hasDirectSidebarGuide).toBe(false);
    expect(step5Desktop!.ratio).toBeGreaterThanOrEqual(
      STEP5_MIN_CONTENT_BODY_WIDTH_RATIO,
    );

    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await expect(page.getByTestId("ss-guided-review-분석 대상")).toBeVisible();
    await expect(page.getByTestId("ss-guided-review-탐색 방식")).toBeVisible();
    await expect(page.getByTestId("ss-guided-review-전략 · 범위")).toBeVisible();
    await expect(page.getByTestId("ss-guided-review-검증 · 위험")).toBeVisible();
    await expect(page.getByTestId("ss-launch-panel")).toBeVisible();
    await expect(page.getByTestId("ss-create-submit")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await goToStep(page, 4);
    const step5Mobile = await guidedContentWidthRatio(page);
    expect(step5Mobile!.ratio).toBeGreaterThanOrEqual(
      STEP5_MIN_CONTENT_BODY_WIDTH_RATIO,
    );
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await expect(page.getByTestId("ss-create-submit")).toBeVisible();
  });

  test("capture automatic target-mode screenshots", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToStep(page, 1);
    await page.getByTestId("ss-auto-objective-target").click();
    await expect(page.getByTestId("ss-guided-auto-target")).toBeVisible();
    await expect(page.getByTestId("ss-guided-step2-deep")).not.toHaveAttribute(
      "open",
    );
    await page.screenshot({
      path: path.join(OUT, "desktop-step2-auto-target-1440.png"),
      fullPage: true,
    });
    await page.getByTestId("ss-guided-next").click();
    await page.getByTestId("ss-guided-next").click();
    await expect(page.getByTestId("ss-guided-target-summary")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "desktop-step4-auto-target-1440.png"),
      fullPage: true,
    });
    await page.getByTestId("ss-guided-next").click();
    await expect(page.getByTestId("ss-guided-target-review")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "desktop-step5-auto-target-1440.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await goToStep(page, 1);
    await page.getByTestId("ss-auto-objective-target").click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: path.join(OUT, "mobile-step2-auto-target-390.png"),
      fullPage: true,
    });
  });
});
