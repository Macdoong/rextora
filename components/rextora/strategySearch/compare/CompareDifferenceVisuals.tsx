"use client";

import {
  compareFieldInventory,
  displayedCompareMagnitude,
  formatCompactCompareDate,
  formatCompareFamilyDisplay,
  pairRelativeBarWidths,
  strategyFamilyZones,
} from "../compareVisual";
import type { SearchJobCompareRow } from "../searchJobComparison";

export type DiffWorkspace = "settings" | "risk" | "families";

function isPeriodSetting(row: SearchJobCompareRow) {
  return row.id === "setting-분석 구간 시작" || row.id === "setting-분석 구간 종료";
}

function numericPair(row: SearchJobCompareRow): { left: number; right: number } | null {
  const leftIsRate = row.left.trim().endsWith("%");
  const rightIsRate = row.right.trim().endsWith("%");
  if (leftIsRate !== rightIsRate) return null;
  const left = displayedCompareMagnitude(row.left);
  const right = displayedCompareMagnitude(row.right);
  if (left == null || right == null || left < 0 || right < 0) return null;
  return { left, right };
}

function SharedValueRow(props: { row: SearchJobCompareRow; value?: string }) {
  return (
    <article className="ss-compare-analysis-row is-shared" data-testid={`ss-compare-diff-${props.row.id}`}>
      <div className="ss-compare-analysis-row__shared-head">
        <h4>{props.row.label}</h4>
        <span>동일</span>
      </div>
      <strong className="ss-compare-analysis-row__shared-value">{props.value ?? props.row.left}</strong>
    </article>
  );
}

function NumericCompareRow(props: { row: SearchJobCompareRow }) {
  const widths = pairRelativeBarWidths(props.row.left, props.row.right);
  return (
    <article className="ss-compare-analysis-row is-numeric" data-testid={`ss-compare-diff-${props.row.id}`}>
      <h4>{props.row.label}</h4>
      <div className="ss-compare-analysis-row__values">
        <strong className="is-left"><span>기준</span>{props.row.left}</strong>
        <span className="ss-sr">두 값 안에서의 상대 크기</span>
        <strong className="is-right"><span>비교</span>{props.row.right}</strong>
      </div>
      <div className="ss-compare-analysis-row__opposed" aria-hidden="true">
        <i className="is-left"><b style={{ width: `${widths.left.widthPct}%` }} /></i>
        <em />
        <i className="is-right"><b style={{ width: `${widths.right.widthPct}%` }} /></i>
      </div>
    </article>
  );
}

function CategoryCompareRow(props: { row: SearchJobCompareRow }) {
  const left = isPeriodSetting(props.row) ? formatCompactCompareDate(props.row.left) : props.row.left;
  const right = isPeriodSetting(props.row) ? formatCompactCompareDate(props.row.right) : props.row.right;
  return (
    <article
      className={`ss-compare-analysis-row is-category${isPeriodSetting(props.row) ? " is-date" : ""}`}
      data-testid={`ss-compare-diff-${props.row.id}`}
    >
      <h4>{props.row.label}</h4>
      <div className="ss-compare-analysis-row__cells">
        <div className="is-left"><span>기준</span><strong>{left}</strong></div>
        <i aria-hidden="true">→</i>
        <div className="is-right"><span>비교</span><strong>{right}</strong></div>
      </div>
    </article>
  );
}

function FamilyCompareRow(props: { row: SearchJobCompareRow }) {
  const zones = strategyFamilyZones(props.row.left, props.row.right);
  return (
    <article className="ss-compare-analysis-row is-family" data-testid={`ss-compare-diff-${props.row.id}`}>
      <h4>{props.row.label}</h4>
      <FamilyGraphic leftOnly={zones.leftOnly} shared={zones.shared} rightOnly={zones.rightOnly} />
    </article>
  );
}

function VisualRows(props: { rows: SearchJobCompareRow[] }) {
  if (props.rows.length === 0) return <p className="ss-compare-workspace-empty">표시할 항목이 없습니다.</p>;
  return (
    <div className="ss-compare-vrows">
      {props.rows.map((row) => {
        if (row.tone === "same") {
          return row.id === "setting-활성 전략 패밀리"
            ? <FamilyCompareRow key={row.id} row={row} />
            : <SharedValueRow
                key={row.id}
                row={row}
                value={isPeriodSetting(row) ? formatCompactCompareDate(row.left) : undefined}
              />;
        }
        if (row.id === "setting-활성 전략 패밀리") return <FamilyCompareRow key={row.id} row={row} />;
        if (isPeriodSetting(row)) return <CategoryCompareRow key={row.id} row={row} />;
        if (numericPair(row)) return <NumericCompareRow key={row.id} row={row} />;
        return <CategoryCompareRow key={row.id} row={row} />;
      })}
    </div>
  );
}

