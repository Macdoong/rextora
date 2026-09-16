"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SettingsTabs } from "@/components/rextora/settings/SettingsTabs";
import { SystemStatusSection } from "@/components/rextora/settings/SystemStatusSection";
import { ExpertModeCard } from "@/components/rextora/settings/ExpertModeCard";
import { AiProviderSettingsPanel } from "@/components/rextora/settings/AiProviderSettingsPanel";
import { RiskPanelEditable } from "@/components/rextora/RiskPanelEditable";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import {
  settingsCredentialConnectionLabel,
  settingsCredentialPresenceLabel,
  settingsCredentialPresenceTone,
  settingsExchangeEnvironmentLabel,
  settingsLiveFlagTone,
  settingsPermissionTone,
  settingsRealOrderEngineLabel,
} from "@/src/lib/rextora/settings/settingsExchangePresentation";
import {
  SETTINGS_SEARCH_ENGINE_LEDE,
  SETTINGS_SEARCH_ENGINE_TECHNICAL_NOTE,
  settingsSearchEngineGroups,
} from "@/src/lib/rextora/settings/settingsSearchPresentation";
import {
  SETTINGS_NOTIFICATION_LEDE,
  SETTINGS_NOTIFICATION_SECRET_NOTE,
  SETTINGS_TELEGRAM_ENV_KEYS,
  settingsTelegramChannelLabel,
  settingsTelegramChannelStateLabel,
  settingsTelegramChannelStateTone,
  settingsTelegramConfiguredLabel,
  settingsTelegramConfiguredTone,
  settingsTelegramEnabledLabel,
  settingsTelegramEnvKeyLabel,
  settingsTelegramServiceStateLabel,
} from "@/src/lib/rextora/settings/settingsNotificationsPresentation";

export type LifecycleSettingsTabId =
  | "data"
  | "cost"
  | "research"
  | "exchange"
  | "ai"
  | "risk"
  | "alerts"
  | "system"
  | "expert";

