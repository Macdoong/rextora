import { describe, expect, it } from "vitest";
import { GET as listUsersGet, POST as createUserPost } from "../app/api/rextora/admin/users/route";
import { DELETE as deleteUserApi, PATCH as patchUser } from "../app/api/rextora/admin/users/[userId]/route";
import { POST as loginPost } from "../app/api/rextora/auth/login/route";
import { AUTH_ERROR } from "../src/lib/rextora/auth/authTypes";
import { AUTH_LOGIN_REQUIRED } from "../src/lib/rextora/auth/authPresentation";
import { createSession, resolveSessionToken } from "../src/lib/rextora/auth/sessionStore";
import { createUser, deleteUser, getUserById, getUserByUsername } from "../src/lib/rextora/auth/userStore";
import { attachCookie, authedRequest, ensureTestUser, testPassword } from "./helpers/authSession";

type PublicUser = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  disabledAt: string | null;
  passwordHash?: string;
  password?: string;
};

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

async function jsonOf(res: Response) {
  return (await res.json()) as {
    ok?: boolean;
    data?: { users?: PublicUser[]; user?: PublicUser };
    error?: string;
    code?: string;
  };
}

function secretFree(value: unknown, plaintext?: string) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/passwordHash/);
  expect(text).not.toMatch(/"password":/);
  if (plaintext) expect(text).not.toContain(plaintext);
}

async function patch(
  userId: string,
  body: unknown,
  role: "ceo" | "admin" | "operator" | "viewer" = "ceo",
  init: RequestInit = {},
) {
  return patchUser(
    await authedRequest(
      `http://localhost/api/rextora/admin/users/${userId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init,
      },
      role,
    ),
    { params: Promise.resolve({ userId }) },
  );
}

async function patchAs(actorUserId: string, targetUserId: string, body: unknown) {
  const { token } = createSession(actorUserId);
  return patchUser(
    attachCookie(
      new Request(`http://localhost/api/rextora/admin/users/${targetUserId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      token,
      "http://localhost",
    ),
    { params: Promise.resolve({ userId: targetUserId }) },
  );
}

async function del(
  userId: string,
  role: "ceo" | "admin" | "operator" | "viewer" = "ceo",
  init: RequestInit = {},
) {
  return deleteUserApi(
    await authedRequest(
      `http://localhost/api/rextora/admin/users/${userId}`,
      {
        method: "DELETE",
        ...init,
      },
      role,
    ),
    { params: Promise.resolve({ userId }) },
  );
}

async function delAs(actorUserId: string, targetUserId: string, origin = "http://localhost") {
  const { token } = createSession(actorUserId);
  return deleteUserApi(
    attachCookie(
      new Request(`http://localhost/api/rextora/admin/users/${targetUserId}`, {
        method: "DELETE",
      }),
      token,
      origin,
    ),
    { params: Promise.resolve({ userId: targetUserId }) },
  );
}

async function createManaged(
  role: "admin" | "operator" | "viewer",
  actor: "ceo" | "admin" = "ceo",
) {
  const username = unique(`api_${role}`);
  const password = `${username}-pass`;
  const res = await createUserPost(
    await authedRequest(
      "http://localhost/api/rextora/admin/users",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          displayName: username,
          password,
          role,
        }),
      },
      actor,
    ),
  );
  const body = await jsonOf(res);
  expect(res.status).toBe(200);
  const user = body.data?.user;
  if (!user) throw new Error("expected created user");
  return { user, password, username };
}

async function login(username: string, password: string) {
  return loginPost(
    new Request("http://localhost/api/rextora/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({ username, password }),
    }),
  );
}

