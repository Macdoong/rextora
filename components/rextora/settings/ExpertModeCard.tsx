"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { SettingsExpertModeView } from "@/components/rextora/settings/SettingsExpertModeView";
import {
  SETTINGS_EXPERT_STORAGE_KEY,
  SETTINGS_EXPERT_STORAGE_OFF,
  SETTINGS_EXPERT_STORAGE_ON,
  settingsExpertGateLabel,
} from "@/src/lib/rextora/settings/settingsExpertModePresentation";

function readExpertFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SETTINGS_EXPERT_STORAGE_KEY) === SETTINGS_EXPERT_STORAGE_ON;
  } catch {
    return false;
  }
}

/** Expert Mode toggle — localStorage only; does not mutate SAFE or settings.json. */
export function ExpertModeCard() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      setEnabled(readExpertFlag());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(boot);
  }, []);

  function toggle() {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          SETTINGS_EXPERT_STORAGE_KEY,
          next ? SETTINGS_EXPERT_STORAGE_ON : SETTINGS_EXPERT_STORAGE_OFF,
        );
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  return (
    <V3Card
      title="전문가 모드"
      meta={settingsExpertGateLabel(enabled)}
      headerAction={
        <Badge tone={enabled ? "warning" : "muted"}>
          {settingsExpertGateLabel(enabled)}
        </Badge>
      }
      data-testid="expert-mode-card"
    >
      <SettingsExpertModeView
        enabled={enabled}
        hydrated={hydrated}
        onToggle={toggle}
      />
    </V3Card>
  );
}