const TABS: Array<{ id: LifecycleSettingsTabId; label: string }> = [
  { id: "data", label: "데이터" },
  { id: "cost", label: "거래 비용" },
  { id: "research", label: "탐색 엔진" },
  { id: "exchange", label: "거래소 연결" },
  { id: "ai", label: "AI 공급자" },
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
  liveGateFacts?: {
    futuresPermission: string;
    orderPermission: string;
    liveAllowed: boolean;
  };
  exchangeFacts?: {
    testnetEnv: boolean;
    serviceState: string;
    realOrderEngineConnected: boolean;
  };
  telegramServiceState: string;
  telegramConfigured: boolean;
  telegramEnabled?: boolean;
  liveTradingEnabled?: boolean;
  allowLiveTradingFlag?: boolean;
  defaultMode: string;
  liveAllowed: boolean;
  serverTpSlRequired: boolean;
  risk: unknown;
}) {
  const [tab, setTab] = useState<LifecycleSettingsTabId>("data");

  useEffect(() => {
    const applyHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (TABS.some((item) => item.id === raw)) {
        setTab(raw as LifecycleSettingsTabId);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function selectTab(id: LifecycleSettingsTabId) {
    setTab(id);
    if (typeof window === "undefined") return;
    const current = window.location.hash.replace(/^#/, "");
    if (current !== id) {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  const liveOn = props.liveGateFacts?.liveAllowed ?? props.liveAllowed;
  const futures = props.liveGateFacts?.futuresPermission ?? "미확인";
  const orders = props.liveGateFacts?.orderPermission ?? "차단";
  const keyConfigured = props.apiConfigured.binanceApiKey;
  const secretConfigured = props.apiConfigured.binanceApiSecret;
  const bothCredentials = keyConfigured && secretConfigured;
  const testnetEnv = props.exchangeFacts?.testnetEnv ?? true;
  const serviceState = props.exchangeFacts?.serviceState ?? "read-only";
  const realOrderEngineConnected = props.exchangeFacts?.realOrderEngineConnected ?? false;

  const panels = useMemo<Record<LifecycleSettingsTabId, ReactNode>>(
    () => ({
      data: (
        <V3Card
          className="v3-st-panel"
          title="데이터"
          meta="공급 · 종목 · 동기화"
          data-testid="settings-tab-data"
        >
          <p className="v3-st-lede">
            시장 데이터 공급·동기화·가용 심볼/타임프레임
          </p>
          <div className="v3-st-facts">
            <div className="v3-st-metric">
              <span>데이터 공급자</span>
              <b>Binance Futures OHLCV</b>
            </div>
            <div className="v3-st-metric">
              <span>동기화 상태</span>
              <b>온디맨드 캐시</b>
            </div>
            <div className="v3-st-metric">
              <span>가용 마켓</span>
              <b>USDT-M Perpetual</b>
            </div>
            <div className="v3-st-metric">
              <span>가용 타임프레임</span>
              <b>1m · 5m · 15m · 1h · 4h · 1d</b>
            </div>
          </div>
          <p className="v3-st-note">
            데이터 오류는 시스템 상태 탭과 백테스트/탐색 실행 로그에 표시됩니다.
            별도 영구 동기화 워커가 없으면 마지막 동기화 시각은 요청 시점
            기준입니다.
          </p>
          <div style={{ marginTop: 14 }}>
            <SettingsTabs initialCategory="market" hideTabBar />
          </div>
        </V3Card>
      ),
      cost: (
        <V3Card
          className="v3-st-panel"
          title="거래 비용"
          meta="수수료 · 슬리피지"
          data-testid="settings-tab-cost"
        >
          <p className="v3-st-lede">
            연구·백테스트·모의·실전에 공통으로 쓰는 기본 비용입니다. 값은 직접
            설정하며, 페이지별 덮어쓰기는 전문가 모드에서만 가능합니다.
          </p>
          <SettingsTabs initialCategory="cost" hideTabBar />
        </V3Card>
      ),
      research: (
        <V3Card
          className="v3-st-panel"
          title="탐색 엔진"
          meta="읽기 전용 · 런타임 · 복구"
          data-testid="settings-tab-research"
        >
          <p className="v3-st-lede">{SETTINGS_SEARCH_ENGINE_LEDE}</p>
          <div data-testid="settings-search-facts">
            {settingsSearchEngineGroups().map((group) => (
              <section
                key={group.id}
                className="v3-st-group"
                data-testid={`settings-search-group-${group.id}`}
              >
                <h3 className="v3-st-group-label">{group.title}</h3>
                <div className="v3-st-facts">
                  {group.facts.map((fact) => (
                    <div className="v3-st-metric" key={fact.label}>
                      <span>{fact.label}</span>
                      <b>{fact.value}</b>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <details className="v3-st-disc">
            <summary>기술 세부</summary>
            <p className="v3-st-note">{SETTINGS_SEARCH_ENGINE_TECHNICAL_NOTE}</p>
          </details>
        </V3Card>
      ),
      exchange: (
        <V3Card
          className="v3-st-panel"
          title="거래소 연결"
          meta="자격 증명 · 권한"
          data-testid="settings-tab-exchange"
        >
          <p className="v3-st-lede">
            자격 증명 존재 여부만 표시합니다. 전체 키는 절대 표시하지 않습니다.
            키 설정됨은 연결 확인이 아니며, 실제 주문 허용과도 다릅니다.
          </p>
          <section className="v3-st-group" data-testid="settings-exchange-summary">
            <h3 className="v3-st-group-label">거래소 / 환경</h3>
            <div className="v3-st-facts">
              <div className="v3-st-metric">
                <span>거래소</span>
                <b>Binance Futures</b>
              </div>
              <div className="v3-st-metric">
                <span>거래 환경</span>
                <b>{settingsExchangeEnvironmentLabel(testnetEnv)}</b>
              </div>
            </div>
          </section>
          <section className="v3-st-group" data-testid="settings-exchange-credentials">
            <h3 className="v3-st-group-label">자격 증명</h3>
            <div className="v3-st-facts">
              <div className="v3-st-metric">
                <span>API 키</span>
                <b className={settingsCredentialPresenceTone(keyConfigured)}>
                  {settingsCredentialPresenceLabel(keyConfigured)}
                </b>
              </div>
              <div className="v3-st-metric">
                <span>API 시크릿</span>
                <b className={settingsCredentialPresenceTone(secretConfigured)}>
                  {settingsCredentialPresenceLabel(secretConfigured)}
                </b>
              </div>
            </div>
          </section>
          <section
            className="v3-st-group"
            data-testid="settings-live-gate-facts"
          >
            <h3 className="v3-st-group-label">연결 · 권한 · 실주문</h3>
            <div className="v3-st-facts">
              <div className="v3-st-metric">
                <span>연결 상태</span>
                <b className={bothCredentials ? "warn" : undefined}>
                  {settingsCredentialConnectionLabel(bothCredentials)}
                </b>
              </div>
              <div className="v3-st-metric">
                <span>서비스 상태</span>
                <b>{displayLabel(serviceState)}</b>
              </div>
              <div className="v3-st-metric">
                <span>실전 허용 설정</span>
                <b className={settingsLiveFlagTone(liveOn)}>{liveOn ? "켜짐" : "꺼짐"}</b>
              </div>
              <div className="v3-st-metric">
                <span>Futures 권한 (게이트)</span>
                <b className={settingsPermissionTone(futures)}>{futures}</b>
              </div>
              <div className="v3-st-metric">
                <span>주문 권한 (게이트)</span>
                <b className={settingsPermissionTone(orders)}>{orders}</b>
              </div>
              <div className="v3-st-metric">
                <span>실제 주문 엔진</span>
                <b className={realOrderEngineConnected ? "bad" : "ok"}>
                  {settingsRealOrderEngineLabel(realOrderEngineConnected)}
                </b>
              </div>
            </div>
          </section>
          <p className="v3-st-warn">
            키 구성됨은 자격 증명 존재만 의미합니다. 실전 게이트는 같은
            Futures/주문 권한 사실을 사용하며, 키가 있어도 권한이 차단이면
            실전은 열리지 않습니다. 출금 권한이 있는 API 키는 사용하지 마세요.
          </p>
          <div style={{ marginTop: 14 }}>
            <SettingsTabs initialCategory="trading" hideTabBar />
          </div>
          <details className="v3-st-disc">
            <summary>숨겨진 거래 플래그 (편집기 없음)</summary>
            <p className="v3-st-note">
              liveTradingEnabled · allowLiveTrading ·
              operatorLiveStartRequired · 확인 문구. 기존 저장값을 유지하고 새
              편집기를 만들지 않습니다. 현재 실전 허용은 {liveOn ? "켜짐" : "꺼짐"}
              입니다. liveTradingEnabled와 allowLiveTrading은 아래 거래 모드
              양식의 기존 항목입니다.
            </p>
          </details>
        </V3Card>
      ),
      ai: (
        <div className="v3-st-panel" data-testid="settings-tab-ai">
          <AiProviderSettingsPanel />
        </div>
      ),
      risk: (
        <div id="risk" className="v3-st-panel" data-testid="settings-tab-risk">
          <V3Card title="위험 제한" meta="설정 권한">
            <p className="v3-st-lede">
              이 화면의 연속 손실 제한은 실거래 게이트입니다. 모의매매 자동화
              한도는 6회이며 실거래 기본 한도는 3회입니다. 실거래 한도를 느슨하게
              바꾸지 않습니다.
            </p>
            <RiskPanelEditable initialRisk={props.risk as never} />
          </V3Card>
        </div>
      ),
      alerts: (
        <V3Card
          className="v3-st-panel"
          title="알림"
          meta="텔레그램"
          data-testid="settings-tab-alerts"
        >
          <p className="v3-st-lede">{SETTINGS_NOTIFICATION_LEDE}</p>
          <section className="v3-st-group" data-testid="settings-alerts-summary">
            <h3 className="v3-st-group-label">알림 요약</h3>
            <div className="v3-st-facts">
              <div className="v3-st-metric">
                <span>알림 사용</span>
                <b>{settingsTelegramEnabledLabel(Boolean(props.telegramEnabled))}</b>
              </div>
              <div className="v3-st-metric">
                <span>채널</span>
                <b>{settingsTelegramChannelLabel()}</b>
              </div>
              <div className="v3-st-metric">
                <span>채널 구성</span>
                <b
                  className={settingsTelegramChannelStateTone(
                    props.apiConfigured.telegramToken,
                    props.apiConfigured.telegramChatId,
                  )}
                >
                  {props.telegramConfigured
                    ? "설정됨 · 전송 미검증"
                    : settingsTelegramChannelStateLabel(
                        props.apiConfigured.telegramToken,
                        props.apiConfigured.telegramChatId,
                      )}
                </b>
              </div>
              <div className="v3-st-metric">
                <span>서비스 상태</span>
                <b>{settingsTelegramServiceStateLabel(props.telegramServiceState)}</b>
              </div>
            </div>
          </section>
          <section className="v3-st-group" data-testid="settings-alerts-channel">
            <h3 className="v3-st-group-label">텔레그램 자격 증명</h3>
            <div className="v3-st-facts">
              <div className="v3-st-metric">
                <span>봇 토큰</span>
                <b className={settingsTelegramConfiguredTone(props.apiConfigured.telegramToken)}>
                  {settingsTelegramConfiguredLabel(props.apiConfigured.telegramToken)}
                </b>
              </div>
              <div className="v3-st-metric">
                <span>채팅 ID</span>
                <b className={settingsTelegramConfiguredTone(props.apiConfigured.telegramChatId)}>
                  {settingsTelegramConfiguredLabel(props.apiConfigured.telegramChatId)}
                </b>
              </div>
            </div>
            <p className="v3-st-note">{SETTINGS_NOTIFICATION_SECRET_NOTE}</p>
          </section>
          <details className="v3-st-disc" data-testid="settings-alerts-env-keys">
            <summary>원본 설정 키</summary>
            <ul className="v3-st-tech-keys">
              {SETTINGS_TELEGRAM_ENV_KEYS.map((key) => (
                <li key={key}>
                  <span>{key}</span>
                  {settingsTelegramEnvKeyLabel(key)}
                </li>
              ))}
            </ul>
          </details>
          <div style={{ marginTop: 14 }}>
            <SettingsTabs initialCategory="telegram" hideTabBar />
          </div>
        </V3Card>
      ),
      system: (
        <div id="system" className="v3-st-panel" data-testid="settings-tab-system">
          <V3Card title="시스템 상태" meta="읽기 전용">
            <SystemStatusSection
              defaultMode={props.defaultMode}
              liveTradingEnabled={props.liveTradingEnabled ?? props.liveAllowed}
              allowLiveTrading={props.allowLiveTradingFlag ?? props.liveAllowed}
              serverTpSlRequired={props.serverTpSlRequired}
              riskState={
                props.risk &&
                typeof props.risk === "object" &&
                "riskState" in props.risk &&
                typeof (props.risk as { riskState?: unknown }).riskState === "string"
                  ? String((props.risk as { riskState: string }).riskState)
                  : "미확인"
              }
            />
          </V3Card>
        </div>
      ),
      expert: (
        <div className="v3-st-panel" data-testid="settings-tab-expert">
          <ExpertModeCard />
        </div>
      ),
    }),
    [
      props,
      futures,
      liveOn,
      orders,
      keyConfigured,
      secretConfigured,
      bothCredentials,
      testnetEnv,
      serviceState,
      realOrderEngineConnected,
    ],
  );

  return (
    <div
      className="v3-st-workspace"
      data-testid="lifecycle-settings-shell"
      data-settings-shell-ready="true"
    >
      <V3Card title="설정 구역" meta="섹션">
        <nav
          className="v3-st-menu"
          aria-label="시스템 설정 탭"
          data-testid="settings-lifecycle-tabs"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`settings-tab-btn-${item.id}`}
              className={tab === item.id ? "is-active v3-hover" : "v3-hover"}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </V3Card>
      {panels[tab]}
    </div>
  );
}
