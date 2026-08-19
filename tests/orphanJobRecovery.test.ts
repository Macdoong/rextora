import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recoverOrphanSearchJobs,
  resolveOrphanAutoResumeLimit,
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
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
    vi.spyOn(registry, "isSearchJobExecutionWorkerActive").mockReturnValue(true);
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
    vi.spyOn(registry, "isSearchJobExecutionWorkerActive").mockReturnValue(false);
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

  it("defaults auto-resume to 0 in development and the production cap otherwise", () => {
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).toBe(0);
    expect(
      resolveOrphanAutoResumeLimit({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT);
    expect(
      resolveOrphanAutoResumeLimit({
        NODE_ENV: "development",
        REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "3",
      } as NodeJS.ProcessEnv),
    ).toBe(3);
  });

  it("caps auto-resumes per boot so shared-disk orphans cannot stampede one process", async () => {
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
    vi.spyOn(registry, "isSearchJobExecutionWorkerActive").mockReturnValue(false);
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `search_resume_${i}`,
      status: i % 2 === 0 ? "running" : "queued",
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    }));
    vi.spyOn(jobStore, "listSearchJobs").mockReturnValue(many as never);
    vi.stubEnv("REXTORA_ORPHAN_AUTO_RESUME_LIMIT", "2");

    const result = recoverOrphanSearchJobs(store);
    expect(result.resumed).toHaveLength(2);
    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(result.skipped.length).toBeGreaterThanOrEqual(6);
  });
});
