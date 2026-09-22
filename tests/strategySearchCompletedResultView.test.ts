import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeResultRankPanel,
  resolveDefaultResultRankPanel,
} from "../components/rextora/strategySearch/resultRankPanel";
import { applyGroupChampA } from "../src/lib/rextora/strategySearch/researchEvaluationIdentity";
import {
  GROUP_SAFE,
  topCandidatesForGroup,
} from "../src/lib/rextora/researchRankingReadModel";

const ROOT = process.cwd();
const JOB_ID = "search_e4f63677-41eb-494b-a44c-b09ddcf89614";

function readUi(file: string): string {
  return fs.readFileSync(
    path.join(ROOT, "components", "rextora", "strategySearch", file),
    "utf8",
  );
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Strategy Search completed result view", () => {
  it("A: completed ranking-group job without visible Live TOP10 defaults to 순위 그룹", () => {
    expect(
      resolveDefaultResultRankPanel({
        status: "completed",
        groupAware: true,
        hasVisibleLiveTop10: false,
      }),
    ).toBe("groups");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("resolveDefaultResultRankPanel");
    expect(workbench).toContain('data-testid="ss-result-tab-groups"');
    expect(workbench).toContain("순위 그룹");
  });

  it("A2: group-aware jobs hide the Live TOP10 tab and keep groups + 완료 요약", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    const tabs = workbench.slice(
      workbench.indexOf('aria-label="순위 보기"'),
      workbench.indexOf('data-testid="ss-result-tab-completion"') + 220,
    );
    expect(tabs).toContain("{groupAware ? null : (");
    expect(tabs).toContain('data-testid="ss-result-tab-top10"');
    expect(tabs).toContain('data-testid="ss-result-tab-groups"');
    expect(tabs).toContain('data-testid="ss-result-tab-completion"');
    expect(tabs).toContain("순위 그룹");
    expect(workbench).toContain("완료 요약");
    expect(
      resolveDefaultResultRankPanel({
        status: "completed",
        groupAware: true,
        hasVisibleLiveTop10: true,
      }),
    ).toBe("groups");
  });

  it("B: a manual tab click is not overwritten by later detail polls", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("rankPanelTouchedRef.current = true");
    expect(workbench).toContain("if (rankPanelTouchedRef.current) return");
    expect(workbench).toContain("handleSelect");
    const handleSelect = workbench.slice(
      workbench.indexOf("function handleSelect"),
      workbench.indexOf("function handleSelect") + 700,
    );
    expect(handleSelect).toContain("rankPanelTouchedRef.current = false");
    const defaultAfterPoll = resolveDefaultResultRankPanel({
      status: "completed",
      groupAware: true,
      hasVisibleLiveTop10: false,
    });
    expect(defaultAfterPoll).toBe("groups");
    expect(
      normalizeResultRankPanel({ current: "completion", groupAware: true }),
    ).toBe("completion");
    expect(
      normalizeResultRankPanel({ current: "groups", groupAware: true }),
    ).toBe("groups");
  });

  it("F: switching onto a group-aware job normalizes an invalid top10 tab to groups", () => {
    expect(
      normalizeResultRankPanel({ current: "top10", groupAware: true }),
    ).toBe("groups");
    expect(
      normalizeResultRankPanel({ current: "top10", groupAware: false }),
    ).toBe("top10");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("normalizeResultRankPanel");
    const effect = workbench.slice(
      workbench.indexOf("const groupAwareNow = hasAuthoritativeRankingGroups(detail);"),
      workbench.indexOf("const groupAwareNow = hasAuthoritativeRankingGroups(detail);") +
        520,
    );
    expect(effect).toContain("if (normalized !== current) return normalized");
    expect(effect).toContain("if (rankPanelTouchedRef.current) return current");
  });

  it("C: empty Live TOP10 has no numeric 10 badge", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain('data-testid="ss-top10-empty-panel"');
    expect(workbench).not.toContain("v3-ss-top10-empty__mark");
    const emptySlice = workbench.slice(
      workbench.indexOf('data-testid="ss-top10-empty-panel"'),
      workbench.indexOf('data-testid="ss-top10-empty-panel"') + 900,
    );
    expect(emptySlice).not.toMatch(/>\s*10\s*</);
    expect(workbench).toContain(
      '{rankPanel === "top10" && !groupAware && !hasLiveTop10 ? (',
    );
  });

  it("D: visible Live TOP10 counts use actual entries, not a fixed 10", () => {
    expect(
      resolveDefaultResultRankPanel({
        status: "completed",
        groupAware: false,
        hasVisibleLiveTop10: true,
      }),
    ).toBe("top10");
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain(
      "top10Count: hasLiveTop10 ? liveTop10Entries.length : 0",
    );
    expect(workbench).toContain("hasLiveTop10 = !groupAware && liveTop10Entries.length > 0");
    expect(workbench).toContain('data-testid="ss-result-tab-top10"');
    expect(workbench).toContain("{groupAware ? null : (");
  });

  it("E/F: final recommendation is bestPassed; best score may be a failed candidate", () => {
    const jobPath = path.join(
      ROOT,
      "data",
      "rextora",
      "strategy-search",
      "jobs",
      `${JOB_ID}.json`,
    );
    expect(fs.existsSync(jobPath)).toBe(true);
    const job = JSON.parse(fs.readFileSync(jobPath, "utf8")) as {
      id: string;
      status: string;
      checkpoint: {
        bestByCompatibilityGroup: Array<{
          rankingCompatibilityGroup: string;
          bestCandidate: { score: number; passed: boolean } | null;
          bestPassedCandidate: { score: number; passed: boolean } | null;
        }>;
      };
    };
    expect(job.id).toBe(JOB_ID);
    expect(job.status).toBe("completed");
    const safe = job.checkpoint.bestByCompatibilityGroup.find(
      (row) => row.rankingCompatibilityGroup === GROUP_SAFE,
    );
    expect(safe?.bestPassedCandidate?.score).toBeCloseTo(0.79502227, 5);
    expect(safe?.bestPassedCandidate?.passed).toBe(true);
    expect(safe?.bestCandidate?.score).toBeCloseTo(1.15812667, 5);
    expect(safe?.bestCandidate?.passed).toBe(false);

    const groups = applyGroupChampA(
      [
        {
          rankingCompatibilityGroup: GROUP_SAFE,
          bestCandidate: null,
          bestPassedCandidate: null,
          bestScore: null,
        },
      ],
      GROUP_SAFE,
      {
        candidateId: "high_fail",
        iteration: 1,
        paramsHash: "high_fail",
        score: 1.158,
        passed: false,
      },
    );
    const afterPass = applyGroupChampA(groups, GROUP_SAFE, {
      candidateId: "pass_lower",
      iteration: 2,
      paramsHash: "pass_lower",
      score: 0.795,
      passed: true,
    });
    expect(afterPass[0]?.bestCandidate?.score).toBe(1.158);
    expect(afterPass[0]?.bestCandidate?.passed).toBe(false);
    expect(afterPass[0]?.bestPassedCandidate?.score).toBe(0.795);
    expect(afterPass[0]?.bestPassedCandidate?.passed).toBe(true);

    const card = readUi("ResearchRankingGroupCard.tsx");
    expect(card).toContain("최종 추천");
    expect(card).toContain("최고 점수 후보");
    expect(card).toContain("group.bestPassedCandidate");
    expect(card).toContain("group.bestCandidate");
    expect(card).toContain('data-recommend-flow={flow}');
    expect(card).toContain("최고 점수가 더 높아도");
    expect(card).toContain("미충족이면 추천되지 않습니다");
    const groupsUi = readUi("ResearchRankingGroups.tsx");
    expect(groupsUi).toContain("각 전략군은 독립적으로 평가되며");
  });

  it("G: job-detail ranking snapshot may legally have an empty group shortlist", () => {
    const api = readSrc("src/lib/rextora/strategySearch/jobApiService.ts");
    expect(api).toContain("topCandidates: []");
    expect(
      topCandidatesForGroup(
        [{ rankingCompatibilityGroup: GROUP_SAFE, topCandidates: [] }],
        GROUP_SAFE,
      ),
    ).toEqual([]);
    const card = readUi("ResearchRankingGroupCard.tsx");
    expect(card).toContain("숏리스트 없음");
    expect(card).toContain("이 화면은 그룹 대표만 표시합니다");
  });

  it("H: ranking and scoring source contracts stay on the CHAMP-A path", () => {
    const identity = readSrc(
      "src/lib/rextora/strategySearch/researchEvaluationIdentity.ts",
    );
    expect(identity).toContain("export function applyGroupChampA");
    expect(identity).toContain("ref.passed &&");
    const adapter = readSrc("src/lib/rextora/strategySearch/backtestAdapter.ts");
    expect(adapter).toContain("throwIfEvaluationCancelled");
  });

  it("F/G: recommendation contract and group-aware tabs stay unchanged after mobile layout fix", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("{groupAware ? null : (");
    expect(workbench).toContain('data-testid="ss-result-tab-groups"');
    expect(
      normalizeResultRankPanel({
        current: "top10",
        groupAware: true,
      }),
    ).toBe("groups");
    const card = readUi("ResearchRankingGroupCard.tsx");
    expect(card).toContain("group.bestPassedCandidate");
    expect(card).toContain("group.bestCandidate");
    expect(card).toContain("groupRecommendationLabel");
  });

  it("E: group-aware tab contract and SAFE operator label stay unchanged", () => {
    const workbench = readUi("StrategySearchWorkbench.tsx");
    expect(workbench).toContain("{groupAware ? null : (");
    expect(workbench).toContain('data-testid="ss-result-tab-top10"');
    expect(workbench).toContain('data-testid="ss-result-tab-groups"');
    expect(workbench).toContain("normalizeResultRankPanel");
    expect(
      normalizeResultRankPanel({
        current: "top10",
        groupAware: true,
      }),
    ).toBe("groups");
    const card = readUi("ResearchRankingGroupCard.tsx");
    expect(card).toContain("통합 기술 전략");
    expect(card).toContain("GROUP_SAFE");
    expect(card).toContain("ss-ranking-group-card");
  });
});
