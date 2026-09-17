import { describe, expect, it } from "vitest";
import { AUTH_ERROR } from "../src/lib/rextora/auth/authTypes";
import { AUTH_FORBIDDEN, AUTH_LOGIN_REQUIRED } from "../src/lib/rextora/auth/authPresentation";
import { permissionsForRole, roleHasPermission } from "../src/lib/rextora/auth/permissions";
import {
  requireAuthenticatedUser,
  requireCeo,
} from "../src/lib/rextora/auth/requireUser";
import { createSession } from "../src/lib/rextora/auth/sessionStore";
import { createUser, disableUser } from "../src/lib/rextora/auth/userStore";
import { attachCookie, authedRequest } from "./helpers/authSession";

async function bodyOf(response: Response) {
  return (await response.json()) as {
    ok?: boolean;
    data?: unknown;
    error?: string;
    code?: string;
  };
}

describe("requireCeo", () => {
  it("1. authenticated CEO passes", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "ceo");
    const gate = requireCeo(request);
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.user.role).toBe("ceo");
    expect(gate.user.username).toBe("temp_ceo");
    expect(gate.user.disabledAt).toBeNull();
    expect((gate.user as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it("2. authenticated operator is forbidden", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "operator");
    const gate = requireCeo(request);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const body = await bodyOf(gate.response);
    expect(body.ok).toBe(false);
    expect(body.code).toBe(AUTH_ERROR.forbidden);
    expect(body.error).toBe(AUTH_FORBIDDEN);
    expect(roleHasPermission("operator", "research:run")).toBe(true);
  });

  it("3. authenticated viewer is forbidden", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "viewer");
    const gate = requireCeo(request);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(403);
    const body = await bodyOf(gate.response);
    expect(body.code).toBe(AUTH_ERROR.forbidden);
  });

  it("4. unauthenticated request follows existing auth failure behavior", async () => {
    const request = new Request("http://localhost/api/rextora/auth/me");
    const ceo = requireCeo(request);
    const auth = requireAuthenticatedUser(request);
    expect(ceo.ok).toBe(false);
    expect(auth.ok).toBe(false);
    if (ceo.ok || auth.ok) return;
    expect(ceo.response.status).toBe(401);
    expect(auth.response.status).toBe(401);
    const body = await bodyOf(ceo.response);
    expect(body.code).toBe(AUTH_ERROR.unauthenticated);
    expect(body.error).toBe(AUTH_LOGIN_REQUIRED);
  });

  it("5. disabled CEO cannot pass through a stale session", async () => {
    const user = await createUser({
      username: "disabled_ceo_gate",
      displayName: "비활성 대표",
      role: "ceo",
      password: "disabled-ceo-pass",
    });
    const { token } = createSession(user.userId);
    disableUser(user.userId);
    const request = attachCookie(
      new Request("http://localhost/api/rextora/auth/me"),
      token,
    );
    const gate = requireCeo(request);
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.response.status).toBe(401);
    const body = await bodyOf(gate.response);
    expect(body.code).toBe(AUTH_ERROR.unauthenticated);
  });

  it("6. requireCeo returns the canonical authenticated user", async () => {
    const request = await authedRequest("http://localhost/api/rextora/auth/me", {}, "ceo");
    const ceo = requireCeo(request);
    const auth = requireAuthenticatedUser(request);
    expect(ceo.ok).toBe(true);
    expect(auth.ok).toBe(true);
    if (!ceo.ok || !auth.ok) return;
    expect(ceo.user).toEqual(auth.user);
    expect(ceo.user.role).toBe("ceo");
  });

  it("7. existing role permissions are unchanged", () => {
    expect(permissionsForRole("ceo")).toEqual([
      "research:run",
      "backtest:run",
      "paper:operate",
      "live:request",
      "live:emergency_stop",
      "agent:operate",
      "settings:write",
      "risk:write",
      "live:approve",
      "live:revoke",
      "live:start",
      "credentials:manage",
      "strategy:write",
    ]);
    expect(permissionsForRole("operator")).toEqual(permissionsForRole("ceo"));
    expect(permissionsForRole("admin")).toEqual(permissionsForRole("ceo"));
    expect(permissionsForRole("viewer")).toEqual([]);
    expect(roleHasPermission("operator", "live:approve")).toBe(true);
    expect(roleHasPermission("ceo", "live:approve")).toBe(true);
  });
});
