import type { HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function V3Card({
  title,
  meta,
  header,
  headerAction,
  interactive = false,
  children,
  className,
  ...rest
}: {
  title?: ReactNode;
  meta?: ReactNode;
  header?: ReactNode;
  headerAction?: ReactNode;
  interactive?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const showHead = header != null || title != null || meta != null || headerAction != null;

  return (
    <section
      className={cx(
        "v3-card",
        interactive && "v3-card--interactive",
        className,
      )}
      {...rest}
    >
      {showHead ? (
        <div className="v3-card__head">
          {header ?? (
            <>
              {title != null ? <h3 className="v3-card__title">{title}</h3> : <span />}
              <div>
                {meta != null ? <span className="v3-card__meta">{meta}</span> : null}
                {headerAction}
              </div>
            </>
          )}
        </div>
      ) : null}
      {children != null ? <div className="v3-card__body">{children}</div> : null}
    </section>
  );
}
