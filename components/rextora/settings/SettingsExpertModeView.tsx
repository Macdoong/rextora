"use client";

import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import {
  SETTINGS_EXPERT_LEDE,
  SETTINGS_EXPERT_TECHNICAL_KEYS,
  SETTINGS_EXPERT_WIZARD_HREF,
  settingsExpertBacktestStatus,
  settingsExpertBuilderStatus,
  settingsExpertGateLabel,
  settingsExpertGateTone,
  settingsExpertServerSettingsLabel,
  settingsExpertStoreLabel,
  settingsExpertTechnicalKeyLabel,
  settingsExpertToggleLabel,
  type SettingsExpertTone,
} from "@/src/lib/rextora/settings/settingsExpertModePresentation";

export type SettingsExpertModeViewProps = {
  enabled: boolean;
  hydrated: boolean;
  onToggle: () => void;
};

function toneClass(tone: SettingsExpertTone): string | undefined {
  return tone;
}

function Fact({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: SettingsExpertTone;
  testId?: string;
}) {
  return (
    <div className="v3-st-metric" data-testid={testId}>
      <span>{label}</span>
      <b className={toneClass(tone)}>{value}</b>
    </div>
  );
}

export function SettingsExpertModeView(props: SettingsExpertModeViewProps) {
  const gateTone = settingsExpertGateTone(props.enabled);

  return (
    <div className="v3-st-expert" data-testid="settings-expert-view">
      <p className="v3-st-lede">{SETTINGS_EXPERT_LEDE}</p>

      <section className="v3-st-group" data-testid="settings-expert-summary">
        <h3 className="v3-st-group-label">운영 요약</h3>
        <div className="v3-st-facts">
          <Fact
            label="전문가 모드"
            value={settingsExpertGateLabel(props.enabled)}
            tone={gateTone}
            testId="settings-expert-gate"
          />
          <Fact label="저장 위치" value={settingsExpertStoreLabel()} />
          <Fact label="서버 설정" value={settingsExpertServerSettingsLabel()} />
        </div>
      </section>

      <section className="v3-st-group" data-testid="settings-expert-surfaces">
        <h3 className="v3-st-group-label">열리는 화면</h3>
        <div className="v3-st-facts">
          <Fact
            label="수동 전략 빌더"
            value={settingsExpertBuilderStatus(props.enabled)}
            tone={gateTone}
          />
          <Fact
            label="전문가 백테스트"
            value={settingsExpertBacktestStatus()}
          />
        </div>
        <p className="v3-st-note">
          탐색 엔진·거래 비용·AI·위험 제한 컨트롤은 각 설정 탭과 해당 작업
          화면에 있습니다. 이 스위치는 실전 거래나 실주문을 켜지 않습니다.
        </p>
      </section>

      <div className="v3-st-toolbar">
        <Button
          tone={props.enabled ? "warning" : "default"}
          data-testid="expert-mode-toggle"
          disabled={!props.hydrated}
          onClick={props.onToggle}
        >
          {settingsExpertToggleLabel(props.enabled)}
        </Button>
        {props.enabled ? (
          <Link
            href={SETTINGS_EXPERT_WIZARD_HREF}
            className="rextora-btn-text inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            data-testid="expert-wizard-link"
          >
            수동 9단계 마법사 열기
          </Link>
        ) : null}
      </div>

      <details className="v3-st-disc" data-testid="settings-expert-technical">
        <summary>원본 설정 키</summary>
        <ul className="v3-st-tech-keys">
          {SETTINGS_EXPERT_TECHNICAL_KEYS.map((key) => (
            <li key={key}>
              <span className="v3-st-wrap">{key}</span>
              {settingsExpertTechnicalKeyLabel(key)}
            </li>
          ))}
        </ul>
        <p className="v3-st-help">
          stopWhenQualifiedTarget는 전략 탐색 화면의 진단 옵션이며 여기서 바꾸지
          않습니다. ui.showAdvancedSettings 등 서버 UI 플래그는 이 탭에 두지
          않습니다.
        </p>
      </details>
    </div>
  );
}
