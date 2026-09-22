/** Honest status visuals. Never fabricate a historical series. */

export function hasRealTimeSeries(
  values?: Array<number | null | undefined>,
): boolean {
  return (values ?? []).filter((value): value is number => Number.isFinite(value))
    .length >= 2;
}

export function RealSparkline({
  values,
  tone = "neutral",
}: {
  values?: Array<number | null | undefined>;
  tone?: "good" | "bad" | "neutral";
}) {
  const series = (values ?? []).filter((v): v is number => Number.isFinite(v));
  if (series.length < 2) {
    return <span className="v3-oc-vis-empty" aria-hidden="true" />;
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const w = 72;
  const h = 22;
  const points = series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * w;
      const y = h - ((value - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    tone === "good" ? "#12805c" : tone === "bad" ? "#c24141" : "#3257d7";
  return (
    <svg className="v3-oc-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function RealMiniBars({
  values,
}: {
  values?: Array<number | null | undefined>;
}) {
  const series = (values ?? []).filter((v): v is number => Number.isFinite(v));
  if (series.length === 0) {
    return <span className="v3-oc-vis-empty" aria-hidden="true" />;
  }
  const max = Math.max(...series.map((v) => Math.abs(v)), 1);
  return (
    <span className="v3-oc-minibar" aria-hidden="true">
      {series.slice(-8).map((value, index) => (
        <i
          key={`${index}-${value}`}
          style={{
            height: `${Math.max(12, (Math.abs(value) / max) * 100)}%`,
            background: value >= 0 ? "#12805c" : "#c24141",
          }}
        />
      ))}
    </span>
  );
}

export function WinRateRing({
  value,
  tradeCount,
}: {
  value?: number | null;
  tradeCount?: number | null;
}) {
  if (tradeCount === 0 || value == null || !Number.isFinite(value)) {
    return (
      <span className="v3-oc-ring is-empty" aria-hidden="true">
        <b>—</b>
      </span>
    );
  }
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="v3-oc-ring"
      style={{
        background: `conic-gradient(#0f766e ${pct}%, #e6ebf1 ${pct}% 100%)`,
      }}
      aria-hidden="true"
    >
      <b>{Math.round(pct)}</b>
    </span>
  );
}

export function StatusDot({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "bad" | "idle";
  label: string;
}) {
  return (
    <span className={`v3-oc-status-dot is-${tone}`}>
      <i />
      {label}
    </span>
  );
}

export function ScalarSignedBar({
  value,
  tone,
}: {
  value?: number | null;
  tone?: "good" | "bad" | "neutral";
}) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  const resolved =
    tone ?? (safe > 0 ? "good" : safe < 0 ? "bad" : "neutral");
  const width = Math.min(100, Math.abs(safe) === 0 ? 8 : Math.min(100, 24 + Math.abs(safe)));
  return (
    <span className={`v3-oc-signed is-${resolved}`} aria-hidden="true">
      <i style={{ width: `${width}%` }} />
    </span>
  );
}

export function LimitGauge({
  current,
  limit,
  invert = false,
  tone,
}: {
  current?: number | null;
  limit?: number | null;
  invert?: boolean;
  tone?: "ok" | "warn" | "bad";
}) {
  if (!Number.isFinite(current) || !Number.isFinite(limit) || !limit) {
    return <span className="v3-oc-vis-empty" aria-hidden="true" />;
  }
  const usage = invert
    ? Math.min(100, (Math.abs(Number(current)) / Math.abs(Number(limit))) * 100)
    : Math.min(100, (Number(current) / Number(limit)) * 100);
  const resolved = tone ?? (usage >= 100 ? "bad" : "ok");
  return (
    <span className={`v3-oc-gauge is-${resolved}`} aria-hidden="true">
      <i style={{ width: `${Math.max(4, usage)}%` }} />
    </span>
  );
}

export function PaperStateFlow({
  state,
}: {
  state: "idle" | "running" | "paused" | "ended";
}) {
  const nodes = [
    { id: "idle", label: "대기" },
    { id: "running", label: "실행" },
    { id: "paused", label: "정지" },
    { id: "ended", label: "종료" },
  ] as const;
  return (
    <span className="v3-oc-flow" aria-hidden="true">
      {nodes.map((node) => (
        <i
          key={node.id}
          className={node.id === state ? `is-on is-${state}` : undefined}
          title={node.label}
        />
      ))}
    </span>
  );
}

export function CountSegments({
  value,
  max = 8,
}: {
  value?: number | null;
  max?: number;
}) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const shown = Math.min(max, Math.max(count, 1));
  return (
    <span className="v3-oc-segments" aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => (
        <i key={index} className={index < count ? "is-on" : undefined} />
      ))}
    </span>
  );
}

