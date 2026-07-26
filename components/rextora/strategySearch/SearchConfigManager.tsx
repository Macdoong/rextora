"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { StrategySearchOperatorFormState } from "./formDefaults";
import {
  loadOperatorFormSession,
  saveOperatorFormSession,
} from "./operatorFormSession";

type SavedConfigSummary = {
  name: string;
  savedAt: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
  sourcePreset?: string | null;
  isDefault?: boolean;
  advancedOverrideCount?: number;
};

const inputClass = "ss-input mt-1";

export function SearchConfigManager(props: {
  form: StrategySearchOperatorFormState;
  readOnly?: boolean;
  onChange: (next: StrategySearchOperatorFormState) => void;
}) {
  const { form, readOnly = false, onChange } = props;
  const disabled = readOnly;

  const [configName, setConfigName] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [duplicateFrom, setDuplicateFrom] = useState("");
  const [duplicateTo, setDuplicateTo] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<SavedConfigSummary[]>([]);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  const refreshConfigList = useCallback(async () => {
    try {
      const res = await fetch("/api/rextora/strategy-search/configs");
      const json = await res.json();
      if (json?.ok && Array.isArray(json.data)) {
        setSavedConfigs(json.data);
      }
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshConfigList();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshConfigList]);

  async function postConfigAction(body: Record<string, unknown>) {
    const res = await fetch("/api/rextora/strategy-search/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json?.ok) {
      throw new Error(typeof json?.error === "string" ? json.error : "요청 실패");
    }
    return json.data;
  }

  async function handleSaveConfig() {
    if (!configName.trim()) {
      setConfigFeedback("설정 이름을 입력하세요.");
      return;
    }
    const name = configName.trim();
    const exists = savedConfigs.some((c) => c.name === name);
    if (exists) {
      const ok = window.confirm(
        `"${name}" 설정이 이미 있습니다. 덮어쓰시겠습니까?\n(연구 작업·결과에는 영향 없습니다)`,
      );
      if (!ok) return;
    }
    setConfigFeedback(null);
    try {
      await postConfigAction({ name, form, overwrite: true });
      setConfigFeedback(`"${name}" 설정을 저장했습니다.`);
      await refreshConfigList();
    } catch (err) {
      setConfigFeedback(
        err instanceof Error ? err.message : "저장에 실패했습니다.",
      );
    }
  }

  async function handleLoadConfig(name: string) {
    if (!name) return;
    setConfigFeedback(null);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/configs/${encodeURIComponent(name)}`,
      );
      const json = await res.json();
      if (!json?.ok || !json.data?.form) {
        setConfigFeedback("불러오기에 실패했습니다.");
        return;
      }
      const stored = loadOperatorFormSession();
      const next = {
        ...(stored ?? form),
        ...json.data.form,
      };
      onChange(next);
      saveOperatorFormSession(next);
      setConfigFeedback(`"${name}" 설정을 불러왔습니다.`);
    } catch {
      setConfigFeedback("불러오기에 실패했습니다.");
    }
  }

  async function handleDeleteConfig(name: string) {
    if (!name) return;
    const ok = window.confirm(
      `"${name}" 설정을 삭제할까요?\n저장된 연구 작업·결과는 삭제되지 않습니다.`,
    );
    if (!ok) return;
    setConfigFeedback(null);
    try {
      const res = await fetch(
        `/api/rextora/strategy-search/configs/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!json?.ok) {
        setConfigFeedback("삭제에 실패했습니다.");
        return;
      }
      setConfigFeedback(`"${name}" 설정을 삭제했습니다.`);
      await refreshConfigList();
    } catch {
      setConfigFeedback("삭제에 실패했습니다.");
    }
  }

  async function handleRename() {
    if (!renameFrom.trim() || !renameTo.trim()) {
      setConfigFeedback("이름 변경 대상과 새 이름을 입력하세요.");
      return;
    }
    setConfigFeedback(null);
    try {
      await postConfigAction({
        action: "rename",
        name: renameFrom.trim(),
        newName: renameTo.trim(),
      });
      setConfigFeedback(`"${renameFrom.trim()}" → "${renameTo.trim()}" 이름 변경 완료`);
      setRenameFrom("");
      setRenameTo("");
      await refreshConfigList();
    } catch (err) {
      setConfigFeedback(
        err instanceof Error ? err.message : "이름 변경에 실패했습니다.",
      );
    }
  }

  async function handleDuplicate() {
    if (!duplicateFrom.trim() || !duplicateTo.trim()) {
      setConfigFeedback("복제 원본과 새 이름을 입력하세요.");
      return;
    }
    setConfigFeedback(null);
    try {
      await postConfigAction({
        action: "duplicate",
        name: duplicateFrom.trim(),
        newName: duplicateTo.trim(),
      });
      setConfigFeedback(`"${duplicateFrom.trim()}" 설정을 "${duplicateTo.trim()}"(으)로 복제했습니다.`);
      setDuplicateFrom("");
      setDuplicateTo("");
      await refreshConfigList();
    } catch (err) {
      setConfigFeedback(
        err instanceof Error ? err.message : "복제에 실패했습니다.",
      );
    }
  }

  async function handleSetDefault(name: string) {
    if (!name) return;
    setConfigFeedback(null);
    try {
      await postConfigAction({ action: "setDefault", name });
      setConfigFeedback(`"${name}"을(를) 기본 설정으로 지정했습니다.`);
      await refreshConfigList();
    } catch (err) {
      setConfigFeedback(
        err instanceof Error ? err.message : "기본 설정 지정에 실패했습니다.",
      );
    }
  }

  return (
    <div data-testid="ss-config-manager">
      <p className="ss-helper">
        자주 쓰는 탐색 설정을 이름으로 저장·불러오기·관리할 수 있습니다.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block min-w-[12rem] flex-1" htmlFor="ss-config-name">
          <span className="ss-field-label mb-1 block">설정 이름</span>
          <input
            id="ss-config-name"
            data-testid="ss-config-name"
            className={inputClass}
            value={configName}
            disabled={disabled}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="예: btc-15m-deep"
          />
        </label>
        <Button
          type="button"
          className="ss-btn-secondary"
          data-testid="ss-config-save"
          disabled={disabled}
          onClick={() => void handleSaveConfig()}
        >
          저장
        </Button>
      </div>

      {savedConfigs.length > 0 ? (
        <div className="mt-4 space-y-3">
          <ul
            className="space-y-2"
            data-testid="ss-config-list"
            aria-label="탐색 설정 관리"
          >
            {savedConfigs.map((c) => (
              <li
                key={c.name}
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-3"
                data-testid={`ss-config-row-${c.name}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-medium text-slate-100">
                      {c.name}
                      {c.isDefault ? (
                        <span className="ml-2 text-xs text-emerald-300">
                          기본
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      프리셋 {c.sourcePreset ?? "—"} · 고급 재정의{" "}
                      {c.advancedOverrideCount ?? 0}개 · 최근 사용{" "}
                      {c.lastUsedAt
                        ? new Date(c.lastUsedAt).toLocaleString("ko-KR")
                        : "없음"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      data-testid={`ss-config-load-${c.name}`}
                      onClick={() => void handleLoadConfig(c.name)}
                    >
                      불러오기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || Boolean(c.isDefault)}
                      data-testid={`ss-config-default-${c.name}`}
                      onClick={() => void handleSetDefault(c.name)}
                    >
                      기본
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      tone="muted"
                      disabled={disabled}
                      data-testid={`ss-config-delete-${c.name}`}
                      onClick={() => void handleDeleteConfig(c.name)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="ss-config-select"
              className={inputClass}
              defaultValue=""
              disabled={disabled}
              onChange={(e) => {
                const name = e.target.value;
                if (name) void handleLoadConfig(name);
                e.target.value = "";
              }}
            >
              <option value="">저장된 설정 불러오기…</option>
              {savedConfigs.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                  {c.isDefault ? " (기본)" : ""}
                </option>
              ))}
            </select>
            <select
              data-testid="ss-config-delete-select"
              className={inputClass}
              defaultValue=""
              disabled={disabled}
              onChange={(e) => {
                const name = e.target.value;
                if (name) void handleDeleteConfig(name);
                e.target.value = "";
              }}
            >
              <option value="">삭제할 설정…</option>
              {savedConfigs.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              data-testid="ss-config-default-select"
              className={inputClass}
              defaultValue=""
              disabled={disabled}
              onChange={(e) => {
                const name = e.target.value;
                if (name) void handleSetDefault(name);
                e.target.value = "";
              }}
            >
              <option value="">기본 설정으로 지정…</option>
              {savedConfigs.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[8rem] flex-1" htmlFor="ss-config-rename-from">
                <span className="ss-field-label mb-1 block">이름 변경 (원본)</span>
                <input
                  id="ss-config-rename-from"
                  data-testid="ss-config-rename-from"
                  className={inputClass}
                  value={renameFrom}
                  disabled={disabled}
                  onChange={(e) => setRenameFrom(e.target.value)}
                  placeholder="원본 이름"
                />
              </label>
              <label className="block min-w-[8rem] flex-1" htmlFor="ss-config-rename-to">
                <span className="ss-field-label mb-1 block">새 이름</span>
                <input
                  id="ss-config-rename-to"
                  data-testid="ss-config-rename-to"
                  className={inputClass}
                  value={renameTo}
                  disabled={disabled}
                  onChange={(e) => setRenameTo(e.target.value)}
                  placeholder="새 이름"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                data-testid="ss-config-rename"
                disabled={disabled}
                onClick={() => void handleRename()}
              >
                이름 변경
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[8rem] flex-1" htmlFor="ss-config-dup-from">
                <span className="ss-field-label mb-1 block">복제 (원본)</span>
                <input
                  id="ss-config-dup-from"
                  data-testid="ss-config-dup-from"
                  className={inputClass}
                  value={duplicateFrom}
                  disabled={disabled}
                  onChange={(e) => setDuplicateFrom(e.target.value)}
                  placeholder="원본 이름"
                />
              </label>
              <label className="block min-w-[8rem] flex-1" htmlFor="ss-config-dup-to">
                <span className="ss-field-label mb-1 block">복제 이름</span>
                <input
                  id="ss-config-dup-to"
                  data-testid="ss-config-dup-to"
                  className={inputClass}
                  value={duplicateTo}
                  disabled={disabled}
                  onChange={(e) => setDuplicateTo(e.target.value)}
                  placeholder="새 이름"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                data-testid="ss-config-duplicate"
                disabled={disabled}
                onClick={() => void handleDuplicate()}
              >
                복제
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="ss-helper mt-3">저장된 설정이 없습니다.</p>
      )}

      {configFeedback ? (
        <p className="mt-2 text-sm text-slate-300" data-testid="ss-config-feedback">
          {configFeedback}
        </p>
      ) : null}
    </div>
  );
}
