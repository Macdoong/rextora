"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import type { SafeV44Params, StoredStrategy } from "@/src/lib/rextora/strategy/strategyTypes";

export function StrategyManagerPanel() {
  const [strategies, setStrategies] = useState<StoredStrategy[]>([]);
  const [selectedId, setSelectedId] = useState<string>("SAFE_v44_i4060");
  const [message, setMessage] = useState("");
  const [editParams, setEditParams] = useState<SafeV44Params | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/rextora/strategies");
    const json = await res.json();
    const list = (json.data ?? []) as StoredStrategy[];
    setStrategies(list);
    if (list.length && !list.find((s) => s.id === selectedId)) setSelectedId(list[0].id);
  }, [selectedId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const selected = strategies.find((s) => s.id === selectedId) ?? null;

  function selectStrategy(id: string) {
    setSelectedId(id);
    const s = strategies.find((item) => item.id === id);
    if (s) {
      setEditParams({ ...s.params });
      setEditName(s.name);
    }
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/rextora/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: selectedId, ...extra })
    });
    const json = await res.json();
    setMessage(json.ok ? "완료" : json.error ?? "실패");
    await load();
    if (json.data?.id) setSelectedId(json.data.id);
  }

  function updateParam<K extends keyof SafeV44Params>(key: K, value: SafeV44Params[K]) {
    if (!editParams) return;
    setEditParams({ ...editParams, [key]: value });
  }

  return (
    <div className="space-y-4" data-testid="strategy-manager">
      <div className="flex flex-wrap gap-2">
        <Button tone="success" data-testid="strategy-create" onClick={() => void act("create", { name: `사용자전략_${Date.now().toString(36)}` })}>
          새 전략 만들기
        </Button>
        <Button data-testid="strategy-copy" onClick={() => void act("copy")}>
          전략 복사
        </Button>
        <Button
          tone="success"
          data-testid="strategy-save"
          disabled={selected?.locked}
          onClick={() => void act("save", { patch: { name: editName, params: editParams } })}
        >
          전략 저장
        </Button>
        <Button tone="danger" data-testid="strategy-delete" disabled={selected?.locked} onClick={() => void act("delete")}>
          전략 삭제
        </Button>
        <Button data-testid="strategy-apply-paper" onClick={() => void act("apply_paper")}>
          모의 매매에 적용
        </Button>
        <Button tone="warning" data-testid="strategy-apply-live" onClick={() => void act("apply_live")}>
          실전 전략으로 지정
        </Button>
        <a href="/backtest" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
          백테스트 실행
        </a>
      </div>
      {message && <p className="text-sm text-slate-300">{message}</p>}
      {selected?.locked && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100" data-testid="strategy-locked-hint">
          SAFE_v44_i4060은 잠긴 원본입니다. 수정하려면 복사본을 만드세요.
        </p>
      )}

      <Card title="전략 목록" data-testid="strategy-list">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm text-slate-200">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2">전략명</th>
                <th>유형</th>
                <th>타임프레임</th>
                <th>params_hash</th>
                <th>최근 수익률</th>
                <th>MDD</th>
                <th>거래 수</th>
                <th>승률</th>
                <th>실전</th>
                <th>활성</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr
                  key={s.id}
                  className={`cursor-pointer border-t border-slate-900 ${selectedId === s.id ? "bg-violet-500/10" : ""}`}
                  data-testid={`strategy-row-${s.id}`}
                  onClick={() => selectStrategy(s.id)}
                >
                  <td className="py-2">
                    {s.name} {s.locked && <Badge tone="warning">잠금</Badge>}
                  </td>
                  <td>{s.type}</td>
                  <td>{s.timeframe === "unknown" ? "원본 확인 필요" : s.timeframe}</td>
                  <td className="font-mono text-xs">{s.paramsHash}</td>
                  <td>{s.lastBacktest ? `${(s.lastBacktest.totalReturn * 100).toFixed(1)}%` : "-"}</td>
                  <td>{s.lastBacktest ? `${(s.lastBacktest.mdd * 100).toFixed(1)}%` : "-"}</td>
                  <td>{s.lastBacktest?.trades ?? "-"}</td>
                  <td>{s.lastBacktest ? `${(s.lastBacktest.winRate * 100).toFixed(1)}%` : "-"}</td>
                  <td>{s.liveActive ? "지정" : "-"}</td>
                  <td>{s.paperActive ? "모의" : s.liveActive ? "실전" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && editParams && (
        <>
          <Card title="전략 상세" data-testid="strategy-details">
            <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <div>전략명: {selected.locked ? selected.name : <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1" value={editName} onChange={(e) => setEditName(e.target.value)} />}</div>
              <div>설명: {selected.description}</div>
              <div>유형: {selected.type}</div>
              <div>타임프레임: {selected.timeframe === "unknown" ? "전략 원본 타임프레임 확인 필요" : selected.timeframe}</div>
              <div>롱 조건: {selected.longConditionSummary}</div>
              <div>숏 조건: {selected.shortConditionSummary}</div>
              <div>손절: {selected.stopLossSummary}</div>
              <div>익절: {selected.takeProfitSummary}</div>
              <div>트레일링: {selected.params.use_trailing ? "사용" : "미사용"}</div>
              <div>동적 레버리지: {selected.params.use_dynamic_leverage ? "사용" : "미사용"}</div>
              <div>비용 방어: {selected.params.cost_guard ? `사용 (k=${selected.params.cost_guard_k})` : "미사용"}</div>
              <div>params_hash: <span className="font-mono">{selected.paramsHash}</span></div>
              <div>source: {selected.sourceFile ?? "-"}</div>
              <div>sourceStatus: {selected.sourceStatus}</div>
            </div>
          </Card>

          <Card title="파라미터 편집" data-testid="strategy-param-editor">
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  ["ema_fast", "Trend EMA Fast"],
                  ["ema_mid", "Trend EMA Mid"],
                  ["ema_slow", "Trend EMA Slow"],
                  ["rsi_period", "RSI Period"],
                  ["rsi_max_long", "RSI Max Long"],
                  ["atr_period", "ATR Period"],
                  ["sl_atr_mult", "SL ATR"],
                  ["tp_atr_mult", "TP ATR"],
                  ["trail_atr_mult", "Trail ATR"],
                  ["vol_ratio_min", "Volume Min"],
                  ["max_hold_bars", "Max Hold"],
                  ["cooldown_bars", "Cooldown"],
                  ["lev_min", "Lev Min"],
                  ["lev_base", "Lev Base"],
                  ["lev_max", "Lev Max"],
                  ["cost_guard_k", "Cost Guard K"],
                  ["base_bal_pct", "Base Bal %"]
                ] as Array<[keyof SafeV44Params, string]>
              ).map(([key, label]) => (
                <label key={key} className="text-xs text-slate-400">
                  {label}
                  <input
                    type="number"
                    step="any"
                    disabled={selected.locked}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                    value={Number(editParams[key])}
                    onChange={(e) => updateParam(key, Number(e.target.value) as never)}
                  />
                </label>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
