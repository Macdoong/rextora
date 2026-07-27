"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Metric, Tooltip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import type {
  ResearchClusterView as ResearchCluster,
  ResearchResultCardView as ResearchResultCard,
  ResearchResultsSummaryView as ResearchResultsSummary,
} from "@/components/rextora/strategySearch/types";
import {
  EXPLORER_PAGE_SIZES,
  filterSortPaginate,
  strategyRowKey,
  type ExplorerFilterId,
  type ExplorerPageSize,
  type ExplorerSortKey,
} from "@/components/rextora/results/researchExplorerUtils";

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "없음";
  return `${(v * 100).toFixed(2)}%`;
}

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "없음";
  return n.toLocaleString("ko-KR");
}

function MiniSeries({ values }: { values: number[] | null | undefined }) {
  if (!values || values.length < 2) {
    return <span aria-label="미니 차트 데이터 없음">—</span>;
  }
  const safe = values.filter(Number.isFinite).slice(0, 30);
  if (safe.length < 2) return <span aria-label="미니 차트 데이터 없음">—</span>;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  const points = safe
    .map(
      (value, index) =>
        `${(index / (safe.length - 1)) * 72},${22 - ((value - min) / span) * 20}`,
    )
    .join(" ");
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" role="img" aria-label="실제 저장 성과 미니 차트">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function aliasOf(card: ResearchResultCard): string {
  return card.displayAlias || card.readableName;
}

function registrationDisplayLabel(
  card: ResearchResultCard,
  opts?: { busy?: boolean },
): string {
  if (opts?.busy) return "등록 중";
  if (card.registrationState === "등록됨" || Boolean(card.registeredStrategyId)) {
    return "등록됨";
  }
  if (card.registrationState === "중복") return "이미 등록됨";
  if (card.registrationState === "등록 실패") {
    return "등록 실패";
  }
  return "미등록";
}

function isRegisteredCard(card: ResearchResultCard): boolean {
  return (
    card.registrationState === "등록됨" ||
    card.registrationState === "중복" ||
    Boolean(card.registeredStrategyId)
  );
}

function backtestHref(card: ResearchResultCard): string {
  if (!card.registeredStrategyId) return "/backtest";
  // Pass strategyId only — workbench loads canonical strategyHash from store.
  // Research paramsHash must not be sent as strategyHash (causes mismatch).
  const qs = new URLSearchParams({
    strategyId: card.registeredStrategyId,
    symbol: card.symbol,
    timeframe: card.timeframe,
    sourceResearchJobId: card.sourceResearchJobId,
    sourceTrialIteration: String(card.iteration),
    sourceClusterId: card.clusterId,
  });
  return `/backtest?${qs.toString()}`;
}

const FILTER_OPTIONS: Array<{ id: ExplorerFilterId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "top", label: "TOP 전략" },
  { id: "backtest_rec", label: "백테스트 추천" },
  { id: "recommendable", label: "추천 검토 가능" },
  { id: "final_recommendable", label: "최종 추천 가능" },
  { id: "registered", label: "등록됨" },
  { id: "unregistered", label: "미등록" },
  { id: "stability_pass", label: "거래 안정성 통과" },
  { id: "stability_fail", label: "거래 안정성 미통과" },
  { id: "cost_ready", label: "비용 계산/스트레스 완료" },
  { id: "cost_pending", label: "비용 검증 대기·없음" },
  { id: "sample_ok", label: "표본 신뢰도 충분" },
  { id: "sample_low", label: "표본 신뢰도 낮음" },
];

const SORT_OPTIONS: Array<{ id: ExplorerSortKey; label: string }> = [
  { id: "score", label: "종합 점수" },
  { id: "return", label: "순수익" },
  { id: "mdd", label: "최대 낙폭" },
  { id: "trades", label: "거래 수" },
  { id: "pf", label: "손익비" },
  { id: "stability", label: "거래 안정성" },
  { id: "overfit", label: "편중 위험" },
  { id: "iteration", label: "생성 시각" },
];

const STAGE_TIP: Record<string, string> = {
  "기본 검토 가능":
    "기본 수익·낙폭 조건을 통과했지만 안정성 검증이 추가로 필요할 수 있습니다.",
  "최종 추천 가능":
    "합격·비용 스트레스·과거 데이터 편중 증거를 충족한 후보입니다.",
  "추가 검증 필요":
    "최종 추천 자격이 부족합니다. 거래 안정성·표본·낙폭을 재확인하세요.",
  "추천 검토 가능":
    "기본 수익·낙폭 조건을 통과했지만 안정성 검증이 추가로 필요할 수 있습니다.",
  "추천 불가":
    "최종 추천 자격이 부족합니다. 거래 안정성·표본·낙폭을 재확인하세요.",
};

function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles?.length) return <span className="text-xs text-slate-500">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r} tone={r.startsWith("TOP") || r === "최종 추천" ? "success" : "info"}>
          {r}
        </Badge>
      ))}
    </span>
  );
}

function StatusBadge({
  label,
  tip,
  tone = "muted",
}: {
  label: string;
  tip?: string;
  tone?: "success" | "warning" | "muted" | "danger" | "info";
}) {
  const badge = <Badge tone={tone}>{label}</Badge>;
  if (!tip) return badge;
  return <Tooltip content={tip}>{badge}</Tooltip>;
}

