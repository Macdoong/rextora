import { describe, expect, it } from "vitest";
import { BinanceHttpError } from "../src/lib/rextora/binance/binanceHttpClient";
import { mapBinanceDiagnosticError } from "../src/lib/rextora/binance/binanceDiagnosticsService";

describe("binanceDiagnosticsService", () => {
  it("maps -2015 to Korean permission guidance", () => {
    const mapped = mapBinanceDiagnosticError(new BinanceHttpError("Invalid API-key", 401, -2015));
    expect(mapped.reason).toContain("API 키 권한");
    expect(mapped.errorCode).toBe(-2015);
  });

  it("maps -1021 to timestamp guidance", () => {
    const mapped = mapBinanceDiagnosticError(new BinanceHttpError("Timestamp", 400, -1021));
    expect(mapped.reason).toContain("시간");
    expect(mapped.errorCode).toBe(-1021);
  });

  it("maps -1022 to signature guidance", () => {
    const mapped = mapBinanceDiagnosticError(new BinanceHttpError("Signature", 400, -1022));
    expect(mapped.reason).toContain("Secret");
    expect(mapped.errorCode).toBe(-1022);
  });
});
