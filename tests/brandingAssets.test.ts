import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifest from "../app/manifest";
import { isPublicPath } from "../proxy";

const root = path.join(process.cwd());

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
    ]) {
      const file = path.join(root, relative);
      expect(fs.existsSync(file), relative).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(400);
    }
  });

  it("manifest points at 192/512 icons without inventing routes", () => {
    const data = manifest();
    expect(data.name).toBe("Rextora");
    expect(data.short_name).toBe("Rextora");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/");
    const srcs = (data.icons ?? []).map((icon) => icon.src);
    expect(srcs).toContain("/icons/icon-192.png");
    expect(srcs).toContain("/icons/icon-512.png");
    expect(srcs).toContain("/icons/icon-512-maskable.png");
  });

  it("brand assets and app icons are public without changing page auth", () => {
    expect(isPublicPath("/brand/rextora-logo-main.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-logo-main-transparent.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-icon-main.png")).toBe(true);
    expect(isPublicPath("/icons/icon-192.png")).toBe(true);
    expect(isPublicPath("/icons/icon-512.png")).toBe(true);
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
    const login = fs.readFileSync(path.join(root, "app/login/page.tsx"), "utf8");
    const sidebar = fs.readFileSync(path.join(root, "components/rextora/Sidebar.tsx"), "utf8");
    expect(login).toContain("/brand/rextora-logo-main-transparent.png");
    expect(login).not.toContain('src="/brand/rextora-logo-main.png"');
    expect(sidebar).toContain("/brand/rextora-logo-main-transparent.png");
    expect(sidebar).toContain("/brand/rextora-icon-main.png");
    expect(sidebar.match(/rextora-icon-main\.png/g)?.length).toBe(2);
  });
});
