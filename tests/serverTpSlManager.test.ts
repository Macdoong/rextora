import { describe, expect, it } from "vitest";
import { getTpSlManagerStatus } from "../src/lib/rextora/tpSlManager";
import { getServerTpSlState } from "../src/lib/rextora/serverTpSlManager";

describe("serverTpSlManager", () => {
  it("starts inactive", () => {
    expect(getServerTpSlState().active).toBe(false);
  });

  it("reports manager status", () => {
    const status = getTpSlManagerStatus();
    expect(status.ready).toBe(true);
    expect(status.openTpSlCount).toBe(0);
  });
});
