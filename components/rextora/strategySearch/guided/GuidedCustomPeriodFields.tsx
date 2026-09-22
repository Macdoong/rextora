"use client";

import { guidedDateClass } from "./guidedFieldClass";

export function GuidedCustomPeriodFields(props: {
  availableFromDate: string;
  availableToDate: string;
  disabled?: boolean;
  fromError?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div
      className="ss-guided-custom-period ss-guided-custom-period--enter"
      data-testid="ss-guided-custom-period"
    >
      <label className="ss-guided-field" htmlFor="ss-available-from">
        <span className="ss-field-label mb-1 block">시작일</span>
        <input
          id="ss-available-from"
          data-testid="ss-available-from"
          className={guidedDateClass}
          type="date"
          value={props.availableFromDate}
          disabled={props.disabled}
          onChange={(e) => props.onFromChange(e.target.value)}
        />
        {props.fromError ? (
          <span className="mt-1 block text-xs text-red-300" role="alert">
            {props.fromError}
          </span>
        ) : null}
      </label>
      <label className="ss-guided-field" htmlFor="ss-available-to">
        <span className="ss-field-label mb-1 block">종료일</span>
        <input
          id="ss-available-to"
          data-testid="ss-available-to"
          className={guidedDateClass}
          type="date"
          value={props.availableToDate}
          disabled={props.disabled}
          onChange={(e) => props.onToChange(e.target.value)}
        />
      </label>
    </div>
  );
}
