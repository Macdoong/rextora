"use client";

import { useEffect, useState } from "react";
import { AiCandidateDetailTable } from "@/components/rextora/AiCandidateTopTable";
import { PageHeader } from "@/components/rextora/StatusCards";
import { EmptyState } from "@/components/rextora/EmptyState";
import { ErrorState } from "@/components/rextora/ErrorState";
import { LoadingState } from "@/components/rextora/LoadingState";
import { PanelErrorBoundary, StaleDataBadge } from "@/components/rextora/PanelShell";
import { Button } from "@/components/ui/primitives";
import type { AiCandidate } from "@/lib/types";

type ApiEnvelope<T> = { ok: boolean; data: T; meta: { cached: boolean; durationMs: number } };

export default function AiCandidatesPage() {
  const [candidates, setCandidates] = useState<AiCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState<ApiEnvelope<{ candidates: AiCandidate[] }>["meta"] | null>(null);

  useEffect(() => {
    let active = true;
    const run = async (force = false) => {
      if (force) setRefreshing(true);
      try {
        const response = await fetch(`/api/rextora/candidates${force ? "?force=true" : ""}`, { cache: "no-store" });
        if (!response.ok) {
          if (active) setError(true);
          return;
        }
        const body = (await response.json()) as ApiEnvelope<{ candidates: AiCandidate[] }>;
        if (body.ok && active) {
          setCandidates(body.data.candidates);
          setMeta(body.meta);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const refresh = () => {
    void (async () => {
      setRefreshing(true);
      try {
        const response = await fetch("/api/rextora/candidates?force=true", { cache: "no-store" });
        if (!response.ok) {
          setError(true);
          return;
        }
        const body = (await response.json()) as ApiEnvelope<{ candidates: AiCandidate[] }>;
        if (body.ok) {
          setCandidates(body.data.candidates);
          setMeta(body.meta);
          setError(false);
        }
      } catch {
        setError(true);
      } finally {
        setRefreshing(false);
      }
    })();
  };

  return (
    <>
      <PageHeader
        title="AI 후보 랭킹"
        description="AI 후보는 바로 매수/매도하라는 뜻이 아니라, 비용과 리스크를 통과한 검토 대상입니다."
      />
      <div className="mb-3 flex items-center gap-2">
        <StaleDataBadge cached={meta?.cached} />
        <Button tone="muted" data-testid="candidates-refresh" onClick={refresh} disabled={refreshing}>
          {refreshing ? "갱신 중…" : "새로고침"}
        </Button>
      </div>
      <PanelErrorBoundary title="AI 후보">
        {loading ? (
          <LoadingState lines={8} />
        ) : error ? (
          <ErrorState onRetry={refresh} />
        ) : candidates.length === 0 ? (
          <EmptyState hint="시장 감시가 완료되면 후보가 표시됩니다." />
        ) : (
          <AiCandidateDetailTable candidates={candidates} />
        )}
      </PanelErrorBoundary>
    </>
  );
}
