"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  EXPORT_DOCUMENT_TITLE,
  EXPORT_READ_FAILURE_COPY,
  buildExportFilename,
  loadSearchJobExportModel,
  type SearchJobExportCandidate,
  type SearchJobExportModel,
} from "./searchJobExport";

function CandidateBlock(props: { candidate: SearchJobExportCandidate }) {
  const { candidate } = props;
  return (
    <article className="ss-print-card" data-role={candidate.role}>
      <h3>{candidate.role}</h3>
      <p className="ss-print-name">{candidate.name}</p>
      <p>
        <span className="ss-print-state">{candidate.status}</span>
      </p>
      <dl className="ss-print-metrics">
        <div>
          <dt>수익률</dt>
          <dd>{candidate.returnLabel}</dd>
        </div>
        <div>
          <dt>MDD</dt>
          <dd>{candidate.mddLabel}</dd>
        </div>
        <div>
          <dt>거래 수</dt>
          <dd>{candidate.tradesLabel}</dd>
        </div>
        <div>
          <dt>점수</dt>
          <dd>{candidate.scoreLabel}</dd>
        </div>
      </dl>
      {candidate.reason !== "—" ? (
        <p className="ss-print-reason">{candidate.reason}</p>
      ) : null}
    </article>
  );
}

function ReportBody(props: { model: SearchJobExportModel }) {
  const { model } = props;
  return (
    <div className="ss-print-body">
      <header className="ss-print-header">
        <p className="ss-print-brand">Rextora</p>
        <h1>{EXPORT_DOCUMENT_TITLE}</h1>
        <p className="ss-print-identity">
          {model.searchName}
          <br />
          {model.symbol} · {model.timeframe}
          <br />
          분석 기간 {model.analysisPeriod}
          <br />
          완료 {model.finishedAt}
        </p>
        <p className="ss-print-generated">보고서 생성 {model.generatedAt}</p>
      </header>

      <section className="ss-print-section" data-testid="ss-print-overview">
        <h2>1. 탐색 개요</h2>
        <dl className="ss-print-kv">
          <div>
            <dt>상태</dt>
            <dd>{model.statusLabel}</dd>
          </div>
          <div>
            <dt>시작</dt>
            <dd>{model.startedAt}</dd>
          </div>
          <div>
            <dt>완료</dt>
            <dd>{model.finishedAt}</dd>
          </div>
          <div>
            <dt>소요 시간</dt>
            <dd>{model.elapsed}</dd>
          </div>
        </dl>
      </section>

      <section className="ss-print-section" data-testid="ss-print-settings">
        <h2>2. 탐색 조건</h2>
        <dl className="ss-print-kv">
          {model.configuration.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ss-print-section" data-testid="ss-print-funnel">
        <h2>3. 평가 결과</h2>
        <ol className="ss-print-funnel">
          {model.funnel
            .filter((row) =>
              ["평가 후보", "통과 후보", "최종 적격", "저장 후보", "등록 전략"].includes(
                row.label,
              ),
            )
            .map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </li>
            ))}
        </ol>
        <dl className="ss-print-kv">
          {model.funnel
            .filter((row) =>
              ["통과율", "최종 적격률", "소요 시간"].includes(row.label),
            )
            .map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section className="ss-print-section" data-testid="ss-print-cost">
        <h2>4. 비용 · 위험 가정</h2>
        <dl className="ss-print-kv">
          {model.costRisk.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ss-print-section" data-testid="ss-print-groups">
        <h2>5. 전략군별 추천</h2>
        {model.groups.length === 0 ? (
          <p>표시할 전략군 추천이 없습니다.</p>
        ) : (
          model.groups.map((group) => (
            <div key={group.groupLabel} className="ss-print-group">
              <h3>{group.groupLabel}</h3>
              {group.recommended ? (
                <CandidateBlock candidate={group.recommended} />
              ) : (
                <p>최종 추천 후보 없음</p>
              )}
              {group.rawBest ? (
                <CandidateBlock candidate={group.rawBest} />
              ) : null}
            </div>
          ))
        )}
      </section>

      <section className="ss-print-section" data-testid="ss-print-reasons">
        <h2>6. 추천 근거</h2>
        {model.reasons.length === 0 ? (
          <p>별도 정리된 추천 근거가 없습니다.</p>
        ) : (
          <ul>
            {model.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="ss-print-section" data-testid="ss-print-next">
        <h2>7. 다음 단계</h2>
        {model.nextSteps.length === 0 ? (
          <p>결과 화면에서 등록 또는 백테스트 여부를 선택합니다.</p>
        ) : (
          <ul>
            {model.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        )}
      </section>

      <p className="ss-print-disclaimer">{model.disclaimer}</p>
    </div>
  );
}

export function SearchJobPrintReport() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [model, setModel] = useState<SearchJobExportModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      setError(EXPORT_READ_FAILURE_COPY);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void loadSearchJobExportModel(jobId, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      if (!loaded.ok) {
        setModel(null);
        setError(loaded.error);
        setLoading(false);
        return;
      }
      setModel(loaded.model);
      setError(null);
      setLoading(false);
      document.title = buildExportFilename(
        loaded.model.searchName,
        loaded.model.finishedDate,
        "pdf",
      ).replace(/\.pdf$/, "");
    });
    return () => controller.abort();
  }, [jobId]);

  return (
    <div className="ss-print-page" data-ss-print-report="" data-testid="ss-print-report">
      <div className="ss-print-toolbar ss-print-hide">
        <Link href="/strategy-search" className="ss-print-back">
          전략 탐색으로
        </Link>
        <button
          type="button"
          className="ss-print-action"
          disabled={!model}
          onClick={() => {
            try {
              window.print();
            } catch {
              setError("보고서를 인쇄하지 못했습니다.");
            }
          }}
        >
          인쇄 / PDF 저장
        </button>
      </div>
      {loading ? <p className="ss-print-hide">보고서를 준비하는 중입니다.</p> : null}
      {error ? (
        <p className="ss-export-error" role="alert" data-testid="ss-print-error">
          {error}
        </p>
      ) : null}
      {model ? <ReportBody model={model} /> : null}
    </div>
  );
}
