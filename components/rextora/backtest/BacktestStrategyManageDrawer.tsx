"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { descriptionHasLibraryArchive } from "@/src/lib/rextora/strategy/libraryArchive";

const SAFE_ID = "SAFE_v44_i4060";

interface StrategyRow {
  id: string;
  name: string;
  displayAlias?: string | null;
  displayName?: string | null;
  paramsHash?: string;
  timeframe?: string;
  description?: string;
}

interface BacktestStrategyManageDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedStrategyId?: string | null;
  onSelectStrategy?: (id: string) => void;
}

function displayOf(s: StrategyRow): string {
  return s.displayAlias || s.displayName || s.name || s.id;
}

function isArchived(s: StrategyRow): boolean {
  return descriptionHasLibraryArchive(s.description);
}

export function BacktestStrategyManageDrawer({
  open,
  onClose,
  selectedStrategyId,
  onSelectStrategy,
}: BacktestStrategyManageDrawerProps) {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [impactKo, setImpactKo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/rextora/strategies");
    const json = await res.json();
    if (json.ok && Array.isArray(json.data)) {
      setRows(json.data as StrategyRow[]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((s) => {
      if (!q) return true;
      return [displayOf(s), s.id, s.paramsHash, s.timeframe]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query]);

  async function rename(id: string) {
    if (id === SAFE_ID) {
      setMessage("SAFE 표시 이름은 변경할 수 없습니다.");
      return;
    }
    const current = rows.find((r) => r.id === id);
    const next = window.prompt(
      "표시 이름을 입력하세요",
      displayOf(current ?? { id, name: id }),
    );
    if (!next?.trim()) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_display",
          id,
          displayAlias: next.trim(),
          displayName: next.trim(),
        }),
      });
      const json = await res.json();
      setMessage(json.ok ? "표시 이름을 저장했습니다." : (json.error ?? "실패"));
      if (json.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function archive(id: string, archived: boolean) {
    if (id === SAFE_ID) {
      setMessage("SAFE 전략은 보관할 수 없습니다.");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: archived ? "library_archive" : "library_restore",
          id,
        }),
      });
      const json = await res.json();
      setMessage(
        json.ok
          ? archived
            ? "보관함으로 옮겼습니다."
            : "보관함에서 복원했습니다."
          : (json.error ?? "실패"),
      );
      if (json.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function previewDelete(id: string) {
    if (id === SAFE_ID) {
      setMessage("SAFE 전략은 삭제할 수 없습니다.");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deletion_impact", id }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error ?? "삭제 영향 확인 실패");
        return;
      }
      const impact = json.data as {
        classification?: string;
        reasonsKo?: string[];
        nextActionKo?: string;
      };
      setImpactKo(
        [
          ...(impact.reasonsKo ?? []),
          impact.nextActionKo,
          "저장된 백테스트 이력은 기본적으로 유지됩니다.",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setConfirmDeleteId(id);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      setMessage(json.ok ? "전략을 삭제했습니다." : (json.error ?? "삭제 실패"));
      setConfirmDeleteId(null);
      setImpactKo(null);
      if (json.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55"
      data-testid="backtest-strategy-manage-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="전략 관리"
    >
      <button type="button" className="absolute inset-0" aria-label="닫기" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">전략 관리</p>
            <p className="text-[11px] text-slate-500">
              등록 전략 · 저장된 백테스트 실행과 별개
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-700"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2 border-b border-slate-800 px-4 py-3">
          <input
            className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
            placeholder="이름·ID·해시 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="strategy-manage-search"
          />
          <p className="text-[11px] text-slate-500">
            저장된 백테스트 실행은 이 페이지의 「저장된 백테스트」에서 관리합니다.
          </p>
          {message ? (
            <p className="text-xs text-amber-200" data-testid="strategy-manage-message">
              {message}
            </p>
          ) : null}
        </div>

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {filtered.map((s) => {
            const safe = s.id === SAFE_ID;
            const archived = isArchived(s);
            return (
              <li
                key={s.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  selectedStrategyId === s.id
                    ? "border-emerald-500/40 bg-emerald-950/20"
                    : "border-slate-800 bg-slate-900/40"
                }`}
                data-testid={`strategy-manage-row-${s.id}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onSelectStrategy?.(s.id)}
                >
                  <p className="text-sm font-medium text-slate-100">
                    {displayOf(s)}
                    {safe ? " · SAFE" : ""}
                    {archived ? " · 보관됨" : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    ID {s.id} · 해시 {(s.paramsHash ?? "—").slice(0, 12)} ·{" "}
                    {s.timeframe ?? "—"}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {safe ? (
                    <p
                      className="text-[11px] text-amber-200/80"
                      data-testid="strategy-manage-safe-locked"
                    >
                      SAFE 보호 · 이름 변경·보관·삭제 불가
                    </p>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === s.id}
                        onClick={() => void rename(s.id)}
                        data-testid="strategy-manage-rename"
                      >
                        <Pencil className="mr-1 size-3" />
                        이름
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === s.id}
                        onClick={() => void archive(s.id, !archived)}
                        data-testid="strategy-manage-archive"
                      >
                        {archived ? (
                          <ArchiveRestore className="mr-1 size-3" />
                        ) : (
                          <Archive className="mr-1 size-3" />
                        )}
                        {archived ? "복원" : "보관"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === s.id}
                        onClick={() => void previewDelete(s.id)}
                        data-testid="strategy-manage-delete"
                      >
                        <Trash2 className="mr-1 size-3" />
                        삭제
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {confirmDeleteId ? (
          <div className="space-y-2 border-t border-rose-500/30 bg-rose-950/20 px-4 py-3">
            <p className="text-sm text-rose-100">삭제 확인 · {confirmDeleteId}</p>
            <p className="text-xs text-rose-100/80">{impactKo}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfirmDeleteId(null);
                  setImpactKo(null);
                }}
              >
                취소
              </Button>
              <Button size="sm" onClick={() => void confirmDelete()}>
                삭제 실행
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
