import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DRY_RUN_SUBMIT_PATH,
  submitDryRunOrder,
  advanceDryRunOrder,
  emergencyStopDryRun,
} from "../src/lib/rextora/live/liveDryRunEngine";
import {
  evaluateHighlightEligibility,
  metricStatusKo,
} from "../src/lib/rextora/results/eligibility";
import { isTestStrategyRecord } from "../src/lib/rextora/strategy/strategyTestFilter";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";

const ROOT = path.resolve(__dirname, "..");

describe("lifecycle redesign fixes", () => {
  it("sidebar has exactly seven primary items in order", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/rextora/Sidebar.tsx"),
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
    let last = -1;
    for (const label of labels) {
      const idx = src.indexOf(label);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
    for (const banned of [
      "고급 전략 편집",
      "전략 성과",
      "멀티코인 감시",
      "거래 기록",
      "AI 분석 보고",
      "리스크 관리",
    ]) {
      expect(src).not.toContain(banned);
    }
  });

  it("advanced settings default collapsed and isolated from five-field workflow", () => {
    const defaults = createDefaultOperatorFormState();
    expect(defaults.showAdvanced).toBe(false);
    const form = fs.readFileSync(
      path.join(ROOT, "components/rextora/strategySearch/JobCreateForm.tsx"),
      "utf8",
    );
    expect(form).toMatch(/open=\{form\.showAdvanced\}/);
    expect(form).toContain("탐색 대상");
    expect(form).toContain("탐색 시간");
    expect(form).toContain("초보자 프리셋");
    expect(form).toContain("최대 허용 낙폭");
    expect(form).toContain("탐색 기준");
  });

  it("research workbench does not embed full qualified library", () => {
    const src = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).not.toContain("<QualifiedResultsPanel");
    expect(src).toContain("ss-open-results");
  });

  it("highlight eligibility rejects invalid stability candidates", () => {
    const bad = evaluateHighlightEligibility({
      hasBacktest: true,
      totalReturn: 0.01,
      mdd: 0.001,
      tradeCount: 0,
      passed: false,
    });
    expect(bad.eligible).toBe(false);
    expect(bad.messageKo).toBeTruthy();

    const good = evaluateHighlightEligibility({
      hasBacktest: true,
      totalReturn: 0.12,
      mdd: -0.08,
      tradeCount: 20,
      passed: true,
    });
    expect(good.eligible).toBe(true);
  });

  it("metric status explains missing values", () => {
    expect(
      metricStatusKo({
        hasBacktest: false,
        totalReturn: null,
        tradeCount: null,
        passed: null,
      }),
    ).toBe("백테스트 필요");
  });

  it("filters known verification artifact names", () => {
    expect(
      isTestStrategyRecord({
        id: "x",
        name: "lifecycle-browser-verify",
      } as never),
    ).toBe(true);
    expect(
      isTestStrategyRecord({
        id: "y",
        name: "검증용복사_persist",
        metadata: { testData: true },
      } as never),
    ).toBe(true);
  });

  it("backtest default UI hides expert manual action", () => {
    const src = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/backtest/BacktestReviewWorkbench.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("expertMode || expertQuery");
    expect(src).toContain("backtest-paper-action");
    expect(src).toContain("backtest-live-action");
    expect(src).toContain("선택된 전략이 없어 보호 기준 전략 SAFE를 표시합니다.");
  });

  it("paper page has one control bar and canonical status mapping", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/paper-trading/page.tsx"),
      "utf8",
    );
    expect(src).toContain("paper-control-bar");
    expect(src).toContain("paper-canonical-status");
    expect(src).toContain('CanonicalPaperStatus');
    expect(src).not.toContain("모의 매매 중지");
    expect(src).toContain("paper-strategy-loading");
  });

  it("settings shell exposes eight lifecycle tabs", () => {
    const src = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/settings/LifecycleSettingsShell.tsx",
      ),
      "utf8",
    );
    for (const label of [
      "데이터",
      "거래 비용",
      "탐색 엔진",
      "거래소 연결",
      "위험 제한",
      "알림",
      "시스템 상태",
      "전문가 모드",
    ]) {
      expect(src).toContain(label);
    }
  });

  describe("live dry-run transitions", () => {
    let rootDir: string;
    beforeEach(() => {
      rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-dry-fix-"));
    });
    afterEach(() => {
      fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it("persists full submit path transitions", () => {
      const rec = submitDryRunOrder(
        {
          executionKey: "k1",
          strategyId: "strat_a",
          strategyHash: "hash_a",
          symbol: "BTCUSDT",
          side: "BUY",
          quantity: 0.01,
        },
        { rootDir },
      );
      expect(rec.state).toBe("DRY_RUN_SUBMITTED");
      expect(rec.transitions.map((t) => t.newState)).toEqual([
        ...DRY_RUN_SUBMIT_PATH,
      ]);
      expect(rec.exchangeCalled).toBe(false);

      const filled = advanceDryRunOrder(
        "k1",
        "FILLED",
        "simulated fill",
        { rootDir },
      );
      expect(filled.state).toBe("FILLED");
      expect(filled.transitions.at(-1)?.previousState).toBe("DRY_RUN_SUBMITTED");

      emergencyStopDryRun({ reason: "halt" }, { rootDir });
      const blocked = submitDryRunOrder(
        {
          executionKey: "k2",
          strategyId: "strat_a",
          strategyHash: "hash_a",
          symbol: "BTCUSDT",
          side: "BUY",
          quantity: 0.01,
        },
        { rootDir },
      );
      expect(blocked.state).toBe("EMERGENCY_STOPPED");
    });
  });
});
