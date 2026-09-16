"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  SectionHeader,
  StatusBanner,
} from "@/components/ui/primitives";
import { DemoDataBadge } from "@/components/rextora/DemoDataBadge";
import type { FirstRunMode, FirstRunStatus } from "@/src/lib/rextora/firstRun/firstRunStatus";

type FirstRunPayload = {
  status: FirstRunStatus;
  deepLinks?: {
    results: string | null;
    backtest: string | null;
    paper: string | null;
  };
};

type InitPhase = "idle" | "confirming" | "working" | "done" | "error" | "cancelled";
type ResetPhase = "idle" | "confirming" | "working" | "done" | "error";

function modeLabel(mode: FirstRunMode): string {
  switch (mode) {
    case "EMPTY":
      return "최초 실행";
    case "DEMO_AVAILABLE":
      return "데모 준비됨";
    case "DEMO_ACTIVE":
      return "데모 활성";
    case "REAL_DATA_PRESENT":
      return "실제 데이터";
    case "MIXED":
      return "데모+실제";
    case "SETUP_COMPLETE":
      return "설정 완료";
    default:
      return mode;
  }
}

export function FirstRunOnboarding({
  forceShow,
}: {
  forceShow?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<FirstRunPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initPhase, setInitPhase] = useState<InitPhase>("idle");
  const [resetPhase, setResetPhase] = useState<ResetPhase>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [initResult, setInitResult] = useState<{
    resultsDeepLink: string;
    backtestDeepLink: string;
    paperDeepLink: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/rextora/first-run", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) {
        setLoadError(json.error ?? "최초 실행 상태를 불러오지 못했습니다.");
        return;
      }
      setPayload(json.data as FirstRunPayload);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "최초 실행 상태 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const status = payload?.status;
  const urlWantsDemoConfirm = searchParams.get("firstRun") === "demo";
  const demoConfirmOpen =
    initPhase === "confirming" ||
    (urlWantsDemoConfirm &&
      initPhase !== "working" &&
      initPhase !== "done" &&
      initPhase !== "error" &&
      initPhase !== "cancelled");

  const showOnboarding =
    forceShow ||
    status?.recommendedAction === "show_onboarding" ||
    status?.mode === "EMPTY" ||
    status?.mode === "DEMO_AVAILABLE" ||
    searchParams.get("firstRun") === "1" ||
    searchParams.get("firstRun") === "demo";

  const showDemoBanner =
    status?.mode === "DEMO_ACTIVE" || status?.mode === "MIXED";

  async function confirmInitDemo() {
    setInitPhase("working");
    setActionError(null);
    try {
      const res = await fetch("/api/rextora/first-run/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setActionError(json.error ?? "데모 초기화 실패");
        setInitPhase("error");
        return;
      }
      const result = json.data?.result as {
        resultsDeepLink: string;
        backtestDeepLink: string;
        paperDeepLink: string;
      };
      setInitResult(result);
      setInitPhase("done");
      await refresh();
      if (result?.resultsDeepLink) {
        router.push(result.resultsDeepLink);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "데모 초기화 실패");
      setInitPhase("error");
    }
  }

  async function confirmResetDemo() {
    setResetPhase("working");
    setActionError(null);
    try {
      const res = await fetch("/api/rextora/first-run/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setActionError(json.error ?? "데모 초기화 해제 실패");
        setResetPhase("error");
        return;
      }
      setResetPhase("done");
      setInitResult(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "데모 초기화 해제 실패");
      setResetPhase("error");
    }
  }

  async function dismissSetup() {
    await fetch("/api/rextora/first-run/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    await refresh();
  }

  async function leaveDemoToReal() {
    await fetch("/api/rextora/first-run/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    router.push("/strategy-search");
  }

  if (loading && !status) {
    return (
      <StatusBanner
        status="loading"
        message="최초 실행 상태를 확인하고 있습니다."
        data-testid="first-run-loading"
      />
    );
  }

  if (loadError) {
    return (
      <StatusBanner
        status="error"
        message={loadError}
        data-testid="first-run-load-error"
      />
    );
  }

  return (
    <div className="space-y-4 v3-oc-firstrun" data-testid="first-run-root">
      {showDemoBanner ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          data-testid="demo-mode-banner"
        >
          <DemoDataBadge />
          <p className="text-sm text-amber-50">
            데모 워크스페이스가 활성입니다. 예시는 실전 증거가 아니며 Paper/Live는
            자동 시작되지 않습니다.
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            {payload?.deepLinks?.results ? (
              <Link href={payload.deepLinks.results}>
                <Button size="sm" variant="secondary">
                  데모 결과
                </Button>
              </Link>
            ) : null}
            {payload?.deepLinks?.backtest ? (
              <Link href={payload.deepLinks.backtest}>
                <Button size="sm" variant="secondary">
                  데모 백테스트
                </Button>
              </Link>
            ) : null}
            {payload?.deepLinks?.paper ? (
              <Link href={payload.deepLinks.paper}>
                <Button size="sm" variant="secondary">
                  Paper 승인 화면
                </Button>
              </Link>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setResetPhase("confirming")}
              data-testid="first-run-reset-demo"
            >
              데모만 초기화
            </Button>
            <Button
              size="sm"
              onClick={() => void leaveDemoToReal()}
              data-testid="first-run-leave-demo"
            >
              실제 전략 탐색 시작
            </Button>
          </div>
        </div>
      ) : null}

      {showOnboarding ? (
        <Card data-testid="first-run-onboarding" className="v3-card">
          <SectionHeader
            title="Rextora 시작하기"
            description="AI Trading Employee — 연구·검증·보고를 돕고, 최종 승인은 항상 사용자에게 있습니다."
            action={
              status ? (
                <Badge tone="info" data-testid="first-run-mode-badge">
                  {modeLabel(status.mode)}
                </Badge>
              ) : null
            }
          />

          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            <li>데모 데이터는 예시이며 실전 매매 증거가 아닙니다.</li>
            <li>실전 주문은 실행되지 않습니다. Paper도 자동으로 시작되지 않습니다.</li>
            <li>SAFE 보호 전략은 변경되지 않습니다.</li>
            <li>최종 승인자(Approver)는 항상 사용자입니다.</li>
          </ul>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 text-left transition hover:border-sky-400/60 hover:bg-sky-500/15"
              onClick={() => setInitPhase("confirming")}
              disabled={initPhase === "working"}
              data-testid="first-run-demo-cta"
            >
              <p className="text-base font-semibold text-sky-50">데모로 둘러보기</p>
              <p className="mt-1 text-xs text-slate-400">
                예시 연구 → 결과 → 백테스트 → Paper 승인 화면까지 안내합니다.
              </p>
            </button>

            <Link
              href="/strategy-search"
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left transition hover:border-emerald-400/60 hover:bg-emerald-500/15"
              data-testid="first-run-real-cta"
              onClick={() => void dismissSetup()}
            >
              <p className="text-base font-semibold text-emerald-50">
                실제 전략 탐색 시작
              </p>
              <p className="mt-1 text-xs text-slate-400">
                가짜 데이터를 만들지 않고 Strategy Search로 이동합니다.
              </p>
            </Link>
          </div>

          {initPhase === "working" ? (
            <StatusBanner
              status="loading"
              message="데모 워크스페이스를 준비하는 중…"
              data-testid="first-run-demo-progress"
            />
          ) : null}
          {actionError ? (
            <StatusBanner
              status="error"
              message={actionError}
              data-testid="first-run-action-error"
            />
          ) : null}
          {initPhase === "done" && initResult ? (
            <StatusBanner
              status="success"
              message="데모가 준비되었습니다. 결과 화면으로 이동합니다."
              data-testid="first-run-demo-ready"
            />
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        open={demoConfirmOpen}
        title="데모 워크스페이스 만들기"
        description="예시 연구·전략·백테스트만 생성합니다. 실전 주문·Paper 자동 시작·SAFE 변경은 없습니다. 계속할까요?"
        confirmLabel="데모 만들기"
        cancelLabel="취소"
        tone="warning"
        loading={initPhase === "working"}
        onConfirm={() => void confirmInitDemo()}
        onCancel={() => setInitPhase("cancelled")}
      />

      <ConfirmDialog
        open={resetPhase === "confirming"}
        title="데모 데이터만 삭제"
        description="예약된 데모 ID 레코드만 삭제합니다. 실제 연구 데이터와 SAFE는 유지됩니다."
        confirmLabel="데모만 삭제"
        cancelLabel="취소"
        tone="danger"
        onConfirm={() => void confirmResetDemo()}
        onCancel={() => setResetPhase("idle")}
      />
    </div>
  );
}
