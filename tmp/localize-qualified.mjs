import fs from "node:fs";

const p =
  "c:/Rextora/components/rextora/strategySearch/QualifiedResultsPanel.tsx";
let s = fs.readFileSync(p, "utf8");

const reps = [
  ['return "Registered";', 'return "등록됨";'],
  ['return "Already Registered";', 'return "이미 등록됨";'],
  ['return "Not Registered";', 'return "미등록";'],
  [
    '{props.pending ? "Registering…" : props.confirmLabel}',
    '{props.pending ? "등록 중…" : props.confirmLabel}',
  ],
  [">Cancel<", ">취소<"],
  ["Back to Research", "탐색으로 돌아가기"],
  [">Overview<", ">개요<"],
  [
    "aria-label={`Recommendation ${stars.stars} of 5`}",
    "aria-label={`추천 ${stars.stars}점 / 5점`}",
  ],
  [
    '<Badge tone="success">Approved</Badge>',
    '<Badge tone="success">합격</Badge>',
  ],
  ["Why AI Selected This", "AI가 선택한 이유"],
  [">Performance<", ">성과<"],
  ['label="Return"', 'label="수익률"'],
  ['label="Max Loss"', 'label="최대 낙폭"'],
  ['label="Win Rate"', 'label="승률"'],
  ['label="Profit Factor"', 'label="손익비"'],
  ['label="Trades"', 'label="거래 수"'],
  ['label="Sharpe"', 'label="샤프"'],
  ["Entry Logic", "진입 로직"],
  ["Exit Logic", "청산 로직"],
  [">Risk<", ">위험<"],
  [">Stop<", ">손절<"],
  [">Take Profit<", ">익절<"],
  [">Parameters<", ">파라미터<"],
  ["Technical Details", "기술 정보"],
  ["Internal score:", "내부 점수:"],
  ["Iteration:", "반복:"],
  ["Cost validation:", "비용 검증:"],
  ["Stability:", "안정성:"],
  [">Open Strategy<", ">전략 열기<"],
  [">Register<", ">등록<"],
  ['? "Approved"', '? "합격"'],
  [': item.status || "Validated"', ': item.status || "검증됨"'],
  ['label="Validation"', 'label="검증 상태"'],
  [">View<", ">보기<"],
  [
    '<span className="text-xs text-slate-500">Already Registered</span>',
    '<span className="text-xs text-[var(--text-muted)]">이미 등록됨</span>',
  ],
  ["No strategy met your goal.", "목표를 충족한 전략이 없습니다."],
  ["Suggested improvements", "개선 제안"],
  ["Increase budget", "후보 예산 늘리기"],
  ["Extend period", "기간 늘리기"],
  ["Relax drawdown", "최대 낙폭 완화"],
  ["Reduce minimum trades", "최소 거래 수 줄이기"],
  [">Start New Research<", ">새 탐색<"],
  [
    '"Approved strategies will appear here when research finds them."',
    '"합격 전략이 발견되면 여기에 표시됩니다."',
  ],
  ["Approved Strategies", "합격 전략"],
  [
    'Register{selectedCount > 0 ? ` (${selectedCount})` : ""}',
    '등록{selectedCount > 0 ? ` (${selectedCount})` : ""}',
  ],
  ["Registered {summary.registered}", "등록 {summary.registered}건"],
  [
    " · Already Registered ${summary.duplicate}",
    " · 이미 등록됨 ${summary.duplicate}건",
  ],
  [" · Failed ${summary.failed}", " · 실패 ${summary.failed}건"],
  ['aria-label="Filter"', 'aria-label="필터"'],
  ['["all", "All"]', '["all", "전체"]'],
  ['["not_registered", "Not Registered"]', '["not_registered", "미등록"]'],
  ['["registered", "Registered"]', '["registered", "등록됨"]'],
  [">Sort\n", ">정렬\n"],
  ['<option value="return">Return</option>', '<option value="return">수익률</option>'],
  ['<option value="mdd">Max Loss</option>', '<option value="mdd">최대 낙폭</option>'],
  ['<option value="trades">Trades</option>', '<option value="trades">거래 수</option>'],
  ['<option value="winRate">Win Rate</option>', '<option value="winRate">승률</option>'],
  [">Recommended<", ">추천 전략<"],
  ["More approved strategies", "나머지 합격 전략"],
  ['title="Register Strategy"', 'title="전략 등록"'],
  [
    '"Register this approved strategy into Strategy Management? Nothing is saved automatically."',
    '"선택한 합격 전략을 전략 관리에 등록할까요? 자동으로 저장되지 않습니다."',
  ],
  [
    "`Register ${pendingIterations.length} strategies into Strategy Management? Nothing is saved automatically.`",
    "`선택한 ${pendingIterations.length}개 전략을 전략 관리에 등록할까요? 자동으로 저장되지 않습니다.`",
  ],
  ['confirmLabel="Register"', 'confirmLabel="등록"'],
  // technical details pass labels (after Cost validation: already applied)
  ["{item.stressPass ? \"passed\" : \"not passed\"}", '{item.stressPass ? "통과" : "미통과"}'],
  [
    'item.jitterPass === true\n                    ? "passed"\n                    : item.jitterPass === false\n                      ? "not passed"\n                      : "n/a"',
    'item.jitterPass === true\n                    ? "통과"\n                    : item.jitterPass === false\n                      ? "미통과"\n                      : "해당 없음"',
  ],
];

