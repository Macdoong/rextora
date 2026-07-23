import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStrategySearchJob,
  isOperationallyActiveStatus,
} from "../components/rextora/strategySearch/apiClient";
import {
  formatErrorDetails,
  mapStrategySearchErrorCode,
} from "../components/rextora/strategySearch/errorMessages";
import {
  createDefaultOperatorFormState,
  goalDefaults,
  intensityBatchSize,
  intensityDefaults,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  buildCreateBodyIfValid,
  validateStrategySearchForm,
} from "../components/rextora/strategySearch/formValidation";
import {
  historyStatusLabelKo,
  researchStatusLabelKo,
  statusLabelKo,
} from "../components/rextora/strategySearch/formatters";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);
const STRATEGIES_DIR = path.join(process.cwd(), "data", "strategies");
const UI_DIR = path.join(
  process.cwd(),
  "components",
  "rextora",
  "strategySearch",
);
const PAGE_PATH = path.join(
  process.cwd(),
  "app",
  "strategy-search",
  "page.tsx",
);

function readUi(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("strategySearch operator UX", () => {
  it("page and workbench expose operator structure", () => {
    const page = fs.readFileSync(PAGE_PATH, "utf8");
    expect(page).toContain("전략 탐색");
    expect(page).toContain("StrategySearchWorkbench");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("JobCreateForm");
    expect(workbench).toContain("JobList");
    expect(workbench).toContain("SearchStatusCard");
    expect(workbench).toContain("QualifiedResultsPanel");
    expect(workbench).toContain("ResearchCompletionPanel");
    expect(workbench).toContain("promoteStrategySearchTrials");
    expect(workbench).toContain("runUntilQualified");
  });

  it("create form hides advanced settings by default", () => {
    const src = readUi("JobCreateForm.tsx");
    expect(src).toContain("ss-advanced-toggle");
    expect(src).toContain("ss-intensity");
    expect(src).toContain("ss-goal");
    expect(src).toContain("ss-run-until-qualified");
    expect(src).toContain("<details");
  });

  it("operator defaults build a valid API body", () => {
    const form = createDefaultOperatorFormState();
    const result = buildCreateBodyIfValid(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.maxIterations).toBe(intensityBatchSize("balanced"));
    expect(result.body.dataRef.source).toBe("binance_historical");
    expect(result.body.evaluationWindows.some((w) => w.requiredForPass)).toBe(
      true,
    );
    expect(result.body.passPolicy.thresholds.maxMdd).toBeLessThan(0);
  });

  it("intensity and goal presets change engine mapping", () => {
    const form = createDefaultOperatorFormState();
    const deep = intensityDefaults("deep");
    const conservative = goalDefaults("conservative");
    form.intensity = "deep";
    form.goal = "conservative";
    form.stressEnabled = deep.stressEnabled;
    form.jitterEnabled = deep.jitterEnabled;
    form.jitterSamples = deep.jitterSamples;
    form.minTradeCount = conservative.minTradeCount;
    form.maxMdd = conservative.maxMdd;
    form.targetReturn = conservative.targetReturn;
    const body = operatorFormToCreateBody(form);
    expect(body.maxIterations).toBe(80);
    expect(body.jitterConfig.enabled).toBe(true);
    expect(body.passPolicy.thresholds.minTradeCount).toBe(20);
  });

  it("blocks empty symbols and invalid max search", () => {
    const form = createDefaultOperatorFormState();
    form.symbols = "";
    form.maxSearchCount = "0";
    const errors = validateStrategySearchForm(form);
    expect(errors.some((e) => e.field === "symbols")).toBe(true);
    expect(errors.some((e) => e.field === "maxSearchCount")).toBe(true);
  });

  it("operator status labels avoid engineering jargon", () => {
    expect(statusLabelKo("running")).toContain("연구");
    expect(researchStatusLabelKo("completed", {
      completionReason: "QUALIFIED_TARGET_REACHED",
    })).toBe("조기 완료");
    expect(researchStatusLabelKo("completed", {
      completionReason: "SEARCH_SPACE_EXHAUSTED",
    })).toBe("완료");
    expect(historyStatusLabelKo("completed", {
      completionReason: "QUALIFIED_TARGET_REACHED",
    })).toBe("조기 종료");
    expect(historyStatusLabelKo("running")).toBe("실행 중");
  });

  it("history list shows operator columns only", () => {
    const src = readUi("JobList.tsx");
    expect(src).toContain("탐색 이름");
    expect(src).toContain("검증");
    expect(src).toContain("합격");
    expect(src).toContain("최고 수익");
    expect(src).toContain("historyStatusLabelKo");
    expect(src).toContain("기록 삭제");
    expect(src).toContain("이전 기록 보기");
    expect(src).not.toContain("checkpoint");
    expect(src).not.toContain("paramsHash");
    expect(src).not.toContain("전략군");
  });

  it("status card separates goal/budget/status and never shows bare progress %", () => {
    const src = readUi("SearchStatusCard.tsx");
    expect(src).toContain("합격 목표");
    expect(src).toContain("연구 예산 사용");
    expect(src).toContain("연구 상태");
    expect(src).toContain("종료 사유");
    expect(src).toContain("pipelineStageLabelKo");
    expect(src).toContain("현재 AI 연구");
    expect(src).toContain("AI가 연구 중입니다");
    expect(src).toContain("탐색 파이프라인");
    expect(src).toContain("기술 정보");
    expect(src).toContain("<details");
    expect(src).not.toContain("ProgressBar");
    expect(src).not.toContain("진행 ${");
    expect(src).not.toContain("overallPct");
    expect(src).not.toContain("paramsHash");
  });

  it("qualified cards prefer readable metrics over score", () => {
    const src = readUi("QualifiedResultsPanel.tsx");
    expect(src).toContain("전략 열기");
    expect(src).toContain("이미 등록됨");
    expect(src).toContain("등록");
    expect(src).toContain("최대 손실");
    expect(src).toContain("AI가 선택한 이유");
    expect(src).toContain("추천");
    expect(src).toContain("개요");
    expect(src).toContain("진입");
    expect(src).toContain("청산");
    expect(src).toContain("위험");
    expect(src).toContain("파라미터");
    expect(src).not.toContain("계산되지 않음");
  });

  it("workbench never auto-promotes on poll or select", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    const api = readUi("apiClient.ts");
    expect(workbench).not.toContain("allPassed");
    expect(workbench).not.toContain("promotePassed");
    expect(api).not.toContain("allPassed");
    expect(workbench).toContain("iterations");
  });

  it("maps API error codes to Korean", () => {
    expect(mapStrategySearchErrorCode("INVALID_REQUEST")).toMatch(/요청/);
    expect(formatErrorDetails("INVALID_REQUEST", ["x"])).toContain(
      "INVALID_REQUEST",
    );
  });

  it("create client posts to strategy-search API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        data: { id: "search_x", status: "queued" },
        meta: {},
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await createStrategySearchJob(
      operatorFormToCreateBody(createDefaultOperatorFormState()),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/rextora/strategy-search",
    );
  });

  it("polling helper treats running as active", () => {
    expect(isOperationallyActiveStatus("running")).toBe(true);
    expect(isOperationallyActiveStatus("completed")).toBe(false);
    expect(isOperationallyActiveStatus("queued", true)).toBe(true);
  });

  it("does not import server strategySearch modules in client UI", () => {
    for (const file of fs.readdirSync(UI_DIR)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const src = readUi(file);
      expect(src).not.toMatch(/from ["']@\/src\/lib\/rextora\/strategySearch/);
      expect(src).not.toMatch(/from ["']\.\.\/\.\.\/src\/lib\/rextora\/strategySearch/);
    }
  });

  it("preserves SAFE file bytes", () => {
    expect(fs.existsSync(SAFE_PATH)).toBe(true);
    const raw = fs.readFileSync(SAFE_PATH, "utf8");
    expect(raw).toContain("7893ca3f0e30");
    expect(fs.readdirSync(STRATEGIES_DIR)).toContain("SAFE_v44_i4060.json");
  });
});
