import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
const routes = [
  "/strategy-search",
  "/market-watch",
  "/paper-trading",
  "/live-trading",
  "/trades",
  "/ai-reports",
  "/risk",
  "/settings",
  "/system-status",
];

const outDir = path.join(process.cwd(), "tmp", "style-audit");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const results = [];
for (const route of routes) {
  const errors = [];
  const failed = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.removeAllListeners("response");
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("response", (res) => {
    const ct = res.headers()["content-type"] || "";
    const url = res.url();
    if (
      res.status() >= 400 &&
      (ct.includes("css") ||
        url.includes(".css") ||
        url.includes("/_next/static"))
    ) {
      failed.push({ status: res.status(), url });
    }
  });

  const res = await page.goto(`${BASE}${route}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(500);

  const stylesheets = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => ({
      href: l.href,
      disabled: l.disabled,
    })),
  );
  const computed = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const shell = document.querySelector(".dashboard-shell");
    const aside = document.querySelector("aside");
    const main = document.querySelector("main.dashboard-main");
    const nav = document.querySelector('[data-testid="main-nav"]');
    return {
      title: document.title,
      bodyBg: body.backgroundColor,
      bodyBgImage: body.backgroundImage?.slice(0, 80),
      fontFamily: body.fontFamily,
      hasShell: !!shell,
      shellDisplay: shell ? getComputedStyle(shell).display : null,
      shellColumns: shell ? getComputedStyle(shell).gridTemplateColumns : null,
      hasAside: !!aside,
      asideDisplay: aside ? getComputedStyle(aside).display : null,
      hasMain: !!main,
      hasNav: !!nav,
      htmlClass: document.documentElement.className,
    };
  });

  const shot = path.join(outDir, `${route.replace(/\//g, "_") || "home"}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  results.push({
    route,
    httpStatus: res?.status() ?? null,
    stylesheets,
    failedAssets: failed,
    consoleErrors: errors,
    ...computed,
    screenshot: shot,
  });
}

await browser.close();
fs.writeFileSync(
  path.join(outDir, "report.json"),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
