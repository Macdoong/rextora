import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import manifest from "../app/manifest";
import { isPublicPath } from "../proxy";

const root = path.join(process.cwd());
const SOCIAL_PREVIEW = "public/brand/rextora-share-1200x630-v1.png";
const FULL_LOGO = "/brand/rextora-logo-main-transparent.png";
const MARK = "/brand/rextora-mark-v3.png";
const LAUNCHER_ASSETS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-v2.png",
  "/icons/icon-512-v2.png",
  "/icons/icon-192-v3.png",
  "/icons/icon-512-v3.png",
  "/icon.png",
];

function pngSize(relative: string) {
  const buf = fs.readFileSync(path.join(root, relative));
  expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.byteLength, colorType: buf[25] };
}

function decodePng(relative: string) {
  const buf = fs.readFileSync(path.join(root, relative));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IDAT") chunks.push(data);
    if (type === "IEND") break;
    offset += 12 + len;
  }
  const inflated = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  let dst = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    for (let i = 0; i < stride; i += 1) {
      const raw = inflated[src + i];
      const a = i >= bytesPerPixel ? out[dst + i - bytesPerPixel] : 0;
      const b = y > 0 ? out[dst + i - stride] : 0;
      const c = y > 0 && i >= bytesPerPixel ? out[dst + i - stride - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value = (raw + a) & 255;
      else if (filter === 2) value = (raw + b) & 255;
      else if (filter === 3) value = (raw + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (raw + pr) & 255;
      }
      out[dst + i] = value;
    }
    src += stride;
    dst += stride;
  }
  return { width, height, bytesPerPixel, data: out };
}

function occupancy(relative: string) {
  const png = decodePng(relative);
  const { width, height, bytesPerPixel, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * bytesPerPixel;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = bytesPerPixel === 4 ? data[i + 3] : 255;
      if (a < 20) continue;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma > 40 && Math.max(r, g, b) > 80) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    widthRatio: (maxX - minX + 1) / width,
    heightRatio: (maxY - minY + 1) / height,
    box: { minX, minY, maxX, maxY },
  };
}