for (const [a, b] of reps) {
  if (!s.includes(a)) {
    console.log("MISSING:", JSON.stringify(a).slice(0, 80));
  } else {
    s = s.split(a).join(b);
  }
}

const oldEmpty = `  if (items.length === 0) {
    if (props.researchCompleted) {
      return (
        <section
          className="rextora-card space-y-4 p-6"
          data-testid="ss-qualified-results"
        >
          <h3 className="text-lg font-semibold text-white">
            목표를 충족한 전략이 없습니다.
          </h3>
          <p className="text-sm text-slate-300">개선 제안</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>후보 예산 늘리기</li>
            <li>기간 늘리기</li>
            <li>최대 낙폭 완화</li>
            <li>최소 거래 수 줄이기</li>
          </ul>
          {props.onNewResearch ? (
            <Button
              type="button"
              data-testid="ss-empty-new-research"
              onClick={props.onNewResearch}
            >
              새 탐색
            </Button>
          ) : null}
        </section>
      );
    }
    return (
      <section
        className="rextora-card p-6 text-sm rx-text-muted"
        data-testid="ss-qualified-results"
      >
        {props.emptyHint ??
          "합격 전략이 발견되면 여기에 표시됩니다."}
      </section>
    );
  }`;

const newEmpty = `  if (items.length === 0) {
    if (props.researchCompleted) {
      return (
        <section
          className="ss-empty-card space-y-4"
          data-testid="ss-qualified-results"
        >
          <h3 className="ss-section-title">
            목표를 충족한 전략이 없습니다.
          </h3>
          <p className="text-[0.9375rem] text-[var(--text-secondary)]">
            개선 제안
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[0.9375rem] text-[var(--text-secondary)]">
            <li>후보 예산 늘리기</li>
            <li>기간 늘리기</li>
            <li>최대 낙폭 완화</li>
            <li>최소 거래 수 줄이기</li>
          </ul>
          {props.onNewResearch ? (
            <Button
              type="button"
              className="ss-btn-primary"
              data-testid="ss-empty-new-research"
              onClick={props.onNewResearch}
            >
              새 탐색
            </Button>
          ) : null}
        </section>
      );
    }
    return (
      <section
        className="ss-empty-card space-y-2"
        data-testid="ss-qualified-results"
      >
        <h3 className="ss-section-title">합격 전략 대기 중</h3>
        <p className="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {props.emptyHint ??
            "탐색을 시작하면 기준을 통과한 전략이 이곳에 표시됩니다."}
        </p>
      </section>
    );
  }`;

if (s.includes(oldEmpty)) {
  s = s.replace(oldEmpty, newEmpty);
  console.log("EMPTY_UPDATED");
} else {
  console.log("EMPTY_NOT_FOUND_exact");
  // fallback: replace waiting empty only
  s = s.replace(
    /className="rextora-card p-6 text-sm rx-text-muted"/,
    'className="ss-empty-card space-y-2"',
  );
}

// section titles
s = s.replace(
  'className="text-lg font-semibold tracking-tight text-white"',
  'className="ss-section-title"',
);

fs.writeFileSync(p, s);
const leftover = [
  "Register",
  "Approved",
  "Already",
  "Start New",
  "Recommended",
  "View",
  "Open Strategy",
  "Return",
  "Max Loss",
  "Win Rate",
  "Technical Details",
  "Overview",
  "Performance",
].filter((w) => s.includes(`>${w}<`) || s.includes(`"${w}"`) || s.includes(`>${w}\n`));
console.log("possible leftover markers", leftover);
console.log("has 합격 전략 대기 중", s.includes("합격 전략 대기 중"));
