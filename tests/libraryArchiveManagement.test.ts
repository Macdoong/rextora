import { describe, expect, it } from "vitest";
import {
  applyLibraryArchiveTag,
  descriptionHasLibraryArchive,
} from "../src/lib/rextora/strategy/libraryArchive";
import { isLibraryArchived } from "../components/rextora/results/libraryFilterUtils";

describe("library archive tag", () => {
  it("adds and removes archive tag without wiping provenance", () => {
    const base = "sourceResearchJobId=search_abc · pattern=order_block";
    const archived = applyLibraryArchiveTag(base, true);
    expect(descriptionHasLibraryArchive(archived)).toBe(true);
    expect(archived).toContain("sourceResearchJobId=search_abc");
    expect(isLibraryArchived({ description: archived })).toBe(true);
    const restored = applyLibraryArchiveTag(archived, false);
    expect(descriptionHasLibraryArchive(restored)).toBe(false);
    expect(restored).toContain("sourceResearchJobId=search_abc");
  });
});