function RowMenu(props: {
  card: ResearchResultCard;
  registered: boolean;
  busy: boolean;
  onDetail: () => void;
  onPromote?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <Button
        size="sm"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        data-testid={`row-menu-${props.card.iteration}`}
      >
        ⋯
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => {
              props.onDetail();
              setOpen(false);
            }}
          >
            상세 보기
          </button>
          {!props.registered && props.onPromote ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              disabled={props.busy}
              onClick={() => {
                props.onPromote?.();
                setOpen(false);
              }}
            >
              선택 등록
            </button>
          ) : null}
          <Link
            role="menuitem"
            className="block rounded px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            href={`/strategy-search?jobId=${encodeURIComponent(props.card.sourceResearchJobId)}&followUpIteration=${props.card.iteration}`}
            onClick={() => setOpen(false)}
          >
            이 전략군으로 개선 탐색
          </Link>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded px-3 py-2 text-left text-xs text-slate-500"
            disabled
            title="보관은 라이브러리에서 지원됩니다"
          >
            보관
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded px-3 py-2 text-left text-xs text-slate-500"
            disabled
            title="제외는 라이브러리에서 지원됩니다"
          >
            제외
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopDecisionCard(props: {
  title: string;
  card: ResearchResultCard | null;
  empty: string;
  testId: string;
  busyIteration: number | null;
  promoting: boolean;
  onRegisterThenBacktest: (iteration: number) => void;
}) {
  const card = props.card;
  if (!card) {
    return (
      <Card title={props.title} data-testid={props.testId}>
        <EmptyState message={props.empty} />
      </Card>
    );
  }
  const registered = isRegisteredCard(card);
  const busy = props.busyIteration === card.iteration || props.promoting;
  const registrationLabel = registrationDisplayLabel(card, { busy });
  return (
    <Card title={props.title} data-testid={props.testId}>
      <div className="space-y-2">
        <div className="text-lg font-semibold text-slate-100">{aliasOf(card)}</div>
        <div className="flex flex-wrap gap-1">
          <RoleBadges roles={card.roles} />
          <StatusBadge
            label={card.eligibilityStatus}
            tip={STAGE_TIP[card.eligibilityStatus]}
            tone={card.finalRecommendable ? "success" : "warning"}
          />
          <Badge>{registrationLabel}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="순수익" value={formatPct(card.netReturn)} />
          <Metric label="최대 낙폭" value={formatPct(card.maxDrawdown)} />
          <Metric label="거래 수" value={card.tradeCount ?? "없음"} />
          <Metric
            label="손익비"
            value={card.profitFactor != null ? card.profitFactor.toFixed(2) : "없음"}
          />
          <Metric label="표본" value={card.sampleConfidence} />
          <Metric label="비용" value={card.costStatus} />
        </div>
        <p className="text-xs text-emerald-200">강점: {card.strongestPoint}</p>
        <p className="text-xs text-amber-200">약점: {card.primaryWeakness}</p>
        <p className="text-xs text-sky-200/90">
          선정 사유: {card.recommendationReason}
        </p>
        {card.whyNotRank1 ? (
          <p className="text-xs text-slate-400">
            1위가 아닌 이유: {card.whyNotRank1}
          </p>
        ) : null}
        {card.vsPreviousRankNote ? (
          <p className="text-xs text-slate-500">{card.vsPreviousRankNote}</p>
        ) : null}
        <p className="text-xs text-slate-500">
          레버리지: {card.leverageLabel || "—"}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {registered ? (
            <Link href={backtestHref(card)} data-testid={`${props.testId}-backtest`}>
              <Button size="sm">새 기간으로 백테스트</Button>
            </Link>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => props.onRegisterThenBacktest(card.iteration)}
              data-testid={`${props.testId}-register-backtest`}
            >
              {busy ? "등록 중" : "전략 등록 후 백테스트"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function CompactRecRow(props: {
  card: ResearchResultCard;
  rank: number;
  busy: boolean;
  onRegisterThenBacktest: (iteration: number) => void;
  onToggleDetail: () => void;
  expanded: boolean;
  testIdPrefix?: string;
}) {
  const { card } = props;
  const registered = isRegisteredCard(card);
  const registrationLabel = registrationDisplayLabel(card, { busy: props.busy });
  const testId =
    props.testIdPrefix ?? `backtest-rec-${props.rank}`;
  return (
    <div
      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100">
            {props.rank}. {aliasOf(card)}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
            <span>수익 {formatPct(card.netReturn)}</span>
            <span>낙폭 {formatPct(card.maxDrawdown)}</span>
            <span>거래 {card.tradeCount ?? "없음"}</span>
            <span>
              손익비{" "}
              {card.profitFactor != null ? card.profitFactor.toFixed(2) : "없음"}
            </span>
            <StatusBadge
              label={card.sampleConfidence}
              tip={card.sampleConfidenceDetail}
              tone={card.sampleConfidence === "표본 충분" ? "success" : "warning"}
            />
            <Badge>{registrationLabel}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {registered ? (
            <Link href={backtestHref(card)}>
              <Button size="sm">새 기간으로 백테스트</Button>
            </Link>
          ) : (
            <Button
              size="sm"
              disabled={props.busy}
              onClick={() => props.onRegisterThenBacktest(card.iteration)}
            >
              {props.busy ? "등록 중" : "전략 등록 후 백테스트"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={props.onToggleDetail}>
            상세 보기
          </Button>
        </div>
      </div>
      {props.expanded ? (
        <div className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400">
          <p>정식 이름: {card.readableName}</p>
          <p>약점: {card.primaryWeakness}</p>
          <p>사유: {card.recommendationReason}</p>
          <p>비용: {card.costStatus}</p>
        </div>
      ) : null}
    </div>
  );
}

function RowDetail(props: { card: ResearchResultCard; cluster?: ResearchCluster }) {
  const { card, cluster } = props;
  return (
    <div
      className="space-y-1 border-t border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-400"
      data-testid={`row-detail-${card.iteration}`}
    >
      <p>
        <span className="text-slate-300">정식 이름:</span> {card.readableName}
      </p>
      <p>
        <span className="text-slate-300">표시 별칭:</span> {aliasOf(card)}
      </p>
      <p className="font-mono">hash {card.paramsHash}</p>
      <p className="font-mono">job {card.sourceResearchJobId}</p>
      <p className="font-mono">iteration {card.iteration}</p>
      <p className="font-mono">
        cluster {card.clusterId}
        {cluster ? ` · 멤버 ${cluster.memberCount}` : ""}
      </p>
      <p>
        {card.symbol} · {card.timeframe}
      </p>
      <p>
        총 비용:{" "}
        {card.totalCost != null && Number.isFinite(card.totalCost)
          ? card.totalCost.toFixed(4)
          : card.costStatus}
      </p>
      <p>선정 사유: {card.recommendationReason}</p>
      <p>강점: {card.strongestPoint}</p>
      <p>약점: {card.primaryWeakness}</p>
      {card.whyNotRank1 ? (
        <p>1위가 아닌 이유: {card.whyNotRank1}</p>
      ) : null}
      {card.vsPreviousRankNote ? <p>{card.vsPreviousRankNote}</p> : null}
      <p>레버리지: {card.leverageLabel || "—"}</p>
      <p>
        자격: {card.eligibilityStatus} · 안정성 {card.robustnessStatus} · 편중{" "}
        {card.overfittingRisk}
      </p>
      <p>
        표본: {card.sampleConfidence} — {card.sampleConfidenceDetail}
      </p>
      {card.registeredStrategyId ? (
        <p className="font-mono">strategyId {card.registeredStrategyId}</p>
      ) : null}
    </div>
  );
}

export function CurrentResearchResultsPanel(props: {
  jobId: string | null;
  onMessage?: (msg: string) => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<ResearchResultsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [busyIteration, setBusyIteration] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ExplorerFilterId[]>(["all"]);
  const [sortKey, setSortKey] = useState<ExplorerSortKey>("score");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ExplorerPageSize>(10);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [top10Expanded, setTop10Expanded] = useState(false);
  const [recDetail, setRecDetail] = useState<number | null>(null);
  const [scopedJobId, setScopedJobId] = useState<string | null | undefined>(
    undefined,
  );
  const sessionKey = props.jobId
    ? `rextora.results.explorer.${props.jobId}`
    : null;

  function applyExplorerSession(jobId: string | null) {
    setExpandedRow(null);
    setShowAllRecs(false);
    setTop10Expanded(false);
    setRecDetail(null);
    setPage(1);
    if (!jobId) {
      setSearch("");
      setFilters(["all"]);
      setSortKey("score");
      setPageSize(10);
      return;
    }
    try {
      const raw = sessionStorage.getItem(`rextora.results.explorer.${jobId}`);
      if (!raw) {
        setSearch("");
        setFilters(["all"]);
        setSortKey("score");
        setPageSize(10);
        return;
      }
      const parsed = JSON.parse(raw) as {
        search?: string;
        filters?: ExplorerFilterId[];
        sortKey?: ExplorerSortKey;
        pageSize?: ExplorerPageSize;
      };
      setSearch(parsed.search ?? "");
      setFilters(parsed.filters?.length ? parsed.filters : ["all"]);
      setSortKey(parsed.sortKey ?? "score");
      setPageSize(
        EXPLORER_PAGE_SIZES.includes(parsed.pageSize as ExplorerPageSize)
          ? (parsed.pageSize as ExplorerPageSize)
          : 10,
      );
    } catch {
      setSearch("");
      setFilters(["all"]);
      setSortKey("score");
      setPageSize(10);
    }
  }

  // Initial hydrate + job switch (render-time adjust — avoids cascading effect setState).
  if (scopedJobId !== props.jobId) {
    setScopedJobId(props.jobId);
    if (typeof window !== "undefined") {
      applyExplorerSession(props.jobId);
    } else {
      setSearch("");
      setFilters(["all"]);
      setSortKey("score");
      setPage(1);
      setPageSize(10);
    }
  }

  const summaryAbortRef = useRef<AbortController | null>(null);
  const summaryJobRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!props.jobId) {
      setSummary(null);
      setError(null);
      setLoading(false);
      return;
    }
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    const requestJobId = props.jobId;
    summaryJobRef.current = requestJobId;
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(requestJobId)}/results-summary`,
        { cache: "no-store", signal: controller.signal },
      );
      const json = await res.json();
      if (summaryJobRef.current !== requestJobId) return;
      if (!json.ok) {
        throw new Error(json.error ?? "탐색 결과 요약을 불러오지 못했습니다.");
      }
      setSummary(json.data as ResearchResultsSummary);
      setError(null);
    } catch (e) {
      if (summaryJobRef.current !== requestJobId) return;
      // Superseded or cleanup abort — do not wipe a loaded summary with a timeout error.
      if (e instanceof DOMException && e.name === "AbortError") {
        if (summaryAbortRef.current !== controller) return;
        setError("결과 요약 로드가 지연되어 중단했습니다. 다시 시도하세요.");
        return;
      }
      setError(e instanceof Error ? e.message : "탐색 결과 요약 실패");
    } finally {
      window.clearTimeout(timeout);
      if (summaryJobRef.current === requestJobId) {
        setLoading(false);
      }
    }
  }, [props.jobId]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(boot);
      summaryAbortRef.current?.abort();
      summaryAbortRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    if (!loading || summary) return;
    const failsafe = window.setTimeout(() => {
      setLoading(false);
      setError((prev) => prev ?? "결과 요약 로드가 지연되어 중단했습니다.");
    }, 22_000);
    return () => window.clearTimeout(failsafe);
  }, [loading, summary]);

  useEffect(() => {
    if (!sessionKey) return;
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({ search, filters, sortKey, pageSize }),
    );
  }, [sessionKey, search, filters, sortKey, pageSize]);

  const pageModel = useMemo(() => {
    if (!summary) {
      return filterSortPaginate([], {
        search,
        filters,
        sortKey,
        page,
        pageSize,
      });
    }
    return filterSortPaginate(summary.representatives, {
      search,
      filters,
      sortKey,
      page,
      pageSize,
    });
  }, [summary, search, filters, sortKey, page, pageSize]);

  async function promoteOne(iteration: number) {
    if (!props.jobId) return;
    setPromoting(true);
    setBusyIteration(iteration);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(props.jobId)}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iteration }),
        },
      );
      const json = await res.json();
      props.onMessage?.(
        json.ok
          ? json.data?.alreadyExists
            ? "이미 등록된 전략을 사용합니다."
            : "전략 라이브러리에 등록했습니다."
          : (json.error ?? "등록 실패"),
      );
      await load();
    } finally {
      setPromoting(false);
      setBusyIteration(null);
    }
  }

  async function registerThenBacktest(iteration: number) {
    if (!props.jobId) return;
    setPromoting(true);
    setBusyIteration(iteration);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(props.jobId)}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "register_for_backtest",
            iteration,
          }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        props.onMessage?.(json.error ?? "등록 실패");
        return;
      }
      props.onMessage?.(
        json.data?.messageKo ??
          (json.data?.reused
            ? "이미 등록된 전략을 사용합니다."
            : "전략 라이브러리에 등록했습니다."),
      );
      await load();
      const href = json.data?.backtestHref as string | undefined;
      if (href) router.push(href);
    } finally {
      setPromoting(false);
      setBusyIteration(null);
    }
  }

  async function promoteTop() {
    if (!props.jobId) return;
    setPromoting(true);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/${encodeURIComponent(props.jobId)}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "top", limit: 10 }),
        },
      );
      const json = await res.json();
      const n = Array.isArray(json.data?.promoted)
        ? json.data.promoted.length
        : 0;
      props.onMessage?.(
        json.ok
          ? `상위 전략 ${n}개를 전략 라이브러리에 등록했습니다.`
          : (json.error ?? "일괄 등록 실패"),
      );
      await load();
    } finally {
      setPromoting(false);
    }
  }

  function toggleFilter(id: ExplorerFilterId) {
    setPage(1);
    if (id === "all") {
      setFilters(["all"]);
      return;
    }
    setFilters((prev) => {
      const withoutAll = prev.filter((f) => f !== "all");
      if (withoutAll.includes(id)) {
        const next = withoutAll.filter((f) => f !== id);
        return next.length ? next : ["all"];
      }
      return [...withoutAll, id];
    });
  }

  function resetFilters() {
    setSearch("");
    setFilters(["all"]);
    setSortKey("score");
    setPage(1);
  }

  if (!props.jobId) {
    return (
      <Card title="이번 탐색 요약" data-testid="current-research-empty">
        <EmptyState
          message="선택된 탐색 작업이 없습니다."
          hint="전략 탐색 완료 후 「탐색 결과 확인」으로 들어오거나, 아래 연구 이력에서 작업을 고르세요."
        />
      </Card>
    );
  }

  if (loading && !summary) {
    return (
      <Card title="이번 탐색 요약" data-testid="current-research-loading">
        <EmptyState message="이번 탐색 결과를 불러오는 중입니다…" />
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card title="이번 탐색 요약" data-testid="current-research-error">
        <EmptyState message={error ?? "요약을 표시할 수 없습니다."} />
        <div className="mt-3">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-100"
            data-testid="current-research-retry"
            onClick={() => void load()}
          >
            다시 시도
          </button>
        </div>
      </Card>
    );
  }

  const c = summary.counts;
  const clusterById = new Map<string, ResearchCluster>(
    summary.clusters.map((cl) => [cl.clusterId, cl]),
  );
  const recs = summary.backtestRecommendations;
  const top10 = summary.top10 ?? [];
  const rankChanges = summary.top10RankChanges ?? [];
  const visibleRecs = showAllRecs ? recs : recs.slice(0, 3);
  const activeFilters = filters.filter((f) => f !== "all");
  const top10Visible = top10Expanded ? top10 : top10.slice(0, 3);
  const decisionTop3 = (() => {
    const map = new Map<
      string,
      { card: ResearchResultCard; titles: string[] }
    >();
    for (const [title, card] of [
      ["최고 수익 전략", summary.topProfit],
      ["최고 안정 전략", summary.topStable],
      ["최종 추천 전략", summary.topRecommend],
    ] as const) {
      if (!card) continue;
      const current = map.get(card.paramsHash);
      if (current) {
        current.titles.push(title);
        current.card = {
          ...current.card,
          roles: [...new Set([...current.card.roles, ...card.roles])],
        };
      } else {
        map.set(card.paramsHash, { card, titles: [title] });
      }
    }
    return [...map.values()];
  })();

  const stageCounts = [
    { id: "stage-basic", label: "기본 조건 통과", value: c.stageBasicQualified },
    { id: "stage-stability", label: "안정성", value: c.stageStabilityPassed },
    { id: "stage-cost", label: "비용", value: c.stageCostPassed },
    { id: "stage-sample", label: "표본(보통↑)", value: c.stageSampleOk },
    { id: "stage-overfit", label: "편중", value: c.stageOverfitOk },
    { id: "stage-final", label: "최종 추천", value: c.stageFinalRecommendable },
    { id: "stage-top10", label: "TOP 10", value: c.top10Saved },
  ];

  return (
    <div className="space-y-5" data-testid="current-research-panel">
      <section id="results-section-outcome" data-testid="current-research-outcome">
        <Card title={summary.outcome?.titleKo ?? "이번 탐색 요약"}>
          <p
            className="text-sm text-emerald-100"
            data-testid="current-research-outcome-detail"
          >
            {summary.outcome?.detailKo ?? "이번 탐색 결과"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            원본 상태 {summary.status} ·{" "}
            {summary.outcome?.usable
              ? "결과 사용 가능"
              : "사용 가능한 합격 결과 없음"}
          </p>
        </Card>
      </section>

      <section id="results-section-summary" data-testid="current-research-summary">
        <Card title="이번 탐색 요약">
          <p className="text-sm text-slate-300">
            {summary.searchName} · {summary.symbol} · {summary.timeframe}
          </p>
          <p
            className="mt-1 text-xs text-slate-500"
            data-testid="current-research-provenance"
          >
            {summary.provenanceNote}
          </p>
          <div
            className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            data-testid="current-research-stage-counts"
          >
            {stageCounts.map((s) => (
              <div key={s.id} data-testid={s.id}>
                <Metric label={s.label} value={formatCount(s.value)} />
              </div>
            ))}
          </div>
          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer select-none">집계 상세 · 최고 수익 비교</summary>
            <div
              className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              data-testid="current-research-counts"
            >
              <div data-testid="count-evaluated">
                <Metric label="평가한 전략" value={formatCount(c.evaluatedStrategies)} />
              </div>
              <div data-testid="count-qualified">
                <Metric label="합격 전략" value={formatCount(c.qualifiedStrategies)} />
              </div>
              <div data-testid="count-unique-clustered">
                <Metric
                  label="유사 전략 제거 후"
                  value={formatCount(c.clusteredRepresentatives)}
                />
              </div>
              <div data-testid="count-registered">
                <Metric
                  label="전략 라이브러리 등록"
                  value={formatCount(c.registeredStrategies)}
                />
              </div>
              <div data-testid="count-recommendable">
                <Metric
                  label="추천 검토 가능"
                  value={formatCount(c.recommendationEligibleStrategies)}
                />
              </div>
              <div data-testid="count-backtest-rec">
                <Metric
                  label="백테스트 추천"
                  value={formatCount(c.backtestRecommendedStrategies)}
                />
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div data-testid="finalized-best-label">
                <Metric
                  label="최종 정리 후 최고"
                  value={formatPct(summary.finalizedBest?.netReturn)}
                />
                <p className="mt-1">{summary.finalizedBest?.explanationKo}</p>
              </div>
              <div data-testid="live-best-label">
                <Metric
                  label="실시간 탐색 최고"
                  value={formatPct(summary.liveSearchBest?.netReturn)}
                />
                <p className="mt-1">{summary.liveSearchBest?.explanationKo}</p>
              </div>
            </div>
            <p className="mt-2" data-testid="current-research-qualified-note">
              합격 전략 {formatCount(c.qualifiedStrategies)}개는 탐색 trial 기록입니다.
              전략 라이브러리 등록({formatCount(c.registeredStrategies)}개)과 다릅니다.
            </p>
          </details>
          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer select-none">AI 선정 요약</summary>
            <div className="mt-2 grid gap-4 text-sm text-slate-300 md:grid-cols-3">
              <div>
                <div className="font-medium text-slate-100">추천 근거</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {summary.selectionSummary.whyTopSelected.slice(0, 3).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-100">주의할 점</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>{summary.selectionSummary.tradeConfidenceNote}</li>
                  <li>{summary.selectionSummary.costSensitivityNote}</li>
                  <li>{summary.selectionSummary.drawdownRiskNote}</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-100">다음 행동</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {summary.selectionSummary.nextActions.slice(0, 3).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {summary.selectionSummary.whyExcluded.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-2">편중: {summary.selectionSummary.overfittingNote}</p>
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={promoting || c.recommendationEligibleStrategies === 0}
              onClick={() => void promoteTop()}
              data-testid="promote-top-batch"
            >
              상위 전략 일괄 등록
            </Button>
            <Link href={`/strategy-search?jobId=${encodeURIComponent(summary.jobId)}`}>
              <Button size="sm" variant="outline">
                탐색 화면으로
              </Button>
            </Link>
          </div>
        </Card>
      </section>

      <section id="results-section-top3" data-testid="results-top3">
        <div className="grid gap-4 lg:grid-cols-3">
          {decisionTop3.map(({ card, titles }) => (
            <TopDecisionCard
              key={card.paramsHash}
              title={titles.join(" · ")}
              card={card}
              empty="추천 가능한 전략 없음"
              testId={`highlight-${titles[0]}`}
              busyIteration={busyIteration}
              promoting={promoting}
              onRegisterThenBacktest={registerThenBacktest}
            />
          ))}
          {decisionTop3.length === 0 ? (
            <Card title="Best strategy">
              <EmptyState message="합격 전략이 없습니다." />
            </Card>
          ) : null}
        </div>
      </section>

      <section id="results-section-top10" data-testid="results-top10">
        <Card title="TOP 10 기관형 비교">
          {top10.length === 0 ? (
            <EmptyState message="저장된 TOP 10 후보가 없습니다." />
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left text-xs" data-testid="results-top10-table">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      {["순위", "변동", "전략", "패턴 스택", "승률", "수익률", "낙폭", "Sharpe", "견고성", "레버리지", "위험", "신뢰도", "미니 차트", "승격 근거"].map((label) => (
                        <th key={label} scope="col" className="px-2 py-2 font-medium">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {top10Visible.map((card, index) => {
                      const movement = rankChanges.find(
                        (entry) => entry.strategyHash === card.paramsHash,
                      );
                      const expanded = recDetail === card.iteration;
                      return (
                        <tr
                          key={strategyRowKey(card)}
                          className="border-b border-slate-800 align-top"
                          data-testid={`top10-row-${index + 1}`}
                        >
                          <td className="px-2 py-2 tabular-nums">{index + 1}</td>
                          <td className="px-2 py-2">{movement?.change ?? "—"}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              className="text-left font-medium text-slate-100 hover:underline"
                              aria-expanded={expanded}
                              onClick={() =>
                                setRecDetail(expanded ? null : card.iteration)
                              }
                            >
                              {aliasOf(card)}
                            </button>
                            {expanded ? <RowDetail card={card} cluster={clusterById.get(card.clusterId)} /> : null}
                          </td>
                          <td className="px-2 py-2">{card.patternStack || card.strategyFamily}</td>
                          <td className="px-2 py-2 tabular-nums">{formatPct(card.winRate)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatPct(card.netReturn)}</td>
                          <td className="px-2 py-2 tabular-nums">{formatPct(card.maxDrawdown)}</td>
                          <td className="px-2 py-2 tabular-nums">{card.sharpe != null ? card.sharpe.toFixed(2) : "없음"}</td>
                          <td className="px-2 py-2">{card.robustnessStatus}</td>
                          <td className="px-2 py-2">{card.leverageLabel || "—"}</td>
                          <td className="px-2 py-2">{card.risk || card.overfittingRisk}</td>
                          <td className="px-2 py-2">{card.confidence || card.sampleConfidence}</td>
                          <td className="px-2 py-2 text-sky-300"><MiniSeries values={card.miniSeries} /></td>
                          <td className="max-w-[16rem] px-2 py-2">{card.recommendationReason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {top10.length > 3 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTop10Expanded((value) => !value)}
                  data-testid="results-top10-expand"
                >
                  {top10Expanded ? "상위 3개만 보기" : `전체 ${top10.length}개 보기`}
                </Button>
              ) : null}
            </div>
          )}
        </Card>
      </section>

      <section id="results-section-backtest-rec" data-testid="backtest-recommendations">
        <Card title="백테스트 추천 전략">
          {recs.length === 0 ? (
            <EmptyState message="추천 자격이 있는 전략이 없어 백테스트 추천이 비어 있습니다." />
          ) : (
            <div className="space-y-2">
              {visibleRecs.map((card, i) => (
                <CompactRecRow
                  key={strategyRowKey(card)}
                  card={card}
                  rank={i + 1}
                  busy={busyIteration === card.iteration || promoting}
                  onRegisterThenBacktest={registerThenBacktest}
                  onToggleDetail={() =>
                    setRecDetail((v) => (v === card.iteration ? null : card.iteration))
                  }
                  expanded={recDetail === card.iteration}
                />
              ))}
              {recs.length > 3 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAllRecs((v) => !v)}
                  data-testid="backtest-rec-expand"
                >
                  {showAllRecs ? "상위 3개만 보기" : `전체 ${recs.length}개 보기`}
                </Button>
              ) : null}
            </div>
          )}
        </Card>
      </section>

      <section id="results-section-rank-history" data-testid="top10-rank-changes">
        <Card title="TOP 10 순위 변동">
          {rankChanges.length === 0 ? (
            <EmptyState message="이번 탐색에서 TOP 10 순위 변동 기록이 없습니다." />
          ) : (
            <ul className="space-y-2 text-sm" data-testid="rank-change-list">
              {rankChanges.map((entry) => (
                <li
                  key={`${entry.strategyHash}-${entry.currentRank ?? "x"}-${entry.previousRank ?? "y"}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2"
                  data-testid={`rank-change-${entry.strategyHash.slice(0, 8)}`}
                >
                  <span className="font-mono text-xs text-slate-400">
                    {entry.strategyHash.slice(0, 12)}
                  </span>
                  <Badge tone={entry.change === "신규 진입" ? "success" : "info"}>
                    {entry.change}
                  </Badge>
                  <span className="text-xs text-slate-300">
                    {entry.previousRank != null ? `${entry.previousRank}위` : "—"} →{" "}
                    {entry.currentRank != null ? `${entry.currentRank}위` : "제외"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section id="results-raw-candidates" data-testid="results-raw-candidates">
        <details className="rounded-xl border border-slate-800 bg-slate-950/30">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-200">
            전체 원본 후보 보기 ({formatCount(c.clusteredRepresentatives)}개 대표)
          </summary>
          <div className="border-t border-slate-800 p-4" data-testid="current-research-list">
      <div className="mb-2 text-xs text-slate-400">
        전체 대표 후보를 검색·필터·정렬합니다. 기본 화면은 TOP 10만 표시합니다.
      </div>
          <div
            className="mb-3 space-y-3"
            data-testid="explorer-toolbar"
          >
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="explorer-search">
                전략 검색
              </label>
              <input
                id="explorer-search"
                className="min-w-[12rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="이름 · 패밀리 · 해시 · 전략 ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                data-testid="explorer-search"
              />
              <select
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value as ExplorerSortKey);
                  setPage(1);
                }}
                aria-label="정렬"
                data-testid="explorer-sort"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as ExplorerPageSize);
                  setPage(1);
                }}
                aria-label="페이지 크기"
                data-testid="explorer-page-size"
              >
                {EXPLORER_PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}개씩
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={resetFilters}
                data-testid="explorer-reset-filters"
              >
                필터 초기화
              </Button>
            </div>
            <div className="flex flex-wrap gap-2" data-testid="explorer-filters">
              {FILTER_OPTIONS.map((o) => {
                const active =
                  o.id === "all"
                    ? filters.includes("all") || filters.length === 0
                    : filters.includes(o.id);
                return (
                  <Button
                    key={o.id}
                    size="sm"
                    variant={active ? "primary" : "outline"}
                    onClick={() => toggleFilter(o.id)}
                    aria-pressed={active}
                  >
                    {o.label}
                  </Button>
                );
              })}
            </div>
            {activeFilters.length > 0 ? (
              <div className="flex flex-wrap gap-1" data-testid="explorer-filter-chips">
                {activeFilters.map((f) => {
                  const label =
                    FILTER_OPTIONS.find((o) => o.id === f)?.label ?? f;
                  return (
                    <button
                      key={f}
                      type="button"
                      className="rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-xs text-slate-200"
                      onClick={() => toggleFilter(f)}
                    >
                      {label} ×
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p
              className="text-xs text-slate-400"
              data-testid="explorer-page-summary"
            >
              총 {formatCount(pageModel.total)}개 중{" "}
              {pageModel.total === 0
                ? "0"
                : `${pageModel.startIndex + 1}–${pageModel.endIndex}`}
              개 표시
            </p>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer select-none">상태 배지 안내</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>기본 검토 가능: {STAGE_TIP["기본 검토 가능"]}</li>
                <li>최종 추천 가능: {STAGE_TIP["최종 추천 가능"]}</li>
                <li>
                  거래 안정성 미통과는 기본 검토와 함께 표시될 수 있습니다(중간
                  단계).
                </li>
              </ul>
            </details>
          </div>

          {pageModel.pageRows.length === 0 ? (
            <EmptyState message="표시할 대표 전략이 없습니다." />
          ) : (
            <>
              <div
                className="rextora-table-wrap hidden md:block"
                data-testid="explorer-table"
              >
                <table className="rextora-data-table">
                  <thead>
                    <tr>
                      <th scope="col">순위</th>
                      <th scope="col">전략</th>
                      <th scope="col">역할</th>
                      <th scope="col" className="num">
                        순수익
                      </th>
                      <th scope="col" className="num">
                        최대 낙폭
                      </th>
                      <th scope="col" className="num">
                        거래 수
                      </th>
                      <th scope="col" className="num">
                        손익비
                      </th>
                      <th scope="col">거래 안정성</th>
                      <th scope="col">편중 위험</th>
                      <th scope="col">비용 상태</th>
                      <th scope="col">등록 상태</th>
                      <th scope="col">실행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageModel.pageRows.map((card, idx) => {
                      const key = strategyRowKey(card);
                      const registered = isRegisteredCard(card);
                      const busy =
                        busyIteration === card.iteration || promoting;
                      const registrationLabel = registrationDisplayLabel(card, {
                        busy,
                      });
                      const rank = pageModel.startIndex + idx + 1;
                      const expanded = expandedRow === key;
                      return (
                        <tr
                          key={key}
                          data-testid={`research-row-${card.iteration}`}
                          className="align-top"
                        >
                          <td className="num">{rank}</td>
                          <td>
                            <button
                              type="button"
                              className="text-left text-slate-100 hover:underline"
                              onClick={() =>
                                setExpandedRow(expanded ? null : key)
                              }
                            >
                              {aliasOf(card)}
                            </button>
                            {card.sampleConfidence !== "표본 충분" ? (
                              <div className="mt-1">
                                <StatusBadge
                                  label={card.sampleConfidence}
                                  tip={card.sampleConfidenceDetail}
                                  tone="warning"
                                />
                              </div>
                            ) : null}
                            {expanded ? (
                              <RowDetail
                                card={card}
                                cluster={clusterById.get(card.clusterId)}
                              />
                            ) : null}
                          </td>
                          <td>
                            <RoleBadges roles={card.roles} />
                          </td>
                          <td className="num">{formatPct(card.netReturn)}</td>
                          <td className="num">{formatPct(card.maxDrawdown)}</td>
                          <td className="num">{card.tradeCount ?? "없음"}</td>
                          <td className="num">
                            {card.profitFactor != null
                              ? card.profitFactor.toFixed(2)
                              : "없음"}
                          </td>
                          <td>
                            <StatusBadge
                              label={card.robustnessStatus}
                              tip={
                                card.robustnessStatus === "거래 안정성 미통과"
                                  ? "비용 스트레스 미통과. 기본 검토와 함께 표시될 수 있습니다."
                                  : undefined
                              }
                              tone={
                                card.robustnessStatus === "거래 안정성 통과"
                                  ? "success"
                                  : "warning"
                              }
                            />
                            <div className="mt-1">
                              <StatusBadge
                                label={card.eligibilityStatus}
                                tip={STAGE_TIP[card.eligibilityStatus]}
                                tone={
                                  card.finalRecommendable ? "success" : "muted"
                                }
                              />
                            </div>
                          </td>
                          <td>{card.overfittingRisk}</td>
                          <td>
                            <StatusBadge
                              label={card.costStatus}
                              tip={
                                card.totalCost != null
                                  ? `총 비용 ${card.totalCost.toFixed(4)} (수수료·슬리피지 합산)`
                                  : "이 탐색 trial에는 절대 비용 금액이 저장되지 않았습니다. 스트레스 통과 여부만 별도 확인하세요."
                              }
                              tone={
                                card.costStatus === "비용 계산 완료"
                                  ? "success"
                                  : "warning"
                              }
                            />
                          </td>
                          <td>
                            <Badge>{registrationLabel}</Badge>
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-1">
                              {registered ? (
                                <Link href={backtestHref(card)}>
                                  <Button size="sm">새 기간으로 백테스트</Button>
                                </Link>
                              ) : (
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void registerThenBacktest(card.iteration)
                                  }
                                  data-testid="current-research-register-backtest"
                                >
                                  {busy ? "등록 중" : "전략 등록 후 백테스트"}
                                </Button>
                              )}
                              <RowMenu
                                card={card}
                                registered={registered}
                                busy={busy}
                                onDetail={() =>
                                  setExpandedRow(expanded ? null : key)
                                }
                                onPromote={() => void promoteOne(card.iteration)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className="space-y-2 md:hidden"
                data-testid="explorer-mobile-cards"
              >
                {pageModel.pageRows.map((card, idx) => {
                  const key = strategyRowKey(card);
                  const registered = isRegisteredCard(card);
                  const busy = busyIteration === card.iteration || promoting;
                  const registrationLabel = registrationDisplayLabel(card, {
                    busy,
                  });
                  const expanded = expandedRow === key;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                      data-testid={`research-mobile-row-${card.iteration}`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setExpandedRow(expanded ? null : key)}
                      >
                        <div className="font-medium text-slate-100">
                          {pageModel.startIndex + idx + 1}. {aliasOf(card)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                          <span>{formatPct(card.netReturn)}</span>
                          <span>낙폭 {formatPct(card.maxDrawdown)}</span>
                          <span>거래 {card.tradeCount ?? "없음"}</span>
                          <span>{card.robustnessStatus}</span>
                          <Badge>{registrationLabel}</Badge>
                          {card.sampleConfidence !== "표본 충분" ? (
                            <Badge tone="warning">{card.sampleConfidence}</Badge>
                          ) : null}
                        </div>
                      </button>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {registered ? (
                          <Link href={backtestHref(card)}>
                            <Button size="sm">새 기간으로 백테스트</Button>
                          </Link>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void registerThenBacktest(card.iteration)
                            }
                          >
                            {busy ? "등록 중" : "전략 등록 후 백테스트"}
                          </Button>
                        )}
                        <RowMenu
                          card={card}
                          registered={registered}
                          busy={busy}
                          onDetail={() =>
                            setExpandedRow(expanded ? null : key)
                          }
                          onPromote={() => void promoteOne(card.iteration)}
                        />
                      </div>
                      {expanded ? (
                        <RowDetail
                          card={card}
                          cluster={clusterById.get(card.clusterId)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div
                className="mt-3 flex flex-wrap items-center gap-2"
                data-testid="explorer-pagination"
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageModel.page <= 1}
                  onClick={() => setPage(1)}
                  data-testid="explorer-page-first"
                >
                  처음
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageModel.page <= 1}
                  onClick={() => setPage(pageModel.page - 1)}
                  data-testid="explorer-page-prev"
                >
                  이전
                </Button>
                <span className="text-xs text-slate-300" data-testid="explorer-page-current">
                  {pageModel.page} / {pageModel.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageModel.page >= pageModel.totalPages}
                  onClick={() => setPage(pageModel.page + 1)}
                  data-testid="explorer-page-next"
                >
                  다음
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageModel.page >= pageModel.totalPages}
                  onClick={() => setPage(pageModel.totalPages)}
                  data-testid="explorer-page-last"
                >
                  마지막
                </Button>
              </div>
            </>
          )}
          </div>
        </details>
      </section>
    </div>
  );
}
