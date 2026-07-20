"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import type { SafeV44Params, StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";
import type { SafeParamCatalogEntry } from "@/src/lib/rextora/strategy/definition/safeParamCatalog";
import type { CanonicalStrategyDefinition, ConditionGroup, LeafCondition, LeafConditionType } from "@/src/lib/rextora/strategy/definition/types";
import { emptyGroup, newLeafId } from "@/src/lib/rextora/strategy/definition/types";
import { CandlestickChart, EquityCurveChart, ScatterChart } from "@/components/rextora/charts";
import type { CandlePoint, LevelLine, TradeMarker, ChartSeries, ScatterPoint } from "@/src/lib/rextora/charts/types";

const STEPS = [
  "전략 선택",
  "진입 조건",
  "청산 조건",
  "손절·익절",
  "자금 관리",
  "설정 확인",
  "백테스트",
  "모의 매매 적용",
  "실전 후보 등록"
] as const;

const CONDITION_OPTIONS: Array<{ type: LeafConditionType; label: string; category: LeafCondition["category"] }> = [
  { type: "bullish_structure", label: "상승 구조", category: "structure" },
  { type: "bearish_structure", label: "하락 구조", category: "structure" },
  { type: "break_of_structure", label: "구조 돌파", category: "structure" },
  { type: "change_of_character", label: "성격 전환(ChoCH)", category: "structure" },
  { type: "higher_high", label: "고점 갱신", category: "structure" },
  { type: "higher_low", label: "저점 상승", category: "structure" },
  { type: "bullish_order_block", label: "상승 오더블럭", category: "order_block" },
  { type: "bearish_order_block", label: "하락 오더블럭", category: "order_block" },
  { type: "bullish_fvg", label: "상승 FVG", category: "fvg" },
  { type: "bearish_fvg", label: "하락 FVG", category: "fvg" },
  { type: "support_trend_line", label: "지지 추세선", category: "trend_line" },
  { type: "resistance_trend_line", label: "저항 추세선", category: "trend_line" },
  { type: "support_zone", label: "지지 구간", category: "support_resistance" },
  { type: "resistance_zone", label: "저항 구간", category: "support_resistance" },
  { type: "ema", label: "EMA", category: "indicator" },
  { type: "sma", label: "SMA", category: "indicator" },
  { type: "rsi", label: "RSI", category: "indicator" },
  { type: "atr", label: "ATR", category: "indicator" },
  { type: "volume", label: "거래량", category: "indicator" },
  { type: "cost_guard", label: "거래 비용 제한", category: "filter" },
  { type: "breakout_volume_multiplier", label: "돌파 거래량 배수", category: "filter" }
];

type OverlayToggles = {
  entries: boolean;
  orderBlocks: boolean;
  fvg: boolean;
  trendLines: boolean;
  sr: boolean;
  volume: boolean;
  indicators: boolean;
};

function makeLeaf(type: LeafConditionType, category: LeafCondition["category"]): LeafCondition {
  return {
    id: newLeafId(),
    type,
    category,
    enabled: true,
    parameters: {
      pivot_lookback: 3,
      period: 14,
      max_age_bars: 40,
      tolerance_pct: 0.3,
      cost_guard_k: 3
    },
    comparison: type === "rsi" || type === "ema" || type === "sma" ? "below" : "true",
    value: type === "rsi" ? 70 : type === "cost_guard" ? 3 : true,
    validationStatus: "ok",
    description: CONDITION_OPTIONS.find((o) => o.type === type)?.label
  };
}

