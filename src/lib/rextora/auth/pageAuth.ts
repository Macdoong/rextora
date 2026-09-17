import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SESSION_COOKIE, type AuthenticatedUser } from "./authTypes";
import { resolveSessionToken } from "./sessionStore";
import { resolveAdminPageAccess } from "./adminUserPolicy";

export async function resolvePageUser(): Promise<AuthenticatedUser | null> {
  const jar = await cookies();
  return resolveSessionToken(jar.get(AUTH_SESSION_COOKIE)?.value ?? null);
}

export async function requireAdminPageUser(): Promise<AuthenticatedUser> {
  const user = await resolvePageUser();
  const access = resolveAdminPageAccess(user);
  if (access === "unauthenticated") redirect("/login");
  if (access === "forbidden") redirect("/dashboard");
  if (!user) redirect("/login");
  return user;
}
