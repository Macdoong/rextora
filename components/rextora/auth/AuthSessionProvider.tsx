"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicRextoraUser, RextoraPermission } from "@/src/lib/rextora/auth/authTypes";
import { roleHasPermission } from "@/src/lib/rextora/auth/permissions";

const AuthSessionContext = createContext<PublicRextoraUser | null | undefined>(undefined);

export function AuthSessionProvider({
  user,
  children,
}: {
  user: PublicRextoraUser | null;
  children: ReactNode;
}) {
  return <AuthSessionContext.Provider value={user}>{children}</AuthSessionContext.Provider>;
}

export function useAuth() {
  const user = useContext(AuthSessionContext);
  const ready = user !== undefined;
  const current = user ?? null;
  return {
    user: current,
    role: current?.role ?? null,
    ready,
    can: (permission: RextoraPermission) => {
      if (user === undefined) return true;
      if (!current) return false;
      return roleHasPermission(current.role, permission);
    },
  };
}
