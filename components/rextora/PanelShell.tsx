"use client";

import { Component, type ReactNode } from "react";
import { Card } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";

type Props = {
  children: ReactNode;
  title?: string;
  fallback?: ReactNode;
};

type State = { hasError: boolean; message?: string };

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <Card title={this.props.title ?? "패널 오류"}>
            <p className="rextora-helper text-red-300" data-testid="panel-error">
              {this.state.message ?? "패널을 불러오지 못했습니다."}
            </p>
          </Card>
        )
      );
    }
    return this.props.children;
  }
}

export function PanelSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`animate-pulse space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 ${className}`} data-testid="panel-skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-slate-800" style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}

export function StaleDataBadge({ cached, ageMs }: { cached?: boolean; ageMs?: number }) {
  if (!cached && ageMs === undefined) return null;
  const stale = typeof ageMs === "number" && ageMs > 30_000;
  return (
    <span
      className={`rextora-badge rounded-full border px-2 py-0.5 ${stale ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-400"}`}
      data-testid="stale-data-badge"
    >
      {cached ? (stale ? displayLabel("stale") : displayLabel("cached")) : displayLabel("real")}
    </span>
  );
}
