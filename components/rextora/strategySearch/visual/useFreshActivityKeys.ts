"use client";

import { useEffect, useRef, useState } from "react";
import type { StrategySearchActivityEvent } from "@/src/lib/rextora/strategySearch/activityTelemetry";
import {
  activityEventKeys,
  establishActivityBaseline,
  incomingActivityKeys,
} from "./runningVisualModel";

export function useFreshActivityKeys(
  events: readonly StrategySearchActivityEvent[] | null | undefined,
): Set<string> {
  const seenRef = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const keys = activityEventKeys(events);
  const serialized = keys.join("\n");

  useEffect(() => {
    const nextKeys = serialized === "" ? [] : serialized.split("\n");
    if (seenRef.current == null) {
      seenRef.current = establishActivityBaseline(nextKeys);
      setFresh(new Set());
      return;
    }
    const incoming = incomingActivityKeys(nextKeys, seenRef.current);
    if (incoming.length === 0) {
      setFresh((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    for (const key of incoming) seenRef.current.add(key);
    setFresh(new Set(incoming));
  }, [serialized]);

  return fresh;
}
