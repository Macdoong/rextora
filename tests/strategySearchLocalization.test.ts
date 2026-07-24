import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultOperatorFormState, operatorFormToCreateBody } from "../components/rextora/strategySearch/formDefaults";
import { buildCreateBodyIfValid } from "../components/rextora/strategySearch/formValidation";

const UI_DIR = path.join(
  process.cwd(),
  "components",
  "rextora",
  "strategySearch",
);
const PAGE = path.join(process.cwd(), "app", "strategy-search", "page.tsx");
const SIDEBAR = path.join(process.cwd(), "components", "rextora", "Sidebar.tsx");
const SAFE = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

function read(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), "utf8");
}

/** Visible English UI phrases that must not appear in Strategy Search screens. */
const FORBIDDEN_VISIBLE = [
  "AI Strategy Research",
  "AI Research",
  "Research Goal",
  "Research Name",
  "Research Depth",
  "Approval Goal",
  "Approved Strategies Needed",
  "Min Trades",
  "Min Return (%)",
  "Max Loss (%)",
  "Advanced Settings",
  "Research Budget",
  "Cost Validation",
  "Stability Validation",
  "Expert Conditions",
  "Min Win Rate (%)",
  "Min Internal Score",
  "Start Research",
  "Approved strategies will appear here",
  "Start New Research",
  "Open Strategy Management",
  "Register Best Strategy",
  "Technical Details",
  "Why AI Selected This",
  "Back to Research",
  "Already Registered",
  "Not Registered",
  "No strategy met your goal",
];

describe("strategy search Korean localization polish", () => {
  it("page title and sidebar are 전략 탐색", () => {
    expect(fs.readFileSync(PAGE, "utf8")).toContain("전략 탐색");
    expect(fs.readFileSync(SIDEBAR, "utf8")).toContain(
      '["전략 탐색", "/strategy-search"]',
    );
  });

  it("visible English UI labels are absent from Strategy Search components", () => {
    const files = [
      PAGE,
      SIDEBAR,
      path.join(UI_DIR, "JobCreateForm.tsx"),
      path.join(UI_DIR, "ExecutionControls.tsx"),
      path.join(UI_DIR, "SearchStatusCard.tsx"),
      path.join(UI_DIR, "QualifiedResultsPanel.tsx"),
      path.join(UI_DIR, "ResearchCompletionPanel.tsx"),
      path.join(UI_DIR, "StrategySearchWorkbench.tsx"),
      path.join(UI_DIR, "JobList.tsx"),
    ];
    const joined = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    for (const phrase of FORBIDDEN_VISIBLE) {
      expect(joined.includes(phrase), `found forbidden: ${phrase}`).toBe(false);
    }
  });

  it("Korean field labels and primary CTA render", () => {
    const form = read("JobCreateForm.tsx");
    expect(form).toContain("탐색 목표 설정");
    expect(form).toContain("탐색 대상");
    expect(form).toContain("탐색 시간");
    expect(form).toContain("초보자 프리셋");
    expect(form).toContain("최대 허용 낙폭");
    expect(form).toContain("탐색 기준");
    expect(form).toContain("고급 설정");
    expect(form).toContain("탐색 시작");
    expect(form).toContain("showAdvanced");
    expect(form).toMatch(/open=\{form\.showAdvanced\}/);
    // Advanced still retains expert controls
    expect(form).toContain("탐색 이름");
    expect(form).toContain("목표 합격 전략 수");
    expect(form).toContain("비용 검증");
    expect(form).toContain("안정성 검증");
    expect(form).toContain("전문가 조건");
  });

  it("advanced groups use Korean titles", () => {
    const form = read("JobCreateForm.tsx");
    for (const title of [
      "데이터",
      "실행 제한",
      "비용 검증",
      "안정성 검증",
      "전문가 조건",
    ]) {
      expect(form).toContain(`title="${title}"`);
    }
  });

  it("empty state renders Korean title and explanation", () => {
    const src = read("QualifiedResultsPanel.tsx");
    expect(src).toContain("합격 전략 대기 중");
    expect(src).toContain("아직 합격 전략이 없습니다");
    expect(src).toContain("연구가 진행 중입니다");
    expect(src).toContain("합격 전략이 없습니다");
    expect(src).toContain(
      "탐색을 시작하면 기준을 통과한 전략이 이곳에 표시됩니다.",
    );
  });

  it("completion panel uses clear Korean research summary fields", () => {
    const src = read("ResearchCompletionPanel.tsx");
    expect(src).toContain("AI 연구 완료");
    expect(src).toContain("연구 시간");
    expect(src).toContain("평가한 후보");
    expect(src).toContain("자원 안전 제한");
    expect(src).toContain("합격 전략");
    expect(src).toContain("최고 전략");
    expect(src).toContain("최고 수익률");
    expect(src).toContain("종료 사유");
  });

  it("history list shows Korean retention note and delete label", () => {
    const src = read("JobList.tsx");
    expect(src).toContain("최근 탐색 기록");
    expect(src).toContain("개를 보관합니다");
    expect(src).toContain("ss-history-retention-note");
    expect(src).toContain("기록 삭제");
    expect(src).toContain("이전 기록 보기");
    const wb = read("StrategySearchWorkbench.tsx");
    expect(wb).toContain("STRATEGY_SEARCH_HISTORY_RETENTION_NOTE");
    expect(wb).toContain("ss-open-results");
    expect(wb).toContain("탐색 결과 열기");
  });

  it("API payload behavior remains unchanged", () => {
    const form = createDefaultOperatorFormState();
    const validated = buildCreateBodyIfValid(form);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const body = validated.body;
    expect(body.operatorPlan).toBeTruthy();
    expect(body.symbols.length).toBeGreaterThan(0);
    expect(body.timeframe).toBeTruthy();
    const again = operatorFormToCreateBody(form);
    expect(again.operatorPlan?.candidateBudget).toBe(
      body.operatorPlan?.candidateBudget,
    );
  });

  it("registration still requires explicit promote path", () => {
    const wb = read("StrategySearchWorkbench.tsx");
    expect(wb).toContain("promoteStrategySearchTrials");
    expect(wb).not.toContain("allPassed");
    expect(wb).toContain("ConfirmDialog");
  });

  it("SAFE research file remains unchanged", () => {
    const buf = fs.readFileSync(SAFE);
    expect(buf.length).toBeGreaterThan(100);
    // hash fingerprint from prior sessions
    const crypto = require("node:crypto") as typeof import("node:crypto");
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    expect(hash).toBe(
      "53a3ab25bb41dda2bae13fe87cdd8f14abfd0b224bca3879becd71667eff7475",
    );
  });
});