function SegmentMatrix(props: { same: number; different: number; variant: "settings" | "risk" }) {
  const total = props.same + props.different;
  if (total <= 0) return <span className="ss-compare-graphic-empty">—</span>;
  return (
    <span className={`ss-compare-segment-matrix is-${props.variant}`} aria-label={`${total}개 중 ${props.different}개 다름`}>
      {Array.from({ length: total }, (_, index) => (
        <i key={index} className={index < props.different ? "is-diff" : "is-same"} />
      ))}
    </span>
  );
}

function RiskMatrix(props: { same: number; different: number; testId?: string }) {
  const total = props.same + props.different;
  if (total <= 0) return <span className="ss-compare-graphic-empty">—</span>;
  return (
    <span className="ss-compare-risk-matrix" data-testid={props.testId} aria-label={`${props.same}개 동일 · ${props.different}개 다름`}>
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle className="ss-compare-risk-matrix__orbit" cx="66" cy="66" r="57" />
        {Array.from({ length: total }, (_, index) => {
          const angle = -90 + (360 / total) * index;
          const radians = (angle * Math.PI) / 180;
          const x = 66 + Math.cos(radians) * 48;
          const y = 66 + Math.sin(radians) * 48;
          return <circle key={index} className={index < props.different ? "is-diff" : "is-same"} cx={x} cy={y} r="6" />;
        })}
        <text x="66" y="63">{props.same}개 동일</text>
        <text className="is-caption" x="66" y="82">{props.different}개 다름</text>
      </svg>
    </span>
  );
}

function FamilyGraphic(props: { leftOnly: string[]; shared: string[]; rightOnly: string[]; compact?: boolean }) {
  return (
    <div className={`ss-compare-family-graphic${props.compact ? " is-compact" : ""}`}>
      <FamilyZone label="기준 전용" names={props.leftOnly} tone="left" />
      <FamilyZone label="공통" names={props.shared} tone="shared" />
      <FamilyZone label="비교 전용" names={props.rightOnly} tone="right" />
    </div>
  );
}

function FamilyZone(props: { label: string; names: string[]; tone: "left" | "shared" | "right" }) {
  return (
    <div className={`ss-compare-family-zone is-${props.tone}`}>
      <span>{props.label}</span>
      <strong>{props.names.length}</strong>
      <FamilyNames names={props.names} />
    </div>
  );
}

