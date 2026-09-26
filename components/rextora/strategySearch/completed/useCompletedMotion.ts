"use client";

import { useEffect, useState } from "react";

/** One-shot completion dashboard motion; off when prefers-reduced-motion. */
export function useCompletedMotion(): boolean {
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimate(false);
    }
  }, []);
  return animate;
}
