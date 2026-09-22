"use client";

import type { StrategySearchOperatorFormState } from "../formDefaults";
import { COST_STRESS_HELP, COST_STRESS_LABEL } from "./searchVisualCopy";
import {
  SEARCH_SCOPE_FLOW,
  costStressChannelLines,
  costStressChannels,
  familyProgressState,
  isLiveSearchStatus,
  periodScopeDays,
  periodScopeLabel,
  qualificationTargetCopy,
  searchFamilyLabelKo,
  timeframeBarLabel,
  topResultCopy,
  visualizedSearchSpaceIds,
  type SearchScopeProgress,
} from "./searchScopeVisual";
import { SearchFamilyGlyph } from "./SearchFamilyGlyph";
import { shouldRenderRunningVisual } from "./runningVisualModel";
import {
  CandidateBranchVisual,
  CostChannelVisual,
  FamilyNetworkVisual,
  HistoryScanVisual,
  MarketScopeVisual,
  QualificationTargetVisual,
  SearchProgressRing,
  TopResultVisual,
} from "./ScopeCardVisuals";

export function StrategySearchScopeMap({
  form,
  automatic,
  progress,
}: {
  form: StrategySearchOperatorFormState;
  automatic: boolean;
  progress?: SearchScopeProgress | null;
}) {
  const familyIds = visualizedSearchSpaceIds({
    automatic,
    selectedSpaceIds: form.selectedSpaceIds,
  });
  const periodLabel = periodScopeLabel(form.periodPreset);
  const periodDays = periodScopeDays(form.periodPreset);
  const tfLabel = timeframeBarLabel(form.timeframe);
  const cost = costStressChannelLines(form);
  const costChannels = costStressChannels(form);
  const qualification = qualificationTargetCopy(form);
  const top = topResultCopy(progress);
  const running = isLiveSearchStatus(progress?.status);

  return (
    <section
      className={
        "ss-scope-map" + (running ? " ss-scope-map--running" : "")
      }
      data-testid="ss-search-scope-map"
      data-scope-mode={automatic ? "automatic" : "manual"}
      data-search-running={running ? "true" : "false"}
    >
      <header className="ss-scope-map__head ss-section-head">
        <h3 className="ss-section-head__title">탐색 범위</h3>
        <p className="ss-section-head__desc">
          Rextora가 후보를 만들고 과거 데이터로 검증하는 범위입니다. 전략을
          직접 작성하지 않습니다.
        </p>
      </header>

      {shouldRenderRunningVisual(progress?.status) ? null : (
        <SearchProgressRing progress={progress} />
      )}

      <ol className="ss-scope-flow" data-testid="ss-scope-flow">
        {SEARCH_SCOPE_FLOW.map((step) => (
          <li key={step.id} className="ss-scope-flow__item">
            <span className="ss-scope-flow__mark">{step.keyword}</span>
            <strong>{step.title}</strong>
          </li>
        ))}
      </ol>

      <div className="ss-scope-stack">
        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-scope-market"
        >
          <MarketScopeVisual
            symbol={form.symbol}
            timeframe={form.timeframe}
            periodDays={periodDays}
          />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">시장</span>
            <strong data-testid="ss-scope-symbol">{form.symbol}</strong>
            <p>
              <span data-testid="ss-scope-timeframe">{tfLabel}</span>
              {" · "}
              <span data-testid="ss-scope-period">{periodLabel}</span>
            </p>
          </div>
        </article>

        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-scope-families"
        >
          <FamilyNetworkVisual familyIds={familyIds} />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">전략군</span>
            <strong>탐색 대상 {familyIds.length}개</strong>
            <p className="ss-helper">
              {automatic
                ? "자동으로 여러 전략군을 나눠 탐색합니다."
                : "선택한 전략군을 각각 별도로 탐색합니다. 하나의 결합 전략이 아닙니다."}
            </p>
            <ul className="ss-scope-chips">
              {familyIds.map((id) => {
                const familyState = familyProgressState(
                  id,
                  progress?.searchProgression,
                  progress?.currentSearchFamily,
                );
                return (
                  <li
                    key={id}
                    data-testid={`ss-scope-family-${id}`}
                    data-family-state={familyState}
                    className={
                      familyState === "active"
                        ? "ss-scope-chip--active"
                        : familyState === "completed"
                          ? "ss-scope-chip--done"
                          : undefined
                    }
                  >
                    {familyState === "completed" ? (
                      <span className="ss-scope-chip__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                    <SearchFamilyGlyph id={id} />
                    {searchFamilyLabelKo(id)}
                    {familyState === "active" ? (
                      <span className="ss-sr-only">진행 중</span>
                    ) : familyState === "completed" ? (
                      <span className="ss-sr-only">완료</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </article>

        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-scope-candidates"
        >
          <CandidateBranchVisual branchCount={familyIds.length} />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">후보 생성</span>
            <strong>파라미터 조합 생성</strong>
            <p>선택한 전략군에서 후보 전략을 만들어 평가합니다.</p>
          </div>
        </article>

        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-scope-history"
        >
          <HistoryScanVisual periodDays={periodDays} />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">과거 검증</span>
            <strong>과거 데이터 검증</strong>
            <p data-testid="ss-scope-history-line">
              {form.symbol} · {form.timeframe} · {periodLabel}
            </p>
          </div>
        </article>

        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-cost-summary"
        >
          <CostChannelVisual channels={costChannels} />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">비용 / 검증</span>
            <strong>{COST_STRESS_LABEL}</strong>
            <p className="ss-helper">{COST_STRESS_HELP}</p>
            {cost.enabled ? (
              <ul
                className="ss-scope-cost-lines"
                data-testid="ss-cost-summary-line"
              >
                {cost.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p data-testid="ss-cost-summary-line">
                비용 스트레스가 꺼져 있습니다.
              </p>
            )}
          </div>
        </article>

        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-scope-qualified-target"
        >
          <QualificationTargetVisual
            target={qualification.target}
            qualifiedCount={progress?.qualifiedCount}
          />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">합격 목표</span>
            <strong>{qualification.title}</strong>
            <p>{qualification.hint}</p>
          </div>
        </article>

        <article
          className="ss-scope-card ss-scope-card--visual"
          data-testid="ss-scope-top-results"
          data-top-state={top.state}
        >
          <TopResultVisual top10Count={progress?.top10Count ?? null} />
          <div className="ss-scope-card__copy">
            <span className="ss-scope-card__kicker">결과</span>
            <strong>{top.title}</strong>
            <p>{top.detail}</p>
          </div>
        </article>
      </div>
    </section>
  );
}
