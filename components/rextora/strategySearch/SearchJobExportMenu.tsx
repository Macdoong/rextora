"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  EXPORT_INELIGIBLE_COPY,
  EXPORT_READ_FAILURE_COPY,
  buildExportFilename,
  buildSearchReportHref,
  downloadTextFile,
  isExportEligibleStatus,
  loadSearchJobExportModel,
  serializeCustomerExportCsv,
  serializeCustomerExportJson,
} from "./searchJobExport";

type ExportKind = "pdf" | "csv" | "json";

export function SearchJobExportMenu(props: {
  jobId: string | null | undefined;
  status?: string | null;
}) {
  const { jobId, status } = props;
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIneligible =
    Boolean(status) && !isExportEligibleStatus(status);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function runExport(kind: ExportKind) {
    if (!jobId) {
      setError(EXPORT_READ_FAILURE_COPY);
      return;
    }
    if (knownIneligible) {
      setError(EXPORT_INELIGIBLE_COPY);
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === "pdf") {
        window.open(buildSearchReportHref(jobId), "_blank", "noopener,noreferrer");
        setOpen(false);
        return;
      }
      const loaded = await loadSearchJobExportModel(jobId);
      if (!loaded.ok) {
        setError(loaded.error);
        return;
      }
      const filename = buildExportFilename(
        loaded.model.searchName,
        loaded.model.finishedDate,
        kind,
      );
      if (kind === "json") {
        downloadTextFile({
          filename,
          content: serializeCustomerExportJson(loaded.model),
          mime: "application/json;charset=utf-8",
        });
      } else {
        downloadTextFile({
          filename,
          content: serializeCustomerExportCsv(loaded.model),
          mime: "text/csv;charset=utf-8",
        });
      }
      setOpen(false);
    } catch {
      setError(EXPORT_READ_FAILURE_COPY);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ss-export" ref={rootRef} data-testid="ss-export-menu">
      <button
        type="button"
        className="ss-export-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={!jobId || busy}
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
      >
        결과 내보내기 ▾
      </button>
      {open ? (
        <div
          id={menuId}
          className="ss-export-dropdown"
          role="menu"
          aria-label="결과 내보내기"
        >
          {knownIneligible ? (
            <p className="ss-export-note" role="note">
              {EXPORT_INELIGIBLE_COPY}
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="ss-export-item"
            disabled={knownIneligible || busy}
            onClick={() => void runExport("pdf")}
          >
            PDF 보고서
          </button>
          <button
            type="button"
            role="menuitem"
            className="ss-export-item"
            disabled={knownIneligible || busy}
            onClick={() => void runExport("csv")}
          >
            CSV
          </button>
          <button
            type="button"
            role="menuitem"
            className="ss-export-item"
            disabled={knownIneligible || busy}
            onClick={() => void runExport("json")}
          >
            JSON
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="ss-export-error" role="alert" data-testid="ss-export-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
