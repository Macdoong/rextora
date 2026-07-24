"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";

const STORAGE_KEY = "rextora.expertMode";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Client route guard for Expert Mode surfaces.
 * Expert Mode defaults off; localStorage flag must be "1".
 */
export function ExpertRouteGuard(props: {
  children: ReactNode;
  title?: string;
}) {
  const allowed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (!allowed) {
    return (
      <div
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-50"
        data-testid="expert-guard-blocked"
        role="alert"
      >
        <p className="font-medium">
          {props.title ?? "전문가 모드가 꺼져 있습니다."}
        </p>
        <p className="mt-1 text-amber-100/90">
          시스템 설정 → 전문가 모드에서 켠 뒤에만 이 화면을 사용할 수 있습니다.
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-flex rounded-lg border border-sky-500/40 bg-sky-600 px-3 py-2 text-white"
        >
          시스템 설정 열기
        </Link>
      </div>
    );
  }

  return <>{props.children}</>;
}
