import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GET_ROUTE_ACCESS,
  MUTATION_ROUTE_PERMISSIONS,
  PUBLIC_GET_EXCEPTIONS,
} from "../src/lib/rextora/auth/routePermissions";

const API_ROOT = path.join(process.cwd(), "app/api");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fp);
    return entry.name === "route.ts" ? [fp] : [];
  });
}

function exportedMutations(source: string): Array<"POST" | "PUT" | "PATCH" | "DELETE"> {
  const found: Array<"POST" | "PUT" | "PATCH" | "DELETE"> = [];
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    if (new RegExp(`export (async )?function ${method}\\(`).test(source)) found.push(method);
  }
  return found;
}

function exportsGet(source: string): boolean {
  return /export (async )?function GET\(/.test(source);
}

function hasReadGuard(source: string): boolean {
  return (
    source.includes("denyUnlessAuthenticated") ||
    source.includes("requireAuthenticatedUser") ||
    source.includes("requireAdmin") ||
    source.includes("requireCeo") ||
    source.includes("requireMemberManagementViewer") ||
    source.includes("resolveRequestUser")
  );
}

function toPath(rel: string): string {
  return (
    "/" +
    rel
      .replace(/\\/g, "/")
      .replace(/^app/, "")
      .replace(/\/route\.ts$/, "")
      .replace(/^\//, "app/")
      .replace(/^app/, "")
  )
    .replace(/\/+/g, "/")
    .replace(/^/, "")
    .replace(/^/, "/api")
    .replace(/^\/api\/api/, "/api");
}

describe("auth route coverage", () => {
  it("every mutation route is inventoried and guarded", () => {
    const files = walk(API_ROOT);
    const discovered: Array<{ method: string; sourceFile: string; path: string }> = [];
    for (const abs of files) {
      const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
      const source = fs.readFileSync(abs, "utf8");
      const routePath = "/" + rel.replace(/^app/, "").replace(/\/route\.ts$/, "");
      for (const method of exportedMutations(source)) {
        discovered.push({ method, sourceFile: rel, path: routePath });
      }
    }

    const inventory = new Map(
      MUTATION_ROUTE_PERMISSIONS.map((row) => [`${row.method} ${row.sourceFile}`, row]),
    );

    const missing = discovered.filter((row) => !inventory.has(`${row.method} ${row.sourceFile}`));
    expect(missing, JSON.stringify(missing, null, 2)).toEqual([]);

    const stale = MUTATION_ROUTE_PERMISSIONS.filter(
      (row) => !discovered.some((d) => d.method === row.method && d.sourceFile === row.sourceFile),
    );
    expect(stale, JSON.stringify(stale, null, 2)).toEqual([]);

    for (const row of MUTATION_ROUTE_PERMISSIONS) {
      if (row.permission === "auth") continue;
      const source = fs.readFileSync(path.join(process.cwd(), row.sourceFile), "utf8");
      const guarded =
        source.includes("denyUnlessPermitted") ||
        source.includes("requirePermission") ||
        source.includes("requireAuthenticatedUser") ||
        source.includes("requireAdmin") ||
        source.includes("requireCeo") ||
        source.includes("requireMemberManagementViewer");
      expect(guarded, `${row.method} ${row.path} missing auth guard`).toBe(true);
    }

    void toPath;
  });

  it("every GET route is inventoried as AUTH_REQUIRED, AUTH_ENDPOINT, or explicit PUBLIC", () => {
    const files = walk(API_ROOT);
    const discovered: Array<{ sourceFile: string; path: string }> = [];
    for (const abs of files) {
      const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
      const source = fs.readFileSync(abs, "utf8");
      if (!exportsGet(source)) continue;
      const routePath = "/" + rel.replace(/^app/, "").replace(/\/route\.ts$/, "");
      discovered.push({ sourceFile: rel, path: routePath });
    }

    const inventory = new Map(GET_ROUTE_ACCESS.map((row) => [row.sourceFile, row]));
    const missing = discovered.filter((row) => !inventory.has(row.sourceFile));
    expect(missing, JSON.stringify(missing, null, 2)).toEqual([]);

    const stale = GET_ROUTE_ACCESS.filter(
      (row) => !discovered.some((d) => d.sourceFile === row.sourceFile),
    );
    expect(stale, JSON.stringify(stale, null, 2)).toEqual([]);

    const publicFromInventory = GET_ROUTE_ACCESS.filter((row) => row.access === "PUBLIC").map(
      (row) => row.path,
    );
    expect([...publicFromInventory].sort()).toEqual([...PUBLIC_GET_EXCEPTIONS].sort());

    for (const row of GET_ROUTE_ACCESS) {
      const source = fs.readFileSync(path.join(process.cwd(), row.sourceFile), "utf8");
      if (row.access === "PUBLIC") {
        expect(PUBLIC_GET_EXCEPTIONS.includes(row.path), row.path).toBe(true);
        continue;
      }
      expect(hasReadGuard(source), `GET ${row.path} missing read auth guard`).toBe(true);
    }

    expect(GET_ROUTE_ACCESS.filter((row) => row.access === "PUBLIC")).toHaveLength(
      PUBLIC_GET_EXCEPTIONS.length,
    );
  });
});
