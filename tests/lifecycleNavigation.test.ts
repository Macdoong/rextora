import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { recommendStrategyAction } from "../src/lib/rextora/results/recommendation";
import {
  buildOrderBlockLongSequence,
  validateEventSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";

describe("lifecycle navigation", () => {
  it("sidebar exposes exactly seven primary menus", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/Sidebar.tsx"),
      "utf8",
    );
    const labels = [
      "대시보드",
      "전략 탐색",
      "탐색 결과",
      "백테스트",
      "모의 매매",
      "실전 매매",
      "시스템 설정",
    ];
    for (const label of labels) {
      expect(src).toContain(`["${label}"`);
    }
    for (const removed of [
      "고급 전략 편집",
      "전략 성과",
      "멀티코인 감시",
      "거래 기록",
      "AI 분석 보고",
      "리스크 관리",
      "시스템 상태",
    ]) {
      expect(src).not.toContain(`["${removed}"`);
    }
    expect(src).toContain('"/results"');
    expect(src).toContain('"/settings"');
  });

  it("default backtest page supports strategy+date Run without expert params", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "app/backtest/page.tsx"),
      "utf8",
    );
    expect(page).toContain("BacktestReviewWorkbench");
    expect(page).toContain('expert === "1"');
    const review = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      ),
      "utf8",
    );
    expect(review).toContain("backtest-review-workbench");
    expect(review).toContain('data-testid="backtest-run"');
    expect(review).toContain('data-testid="backtest-from"');
    expect(review).toContain("모의매매 등록");
    expect(review).toContain("실전 후보 등록");
    expect(review).toContain("결과 다운로드");
    expect(review).not.toContain("초기 자본");
    expect(review).not.toContain("비용 스트레스");
    expect(review).not.toContain("안전 계수");
    expect(review).not.toContain("기본 진입 비중");
  });

  it("legacy routes redirect to lifecycle pages", () => {
    const checks: Array<[string, string]> = [
      ["app/strategy-performance/page.tsx", "/results"],
      ["app/ai-reports/page.tsx", "/results"],
      ["app/market-watch/page.tsx", "/strategy-search"],
      ["app/trades/page.tsx", "/paper-trading"],
      ["app/risk/page.tsx", "/settings#risk"],
      ["app/system-status/page.tsx", "/settings#system"],
    ];
    for (const [file, target] of checks) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).toContain("redirect");
      expect(src).toContain(target);
    }
  });

  it("manual wizard is expert-gated", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/strategies/page.tsx"),
      "utf8",
    );
    expect(src).toContain('expert === "1"');
    expect(src).toContain('redirect("/strategy-search")');
  });
});

describe("results recommendation", () => {
  it("protects SAFE and ranks paper/live correctly", () => {
    expect(
      recommendStrategyAction({
        totalReturn: 1,
        mdd: -0.1,
        tradeCount: 50,
        passed: true,
        paperActive: false,
        liveActive: false,
        isSafe: true,
      }).code,
    ).toBe("protected_safe");
    expect(
      recommendStrategyAction({
        totalReturn: 0.2,
        mdd: -0.1,
        tradeCount: 20,
        passed: true,
        paperActive: false,
        liveActive: false,
        isSafe: false,
      }).labelKo,
    ).toContain("모의매매");
  });
});

describe("event sequence schema", () => {
  it("validates ordered OB sequence and rejects invalid order", () => {
    const seq = buildOrderBlockLongSequence({
      penetrationPct: 0.5,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 20,
    });
    expect(validateEventSequence(seq).ok).toBe(true);
    const bad = {
      ...seq,
      steps: [...seq.steps].reverse(),
    };
    expect(validateEventSequence(bad).ok).toBe(false);
  });
});

describe("SAFE hash fingerprint", () => {
  it("matches expected protected hash on disk", () => {
    const file = path.join(
      process.cwd(),
      "data",
      "strategies",
      "SAFE_v44_i4060.json",
    );
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
      params_hash?: string;
      paramsHash?: string;
    };
    const hash = json.params_hash ?? json.paramsHash;
    expect(hash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(hash).toBe("7893ca3f0e30");
  });
});
