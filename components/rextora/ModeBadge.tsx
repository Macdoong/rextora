"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { FlaskConical, Zap } from "lucide-react";

type ModePayload = {
  status?: { modeLabel?: "모의 거래" | "실전 거래" };
};

export function ModeBadge() {
  const [modeLabel, setModeLabel] = useState<"모의 거래" | "실전 거래">("모의 거래");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/rextora/trading/dashboard", {
          cache: "no-store",
        });
        const body = (await res.json()) as { ok: boolean; data: ModePayload };
        if (active && body.ok && body.data.status?.modeLabel) {
          setModeLabel(body.data.status.modeLabel);
        }
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
  );
}
