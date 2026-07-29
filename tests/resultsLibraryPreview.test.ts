import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Results Library preview", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/rextora/results/ResultsWorkbench.tsx"),
    "utf8",
  );

  it("defaults to a 5-row preview with expand/collapse", () => {
    expect(src).toContain("LIBRARY_PREVIEW_LIMIT = 5");
    expect(src).toContain("libraryShowAll");
    expect(src).toContain('data-testid="library-show-all-toggle"');
    expect(src).toContain("전체 보기");
    expect(src).toContain("filtered.slice(0, LIBRARY_PREVIEW_LIMIT)");
  });

  it("does not block primary content on storage-summary", () => {
    expect(src).toContain("refreshPrimary");
    expect(src).toContain("refreshStorageSummary");
    expect(src).toMatch(/storageOpen/);
    expect(src).toContain("deletion-impact");
    expect(src).toContain("historyOpen");
  });
});
