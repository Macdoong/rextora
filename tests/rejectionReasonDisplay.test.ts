import { describe, expect, it } from "vitest";
import {
  buildRejectionTooltipLines,
  formatPatternZoneChartLabel,
  formatRejectionReasonForDisplay,
  formatRejectionReasonKo,
} from "../src/lib/rextora/backtest/patternExplainability";

describe("rejection reason display", () => {
  it("formats raw enum codes for production UI", () => {
    expect(formatRejectionReasonKo("penetration_too_shallow")).toBe(
      "되돌림 깊이 부족",
    );
    expect(formatRejectionReasonKo("order_block_rejected_penetration_too_shallow")).toBe(
      "되돌림 깊이 부족",
    );
    expect(formatRejectionReasonKo("order_block_rejected_sequence_order_failed")).toBe(
      "패턴 순서 불일치",
    );
    expect(formatRejectionReasonKo("pattern_invalidated")).toBe("실제 무효화");
    expect(formatRejectionReasonKo("confirmation_timeout")).toBe("확인 조건 실패");
  });

  it("keeps raw enum only in developer mode", () => {
    expect(
      formatRejectionReasonForDisplay("penetration_too_shallow"),
    ).toBe("되돌림 깊이 부족");
    expect(
      formatRejectionReasonForDisplay("penetration_too_shallow", {
        developerMode: true,
      }),
    ).toBe("되돌림 깊이 부족 (penetration_too_shallow)");
  });

  it("builds chart-safe rejection tooltips", () => {
    expect(
      buildRejectionTooltipLines("penetration_too_shallow", [], {
        developerMode: false,
      }),
    ).toEqual(["설정 거절", "사유: 되돌림 깊이 부족"]);
    expect(
      buildRejectionTooltipLines("penetration_too_shallow", [], {
        developerMode: true,
      }),
    ).toContain("enum: penetration_too_shallow");
  });

  it("uses friendly pattern labels on chart zones", () => {
    expect(formatPatternZoneChartLabel("order_block")).toBe("오더블럭");
    expect(formatPatternZoneChartLabel("order_block", 2)).toBe(
      "오더블럭 · 접촉 2회",
    );
    expect(formatPatternZoneChartLabel("order_block")).not.toContain(
      "order_block_rejected",
    );
  });
});
