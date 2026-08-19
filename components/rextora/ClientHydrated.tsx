"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Mount browser-state-heavy UI only after the surrounding server tree has
 * hydrated. This prevents selective hydration from comparing persisted client
 * state with an older server snapshot after reload.
 */
export function ClientHydrated({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return mounted ? children : fallback;
}
