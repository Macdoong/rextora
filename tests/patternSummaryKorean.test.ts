import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPatternSummaryGroups } from "../src/lib/rextora/backtest/patternExplainability";
import type { PatternBlockEvidence } from "../src/lib/rextora/strategy/eventSequenceBacktest";

describe("Pattern Summary Korean redesign", () => {
  it("exposes Korean section titles and hides raw param keys in normal groups", () => {
    const block: PatternBlockEvidence = {
      blockId: "primary",
      family: "order_block",
      role: "entry_zone",
      order: 0,
      status: "detected",
      patternType: "order_block",
      zoneHigh: 100,
      zoneLow: 98,
      creationBar: 1,
      creationTime: "2026-06-11T17:00:00.000Z",
      revisitTime: "2026-06-11T18:00:00.000Z",
      confirmationTime: "2026-06-11T19:00:00.000Z",
      entryTime: "2026-06-11T19:00:00.000Z",
      measured: 0.7,
      threshold: 0.5,
      detectorParams: {
        zoneBasis: "BODY",
        institutionalQuality: true,
        minImpulseAtrMult: 1.2,
      },
      measuredValues: {
        sourceBody: 2,
        impulseBody: 5,
        displacementBodyMult: 2.5,
        bodyEngulfPct: 40,
        penetrationPct: 0.7,
      },
      thresholds: {},
      required: true,
      weight: 1,
      priority: 0,
      stopPrice: 97,
      targetPrice: 105,
      exitReason: "take_profit",
    };
    const groups = buildPatternSummaryGroups(block);
    expect(groups.map((g) => g.title)).toEqual([
      "패턴 감지",
      "생성 조건",
      "오더블럭 영역",
      "진입 검증",
      "위험 관리",
    ]);
    const flat = groups.flatMap((g) => g.rows.map((r) => `${r.label}:${r.value}`)).join("\n");
    expect(flat).toContain("오더블럭");
    expect(flat).toContain("몸통 배율");
    expect(flat).not.toContain("minImpulseAtrMult");
    expect(flat).not.toContain("primary_order_block");
    expect(flat).not.toContain("entry_zone");
  });

  it("Pattern Summary card uses Korean title in BacktestAnalysisView", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain('title="패턴 요약"');
    expect(src).toContain("buildPatternSummaryGroups");
    expect(src).toContain("개발자 정보");
  });
});