describe("admin users API", () => {
  it("1-6. GET list: ceo/admin/operator allowed; viewer/unauth denied; no passwordHash", async () => {
    const ceo = await listUsersGet(
      await authedRequest("http://localhost/api/rextora/admin/users", {}, "ceo"),
    );
    const admin = await listUsersGet(
      await authedRequest("http://localhost/api/rextora/admin/users", {}, "admin"),
    );
    const operator = await listUsersGet(
      await authedRequest("http://localhost/api/rextora/admin/users", {}, "operator"),
    );
    const viewer = await listUsersGet(
      await authedRequest("http://localhost/api/rextora/admin/users", {}, "viewer"),
    );
    const unauth = await listUsersGet(new Request("http://localhost/api/rextora/admin/users"));

    expect(ceo.status).toBe(200);
    expect(admin.status).toBe(200);
    const ceoBody = await jsonOf(ceo);
    const adminBody = await jsonOf(admin);
    expect(Array.isArray(ceoBody.data?.users)).toBe(true);
    expect(Array.isArray(adminBody.data?.users)).toBe(true);
    const sample = ceoBody.data?.users?.[0];
    expect(sample).toBeTruthy();
    expect(sample).toHaveProperty("role");
    expect(sample).toHaveProperty("createdAt");
    expect(sample).toHaveProperty("disabledAt");
    secretFree(ceoBody);
    secretFree(adminBody);

    expect(operator.status).toBe(200);
    const operatorBody = await jsonOf(operator);
    expect(Array.isArray(operatorBody.data?.users)).toBe(true);
    secretFree(operatorBody);
    expect(viewer.status).toBe(403);
    expect((await jsonOf(viewer)).code).toBe(AUTH_ERROR.forbidden);
    expect(unauth.status).toBe(401);
    const unauthBody = await jsonOf(unauth);
    expect(unauthBody.code).toBe(AUTH_ERROR.unauthenticated);
    expect(unauthBody.error).toBe(AUTH_LOGIN_REQUIRED);
  });

  it("7-19. POST create admin/operator/viewer; block ceo; conflict/origin/secrets", async () => {
    const ceoOp = await createManaged("operator", "ceo");
    const ceoView = await createManaged("viewer", "ceo");
    const ceoAdmin = await createManaged("admin", "ceo");
    const adminOp = await createManaged("operator", "admin");
    const adminView = await createManaged("viewer", "admin");
    const adminAdmin = await createManaged("admin", "admin");
    expect(ceoOp.user.role).toBe("operator");
    expect(ceoView.user.role).toBe("viewer");
    expect(ceoAdmin.user.role).toBe("admin");
    expect(adminOp.user.role).toBe("operator");
    expect(adminView.user.role).toBe("viewer");
    expect(adminAdmin.user.role).toBe("admin");
    secretFree(ceoOp.user, ceoOp.password);
    expect(ceoOp.user.passwordHash).toBeUndefined();
    const stored = getUserByUsername(ceoOp.username);
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash.includes(ceoOp.password)).toBe(false);

    const blocked: Array<["ceo" | "admin" | "operator", string]> = [
      ["ceo", "ceo"],
      ["admin", "ceo"],
      ["operator", "operator"],
    ];
    for (const [actor, role] of blocked) {
      const res = await createUserPost(
        await authedRequest(
          "http://localhost/api/rextora/admin/users",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              username: unique("blocked"),
              displayName: "blocked",
              password: "blocked-pass",
              role,
            }),
          },
          actor,
        ),
      );
      expect(res.status, `${actor} create ${role}`).toBe(403);
      expect((await jsonOf(res)).code).toBe(AUTH_ERROR.forbidden);
    }

    const dup = await createUserPost(
      await authedRequest(
        "http://localhost/api/rextora/admin/users",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: ceoOp.username,
            displayName: "dup",
            password: "dup-pass",
            role: "operator",
          }),
        },
        "ceo",
      ),
    );
    expect(dup.status).toBe(409);

    const invalidRole = await createUserPost(
      await authedRequest(
        "http://localhost/api/rextora/admin/users",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: unique("badrole"),
            displayName: "bad",
            password: "bad-pass",
            role: "tester",
          }),
        },
        "ceo",
      ),
    );
    expect(invalidRole.status).toBe(400);

    const crossOrigin = await createUserPost(
      await authedRequest(
        "http://localhost/api/rextora/admin/users",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({
            username: unique("origin"),
            displayName: "origin",
            password: "origin-pass",
            role: "operator",
          }),
        },
        "ceo",
      ),
    );
    expect(crossOrigin.status).toBe(403);
    expect((await jsonOf(crossOrigin)).code).toBe(AUTH_ERROR.origin_rejected);
  });

  it("20-31. PATCH displayName/disable/enable/password; session revoke rules", async () => {
    const bystander = await createUser({
      username: unique("bystander"),
      displayName: "다른 세션",
      role: "operator",
      password: "bystander-pass",
    });
    const { token: bystanderToken } = createSession(bystander.userId);

    const target = await createManaged("operator", "ceo");
    const { token: targetToken } = createSession(target.user.userId);

    const ceoName = await patch(target.user.userId, { displayName: "CEO 이름" }, "ceo");
    expect(ceoName.status).toBe(200);
    expect((await jsonOf(ceoName)).data?.user?.displayName).toBe("CEO 이름");
    expect(resolveSessionToken(targetToken)?.userId).toBe(target.user.userId);

    const adminName = await patch(target.user.userId, { displayName: "관리자 이름" }, "admin");
    expect(adminName.status).toBe(200);
    expect((await jsonOf(adminName)).data?.user?.displayName).toBe("관리자 이름");

    const ceoDisable = await patch(target.user.userId, { disabled: true }, "ceo");
    expect(ceoDisable.status).toBe(200);
    expect((await jsonOf(ceoDisable)).data?.user?.disabledAt).toBeTruthy();
    expect(resolveSessionToken(targetToken)).toBeNull();
    expect(resolveSessionToken(bystanderToken)?.userId).toBe(bystander.userId);

    const enabled = await patch(target.user.userId, { disabled: false }, "ceo");
    expect(enabled.status).toBe(200);
    expect((await jsonOf(enabled)).data?.user?.disabledAt).toBeNull();
    expect(resolveSessionToken(targetToken)).toBeNull();

    const viewerTarget = await createManaged("viewer", "admin");
    const adminDisable = await patch(viewerTarget.user.userId, { disabled: true }, "admin");
    expect(adminDisable.status).toBe(200);

    const resetTarget = await createManaged("operator", "ceo");
    const oldPassword = resetTarget.password;
    const newPassword = `${resetTarget.username}-new`;
    const { token: resetToken } = createSession(resetTarget.user.userId);
    const reset = await patch(resetTarget.user.userId, { password: newPassword }, "ceo");
    expect(reset.status).toBe(200);
    secretFree(await reset.clone().json(), newPassword);
    expect(resolveSessionToken(resetToken)).toBeNull();
    const oldLogin = await login(resetTarget.username, oldPassword);
    expect(oldLogin.status).toBe(401);
    const newLogin = await login(resetTarget.username, newPassword);
    expect(newLogin.status).toBe(200);
    expect(resolveSessionToken(bystanderToken)?.userId).toBe(bystander.userId);
  });

  it("32-42. CEO and admin may assign admin/operator/viewer; ceo destination forbidden", async () => {
    const op = await createManaged("operator", "ceo");
    const view = await createManaged("viewer", "ceo");
    const { token: opToken } = createSession(op.user.userId);
    const { token: viewToken } = createSession(view.user.userId);

    const promoteOp = await patch(op.user.userId, { role: "admin" }, "ceo");
    expect(promoteOp.status).toBe(200);
    expect((await jsonOf(promoteOp)).data?.user?.role).toBe("admin");
    expect(resolveSessionToken(opToken)).toBeNull();

    const promoteView = await patch(view.user.userId, { role: "admin" }, "ceo");
    expect(promoteView.status).toBe(200);
    expect((await jsonOf(promoteView)).data?.user?.role).toBe("admin");
    expect(resolveSessionToken(viewToken)).toBeNull();

    const demoteOp = await patch(op.user.userId, { role: "operator" }, "ceo");
    expect(demoteOp.status).toBe(200);
    expect((await jsonOf(demoteOp)).data?.user?.role).toBe("operator");

    const { token: adminToken } = createSession(view.user.userId);
    const demoteView = await patch(view.user.userId, { role: "viewer" }, "ceo");
    expect(demoteView.status).toBe(200);
    expect((await jsonOf(demoteView)).data?.user?.role).toBe("viewer");
    expect(resolveSessionToken(adminToken)).toBeNull();

    const swap = await createManaged("operator", "ceo");
    const toViewer = await patch(swap.user.userId, { role: "viewer" }, "admin");
    expect(toViewer.status).toBe(200);
    expect((await jsonOf(toViewer)).data?.user?.role).toBe("viewer");
    const toOperator = await patch(swap.user.userId, { role: "operator" }, "admin");
    expect(toOperator.status).toBe(200);
    expect((await jsonOf(toOperator)).data?.user?.role).toBe("operator");

    const cannotPromoteCeo = await patch(swap.user.userId, { role: "admin" }, "admin");
    expect(cannotPromoteCeo.status).toBe(200);
    expect((await jsonOf(cannotPromoteCeo)).data?.user?.role).toBe("admin");

    const otherAdmin = await createUser({
      username: unique("other_admin"),
      displayName: "다른 관리자",
      role: "admin",
      password: "other-admin-pass",
    });
    const adminTouchesAdmin = await patch(otherAdmin.userId, { displayName: "가능" }, "admin");
    expect(adminTouchesAdmin.status).toBe(200);
    expect((await jsonOf(adminTouchesAdmin)).data?.user?.displayName).toBe("가능");

    expect((await patch(swap.user.userId, { role: "ceo" }, "admin")).status).toBe(403);
    expect((await patch(swap.user.userId, { role: "ceo" }, "ceo")).status).toBe(403);
  });

  it("43-46. CEO self may edit identity; role/status stay protected; other actors cannot mutate CEO", async () => {
    const { user: ceo } = await ensureTestUser("ceo");
    const originalUsername = ceo.username;
    const originalDisplayName = ceo.displayName;
    try {
      const nick = await patchAs(ceo.userId, ceo.userId, { displayName: "CEO 닉네임" });
      expect(nick.status).toBe(200);
      expect((await jsonOf(nick)).data?.user?.displayName).toBe("CEO 닉네임");

      const renamed = unique("ceo_self");
      const usernameRes = await patchAs(ceo.userId, ceo.userId, { username: renamed });
      expect(usernameRes.status).toBe(200);
      expect((await jsonOf(usernameRes)).data?.user?.username).toBe(renamed);
      expect((await patchAs(ceo.userId, ceo.userId, { username: originalUsername })).status).toBe(200);
      expect(getUserById(ceo.userId)?.username).toBe(originalUsername);

      const newPassword = `${unique("ceo_pw")}-pass`;
      const reset = await patchAs(ceo.userId, ceo.userId, { password: newPassword });
      expect(reset.status).toBe(200);
      secretFree(await reset.clone().json(), newPassword);
      expect((await login(originalUsername, newPassword)).status).toBe(200);

      expect((await patchAs(ceo.userId, ceo.userId, { role: "admin" })).status).toBe(403);
      expect((await patchAs(ceo.userId, ceo.userId, { disabled: true })).status).toBe(403);
      expect((await patch(ceo.userId, { displayName: "해킹" }, "admin")).status).toBe(403);
      expect((await patch(ceo.userId, { username: "hacked-ceo" }, "admin")).status).toBe(403);
      expect((await patch(ceo.userId, { password: "hacked-pass" }, "admin")).status).toBe(403);
      expect(getUserById(ceo.userId)?.role).toBe("ceo");
      expect(getUserById(ceo.userId)?.disabledAt).toBeNull();
    } finally {
      await patchAs(ceo.userId, ceo.userId, { username: originalUsername });
      await patchAs(ceo.userId, ceo.userId, { displayName: originalDisplayName });
      await patchAs(ceo.userId, ceo.userId, { password: testPassword("ceo") });
    }
    expect(getUserById(ceo.userId)?.username).toBe(originalUsername);
    expect(getUserById(ceo.userId)?.displayName).toBe(originalDisplayName);
  });

  it("47-49. admin may mutate its own non-CEO account", async () => {
    const selfAdmin = await createUser({
      username: unique("self_admin"),
      displayName: "본인 관리자",
      role: "admin",
      password: "self-admin-pass",
    });
    expect((await patchAs(selfAdmin.userId, selfAdmin.userId, { displayName: "셀프" })).status).toBe(200);
    expect(getUserById(selfAdmin.userId)?.displayName).toBe("셀프");
    expect((await patchAs(selfAdmin.userId, selfAdmin.userId, { role: "operator" })).status).toBe(200);
    expect(getUserById(selfAdmin.userId)?.role).toBe("operator");

    const disableSelf = await createUser({
      username: unique("self_disable"),
      displayName: "자기 비활성",
      role: "admin",
      password: "self-disable-pass",
    });
    expect((await patchAs(disableSelf.userId, disableSelf.userId, { disabled: true })).status).toBe(200);
    expect(getUserById(disableSelf.userId)?.disabledAt).toBeTruthy();
  });

  it("50-56. validation and caller denial", async () => {
    const target = await createManaged("operator", "ceo");
    expect((await patch(target.user.userId, { userId: "usr_other" }, "ceo")).status).toBe(400);
    expect((await patch(target.user.userId, { email: "a@b.c" }, "ceo")).status).toBe(400);
    expect((await patch(target.user.userId, "[]", "ceo")).status).toBe(400);
    expect((await patch(target.user.userId, {}, "ceo")).status).toBe(400);

    const origin = await patchUser(
      await authedRequest(
        `http://localhost/api/rextora/admin/users/${target.user.userId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({ displayName: "origin" }),
        },
        "ceo",
      ),
      { params: Promise.resolve({ userId: target.user.userId }) },
    );
    expect(origin.status).toBe(403);
    expect((await jsonOf(origin)).code).toBe(AUTH_ERROR.origin_rejected);

    expect((await patch(target.user.userId, { displayName: "op" }, "operator")).status).toBe(403);
    expect((await patch(target.user.userId, { displayName: "view" }, "viewer")).status).toBe(403);
  });

  it("57-60. security mutations revoke only the target sessions", async () => {
    const other = await createUser({
      username: unique("keep_session"),
      displayName: "유지",
      role: "viewer",
      password: "keep-pass",
    });
    const { token: otherToken } = createSession(other.userId);

    const roleUser = await createManaged("operator", "ceo");
    const { token: roleToken } = createSession(roleUser.user.userId);
    await patch(roleUser.user.userId, { role: "viewer" }, "ceo");
    expect(resolveSessionToken(roleToken)).toBeNull();

    const passUser = await createManaged("operator", "ceo");
    const { token: passToken } = createSession(passUser.user.userId);
    await patch(passUser.user.userId, { password: "brand-new-pass" }, "ceo");
    expect(resolveSessionToken(passToken)).toBeNull();

    const disabledUser = await createManaged("operator", "ceo");
    const { token: disabledToken } = createSession(disabledUser.user.userId);
    await patch(disabledUser.user.userId, { disabled: true }, "ceo");
    expect(resolveSessionToken(disabledToken)).toBeNull();

    expect(resolveSessionToken(otherToken)?.userId).toBe(other.userId);
  });

  it("61-72. username PATCH: uniqueness, protection, session revoke, identity preserved", async () => {
    const bystander = await createUser({
      username: unique("uname_keep"),
      displayName: "유지",
      role: "viewer",
      password: "keep-uname-pass",
    });
    const { token: bystanderToken } = createSession(bystander.userId);

    const operator = await createManaged("operator", "ceo");
    const { token: operatorToken } = createSession(operator.user.userId);
    const operatorHash = getUserById(operator.user.userId)?.passwordHash;
    expect(operatorHash).toBeTruthy();
    const operatorRename = unique("ceo_op_rename");
    const ceoRenamesOperator = await patch(
      operator.user.userId,
      { username: operatorRename },
      "ceo",
    );
    expect(ceoRenamesOperator.status).toBe(200);
    const renamedOperator = (await jsonOf(ceoRenamesOperator)).data?.user;
    expect(renamedOperator?.username).toBe(operatorRename);
    expect(renamedOperator?.userId).toBe(operator.user.userId);
    expect(getUserById(operator.user.userId)?.userId).toBe(operator.user.userId);
    expect(getUserById(operator.user.userId)?.passwordHash).toBe(operatorHash);
    expect(resolveSessionToken(operatorToken)).toBeNull();
    expect(resolveSessionToken(bystanderToken)?.userId).toBe(bystander.userId);

    const adminTarget = await createUser({
      username: unique("uname_admin"),
      displayName: "관리자 대상",
      role: "admin",
      password: "admin-target-pass",
    });
    const { token: adminTargetToken } = createSession(adminTarget.userId);
    const adminRename = unique("ceo_admin_rename");
    const ceoRenamesAdmin = await patch(adminTarget.userId, { username: adminRename }, "ceo");
    expect(ceoRenamesAdmin.status).toBe(200);
    expect((await jsonOf(ceoRenamesAdmin)).data?.user?.username).toBe(adminRename);
    expect(getUserById(adminTarget.userId)?.userId).toBe(adminTarget.userId);
    expect(resolveSessionToken(adminTargetToken)).toBeNull();

    const adminOp = await createManaged("operator", "admin");
    const adminOpRename = unique("admin_op_rename");
    expect((await patch(adminOp.user.userId, { username: adminOpRename }, "admin")).status).toBe(200);
    expect(getUserById(adminOp.user.userId)?.username).toBe(adminOpRename);

    const adminView = await createManaged("viewer", "admin");
    const adminViewRename = unique("admin_view_rename");
    expect((await patch(adminView.user.userId, { username: adminViewRename }, "admin")).status).toBe(200);

    const otherAdmin = await createUser({
      username: unique("uname_other_admin"),
      displayName: "다른 관리자",
      role: "admin",
      password: "other-admin-uname-pass",
    });
    expect((await patch(otherAdmin.userId, { username: unique("blocked_admin") }, "admin")).status).toBe(200);

    const selfAdmin = await createUser({
      username: unique("self_uname_src"),
      displayName: "본인 아이디",
      role: "admin",
      password: "self-uname-pass",
    });
    const selfRename = unique("self_uname");
    expect((await patchAs(selfAdmin.userId, selfAdmin.userId, { username: selfRename })).status).toBe(200);
    expect(getUserById(selfAdmin.userId)?.username).toBe(selfRename);

    const { user: ceo } = await ensureTestUser("ceo");
    const ceoNameBefore = ceo.username;
    const ceoSelfRename = unique("ceo_self_uname");
    try {
      expect((await patchAs(ceo.userId, ceo.userId, { username: ceoSelfRename })).status).toBe(200);
      expect(getUserById(ceo.userId)?.username).toBe(ceoSelfRename);
      expect((await patchAs(ceo.userId, ceo.userId, { username: ceoNameBefore })).status).toBe(200);
      expect(getUserById(ceo.userId)?.username).toBe(ceoNameBefore);
      expect((await patch(ceo.userId, { username: unique("ceo_rename") }, "admin")).status).toBe(403);
      expect(getUserById(ceo.userId)?.username).toBe(ceoNameBefore);
    } finally {
      await patchAs(ceo.userId, ceo.userId, { username: ceoNameBefore });
    }

    const holder = await createManaged("operator", "ceo");
    const taken = unique("TakenName");
    expect((await patch(holder.user.userId, { username: taken }, "ceo")).status).toBe(200);
    const colliding = await createManaged("viewer", "ceo");
    const dup = await patch(colliding.user.userId, { username: taken.toLowerCase() }, "ceo");
    expect(dup.status).toBe(409);
    expect((await jsonOf(dup)).error).toBe("이미 사용 중인 아이디입니다.");
    expect(getUserById(colliding.user.userId)?.username).toBe(colliding.username);

    const emptyTarget = await createManaged("operator", "ceo");
    expect((await patch(emptyTarget.user.userId, { username: "" }, "ceo")).status).toBe(400);
    expect((await patch(emptyTarget.user.userId, { username: "  " }, "ceo")).status).toBe(400);
    expect((await patch(emptyTarget.user.userId, { username: "x" }, "ceo")).status).toBe(400);
    expect(getUserById(emptyTarget.user.userId)?.username).toBe(emptyTarget.username);

    expect((await patch(emptyTarget.user.userId, { username: unique("multi"), displayName: "x" }, "ceo")).status).toBe(400);
    expect(resolveSessionToken(bystanderToken)?.userId).toBe(bystander.userId);
  });

  it("73-86. DELETE non-CEO accounts; revoke sessions; block CEO/self/operator/viewer", async () => {
    const bystander = await createUser({
      username: unique("del_keep"),
      displayName: "유지",
      role: "viewer",
      password: "del-keep-pass",
    });
    const { token: bystanderToken } = createSession(bystander.userId);

    const ceoTarget = await createManaged("operator", "ceo");
    const { token: ceoTargetToken } = createSession(ceoTarget.user.userId);
    const ceoDelete = await del(ceoTarget.user.userId, "ceo");
    expect(ceoDelete.status).toBe(200);
    secretFree(await jsonOf(ceoDelete), ceoTarget.password);
    expect(getUserById(ceoTarget.user.userId)).toBeNull();
    expect(resolveSessionToken(ceoTargetToken)).toBeNull();
    expect(resolveSessionToken(bystanderToken)?.userId).toBe(bystander.userId);
    expect((await login(ceoTarget.username, ceoTarget.password)).status).toBe(401);

    const listed = await jsonOf(
      await listUsersGet(await authedRequest("http://localhost/api/rextora/admin/users", {}, "ceo")),
    );
    expect(listed.data?.users?.some((row) => row.userId === ceoTarget.user.userId)).toBe(false);

    const adminTarget = await createManaged("viewer", "admin");
    const { token: adminTargetToken } = createSession(adminTarget.user.userId);
    expect((await del(adminTarget.user.userId, "admin")).status).toBe(200);
    expect(getUserById(adminTarget.user.userId)).toBeNull();
    expect(resolveSessionToken(adminTargetToken)).toBeNull();
    expect(resolveSessionToken(bystanderToken)?.userId).toBe(bystander.userId);

    const selfAdmin = await createUser({
      username: unique("del_self_admin"),
      displayName: "자기 삭제",
      role: "admin",
      password: "del-self-admin-pass",
    });
    expect((await delAs(selfAdmin.userId, selfAdmin.userId)).status).toBe(403);
    expect(getUserById(selfAdmin.userId)?.userId).toBe(selfAdmin.userId);

    const operatorTarget = await createManaged("operator", "ceo");
    expect((await del(operatorTarget.user.userId, "operator")).status).toBe(403);
    expect(getUserById(operatorTarget.user.userId)?.userId).toBe(operatorTarget.user.userId);

    const viewerTarget = await createManaged("viewer", "ceo");
    expect((await del(viewerTarget.user.userId, "viewer")).status).toBe(403);
    expect(getUserById(viewerTarget.user.userId)?.userId).toBe(viewerTarget.user.userId);

    const { user: ceo } = await ensureTestUser("ceo");
    expect((await del(ceo.userId, "ceo")).status).toBe(403);
    expect((await del(ceo.userId, "admin")).status).toBe(403);
    expect(getUserById(ceo.userId)?.role).toBe("ceo");
    expect(() => deleteUser(ceo.userId)).toThrow("대표 계정은 삭제할 수 없습니다.");

    expect((await del("missing_user", "ceo")).status).toBe(404);
    expect((await del(ceo.username, "ceo")).status).toBe(404);

    const originTarget = await createManaged("operator", "ceo");
    const origin = await del(originTarget.user.userId, "ceo", {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(origin.status).toBe(403);
    expect((await jsonOf(origin)).code).toBe(AUTH_ERROR.origin_rejected);
    expect(getUserById(originTarget.user.userId)?.userId).toBe(originTarget.user.userId);
  });
});