export function CompareDifferenceBoard(props: {
  settings: SearchJobCompareRow[];
  costRisk: SearchJobCompareRow[];
  familyLeft: string;
  familyRight: string;
  panel: DiffWorkspace | null;
  onToggle: (next: DiffWorkspace) => void;
  onOpenRaw: () => void;
}) {
  const settingsInventory = compareFieldInventory(props.settings);
  const differentSettings = props.settings.filter((row) => row.tone === "different");
  const sameSettings = props.settings.filter((row) => row.tone === "same");
  const riskInventory = compareFieldInventory(props.costRisk);
  const differentRisk = props.costRisk.filter((row) => row.tone === "different");
  const families = strategyFamilyZones(props.familyLeft, props.familyRight);
  const familyDiffCount = families.leftOnly.length + families.rightOnly.length;
  const settingsPreview = differentSettings.slice(0, 3);
  const settingsPreviewMore = Math.max(0, differentSettings.length - settingsPreview.length);
  const familySummary =
    familyDiffCount === 0 && families.shared.length > 0
      ? `${families.shared.length}개 전략 모두 공통`
      : families.leftOnly.length + families.shared.length + families.rightOnly.length === 0
        ? "전략 구성 정보 없음"
        : `${families.leftOnly.length}개 기준 전용 · ${families.shared.length}개 공통 · ${families.rightOnly.length}개 비교 전용`;

  return (
    <>
      <div className="ss-compare-diff-selectors" role="tablist" aria-label="주요 차이">
        <button
          type="button"
          role="tab"
          aria-selected={props.panel === "settings"}
          className={props.panel === "settings" ? "is-selected" : undefined}
          data-testid="ss-compare-setting-diffs"
          onClick={() => props.onToggle("settings")}
        >
          <span className="ss-compare-diff-card__title">설정 차이</span>
          <SegmentMatrix same={settingsInventory.same} different={settingsInventory.different} variant="settings" />
          <strong>{settingsInventory.different}<small>개 변경</small></strong>
          {settingsPreview.length > 0 ? (
            <span className="ss-compare-setting-preview" data-testid="ss-compare-setting-preview">
              {settingsPreview.map((row) => (
                <span className="ss-compare-setting-preview__row" key={row.id}>
                  <small>{row.label}</small>
                  <span>
                    {isPeriodSetting(row) ? formatCompactCompareDate(row.left) : row.left}
                    {" → "}
                    {isPeriodSetting(row) ? formatCompactCompareDate(row.right) : row.right}
                  </span>
                </span>
              ))}
              {settingsPreviewMore > 0 ? (
                <span className="ss-compare-setting-preview__more">+ {settingsPreviewMore}개 더 보기</span>
              ) : null}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.panel === "risk"}
          className={props.panel === "risk" ? "is-selected" : undefined}
          data-testid="ss-compare-risk"
          onClick={() => props.onToggle("risk")}
        >
          <span className="ss-compare-diff-card__title">비용·위험</span>
          <RiskMatrix same={riskInventory.same} different={riskInventory.different} testId="ss-compare-risk-counts" />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.panel === "families"}
          className={props.panel === "families" ? "is-selected" : undefined}
          data-testid="ss-compare-families"
          onClick={() => props.onToggle("families")}
        >
          <span className="ss-compare-diff-card__title">전략 구성</span>
          <FamilyGraphic leftOnly={families.leftOnly} shared={families.shared} rightOnly={families.rightOnly} compact />
          <strong data-testid="ss-compare-family-summary">{familySummary}</strong>
        </button>
      </div>
      {props.panel ? (
        <div className="ss-compare-workspace" data-testid="ss-compare-workspace" key={props.panel}>
          <header className="ss-compare-workspace__head">
            <span>{props.panel === "settings" ? "설정 비교" : props.panel === "risk" ? "비용·위험 비교" : "전략 구성 비교"}</span>
            <i aria-hidden="true" />
          </header>
          {props.panel === "settings" ? (
            <>
              {differentSettings.length > 0 ? (
                <VisualRows rows={differentSettings} />
              ) : (
                <p className="ss-compare-workspace-empty">
                  {sameSettings.length > 0 ? "서로 다른 설정이 없습니다." : "표시할 항목이 없습니다."}
                </p>
              )}
              {sameSettings.length > 0 ? (
                <details className="ss-compare-identical-settings" data-testid="ss-compare-identical-settings">
                  <summary
                    id="ss-compare-identical-settings-summary"
                    aria-controls="ss-compare-identical-settings-rows"
                    data-testid="ss-compare-identical-settings-toggle"
                  >
                    <span className="ss-compare-identical-settings__closed">
                      동일한 설정 {sameSettings.length}개 보기
                    </span>
                    <span className="ss-compare-identical-settings__open">동일한 설정 접기</span>
                  </summary>
                  <div
                    id="ss-compare-identical-settings-rows"
                    role="region"
                    aria-labelledby="ss-compare-identical-settings-summary"
                    data-testid="ss-compare-identical-settings-rows"
                  >
                    <VisualRows rows={sameSettings} />
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
          {props.panel === "risk" ? (
            differentRisk.length === 0 ? (
              <div className="ss-compare-risk-equal" data-testid="ss-compare-risk-equal">
                <RiskMatrix same={riskInventory.same} different={riskInventory.different} />
                <button type="button" className="ss-compare-secondary-link" onClick={props.onOpenRaw}>상세 데이터 보기</button>
              </div>
            ) : (
              <VisualRows rows={differentRisk} />
            )
          ) : null}
          {props.panel === "families" ? (
            <FamilyGraphic leftOnly={families.leftOnly} shared={families.shared} rightOnly={families.rightOnly} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function FamilyNames(props: { names: string[] }) {
  if (props.names.length === 0) return <p>없음</p>;
  return (
    <div className="ss-compare-family-chips">
      {props.names.map((name) => <span key={name}>{formatCompareFamilyDisplay(name)}</span>)}
    </div>
  );
}
