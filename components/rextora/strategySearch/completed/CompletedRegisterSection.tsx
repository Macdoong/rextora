"use client";

import { Button } from "@/components/ui/primitives";

export function CompletedRegisterSection(props: {
  onRegisterBest?: (() => void) | null;
  onPromoteTop?: (() => void) | null;
}) {
  return (
    <section
      className="ss-completed-register-card"
      data-testid="ss-completed-register-section"
    >
      <h3 className="ss-completed-register-card__title">전략 보관 및 다음 단계</h3>
      <p className="ss-completed-register-card__copy">
        후보를 전략 보관함에 저장합니다. 저장만으로 모의매매나 실전매매가
        시작되지는 않습니다.
      </p>
      <div className="ss-completed-register-card__actions">
        {props.onRegisterBest ? (
          <Button
            type="button"
            className="ss-btn-secondary"
            data-testid="ss-completed-register-passed"
            onClick={props.onRegisterBest}
          >
            선택한 통과 후보 저장
          </Button>
        ) : null}
        {props.onPromoteTop ? (
          <Button
            type="button"
            className="ss-btn-secondary"
            data-testid="ss-completed-register-top"
            onClick={props.onPromoteTop}
          >
            상위 후보 전략 보관
          </Button>
        ) : null}
      </div>
    </section>
  );
}
