"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { FlaskConical, Zap } from "lucide-react";
import { fetchJsonCached } from "@/src/lib/rextora/client/requestCache";
import { DemoDataBadge } from "@/components/rextora/DemoDataBadge";

type ModePayload = {
  status?: { modeLabel?: "모의 거래" | "실전 거래" };
};

type FirstRunPayload = {
  status?: { mode?: string; demoInitialized?: boolean };
};

export function ModeBadge() {
  const [modeLabel, setModeLabel] = useState<"모의 거래" | "실전 거래">("모의 거래");
  const [demoActive, setDemoActive] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [body, firstRun] = await Promise.all([
          fetchJsonCached<{ ok: boolean; data: ModePayload }>(
            "/api/rextora/trading/dashboard",
            { ttlMs: 5_000 },
          ),
          fetchJsonCached<{ ok: boolean; data: FirstRunPayload }>(
            "/api/rextora/first-run",
            { ttlMs: 5_000 },
          ),
        ]);
        if (!active) return;
        if (body.ok && body.data.status?.modeLabel) {
          setModeLabel(body.data.status.modeLabel);
        }
        const mode = firstRun.data?.status?.mode;
        setDemoActive(mode === "DEMO_ACTIVE" || mode === "MIXED");
      } catch {
        /* keep default */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isLive = modeLabel === "실전 거래";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge
        tone={isLive ? "danger" : "success"}
        data-testid="sidebar-mode-badge"
        icon={
          isLive ? (
            <Zap className="h-3 w-3" aria-hidden />
          ) : (
            <FlaskConical className="h-3 w-3" aria-hidden />
          )
        }
      >
        {modeLabel}
      </Badge>
      {demoActive ? <DemoDataBadge compact /> : null}
    </span>
  );
}
