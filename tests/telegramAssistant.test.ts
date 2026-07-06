import { describe, expect, it } from "vitest";
import { runTelegramTest } from "../src/lib/rextora/telegramOperation";

describe("telegramOperation", () => {
  it("handles telegram test safely without crashing", async () => {
    const result = await runTelegramTest();
    expect(typeof result.ok).toBe("boolean");
    expect(result.message.length).toBeGreaterThan(0);
  }, 10_000);
});
