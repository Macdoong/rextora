"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui/primitives";

const STORAGE_KEY = "rextora.expertMode";

function readExpertFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Expert Mode toggle — localStorage only; does not mutate SAFE. */
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
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  return (
    <Card
      title="전문가 모드"
      action={
        <Badge tone={enabled ? "warning" : "muted"}>
          {enabled ? "켜짐" : "꺼짐"}
        </Badge>
      }
      data-testid="expert-mode-card"
    >
      <p className="rextora-helper text-slate-300">
        기본 워크플로는 전략 탐색입니다. 전문가 모드는 9단계 수동 전략 빌더와
        진단용 탐색 옵션(예: stopWhenQualifiedTarget, 기본값 false)을 열 때
        사용합니다. SAFE_v44_i4060은 잠긴 원본이라 수정할 수 없습니다. 변경이
        필요하면 복사본을 만드세요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          tone={enabled ? "warning" : "default"}
          data-testid="expert-mode-toggle"
          disabled={!hydrated}
          onClick={toggle}
        >
          {enabled ? "전문가 모드 끄기" : "전문가 모드 켜기"}
        </Button>
        {enabled && (
          <Link
            href="/strategies?expert=1"
            className="rextora-btn-text inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            data-testid="expert-wizard-link"
          >
            수동 9단계 마법사 열기
          </Link>
        )}
      </div>
    </Card>
  );
}
