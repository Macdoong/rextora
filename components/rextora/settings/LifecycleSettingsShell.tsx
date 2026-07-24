"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SettingsTabs } from "@/components/rextora/settings/SettingsTabs";
import { SystemStatusSection } from "@/components/rextora/settings/SystemStatusSection";
import { ExpertModeCard } from "@/components/rextora/settings/ExpertModeCard";
import { RiskPanelEditable } from "@/components/rextora/RiskPanelEditable";
import { Badge, Card, Metric, StatusBadge } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";

export type LifecycleSettingsTabId =
  | "data"
  | "cost"
  | "research"
  | "exchange"
  | "risk"
  | "alerts"
  | "system"
  | "expert";

const TABS: Array<{ id: LifecycleSettingsTabId; label: string }> = [
  { id: "data", label: "데이터" },
  { id: "cost", label: "거래 비용" },
  { id: "research", label: "탐색 엔진" },
  { id: "exchange", label: "거래소 연결" },
  { id: "risk", label: "위험 제한" },
  { id: "alerts", label: "알림" },
  { id: "system", label: "시스템 상태" },
  { id: "expert", label: "전문가 모드" },
];

export function LifecycleSettingsShell(props: {
  apiConfigured: {
    binanceApiKey: boolean;
    binanceApiSecret: boolean;
    telegramToken: boolean;
    telegramChatId: boolean;
  };
  telegramServiceState: string;
  telegramConfigured: boolean;
  defaultMode: string;
  liveAllowed: boolean;
  serverTpSlRequired: boolean;
  risk: unknown;
}) {
  const [tab, setTab] = useState<LifecycleSettingsTabId>("data");

  const panels = useMemo<Record<LifecycleSettingsTabId, ReactNode>>(
    () => ({
      data: (
        <Card
          title="데이터"
          description="시장 데이터 공급·동기화·가용 심볼/타임프레임"
          data-testid="settings-tab-data"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="데이터 공급자" value="Binance Futures OHLCV" />
            <Metric label="동기화 상태" value="온디맨드 캐시" />
            <Metric label="가용 마켓" value="USDT-M Perpetual" />
            <Metric label="가용 타임프레임" value="1m · 5m · 15m · 1h · 4h · 1d" />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            데이터 오류는 시스템 상태 탭과 백테스트/탐색 실행 로그에 표시됩니다.
            별도 영구 동기화 워커가 없으면 마지막 동기화 시각은 요청 시점 기준입니다.
          </p>
          <div className="mt-4">
            <SettingsTabs initialCategory="market" hideTabBar />
          </div>
        </Card>
      ),
      cost: (
        <Card
          title="거래 비용"
          description="연구·백테스트·모의·실전의 기본 비용 (전문가 모드에서만 페이지별 오버라이드)"
          data-testid="settings-tab-cost"
        >
          <SettingsTabs initialCategory="cost" hideTabBar />
        </Card>
      ),
      research: (
        <Card
          title="탐색 엔진"
          description="검증된 연구 런타임·복구·보존 설정"
          data-testid="settings-tab-research"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Metric label="워커 동시성" value="프로세스 내 순차/버짓 가드" />
            <Metric label="CPU 한도" value="OS 기본 (별도 cgroup 없음)" />
            <Metric label="메모리 한도" value="Node 힙 기본" />
            <Metric label="이력 보존" value="전략 탐색 Job 스토어" />
            <Metric label="자동 복구" value="orphanJobRecovery + instrumentation" />
            <Metric label="하트비트 타임아웃" value="잡 스토어 기준" />
            <Metric label="기본 탐색 시간" value="폼 durationPreset (예: 180분)" />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            후보 예산·합격 최소 목표는 안전 가드이며, 정상 종료는 DEADLINE_REACHED
            입니다.
          </p>
        </Card>
      ),
      exchange: (
        <Card
          title="거래소 연결"
          description="자격 증명 존재 여부만 표시합니다. 전체 키는 절대 표시하지 않습니다."
          data-testid="settings-tab-exchange"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="거래소" value="Binance Futures" />
            <Metric
              label="환경"
              value={
                props.apiConfigured.binanceApiKey ? "키 구성됨" : "disconnected"
              }
            />
            <Metric
              label="API 키"
              value={
                <StatusBadge
                  status={
                    props.apiConfigured.binanceApiKey
                      ? displayLabel("configured")
                      : displayLabel("missing")
                  }
                />
              }
            />
            <Metric
              label="API Secret"
              value={
                <StatusBadge
                  status={
                    props.apiConfigured.binanceApiSecret
                      ? displayLabel("configured")
                      : displayLabel("missing")
                  }
                />
              }
            />
          </div>
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
            출금 권한이 있는 API 키는 사용하지 마세요. 거래 전용 권한만 허용하세요.
          </p>
          <div className="mt-4">
            <SettingsTabs initialCategory="trading" hideTabBar />
          </div>
        </Card>
      ),
      risk: (
        <div data-testid="settings-tab-risk">
          <h2 className="rextora-card-title mb-2 text-white">위험 제한</h2>
          <p className="rextora-helper mb-3 text-slate-400">
            서버가 강제하는 일실·낙폭·포지션·레버리지 한도입니다.
          </p>
          <RiskPanelEditable initialRisk={props.risk as never} />
        </div>
      ),
      alerts: (
        <Card
          title="알림"
          description="텔레그램 등 검증된 알림 채널"
          data-testid="settings-tab-alerts"
        >
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <Metric
              label="텔레그램"
              value={
                props.telegramConfigured
                  ? displayLabel(props.telegramServiceState)
                  : displayLabel("missing")
              }
            />
            <Metric label="연구 완료 알림" value="지원 (텔레그램)" />
            <Metric label="신규 최고 결과" value="지원 (탐색 피드백)" />
            <Metric label="모의 경고" value="지원" />
            <Metric label="실전 주문" value="게이트 통과 후" />
            <Metric label="위험 경고" value="지원" />
            <Metric label="긴급 정지" value="지원" />
            <Metric label="시스템 오류" value="지원" />
          </div>
          <SettingsTabs initialCategory="telegram" hideTabBar />
        </Card>
      ),
      system: (
        <div data-testid="settings-tab-system">
          <h2 className="rextora-card-title mb-2 text-white">시스템 상태</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="muted">기본 모드 {displayLabel(props.defaultMode)}</Badge>
            <Badge tone={props.liveAllowed ? "danger" : "success"}>
              실전 허용 {props.liveAllowed ? "ON" : "OFF"}
            </Badge>
            <Badge>
              서버 TP/SL {props.serverTpSlRequired ? "필수" : "선택"}
            </Badge>
          </div>
          <SystemStatusSection />
        </div>
      ),
      expert: (
        <div data-testid="settings-tab-expert">
          <ExpertModeCard />
        </div>
      ),
    }),
    [props],
  );

  return (
    <div className="space-y-4" data-testid="lifecycle-settings-shell">
      <nav
        className="flex flex-wrap gap-2"
        aria-label="시스템 설정 탭"
        data-testid="settings-lifecycle-tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`settings-tab-btn-${t.id}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tab === t.id
                ? "border-sky-500/50 bg-sky-500/15 text-sky-50"
                : "border-slate-700 bg-slate-900/50 text-slate-300"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {panels[tab]}
    </div>
  );
}
