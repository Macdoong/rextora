import { describe, expect, it } from "vitest";
import { emergencyStopLive, isEmergencyActive } from "../src/lib/rextora/emergencyControls";

describe("emergencyControls", () => {
  it("simulates PAPER emergency stop", async () => {
    const result = await emergencyStopLive("PAPER");
    expect(result.ok).toBe(true);
    expect(isEmergencyActive()).toBe(true);
  });
});
