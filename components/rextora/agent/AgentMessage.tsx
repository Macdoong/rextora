"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  AlertCircle,
  ShieldAlert,
  ChevronDown,
  RotateCcw,
  Database,
  Code2,
} from "lucide-react";
import type { AgentResponse } from "@/src/lib/rextora/agent/types";
import { LIFECYCLE_LABEL_KO } from "@/src/lib/rextora/agent/lifecycleStage";
import {
  sanitizePrimaryUserParagraphs,
  sanitizePrimaryUserText,
} from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";
import { ActionCard } from "./ActionCard";

function StreamingAnswer({ text }: { text: string }) {
  const [chars, setChars] = useState(0);

  useEffect(() => {
    let i = 0;
    const step = Math.max(2, Math.ceil(text.length / 40));
    const id = window.setInterval(() => {
      i += step;
      if (i >= text.length) {
        setChars(text.length);
        window.clearInterval(id);
      } else {
        setChars(i);
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [text]);

  const streaming = chars < text.length;
  return (
    <p
      className="whitespace-pre-line font-medium text-slate-50"
      data-streaming={streaming ? "true" : "false"}
    >
      {streaming ? text.slice(0, chars) : text}
      {streaming ? (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-emerald-400/80 align-middle" />
      ) : null}
    </p>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  strategy_store: "전략 저장소",
  backtest_store: "백테스트 저장소",
  strategy_search_jobs: "탐색 작업",
  trading_dashboard: "거래 대시보드",
  risk_engine: "리스크 엔진",
  market_data: "시장 데이터",
  system_status: "시스템 상태",
  paper_session_store: "모의매매 세션",
  lifecycle_context: "현재 화면 컨텍스트",
};

const SOURCE_LINKS: Record<string, string> = {
  strategy_store: "/results#results-section-library",
  backtest_store: "/backtest",
  strategy_search_jobs: "/strategy-search",
  trading_dashboard: "/dashboard",
  risk_engine: "/settings",
  market_data: "/strategy-search",
  system_status: "/settings",
  paper_session_store: "/paper-trading",
  lifecycle_context: "/dashboard",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entityHref(
  scope: AgentResponse["scope"] | null | undefined,
): string | null {
  if (!scope) return null;
  if (scope.jobId) {
    return `/results?jobId=${encodeURIComponent(scope.jobId)}`;
  }
  if (scope.runId) {
    return `/backtest?runId=${encodeURIComponent(scope.runId)}`;
  }
  if (scope.strategyId) {
    return `/backtest?strategyId=${encodeURIComponent(scope.strategyId)}`;
  }
  if (scope.paperSessionId) {
    return `/paper-trading?sessionId=${encodeURIComponent(scope.paperSessionId)}`;
  }
  return null;
}

interface AgentMessageProps {
  query: string;
  response: AgentResponse | null;
  error: string | null;
  isLoading: boolean;
  timestamp?: string;
  onRetry?: () => void;
  onFollowUp?: (text: string) => void;
  onCancelPlan?: () => void;
  /** When true, omit inline approval trio — Approval Center owns it. */
  hideApprovalActions?: boolean;
}

export function AgentMessage({
  query,
  response,
  error,
  isLoading,
  timestamp,
  onRetry,
  onFollowUp,
  onCancelPlan,
  hideApprovalActions = false,
}: AgentMessageProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  const conclusion =
    response?.conclusionKo ||
    response?.interpretationKo?.split("\n\n")[0] ||
    "";
  const explanation =
    response?.explanationKo ||
    response?.interpretationKo?.split("\n\n").slice(1).join("\n\n") ||
    "";
  const recommended =
    response?.reasoningMeta && response?.proposedAction?.requiresApproval
      ? ""
      : response?.recommendedActionKo
        ? response.recommendedActionKo.endsWith(".") ||
          response.recommendedActionKo.endsWith("요") ||
          response.recommendedActionKo.endsWith("?")
          ? response.recommendedActionKo
          : `${response.recommendedActionKo}.`
        : "";
  const fullAnswer = sanitizePrimaryUserParagraphs([conclusion, explanation, recommended]);

  const evidenceLink = entityHref(response?.scope ?? null);
  const hasEvidence =
    (response?.facts.length ?? 0) > 0 || Boolean(response?.scope);

  return (
    <div className="space-y-4" data-testid="agent-message-turn">
      <div className="flex justify-end">
        <div className="flex max-w-[min(42rem,85%)] flex-col items-end gap-1">
          {timestamp ? (
            <time
              className="text-[11px] text-slate-500"
              dateTime={timestamp}
              data-testid="agent-user-timestamp"
            >
              {formatTime(timestamp)}
            </time>
          ) : null}
          <div
            className="rounded-2xl rounded-tr-md bg-sky-600/25 px-4 py-2.5 text-[15px] leading-relaxed text-slate-50 ring-1 ring-inset ring-sky-400/25"
            data-testid="agent-user-bubble"
          >
            {query}
          </div>
        </div>
      </div>

      {isLoading && (
        <div
          className="flex items-start gap-3"
          data-testid="agent-thinking"
          aria-busy="true"
        >
          <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 ring-1 ring-emerald-500/25">
            <BrainCircuit className="size-4 animate-pulse text-emerald-400" />
          </div>
          <div className="flex-1 space-y-2 pt-1.5">
            <p className="text-sm text-slate-400" data-testid="agent-phase-label">
              생각 중…
            </p>
            <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-slate-800" />
            <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-800" />
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-start gap-3">
          <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-600/20 ring-1 ring-rose-500/30">
            <AlertCircle className="size-4 text-rose-400" />
          </div>
          <div
            className="max-w-[min(42rem,92%)] rounded-2xl border border-rose-500/20 bg-rose-950/20 px-4 py-3 text-[15px] text-rose-100"
            data-testid="agent-turn-error"
          >
            <p>{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-400/30 px-3 py-2 font-semibold text-rose-100 hover:bg-rose-500/10"
              >
                <RotateCcw className="size-4" aria-hidden />
                다시 시도
              </button>
            ) : null}
          </div>
        </div>
      )}

      {response && !isLoading && (
        <div className="flex items-start gap-3">
          <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 ring-1 ring-emerald-500/25">
            <BrainCircuit className="size-4 text-emerald-400" />
          </div>

          <div className="min-w-0 max-w-[min(42rem,92%)] flex-1 space-y-3">
            <time
              className="block text-[11px] text-slate-500"
              dateTime={response.respondedAt}
              data-testid="agent-response-timestamp"
            >
              {formatTime(response.respondedAt)}
              {response.lifecycleStage
                ? ` · ${LIFECYCLE_LABEL_KO[response.lifecycleStage]}`
                : ""}
            </time>

            {response.safetyBlocked && response.safetyReasonKo && (
              <div
                className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2.5 text-sm text-amber-100"
                data-testid="agent-safety-banner"
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <span>{response.safetyReasonKo}</span>
              </div>
            )}

            {response.decision?.situationKo && !response.reasoningMeta ? (
              <p
                className="text-xs text-slate-500"
                data-testid="agent-situation"
              >
                {response.decision.situationKo}
              </p>
            ) : null}

            <div
              className="space-y-2.5 text-[15px] leading-relaxed text-slate-100"
              data-testid="agent-conversational-answer"
            >
              <StreamingAnswer
                key={response.respondedAt + fullAnswer.slice(0, 24)}
                text={fullAnswer}
              />
            </div>

            {response.decision?.whyMattersKo &&
            (response.intentType === "follow_up_why" ||
              response.intentType === "explain_rejection" ||
              response.intentType === "explain_waiting") ? (
              <p
                className="text-xs text-slate-400"
                data-testid="agent-explainability-line"
              >
                {response.intentType === "explain_rejection"
                  ? "왜 거부 · "
                  : response.intentType === "explain_waiting"
                    ? "왜 대기 · "
                    : "왜 추천 · "}
                {response.decision.whyMattersKo}
              </p>
            ) : null}

            {response.actions.length > 0 &&
              !(
                hideApprovalActions &&
                (response.proposedAction?.requiresApproval ||
                  response.plan?.requiresApproval)
              ) && (
              <div data-testid="agent-primary-action">
                <ActionCard
                  action={response.actions[0]!}
                  plan={
                    hideApprovalActions
                      ? null
                      : response.plan
                  }
                  compact
                  onCancel={
                    !hideApprovalActions && response.plan?.requiresApproval
                      ? onCancelPlan
                      : undefined
                  }
                />
              </div>
            )}

            {hideApprovalActions &&
            (response.proposedAction?.requiresApproval ||
              response.plan?.requiresApproval) ? (
              <p
                className="text-xs text-amber-200/80"
                data-testid="agent-approval-requirement"
              >
                {response.plan?.typedCommand
                  ? "상단 승인 센터에서 승인하면 이 계획을 한 번 실행합니다."
                  : "상단 승인 센터에서 계획을 검토해 주세요."}
              </p>
            ) : null}

            {response.executionResult ? (
              <div
                className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100"
                data-testid="agent-execution-result"
              >
                <p className="font-semibold">
                  {sanitizePrimaryUserText(
                    response.executionResult.summaryKo ??
                      `실행 상태: ${response.executionResult.executionStatus}`,
                  )}
                </p>
              </div>
            ) : null}

            {hasEvidence && (
              <div
                className="rounded-xl border border-slate-800/80 bg-slate-950/40"
                data-testid="agent-evidence-section"
              >
                <button
                  type="button"
                  onClick={() => setEvidenceOpen((o) => !o)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-slate-400 hover:text-slate-200"
                  aria-expanded={evidenceOpen}
                  data-testid="agent-evidence-toggle"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Database className="size-3.5" />
                    근거 자세히 보기
                  </span>
                  <ChevronDown
                    className={`size-4 transition-transform ${evidenceOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {evidenceOpen && (
                  <div className="space-y-3 border-t border-slate-800/80 px-3 py-3 text-xs text-slate-400">
                    {evidenceLink ? (
                      <Link
                        href={evidenceLink}
                        className="inline-flex text-sky-400/90 hover:underline"
                        data-testid="agent-evidence-entity-link"
                      >
                        관련 검증 화면 열기
                      </Link>
                    ) : (
                      <p data-testid="agent-no-verified-evidence">
                        검증된 증거가 없습니다.
                      </p>
                    )}
                    {response.decision && (
                      <div
                        className="space-y-1 rounded-lg bg-slate-900/60 p-2"
                        data-testid="agent-decision-surface"
                      >
                        <p>
                          <span className="text-slate-500">이해 · </span>
                          {response.decision.situationKo}
                        </p>
                        <p>
                          <span className="text-slate-500">판단 · </span>
                          {response.decision.meaningKo}
                        </p>
                        <p>
                          <span className="text-slate-500">이유 · </span>
                          {response.decision.whyMattersKo}
                        </p>
                      </div>
                    )}
                    {response.facts.length > 0 && (
                      <dl className="space-y-1.5">
                        {response.facts.map((factItem, i) => (
                          <div
                            key={`${factItem.labelKo}-${i}`}
                            className="flex flex-wrap items-baseline gap-x-2"
                          >
                            <dt className="text-slate-500">{factItem.labelKo}</dt>
                            <dd className="text-slate-200">{factItem.value}</dd>
                            {factItem.source && SOURCE_LABELS[factItem.source] && (
                              <Link
                                href={SOURCE_LINKS[factItem.source] ?? "/dashboard"}
                                className="text-sky-400/80 hover:underline"
                              >
                                {SOURCE_LABELS[factItem.source]}
                              </Link>
                            )}
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
              </div>
            )}

            {response.providerMeta && (
              <div
                className="rounded-xl border border-slate-800/60 bg-slate-950/30"
                data-testid="agent-dev-details"
              >
                <button
                  type="button"
                  onClick={() => setDevOpen((o) => !o)}
                  className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-500 hover:text-slate-300"
                  aria-expanded={devOpen}
                  data-testid="agent-dev-toggle"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Code2 className="size-3.5" />
                    개발자 세부정보
                  </span>
                  <ChevronDown
                    className={`size-3.5 transition-transform ${devOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {devOpen && (
                  <p className="border-t border-slate-800/60 px-3 py-2 text-xs text-slate-600">
                    제공자 {response.providerMeta.provider} ·{" "}
                    {response.providerMeta.model} ·{" "}
                    {response.providerMeta.latencyMs}ms
                    {response.providerMeta.cached ? " · 캐시" : ""}
                    {response.interpretationSource
                      ? ` · ${response.interpretationSource}`
                      : ""}
                  </p>
                )}
              </div>
            )}

            {response.followUpSuggestions &&
              response.followUpSuggestions.length > 0 &&
              onFollowUp && (
                <div
                  className="flex flex-wrap gap-2"
                  data-testid="agent-followups"
                >
                  {response.followUpSuggestions.slice(0, 3).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => onFollowUp(chip)}
                      className="min-h-10 rounded-full border border-slate-700/80 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-100"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