export function CandidateAvailability({
  value,
}: {
  value?: number | null;
}) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const tone = count === 0 ? "idle" : count >= 3 ? "ok" : "warn";
  return (
    <span className={`v3-oc-avail is-${tone}`} aria-hidden="true">
      <i />
      <i className={count > 0 ? "is-on" : undefined} />
      <i className={count > 1 ? "is-on" : undefined} />
    </span>
  );
}

export function OccupancyIndicator({
  value,
  limit,
}: {
  value?: number | null;
  limit?: number | null;
}) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (Number.isFinite(limit) && Number(limit) > 0) {
    return <LimitGauge current={count} limit={limit} />;
  }
  return <CountSegments value={count} max={Math.max(4, Math.min(8, count || 1))} />;
}

export function parseQueueVisualState(
  label?: string | null,
): "idle" | "waiting" | "running" | "completed" {
  const text = label?.trim() ?? "";
  if (!text || text === "대기 중" || text === "대기") return "idle";
  if (/실행\s*[1-9]/.test(text) || /실행 중/.test(text)) return "running";
  if (/완료\s*[1-9]/.test(text) && !/대기\s*[1-9]/.test(text) && !/실행\s*[1-9]/.test(text)) {
    return "completed";
  }
  if (/대기\s*[1-9]/.test(text) || /수신\s*[1-9]/.test(text)) return "waiting";
  return "idle";
}

export function QueueIndicator({
  label,
}: {
  label?: string | null;
}) {
  const state = parseQueueVisualState(label);
  const nodes = [
    { id: "idle", label: "대기" },
    { id: "waiting", label: "수신" },
    { id: "running", label: "실행" },
    { id: "completed", label: "완료" },
  ] as const;
  return (
    <span className={`v3-oc-queue is-${state}`} aria-hidden="true">
      {nodes.map((node) => (
        <i
          key={node.id}
          className={node.id === state ? `is-on is-${state}` : undefined}
          title={node.label}
        />
      ))}
    </span>
  );
}

export function freshnessTone(
  updatedAt?: string | null,
  nowMs = Date.now(),
): "ok" | "warn" | "bad" | "idle" {
  if (!updatedAt) return "idle";
  const ageMs = nowMs - Date.parse(updatedAt);
  if (!Number.isFinite(ageMs)) return "idle";
  if (ageMs < 15_000) return "ok";
  if (ageMs < 60_000) return "warn";
  return "bad";
}

export function FreshnessPulse({
  updatedAt,
}: {
  updatedAt?: string | null;
}) {
  const tone = freshnessTone(updatedAt);
  const label =
    tone === "ok" ? "최신" : tone === "warn" ? "지연" : tone === "bad" ? "오래됨" : "없음";
  return <StatusDot tone={tone} label={label} />;
}

export function resolveSystemNodeTone(input: {
  kind: "market" | "execution" | "queue" | "api";
  lastUpdatedAt?: string | null;
  botStatusLabel?: string | null;
  queueStatusLabel?: string | null;
  loadError?: string | null;
}): "ok" | "warn" | "bad" | "idle" {
  if (input.kind === "market") return freshnessTone(input.lastUpdatedAt);
  if (input.kind === "execution") {
    if (input.botStatusLabel === "오류") return "bad";
    if (input.botStatusLabel === "실행 중") return "ok";
    if (input.botStatusLabel === "중지됨") return "warn";
    return "idle";
  }
  if (input.kind === "queue") {
    const state = parseQueueVisualState(input.queueStatusLabel);
    if (state === "running") return "ok";
    if (state === "waiting") return "warn";
    if (state === "completed") return "ok";
    return "idle";
  }
  return input.loadError ? "bad" : input.lastUpdatedAt ? "ok" : "idle";
}

export function SystemNodes({
  market,
  execution,
  queue,
  api,
}: {
  market: "ok" | "warn" | "bad" | "idle";
  execution: "ok" | "warn" | "bad" | "idle";
  queue: "ok" | "warn" | "bad" | "idle";
  api: "ok" | "warn" | "bad" | "idle";
}) {
  const nodes = [
    { id: "market", label: "시세", tone: market },
    { id: "execution", label: "실행", tone: execution },
    { id: "queue", label: "큐", tone: queue },
    { id: "api", label: "API", tone: api },
  ] as const;
  const stateLabel = {
    ok: "정상",
    warn: "주의",
    bad: "오류",
    idle: "대기",
  } as const;
  return (
    <ul className="v3-oc-sysnodes">
      {nodes.map((node) => (
        <li key={node.id} className={`v3-oc-sysnode is-${node.tone}`}>
          <i />
          <span>{node.label}</span>
          <b>{stateLabel[node.tone]}</b>
        </li>
      ))}
    </ul>
  );
}
