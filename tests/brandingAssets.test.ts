import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifest from "../app/manifest";
import { isPublicPath } from "../proxy";

const root = path.join(process.cwd());
const SOCIAL_PREVIEW = "public/brand/rextora-share-1200x630-v1.png";
const FULL_LOGO = "/brand/rextora-logo-main-transparent.png";
const SYMBOL_ONLY = [
  "/brand/rextora-icon-main.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-v2.png",
  "/icons/icon-512-v2.png",
];

function pngSize(relative: string) {
  const buf = fs.readFileSync(path.join(root, relative));
  expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.byteLength };
}

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("approved Rextora brand assets", () => {
  it("keeps canonical Full Color (Main) logo and Main Icon", () => {
    const logo = path.join(root, "public/brand/rextora-logo-main.png");
    const transparent = path.join(root, "public/brand/rextora-logo-main-transparent.png");
    const icon = path.join(root, "public/brand/rextora-icon-main.png");
    expect(fs.existsSync(logo)).toBe(true);
    expect(fs.existsSync(transparent)).toBe(true);
    expect(fs.existsSync(icon)).toBe(true);
    expect(fs.statSync(logo).size).toBeGreaterThan(1000);
    expect(fs.statSync(transparent).size).toBeGreaterThan(1000);
    expect(fs.statSync(icon).size).toBeGreaterThan(500);
  });

  it("exposes derived favicon and app icons from the Main Icon", () => {
    for (const relative of [
      "app/icon.png",
      "app/apple-icon.png",
      "public/icons/icon-192.png",
      "public/icons/icon-512.png",
      "public/icons/icon-512-maskable.png",
      "public/icons/icon-192-v2.png",
      "public/icons/icon-512-v2.png",
      "public/icons/icon-512-maskable-v2.png",
    ]) {
      const file = path.join(root, relative);
      expect(fs.existsSync(file), relative).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(400);
    }
    expect(pngSize("public/icons/icon-192-v2.png")).toMatchObject({ width: 192, height: 192 });
    expect(pngSize("public/icons/icon-512-v2.png")).toMatchObject({ width: 512, height: 512 });
    expect(pngSize("public/icons/icon-512-maskable-v2.png")).toMatchObject({ width: 512, height: 512 });
    expect(pngSize("app/icon.png")).toMatchObject({ width: 192, height: 192 });
    expect(pngSize("app/apple-icon.png")).toMatchObject({ width: 180, height: 180 });
  });

  it("manifest exists, parses, and points at real versioned icon files", () => {
    const data = manifest();
    expect(data.name).toBe("Rextora");
    expect(data.short_name).toBe("Rextora");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/");
    const icons = data.icons ?? [];
    const srcs = icons.map((icon) => icon.src);
    expect(srcs).toContain("/icons/icon-192-v2.png");
    expect(srcs).toContain("/icons/icon-512-v2.png");
    expect(srcs).toContain("/icons/icon-512-maskable-v2.png");
    expect(srcs).not.toContain("/icons/icon-192.png");
    expect(srcs).not.toContain("/icons/icon-512.png");
    for (const icon of icons) {
      const file = path.join(root, "public", icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), icon.src).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(400);
    }
    const maskable = icons.find((icon) => icon.purpose === "maskable");
    expect(maskable?.src).toBe("/icons/icon-512-maskable-v2.png");
    expect(maskable?.sizes).toBe("512x512");
  });

  it("brand assets and app icons are public without changing page auth", () => {
    expect(isPublicPath("/brand/rextora-logo-main.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-logo-main-transparent.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-icon-main.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-share-1200x630-v1.png")).toBe(true);
    expect(isPublicPath("/icons/icon-192.png")).toBe(true);
    expect(isPublicPath("/icons/icon-512.png")).toBe(true);
    expect(isPublicPath("/icons/icon-192-v2.png")).toBe(true);
    expect(isPublicPath("/icons/icon-512-v2.png")).toBe(true);
    expect(isPublicPath("/icons/icon-512-maskable-v2.png")).toBe(true);
    expect(isPublicPath("/icon.png")).toBe(true);
    expect(isPublicPath("/apple-icon.png")).toBe(true);
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("/paper-trading")).toBe(false);
  });

  it("transparent full logo is RGBA and login/sidebar use it without touching icons", () => {
    const transparent = path.join(root, "public/brand/rextora-logo-main-transparent.png");
    const buf = fs.readFileSync(transparent);
    expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(buf.readUInt32BE(16)).toBe(460);
    expect(buf.readUInt32BE(20)).toBe(128);
    expect(buf[25]).toBe(6); // PNG color type 6 = RGBA
    const login = read("app/login/page.tsx");
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(login).toContain("/brand/rextora-logo-main-transparent.png");
    expect(login).not.toContain('src="/brand/rextora-logo-main.png"');
    expect(sidebar).toContain("/brand/rextora-logo-main-transparent.png");
    expect(sidebar).toContain("/brand/rextora-icon-main.png");
    expect(sidebar.match(/rextora-icon-main\.png/g)?.length).toBe(2);
  });

  it("launch and route loading screens use the full horizontal logo, not the symbol-only asset", () => {
    const layout = read("app/layout.tsx");
    const loading = read("app/loading.tsx");
    expect(layout).toContain('data-testid="rextora-launch-branding"');
    expect(layout).toContain(FULL_LOGO);
    expect(loading).toContain('data-testid="rextora-route-loading-branding"');
    expect(loading).toContain(FULL_LOGO);
    expect(layout).toContain("object-fit:contain");
    for (const symbol of SYMBOL_ONLY) {
      expect(layout).not.toContain(`src="${symbol}"`);
      expect(loading).not.toContain(symbol);
    }
    expect(loading).not.toContain("rextora-icon-main");
  });

  it("Open Graph and Twitter metadata use the 1200x630 full-logo social preview", () => {
    const layout = read("app/layout.tsx");
    const preview = pngSize(SOCIAL_PREVIEW);
    expect(preview.width).toBe(1200);
    expect(preview.height).toBe(630);
    expect(preview.width / preview.height).toBeCloseTo(1200 / 630, 5);
    expect(layout).toContain("metadataBase");
    expect(layout).toContain("https://rextora.com");
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
    expect(layout).toContain("/brand/rextora-share-1200x630-v1.png");
    expect(layout).toContain("summary_large_image");
    expect(layout).not.toContain('url: "/icon.png"');
    expect(layout).not.toContain('url: "/apple-icon.png"');
    expect(layout).not.toContain("/icons/icon-512");
    expect(isPublicPath("/brand/rextora-share-1200x630-v1.png")).toBe(true);
  });
});
