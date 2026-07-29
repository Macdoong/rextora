import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatRejectionReasonKo,
  isActualInvalidationReason,
  LIFECYCLE_LABEL_KO,
} from "../src/lib/rextora/backtest/patternExplainability";

describe("chart overlay defaults and rejection mapping", () => {
  const src = fs.readFileSync(
    path.join(
      process.cwd(),
      "components/rextora/charts/BacktestAnalysisView.tsx",
    ),
    "utf8",
  );

  it("hides rejected setups by default and auto-selects first trade", () => {
    expect(src).toMatch(/rejected:\s*false/);
    expect(src).toContain("selectedTradeOverride");
    expect(src).toContain("model.trades[0]?.id");
  });

  it("maps rejection codes to canonical Korean meanings", () => {
    expect(formatRejectionReasonKo("penetration_too_shallow")).toBe(
      "되돌림 깊이 부족",
    );
    expect(formatRejectionReasonKo("sequence_order_failed")).toBe(
      "패턴 순서 불일치",
    );
    expect(formatRejectionReasonKo("confirmation_timeout")).toBe(
      "확인 조건 실패",
    );
    expect(formatRejectionReasonKo("pattern_invalidated")).toBe("실제 무효화");
    expect(isActualInvalidationReason("penetration_too_shallow")).toBe(false);
    expect(isActualInvalidationReason("pattern_invalidated")).toBe(true);
    expect(LIFECYCLE_LABEL_KO.creation).toBe("패턴 감지");
    expect(LIFECYCLE_LABEL_KO.revisit).toBe("되돌림 확인");
  });

  it("does not permanently paint raw reason codes into zone labels", () => {
    expect(src).toContain("formatPatternZoneChartLabel");
    expect(src).not.toMatch(/blockId:\s*`rejected:\$\{/);
  });
});
