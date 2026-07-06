"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import type { LiveReadinessChecklistItem } from "@/src/lib/rextora/liveReadinessChecklist";

type ReadinessPayload = {
  checklist: LiveReadinessChecklistItem[];
  remainingBlocks: string[];
  liveReady: boolean;
  liveStatus: string;
  liveAllowed: boolean;
};

type ApiEnvelope<T> = { ok: boolean; data: T };

function statusTone(status: LiveReadinessChecklistItem["status"]) {
  if (status === "passed") return "success" as const;
  if (status === "needed" || status === "warning") return "warning" as const;
  return "danger" as const;
}

function ChecklistRow({ item }: { item: LiveReadinessChecklistItem }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2" data-testid={`live-readiness-${item.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rextora-body font-medium text-slate-100">{item.label}</span>
        <Badge tone={statusTone(item.status)}>{item.statusLabel}</Badge>
      </div>
      <p className="rextora-helper mt-2 text-slate-400">설명: {item.description}</p>
      <p className="rextora-helper mt-1 text-slate-300">다음 조치: {item.nextAction}</p>
    </div>
  );
}

export function LiveReadinessPanel() {
  const [data, setData] = useState<ReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rextora/live/readiness", { cache: "no-store" });
      const body = (await res.json()) as ApiEnvelope<ReadinessPayload>;
      if (body.ok) setData(body.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading && !data) {
    return (
      <Card title="실전 실행 상태" data-testid="live-readiness-panel">
        <p className="rextora-helper">실전 실행 상태를 불러오는 중입니다...</p>
      </Card>
    );
  }

  const readyLabel = data?.liveReady ? "실전 거래 실행 가능" : data?.liveAllowed ? "일부 조건 미충족" : "설정에서 LIVE 실전 거래를 켜야 합니다.";

  return (
    <div className="space-y-3" data-testid="live-readiness-panel">
      <Card title="실전 실행 상태" data-testid="live-execution-status-card">
        <p
          className={`rextora-helper mb-3 rounded-lg border p-3 ${data?.liveReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-orange-500/30 bg-orange-500/10 text-orange-100"}`}
          data-testid="live-execution-status-summary"
        >
          {readyLabel}
        </p>
        {data?.remainingBlocks?.length ? (
          <div className="rextora-helper mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-orange-100">
            <p className="font-medium">남은 실행 차단 사유</p>
            <ol className="mt-2 list-decimal pl-5">
              {data.remainingBlocks.map((block) => (
                <li key={block}>{block}</li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="space-y-2">
          {data?.checklist.map((item) => <ChecklistRow key={item.id} item={item} />)}
        </div>
      </Card>
    </div>
  );
}
