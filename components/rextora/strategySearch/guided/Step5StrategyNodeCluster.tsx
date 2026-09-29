"use client";

export function Step5StrategyNodeCluster(props: {
  count: number;
  testId?: string;
  /** Stagger index base for pipeline entry (0 disables stagger class). */
  staggerBase?: number;
}) {
  const count = Math.max(0, Math.min(props.count, 24));
  const nodes = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      className="ss-step5-strategy-cluster"
      data-testid={props.testId ?? "ss-step5-strategy-node-cluster"}
      data-node-count={String(count)}
      aria-label={`${count}개 전략군`}
    >
      {nodes.map((i) => (
        <span
          key={i}
          className="ss-step5-strategy-cluster__node ss-step5-strategy-cluster__node--enter"
          style={
            props.staggerBase != null
              ? { ["--cluster-i" as string]: i }
              : undefined
          }
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{count}개 전략군</span>
    </div>
  );
}
