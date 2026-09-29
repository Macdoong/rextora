"use client";

import { useEffect, useState } from "react";
import { useCompletedMotion } from "./useCompletedMotion";

/** Staggered one-shot enter; instant when reduced motion or not yet stable. */
export function usePresentationEnter(
  delayMs: number,
  dataStable: boolean,
): boolean {
  const motion = useCompletedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!dataStable) {
      setEntered(false);
      return;
    }
    if (!motion) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const t = window.setTimeout(() => setEntered(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs, motion, dataStable]);

  return dataStable && (entered || !motion);
}
