"use client";

import type { LiveGatePermissionRow } from "@/src/lib/rextora/live/liveGateOperatorPresentation";

export function ApiPermissionPanel({
  rows,
}: {
  rows: LiveGatePermissionRow[];
}) {
  return (
    <section data-testid="live-api-permissions">
      <p className="v3-lv-note">
        공개 시세만으로는 거래 권한을 판단하지 않습니다. 비밀 키는 표시하지
        않습니다.
      </p>
      <div className="v3-lv-perm-grid">
        {rows.map((row) => (
          <div
            key={row.id}
            className="v3-lv-metric"
            data-testid={`live-api-${row.id}`}
          >
            <span>{row.labelKo}</span>
            <b
              className={
                row.tone === "success"
                  ? "ok"
                  : row.tone === "danger"
                    ? "bad"
                    : row.tone === "warning"
                      ? "warn"
                      : undefined
              }
            >
              {row.valueKo}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}