export function StrategyBuilderPanel() {
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [selectedId, setSelectedId] = useState("SAFE_v44_i4060");
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [catalog, setCatalog] = useState<SafeParamCatalogEntry[]>([]);
  const [editParams, setEditParams] = useState<SafeV44Params | null>(null);
  const [editName, setEditName] = useState("");
  const [timeframe, setTimeframe] = useState("15m");
  const [longGroup, setLongGroup] = useState<ConditionGroup>(emptyGroup("AND"));
  const [shortGroup, setShortGroup] = useState<ConditionGroup>(emptyGroup("AND"));
  const [sl, setSl] = useState(1.5);
  const [tp, setTp] = useState(3);
  const [maxHold, setMaxHold] = useState(48);
  const [basePct, setBasePct] = useState(0.02);
  const [costK, setCostK] = useState(3);
  const [preview, setPreview] = useState<{
    candles: CandlePoint[];
    markers: TradeMarker[];
    levels: LevelLine[];
    empty?: boolean;
    emptyLabel?: string;
  } | null>(null);
  const [overlays, setOverlays] = useState<OverlayToggles>({
    entries: true,
    orderBlocks: true,
    fvg: true,
    trendLines: true,
    sr: true,
    volume: true,
    indicators: false
  });
  const [compare, setCompare] = useState<{
    rows: Array<Record<string, unknown>>;
    scatter: ScatterPoint[];
  } | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const selected = strategies.find((s) => s.id === selectedId) ?? null;
  const isLocked = Boolean(selected?.locked);

  const load = useCallback(async () => {
    const [sRes, cRes] = await Promise.all([
      fetch("/api/rextora/strategies"),
      fetch("/api/rextora/strategies?catalog=safe_params")
    ]);
    const sJson = await sRes.json();
    const cJson = await cRes.json();
    const list = (sJson.data ?? []) as StoredStrategy[];
    setStrategies(list);
    setCatalog(cJson.data ?? []);
    const cur = list.find((s) => s.id === selectedId) ?? list[0];
    if (cur) {
      setSelectedId(cur.id);
      setEditParams({ ...cur.params });
      setEditName(cur.name);
      setTimeframe(cur.timeframe === "unknown" ? "15m" : cur.timeframe);
      setSl(cur.params.sl_atr_mult);
      setTp(cur.params.tp_atr_mult);
      setMaxHold(cur.params.max_hold_bars);
      setBasePct(cur.params.base_bal_pct);
      setCostK(cur.params.cost_guard_k);
    }
  }, [selectedId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/rextora/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: selectedId, ...extra })
    });
    const json = await res.json();
    setMessage(json.ok ? "완료" : json.error ?? "실패했습니다.");
    setDirty(false);
    await load();
    if (json.data?.id) setSelectedId(json.data.id);
    return json;
  }

  function buildDefinition(): CanonicalStrategyDefinition {
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      strategyId: selectedId,
      strategyName: editName,
      description: selected?.description ?? "",
      version: "1.0.0",
      strategyType: (selected as { strategyType?: string })?.strategyType === "condition_builder" ? "condition_builder" : "safe_params",
      sourceStrategyId: (selected as { sourceStrategyId?: string | null })?.sourceStrategyId ?? null,
      locked: false,
      createdAt: selected?.createdAt ?? now,
      updatedAt: now,
      timeframe: timeframe as CanonicalStrategyDefinition["timeframe"],
      symbols: ["BTCUSDT"],
      longEnabled: true,
      shortEnabled: true,
      entryConditions: { long: longGroup, short: shortGroup },
      exitConditions: { long: emptyGroup("OR"), short: emptyGroup("OR") },
      filters: {},
      risk: {
        stopLossAtrMult: sl,
        takeProfitAtrMult: tp,
        useTrailing: editParams?.use_trailing ?? false,
        trailAtrMult: editParams?.trail_atr_mult ?? 2,
        maxHoldBars: maxHold,
        oppositeSignalExit: true,
        structureInvalidationExit: false,
        partialExitEnabled: false
      },
      positionSizing: {
        baseBalancePct: basePct,
        sizeMin: editParams?.size_min ?? 0.5,
        sizeMax: editParams?.size_max ?? 1.5,
        useVolTarget: editParams?.use_vol_target ?? false,
        targetAtrPct: editParams?.target_atr_pct ?? 0.02
      },
      execution: {
        costGuardEnabled: true,
        costGuardK: costK,
        cooldownBars: editParams?.cooldown_bars ?? 2,
        longEnabled: true,
        shortEnabled: true
      },
      metadata: {},
      paramsHash: selected?.paramsHash ?? "",
      safeParams: editParams as unknown as Record<string, number | boolean>
    };
  }

  async function saveAll() {
    if (isLocked) {
      setMessage("원본 보호 전략은 저장할 수 없습니다. 복사본을 만드세요.");
      return;
    }
    const params = editParams
      ? {
          ...editParams,
          sl_atr_mult: sl,
          tp_atr_mult: tp,
          max_hold_bars: maxHold,
          base_bal_pct: basePct,
          cost_guard_k: costK
        }
      : undefined;
    const definition = buildDefinition();
    await act("save", { patch: { name: editName, timeframe, params, definition } });
  }

  async function loadPreview() {
    const res = await fetch(`/api/rextora/strategies/preview?id=${selectedId}&symbol=BTCUSDT&interval=${timeframe}`);
    const json = await res.json();
    if (!json.ok) {
      setMessage(json.error ?? "미리보기 실패");
      return;
    }
    setPreview(json.data);
  }

  async function runCompare() {
    const ids = [selectedId, "SAFE_v44_i4060"].filter((v, i, a) => a.indexOf(v) === i);
    const res = await fetch("/api/rextora/strategies/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    });
    const json = await res.json();
    if (json.ok) setCompare(json.data);
  }

  const filteredLevels = useMemo(() => {
    if (!preview?.levels) return [];
    return preview.levels.filter((l) => {
      if (l.label.includes("OB") && !overlays.orderBlocks) return false;
      if (l.label.includes("FVG") && !overlays.fvg) return false;
      if (l.label.includes("추세") && !overlays.trendLines) return false;
      if ((l.label.includes("지지") || l.label.includes("저항")) && !overlays.sr) return false;
      if ((l.label.includes("손절") || l.label.includes("익절")) && !overlays.indicators) return false;
      return true;
    });
  }, [preview, overlays]);

  function addCondition(side: "long" | "short", type: LeafConditionType) {
    const opt = CONDITION_OPTIONS.find((o) => o.type === type)!;
    const leaf = makeLeaf(type, opt.category);
    if (side === "long") {
      setLongGroup((g) => ({ ...g, children: [...g.children, leaf] }));
    } else {
      setShortGroup((g) => ({ ...g, children: [...g.children, leaf] }));
    }
    setDirty(true);
  }

  function statusBadge(s: StoredStrategy) {
    if (s.locked) return <Badge tone="warning">원본 보호 전략</Badge>;
    if (s.liveEligible) return <Badge tone="success">사용 가능</Badge>;
    return <Badge>검증 필요</Badge>;
  }

  return (
    <div className="space-y-4" data-testid="strategy-builder">
      <div className="sr-only" data-testid="strategy-manager" />
      {dirty && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">저장되지 않은 변경이 있습니다.</div>
      )}
      {isLocked && (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 text-sm text-orange-100" data-testid="strategy-locked-hint">
          원본 보호 전략입니다. 값을 확인할 수 있지만 직접 수정·삭제할 수 없습니다. 복사본 전략을 만들어 편집하세요.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-xs ${step === i ? "border-sky-500 bg-sky-500/20 text-white" : "border-slate-700 text-slate-400"}`}
            onClick={() => setStep(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button tone="muted" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          이전
        </Button>
        {step === 0 && (
          <>
            {!isLocked && (
              <Button tone="success" data-testid="strategy-create" onClick={() => void act("create", { name: `내전략_${Date.now().toString(36)}`, strategyType: "condition_builder", timeframe: "15m" })}>
                새 전략 만들기
              </Button>
            )}
            {isLocked ? (
              <Button tone="success" data-testid="strategy-copy" onClick={() => void act("clone")}>
                복사해서 수정하기
              </Button>
            ) : (
              <Button data-testid="strategy-copy" onClick={() => void act("clone")}>
                복사본 만들기
              </Button>
            )}
          </>
        )}
        {step >= 1 && step <= 5 && !isLocked && (
          <Button tone="success" data-testid="strategy-save" onClick={() => void saveAll()}>
            저장 후 다음
          </Button>
        )}
        {step === 6 && (
          <a href="/backtest" className="rounded-lg border border-sky-600 bg-sky-600/20 px-3 py-2 text-sm text-sky-100" data-testid="strategy-backtest-link">
            백테스트 실행
          </a>
        )}
        {step === 7 && (
          <Button tone="success" data-testid="strategy-apply-paper" onClick={() => void act("apply_paper")}>
            모의 매매 적용
          </Button>
        )}
        {step === 8 && !isLocked && (
          <Button tone="warning" data-testid="strategy-apply-live" onClick={() => void act("mark_live_candidate")}>
            실전 후보 등록
          </Button>
        )}
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>다음</Button>
        )}
        <Button onClick={() => setAdvanced((v) => !v)}>{advanced ? "고급 설정 닫기" : "고급 설정"}</Button>
        {advanced && !isLocked && (
          <details className="w-full rounded-lg border border-slate-700 p-2 text-sm text-slate-300">
            <summary className="cursor-pointer text-slate-200">추가 작업</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (editParams && selected) {
                    setEditParams({ ...selected.params });
                    setDirty(false);
                    setMessage("변경을 되돌렸습니다.");
                  }
                }}
              >
                초기화
              </Button>
              <Button disabled={isLocked} onClick={() => void act("restore")}>
                원본 값으로 복원
              </Button>
              <Button tone="danger" data-testid="strategy-delete" disabled={isLocked} onClick={() => void act("delete")}>
                복사본 삭제
              </Button>
              <Button onClick={() => void runCompare()}>비교</Button>
            </div>
          </details>
        )}
      </div>
      {message && <p className="text-sm text-slate-300">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card title="전략 목록" data-testid="strategy-list">
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {strategies.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`strategy-row-${s.id}`}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedId === s.id ? "border-sky-500 bg-sky-500/10" : "border-slate-800"}`}
                onClick={() => {
                  setSelectedId(s.id);
                  setEditParams({ ...s.params });
                  setEditName(s.name);
                  setDirty(false);
                }}
              >
                <div className="font-medium text-white">{s.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">{statusBadge(s)}</div>
                <div className="mt-1 text-[11px] text-slate-500">고유번호 {s.id}</div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {step === 0 && (
            <Card title="1. 전략 선택">
              <p className="mb-3 text-sm text-slate-400">원본 보호 전략을 복사하거나, 내 복사본·새 전략을 선택하세요.</p>
              <div className="mb-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100">원본 보호 전략</div>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">내 복사본</div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">새 전략 만들기</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-300">
                  전략 이름
                  <input className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={editName} disabled={isLocked} onChange={(e) => { setEditName(e.target.value); setDirty(true); }} />
                </label>
                <label className="text-sm text-slate-300">
                  적용 시간봉
                  <select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" value={timeframe} disabled={isLocked} onChange={(e) => { setTimeframe(e.target.value); setDirty(true); }}>
                    {["1m", "3m", "5m", "15m", "1h"].map((tf) => (
                      <option key={tf} value={tf}>{tf === "1h" ? "1시간봉" : `${tf.replace("m", "")}분봉`}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <Metric label="전략 고유번호" value={selected?.id ?? "-"} />
                <Metric label="상태" value={isLocked ? "원본 보호" : "복사본 전략"} />
                <Metric label="모의 적용" value={selected?.paperActive ? "예" : "아니오"} />
                <Metric label="실전 후보" value={selected?.liveEligible ? "예" : "아니오"} />
              </div>
            </Card>
          )}

          {(step === 1 || step === 2) && (
            <Card title={step === 1 ? "2. 매수 조건 설정" : "3. 매도 조건 설정"}>
              <div className="mb-2 flex flex-wrap gap-2">
                <select
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                  disabled={isLocked}
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    addCondition(step === 1 ? "long" : "short", e.target.value as LeafConditionType);
                    e.target.value = "";
                  }}
                >
                  <option value="">조건 추가…</option>
                  {CONDITION_OPTIONS.map((o) => (
                    <option key={o.type} value={o.type}>{o.label}</option>
                  ))}
                </select>
                <Badge>{step === 1 ? longGroup.operator : shortGroup.operator} 그룹</Badge>
              </div>
              <ConditionList
                group={step === 1 ? longGroup : shortGroup}
                locked={isLocked}
                onChange={(g) => {
                  if (step === 1) setLongGroup(g);
                  else setShortGroup(g);
                  setDirty(true);
                }}
              />
              {isLocked && (
                <p className="mt-2 text-xs text-slate-400">원본 SAFE는 조건 트리 대신 확인된 파라미터로 동작합니다. 아래에서 파라미터를 확인하세요.</p>
              )}
            </Card>
          )}

          {step === 3 && (
            <Card title="4. 손절·익절 설정">
              <div className="grid gap-3 md:grid-cols-3">
                <Num label="손절 기준 (ATR 배수)" value={sl} disabled={isLocked} onChange={(v) => { setSl(v); setDirty(true); }} />
                <Num label="익절 기준 (ATR 배수)" value={tp} disabled={isLocked} onChange={(v) => { setTp(v); setDirty(true); }} />
                <Num label="최대 보유 시간 (봉)" value={maxHold} disabled={isLocked} onChange={(v) => { setMaxHold(v); setDirty(true); }} />
              </div>
            </Card>
          )}

          {step === 4 && (
            <Card title="5. 자금 관리 설정">
              <div className="grid gap-3 md:grid-cols-2">
                <Num label="진입 금액 비율" value={basePct} step={0.001} disabled={isLocked} onChange={(v) => { setBasePct(v); setDirty(true); }} />
                <Num label="거래 비용 제한 배수" value={costK} step={0.1} disabled={isLocked} onChange={(v) => { setCostK(v); setDirty(true); }} />
              </div>
            </Card>
          )}

          {step >= 5 && (
            <Card title="6. 조건 확인 · 미리보기">
              <div className="mb-2 flex flex-wrap gap-2">
                <Button onClick={() => void loadPreview()}>차트 미리보기</Button>
                {(
                  [
                    ["entries", "진입·청산"],
                    ["orderBlocks", "오더블럭"],
                    ["fvg", "FVG"],
                    ["trendLines", "추세선"],
                    ["sr", "지지·저항"],
                    ["volume", "거래량"],
                    ["indicators", "기술지표"]
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`rounded border px-2 py-1 text-xs ${overlays[key] ? "border-sky-500 text-sky-200" : "border-slate-700 text-slate-500"}`}
                    onClick={() => setOverlays((o) => ({ ...o, [key]: !o[key] }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {preview?.empty ? (
                <p className="text-sm text-slate-400">{preview.emptyLabel ?? "캔들 데이터가 없습니다."}</p>
              ) : preview?.candles?.length ? (
                <CandlestickChart
                  title={`${selected?.name ?? ""} 미리보기`}
                  candles={preview.candles}
                  markers={overlays.entries ? preview.markers : []}
                  levels={filteredLevels}
                  height={320}
                  showVolume={overlays.volume}
                />
              ) : (
                <p className="text-sm text-slate-500">미리보기를 실행하세요.</p>
              )}
            </Card>
          )}

          <Card title={isLocked ? "원본 파라미터 확인" : "SAFE 스타일 파라미터"}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {catalog.map((entry) => {
                const confirmed = entry.confirmedInDataFile;
                const raw = editParams?.[entry.key];
                const display = confirmed ? String(raw ?? "") : "원본에서 확인되지 않음";
                const canEdit = !isLocked && confirmed;
                return (
                  <div key={entry.key} className="rounded-lg border border-slate-800 p-3 text-sm">
                    <div className="font-medium text-white">{entry.koreanName}</div>
                    <div className="mt-1 text-xs text-slate-500" title={entry.key}>
                      {entry.sourceLabel} · {entry.unit}
                    </div>
                    {canEdit && typeof raw === "number" ? (
                      <input
                        type="number"
                        className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                        value={raw}
                        onChange={(e) => {
                          setEditParams((p) => (p ? { ...p, [entry.key]: Number(e.target.value) } : p));
                          setDirty(true);
                        }}
                      />
                    ) : canEdit && typeof raw === "boolean" ? (
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={raw}
                          onChange={(e) => {
                            setEditParams((p) => (p ? { ...p, [entry.key]: e.target.checked } : p));
                            setDirty(true);
                          }}
                        />
                        {raw ? "켜짐" : "꺼짐"}
                      </label>
                    ) : (
                      <div className={`mt-2 ${confirmed ? "text-slate-200" : "text-amber-200"}`}>{display}</div>
                    )}
                    <p className="mt-2 text-[11px] text-slate-400">{entry.explanation}</p>
                    {advanced && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        ↑ {entry.increaseEffect} / ↓ {entry.decreaseEffect}
                        {entry.min != null && entry.max != null ? ` · 범위 ${String(entry.min)}~${String(entry.max)}` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {compare && (
            <Card title="전략 비교 (저장된 백테스트만)">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th>전략</th>
                      <th>순수익</th>
                      <th>최대낙폭</th>
                      <th>승률</th>
                      <th>손익비</th>
                      <th>거래수</th>
                      <th>평균거래</th>
                      <th>수수료</th>
                      <th>펀딩</th>
                      <th>슬리피지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.rows.map((r) => (
                      <tr key={String(r.id)} className="border-t border-slate-900">
                        <td className="py-2">{String(r.name)}</td>
                        <td>{r.netReturn == null ? "데이터 없음" : `${(Number(r.netReturn) * 100).toFixed(2)}%`}</td>
                        <td>{r.mdd == null ? "데이터 없음" : `${(Number(r.mdd) * 100).toFixed(2)}%`}</td>
                        <td>{r.winRate == null ? "데이터 없음" : `${(Number(r.winRate) * 100).toFixed(1)}%`}</td>
                        <td>{r.profitFactor == null ? "데이터 없음" : String(r.profitFactor)}</td>
                        <td>{r.tradeCount == null ? "데이터 없음" : String(r.tradeCount)}</td>
                        <td>{r.averageTrade == null ? "데이터 없음" : `${(Number(r.averageTrade) * 100).toFixed(2)}%`}</td>
                        <td>{r.fee == null ? "데이터 없음" : String(r.fee)}</td>
                        <td>{r.funding == null ? "데이터 없음" : String(r.funding)}</td>
                        <td>{r.slippage == null ? "데이터 없음" : String(r.slippage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ScatterChart title="위험 대비 수익" points={compare.scatter} height={200} />
                {compare.rows[0]?.equitySeries ? (
                  <EquityCurveChart
                    title="에쿼티"
                    series={(compare.rows.map((r) => r.equitySeries).filter(Boolean) as ChartSeries[])}
                    height={200}
                    area={false}
                  />
                ) : (
                  <p className="text-sm text-slate-400">에쿼티 데이터 없음</p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  disabled,
  step = 0.01
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        type="number"
        step={step}
        disabled={disabled}
        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ConditionList({
  group,
  onChange,
  locked
}: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  locked: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={locked}
          className={`rounded border px-2 py-1 text-xs ${group.operator === "AND" ? "border-sky-500" : "border-slate-700"}`}
          onClick={() => onChange({ ...group, operator: "AND" })}
        >
          그리고(AND)
        </button>
        <button
          type="button"
          disabled={locked}
          className={`rounded border px-2 py-1 text-xs ${group.operator === "OR" ? "border-sky-500" : "border-slate-700"}`}
          onClick={() => onChange({ ...group, operator: "OR" })}
        >
          또는(OR)
        </button>
      </div>
      {group.children.length === 0 && <p className="text-xs text-slate-500">조건이 없습니다. 조건을 추가하세요.</p>}
      {group.children.map((child, idx) => {
        if (child.type === "group") return null;
        const leaf = child as LeafCondition;
        return (
          <div key={leaf.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 px-2 py-2 text-sm">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                disabled={locked}
                checked={leaf.enabled}
                onChange={(e) => {
                  const children = [...group.children];
                  children[idx] = { ...leaf, enabled: e.target.checked };
                  onChange({ ...group, children });
                }}
              />
              사용
            </label>
            <span className="text-slate-200">{leaf.description ?? leaf.type}</span>
            <button
              type="button"
              disabled={locked || idx === 0}
              className="text-xs text-slate-400"
              onClick={() => {
                const children = [...group.children];
                [children[idx - 1], children[idx]] = [children[idx], children[idx - 1]];
                onChange({ ...group, children });
              }}
            >
              위로
            </button>
            <button
              type="button"
              disabled={locked}
              className="text-xs text-red-300"
              onClick={() => onChange({ ...group, children: group.children.filter((c) => c.id !== leaf.id) })}
            >
              삭제
            </button>
          </div>
        );
      })}
    </div>
  );
}
