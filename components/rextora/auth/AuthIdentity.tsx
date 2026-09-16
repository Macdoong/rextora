"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { authRoleLabelKo } from "@/src/lib/rextora/auth/authPresentation";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";

export function AuthIdentity() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) return null;

  async function logout() {
    await fetch("/api/rextora/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="rextora-auth-identity v3-shell-account grid gap-2" data-testid="auth-identity">
      <div>
        <div className="v3-shell-account-name text-sm font-medium text-slate-100" data-testid="auth-display-name">
          {user.displayName}
        </div>
        <div className="v3-shell-account-role text-xs text-slate-400" data-testid="auth-role-label">
          {authRoleLabelKo(user.role)}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="auth-logout"
        onClick={() => void logout()}
      >
        로그아웃
      </Button>
    </div>
  );
}
