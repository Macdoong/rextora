import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { GlobalShell } from "@/components/rextora/shell/GlobalShell";
import { AUTH_SESSION_COOKIE } from "@/src/lib/rextora/auth/authTypes";
import { resolveSessionToken } from "@/src/lib/rextora/auth/sessionStore";

export async function AppShellGate({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get("x-rextora-pathname") ?? "";
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  const jar = await cookies();
  const user = resolveSessionToken(jar.get(AUTH_SESSION_COOKIE)?.value ?? null);

  if (isLogin) {
    if (user) redirect("/dashboard");
    return <>{children}</>;
  }

  if (!user) {
    redirect("/login");
  }

  return <GlobalShell user={user}>{children}</GlobalShell>;
}
