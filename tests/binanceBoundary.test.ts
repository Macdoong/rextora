import { describe, expect, it } from "vitest";
import { LiveTradeBlockedError, placeFuturesOrder } from "../src/lib/rextora/binance/binanceTradeService";
import { createLiveExecutionContext } from "../src/lib/rextora/serverTpSlManager";

describe("binanceBoundary", () => {
  it("blocks trade without LiveExecutionContext", async () => {
    await expect(placeFuturesOrder({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: 1 })).rejects.toBeInstanceOf(LiveTradeBlockedError);
  });

  it("blocks trade when gate fails", async () => {
    const context = createLiveExecutionContext("confirm");
    if (context) {
      await expect(placeFuturesOrder({ symbol: "BTCUSDT", side: "BUY", type: "MARKET", quantity: 1 }, context)).rejects.toBeInstanceOf(LiveTradeBlockedError);
    } else {
      expect(context).toBeNull();
    }
  });
});
