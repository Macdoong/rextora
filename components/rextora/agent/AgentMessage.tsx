"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Database,
  BrainCircuit,
  AlertCircle,
  ShieldAlert,
  Cpu,
  ChevronDown,
  RotateCcw,
  Compass,
  ArrowRightCircle,
} from "lucide-react";
import type { AgentResponse, AgentScope } from "@/src/lib/rextora/agent/types";
import { ActionCard } from "./ActionCard";

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

function ScopeRail({ scope }: { scope?: AgentScope }) {
  if (!scope) return null;
  const entries = [
    ["화면", scope.route],
    ["전략", scope.strategyId],
    ["실행", scope.runId],
    ["탐색", scope.jobId],
    ["심볼", scope.symbol],
    ["타임프레임", scope.timeframe],
    ["Paper", scope.paperSessionId],
  ].filter(([, value]) => value && value !== "없음") as Array<[string, string]>;

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Compass className="size-3 text-sky-400" />
        <span className="text-xs font-semibold tracking-wide text-sky-300">
          분석 범위
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {entries.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-xs text-slate-500">{label}</dt>
            <dd className="truncate text-sm font-medium text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface AgentMessageProps {
  query: string;
  response: AgentResponse | null;
  error: string | null;
  isLoading: boolean;
  onRetry?: () => void;
}

export function AgentMessage({
  query,
  response,
  error,
  isLoading,
  onRetry,
}: AgentMessageProps) {
  const [devOpen, setDevOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-violet-600/20 px-4 py-2.5 text-sm text-slate-100 ring-1 ring-inset ring-violet-500/20">
          {query}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-start gap-3">
          <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600/20 ring-1 ring-violet-500/30">
            <BrainCircuit className="size-3.5 text-violet-400" />
          </div>
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-800" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-800" />
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-800" />
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-start gap-3">
          <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-600/20 ring-1 ring-rose-500/30">
            <AlertCircle className="size-3.5 text-rose-400" />
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
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
          <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600/20 ring-1 ring-violet-500/30">
            <BrainCircuit className="size-3.5 text-violet-400" />
          </div>

          <div className="flex-1 space-y-3">
            {response.safetyBlocked && response.safetyReasonKo && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5 text-sm text-amber-200">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <span>{response.safetyReasonKo}</span>
              </div>
            )}

            <ScopeRail scope={response.scope} />

            {response.facts.length > 0 && (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <Database className="size-3 text-emerald-400" />
                  <span className="text-xs font-semibold tracking-wide text-emerald-300">
                    검증된 사실
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {response.facts.map((factItem, i) => (
                    <div key={i} className="min-w-0">
                      <dt className="truncate text-xs text-slate-400">
                        {factItem.labelKo}
                        {factItem.source && SOURCE_LABELS[factItem.source] && (
                          <Link
                            href={SOURCE_LINKS[factItem.source] ?? "/dashboard"}
                            className="ml-1 text-sky-300 hover:underline"
                          >
                            · 출처: {SOURCE_LABELS[factItem.source]}
                          </Link>
                        )}
                      </dt>
                      <dd className="truncate text-sm font-medium text-slate-100">
                        {factItem.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <BrainCircuit className="size-3 text-violet-400" />
                  <span className="text-xs font-semibold tracking-wide text-violet-300">
                    AI 해석
                  </span>
                </div>
                {response.providerMeta && (
                  <button
                    onClick={() => setDevOpen((o) => !o)}
                    className="flex min-h-11 items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                    aria-label="개발자 상세"
                  >
                    <Cpu className="size-3" />
                    <ChevronDown
                      className={`size-3 transition-transform ${devOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>

              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">
                {response.interpretationKo}
              </p>
              <p className="text-xs text-slate-500">
                응답{" "}
                {new Date(response.respondedAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>

              {devOpen && response.providerMeta && (
                <div className="mt-2 space-y-0.5 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                  <div>제공자: {response.providerMeta.provider}</div>
                  <div>모델: {response.providerMeta.model}</div>
                  <div>응답 시간: {response.providerMeta.latencyMs}ms</div>
                  {response.providerMeta.tokens && (
                    <div>
                      토큰: 입력 {response.providerMeta.tokens.input} / 출력{" "}
                      {response.providerMeta.tokens.output}
                    </div>
                  )}
                  {response.providerMeta.cached && (
                    <div className="text-emerald-600">캐시됨</div>
                  )}
                  {response.providerMeta.errorKo && (
                    <div className="text-amber-600">
                      오류: {response.providerMeta.errorKo}
                    </div>
                  )}
                </div>
              )}
            </div>

            {response.recommendedActionKo && (
              <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 px-3 py-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <ArrowRightCircle className="size-3 text-sky-400" />
                  <span className="text-xs font-semibold tracking-wide text-sky-300">
                    권장 다음 작업
                  </span>
                </div>
                <p className="text-sm text-sky-100">{response.recommendedActionKo}</p>
              </div>
            )}

            {response.actions.length > 0 && (
              <div className="space-y-2">
                {response.actions.map((action, i) => (
                  <ActionCard key={i} action={action} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
