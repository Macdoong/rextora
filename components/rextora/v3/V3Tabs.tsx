"use client";

import type { KeyboardEvent, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type V3TabItem = {
  id: string;
  label: ReactNode;
  panel: ReactNode;
};

export function V3Tabs({
  items,
  activeId,
  onChange,
  className,
  labelledBy,
}: {
  items: readonly V3TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  labelledBy?: string;
}) {
  const ids = items.map((item) => item.id);
  const active = items.find((item) => item.id === activeId) ?? items[0];

  function move(fromId: string, delta: number) {
    const index = ids.indexOf(fromId);
    if (index < 0) return;
    const next = ids[(index + delta + ids.length) % ids.length];
    if (next) onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(id, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(id, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (ids[0]) onChange(ids[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = ids[ids.length - 1];
      if (last) onChange(last);
    }
  }

  if (!active) return null;

  return (
    <div className={className}>
      <div className="v3-tabs" role="tablist" aria-labelledby={labelledBy}>
        {items.map((item) => {
          const selected = item.id === active.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={cx("v3-tab", "v3-hover")}
              id={`v3-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`v3-tabpanel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => onKeyDown(event, item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        className="v3-tabpanel v3-screen-in"
        key={active.id}
        role="tabpanel"
        id={`v3-tabpanel-${active.id}`}
        aria-labelledby={`v3-tab-${active.id}`}
      >
        {active.panel}
      </div>
    </div>
  );
}
