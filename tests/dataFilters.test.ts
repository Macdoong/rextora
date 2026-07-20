import { describe, expect, it, vi, afterEach } from "vitest";
import { filterUserFacingRecords, isTestOnlySymbol, showTestDataInUi } from "../src/lib/rextora/dataFilters";

describe("dataFilters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects test-only symbols", () => {
    expect(isTestOnlySymbol("TESTUSDT")).toBe(true);
    expect(isTestOnlySymbol("WINRATE_TEST_USDT")).toBe(true);
    expect(isTestOnlySymbol("FOO_TEST_BAR")).toBe(true);
    expect(isTestOnlySymbol("TESTCOIN")).toBe(true);
    expect(isTestOnlySymbol("BTCUSDT")).toBe(false);
  });

  it("shows test data only in test or debug mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REXTORA_SHOW_TEST_DATA", "");
    expect(showTestDataInUi()).toBe(false);

    vi.stubEnv("REXTORA_SHOW_TEST_DATA", "true");
    expect(showTestDataInUi()).toBe(true);
  });

  it("filters test symbols from user-facing records in production mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REXTORA_SHOW_TEST_DATA", "");
    const rows = [
      { symbol: "BTCUSDT" },
      { symbol: "TESTUSDT" },
      { symbol: "WINRATE_TEST_USDT" },
      { symbol: "ALT_TEST_USDT" }
    ];
    const filtered = filterUserFacingRecords(rows, (row) => row.symbol);
    expect(filtered.map((row) => row.symbol)).toEqual(["BTCUSDT"]);
  });
});