function topRowsAreNavy(relative: string, rows = 8) {
  const png = decodePng(relative);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * png.bytesPerPixel;
      if (png.data[i] !== 10 || png.data[i + 1] !== 15 || png.data[i + 2] !== 22) {
        return false;
      }
    }
  }
  return true;
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

  it("exposes V3 favicon and app icons with valid dimensions", () => {
    for (const relative of [
      "app/icon.png",
      "app/apple-icon.png",
      "public/icons/icon-192-v3.png",
      "public/icons/icon-512-v3.png",
      "public/icons/icon-512-maskable-v3.png",
      "public/brand/rextora-mark-v3.png",
    ]) {
      const file = path.join(root, relative);
      expect(fs.existsSync(file), relative).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(400);
    }
    expect(pngSize("public/icons/icon-192-v3.png")).toMatchObject({ width: 192, height: 192 });
    expect(pngSize("public/icons/icon-512-v3.png")).toMatchObject({ width: 512, height: 512 });
    expect(pngSize("public/icons/icon-512-maskable-v3.png")).toMatchObject({ width: 512, height: 512 });
    expect(pngSize("app/icon.png")).toMatchObject({ width: 192, height: 192 });
    expect(pngSize("app/apple-icon.png")).toMatchObject({ width: 180, height: 180 });
    expect(pngSize("public/brand/rextora-mark-v3.png").colorType).toBe(6);
  });

  it("manifest exists, parses, and points at real V3 icon files", () => {
    const data = manifest();
    expect(data.name).toBe("Rextora");
    expect(data.short_name).toBe("Rextora");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/");
    const icons = data.icons ?? [];
    const srcs = icons.map((icon) => icon.src);
    expect(srcs).toContain("/icons/icon-192-v3.png");
    expect(srcs).toContain("/icons/icon-512-v3.png");
    expect(srcs).toContain("/icons/icon-512-maskable-v3.png");
    expect(srcs).not.toContain("/icons/icon-192-v2.png");
    expect(srcs).not.toContain("/icons/icon-512-v2.png");
    expect(srcs).not.toContain("/icons/icon-512-maskable-v2.png");
    for (const icon of icons) {
      const file = path.join(root, "public", icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), icon.src).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(400);
    }
    const maskable = icons.find((icon) => icon.purpose === "maskable");
    expect(maskable?.src).toBe("/icons/icon-512-maskable-v3.png");
    expect(maskable?.sizes).toBe("512x512");
  });

  it("V3 R occupancy is smaller than V2 and top rows stay uniform navy", () => {
    const v2 = occupancy("public/icons/icon-512-v2.png");
    const v3 = occupancy("public/icons/icon-512-v3.png");
    const mask = occupancy("public/icons/icon-512-maskable-v3.png");
    expect(v2.widthRatio).toBeGreaterThan(0.76);
    expect(v3.widthRatio).toBeLessThan(v2.widthRatio);
    expect(v3.heightRatio).toBeLessThan(v2.heightRatio);
    expect(v3.widthRatio).toBeGreaterThan(0.71);
    expect(v3.widthRatio).toBeLessThan(0.76);
    expect(v3.heightRatio).toBeGreaterThan(0.64);
    expect(v3.heightRatio).toBeLessThan(0.71);
    expect(mask.widthRatio).toBeGreaterThan(0.63);
    expect(mask.widthRatio).toBeLessThanOrEqual(0.7);
    expect(mask.widthRatio).toBeLessThan(v3.widthRatio);
    expect(topRowsAreNavy("public/icons/icon-512-v3.png")).toBe(true);
    expect(topRowsAreNavy("public/icons/icon-512-maskable-v3.png")).toBe(true);
    expect(topRowsAreNavy("public/icons/icon-192-v3.png")).toBe(true);
  });

  it("brand assets and app icons are public without changing page auth", () => {
    expect(isPublicPath("/brand/rextora-logo-main.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-logo-main-transparent.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-icon-main.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-mark-v3.png")).toBe(true);
    expect(isPublicPath("/brand/rextora-share-1200x630-v1.png")).toBe(true);
    expect(isPublicPath("/icons/icon-192-v3.png")).toBe(true);
    expect(isPublicPath("/icons/icon-512-v3.png")).toBe(true);
    expect(isPublicPath("/icons/icon-512-maskable-v3.png")).toBe(true);
    expect(isPublicPath("/icon.png")).toBe(true);
    expect(isPublicPath("/apple-icon.png")).toBe(true);
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("/paper-trading")).toBe(false);
  });

  it("transparent full logo is RGBA and login/sidebar keep it for full-lockup use", () => {
    const transparent = path.join(root, "public/brand/rextora-logo-main-transparent.png");
    const buf = fs.readFileSync(transparent);
    expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(buf.readUInt32BE(16)).toBe(460);
    expect(buf.readUInt32BE(20)).toBe(128);
    expect(buf[25]).toBe(6);
    const login = read("app/login/page.tsx");
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(login).toContain("/brand/rextora-logo-main-transparent.png");
    expect(login).not.toContain('src="/brand/rextora-logo-main.png"');
    expect(sidebar).toContain("/brand/rextora-logo-main-transparent.png");
    expect(sidebar).toContain("/brand/rextora-icon-main.png");
    expect(sidebar.match(/rextora-icon-main\.png/g)?.length).toBe(1);
  });

  it("mobile header uses the clean R mark and the drawer uses the full horizontal logo", () => {
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(sidebar).toContain(MARK);
    expect(sidebar).toContain('className="rextora-mobile-brand-mark"');
    expect(sidebar).toContain('className="v3-shell-mobile-drawer-logo"');
    expect(sidebar).toContain("/brand/rextora-logo-main-transparent.png");
    for (const launcher of LAUNCHER_ASSETS) {
      expect(sidebar).not.toContain(`src="${launcher}"`);
    }
    expect(sidebar).not.toMatch(/rextora-mobile-header[\s\S]*rextora-icon-main\.png/);
  });

  it("launch and route loading screens use the full horizontal logo, not the symbol-only asset", () => {
    const layout = read("app/layout.tsx");
    const loading = read("app/loading.tsx");
    expect(layout).toContain('data-testid="rextora-launch-branding"');
    expect(layout).toContain(FULL_LOGO);
    expect(loading).toContain('data-testid="rextora-route-loading-branding"');
    expect(loading).toContain(FULL_LOGO);
    expect(layout).toContain("object-fit:contain");
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
