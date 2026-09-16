import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function V3PermissionGate({
  allowed,
  reason,
  children,
  className,
}: {
  allowed: boolean;
  reason?: string;
  children: ReactNode;
  className?: string;
}) {
  if (allowed) {
    return <div className={cx("v3-permission", className)} data-allowed="true">{children}</div>;
  }

  return (
    <div className={cx("v3-permission", className)} data-allowed="false">
      <div className="v3-permission__controls" inert aria-disabled="true">
        {children}
      </div>
      {reason ? <p className="v3-permission__reason">{reason}</p> : null}
    </div>
  );
}
