import type { TableHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function V3Table({
  children,
  className,
  wrapClassName,
  minWidth = 720,
  ...rest
}: {
  children: ReactNode;
  wrapClassName?: string;
  minWidth?: number;
} & TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={cx("v3-table-wrap", wrapClassName)}>
      <table
        className={cx("v3-table", className)}
        style={{ minWidth }}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

export function V3TableWrap({
  children,
  className,
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("v3-table-wrap", className)} {...rest}>
      {children}
    </div>
  );
}
