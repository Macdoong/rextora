import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rextora/strategySearch/jobApiService", () => ({
  getStrategySearchJobApi: vi.fn(),
  resumeStrategySearchJobApi: vi.fn(),
  startStrategySearchJobApi: vi.fn(),
  cancelStrategySearchJobApi: vi.fn(),
  createStrategySearchJobApi: vi.fn(),
  pauseStrategySearchJobApi: vi.fn(),
}));

import {
  getStrategySearchJobApi,
  resumeStrategySearchJobApi,
  startStrategySearchJobApi,
} from "../src/lib/rextora/strategySearch/jobApiService";
import { handleSearchStart } from "../src/lib/rextora/agent/v2/tools/execHandlers";
import { DEFAULT_ORPHAN_AUTO_RESUME_LIMIT } from "../src/lib/rextora/strategySearch/orphanJobRecovery";

describe("Agent interrupted Research resume", () => {
  it("resumes interrupted via resumeStrategySearchJobApi, never auto-resumes", async () => {
    expect(DEFAULT_ORPHAN_AUTO_RESUME_LIMIT).toBe(0);
    vi.mocked(getStrategySearchJobApi).mockReturnValue({
      id: "search_interrupted_fixture",
      status: "interrupted",
      searchName: "fixture",
    } as never);
    vi.mocked(resumeStrategySearchJobApi).mockReturnValue({
      id: "search_interrupted_fixture",
      status: "running",
      searchName: "fixture",
    } as never);

    const result = await handleSearchStart({ jobId: "search_interrupted_fixture" });
    expect(resumeStrategySearchJobApi).toHaveBeenCalledWith(
      "search_interrupted_fixture",
    );
    expect(startStrategySearchJobApi).not.toHaveBeenCalled();
    expect(result.status).toBe("running");
  });

  it("still resumes paused via resumeStrategySearchJobApi", async () => {
    vi.mocked(getStrategySearchJobApi).mockReturnValue({
      id: "search_paused_fixture",
      status: "paused",
      searchName: "fixture",
    } as never);
    vi.mocked(resumeStrategySearchJobApi).mockReturnValue({
      id: "search_paused_fixture",
      status: "running",
      searchName: "fixture",
    } as never);

    await handleSearchStart({ jobId: "search_paused_fixture" });
    expect(resumeStrategySearchJobApi).toHaveBeenCalledWith("search_paused_fixture");
    expect(startStrategySearchJobApi).not.toHaveBeenCalled();
  });
});
