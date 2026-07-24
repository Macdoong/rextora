import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverOrphanSearchJobs } from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import type { StrategySearchStoreOptions } from "../src/lib/rextora/strategySearch/jobStore";

const tempRoots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-orphan-"));
  tempRoots.push(root);
  return { rootDir: root };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("recoverOrphanSearchJobs", () => {
  it("returns empty resume set when no jobs exist", () => {
    const store = tempStore();
    const result = recoverOrphanSearchJobs(store);
    expect(result.scanned).toBe(0);
    expect(result.resumed).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("skips jobs that are already active in-process", async () => {
    const store = tempStore();
    const registry = await import(
      "../src/lib/rextora/strategySearch/jobExecutionRegistry"
    );
    const jobApi = await import(
      "../src/lib/rextora/strategySearch/jobApiService"
    );
    const jobStore = await import("../src/lib/rextora/strategySearch/jobStore");

    const startSpy = vi
      .spyOn(jobApi, "startStrategySearchJobApi")
      .mockImplementation(() => ({ ok: true } as never));
    vi.spyOn(registry, "isSearchJobExecutionActive").mockReturnValue(true);
    vi.spyOn(jobStore, "listSearchJobs").mockReturnValue([
      {
        id: "search_orphan_test",
        status: "running",
        updatedAt: new Date().toISOString(),
      } as never,
    ]);

    const result = recoverOrphanSearchJobs(store);
    expect(result.skipped).toContain("search_orphan_test");
    expect(result.resumed).not.toContain("search_orphan_test");
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("resumes disk-running job that is not active in-process", async () => {
    const store = tempStore();
    const registry = await import(
      "../src/lib/rextora/strategySearch/jobExecutionRegistry"
    );
    const jobApi = await import(
      "../src/lib/rextora/strategySearch/jobApiService"
    );
    const jobStore = await import("../src/lib/rextora/strategySearch/jobStore");

    const startSpy = vi
      .spyOn(jobApi, "startStrategySearchJobApi")
      .mockImplementation(() => ({ ok: true } as never));
    vi.spyOn(registry, "isSearchJobExecutionActive").mockReturnValue(false);
    vi.spyOn(jobStore, "listSearchJobs").mockReturnValue([
      {
        id: "search_resume_me",
        status: "running",
        updatedAt: new Date().toISOString(),
      } as never,
    ]);

    const result = recoverOrphanSearchJobs(store);
    expect(result.resumed).toContain("search_resume_me");
    expect(startSpy).toHaveBeenCalledWith("search_resume_me", {
      storeOptions: store,
    });
  });
});
