"use client";

import { useEffect, useState } from "react";

export function useCountUpDisplay(
  target: number | null,
  options?: { durationMs?: number; enabled?: boolean },
): string {
  const durationMs = options?.durationMs ?? 650;
  const enabled = options?.enabled ?? true;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      setDisplay(0);
      return;
    }
    if (!enabled) {
      setDisplay(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(Math.round(target * t));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, enabled]);

  if (target == null || !Number.isFinite(target)) return "—";
  return String(display);
}
