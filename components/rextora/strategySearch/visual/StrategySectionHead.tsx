"use client";

import type { ReactNode } from "react";

export function StrategySectionHead({
  eyebrow,
  title,
  description,
  titleId,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  titleId?: string;
  as?: "h2" | "h3";
}) {
  return (
    <header className="ss-section-head">
      {eyebrow ? <p className="ss-section-head__eyebrow">{eyebrow}</p> : null}
      <Tag id={titleId} className="ss-section-head__title">
        {title}
      </Tag>
      {description ? (
        <p className="ss-section-head__desc">{description}</p>
      ) : null}
    </header>
  );
}
