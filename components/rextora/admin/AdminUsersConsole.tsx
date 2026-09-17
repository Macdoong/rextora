"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { LoadingState } from "@/components/rextora/LoadingState";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { V3Dialog } from "@/components/rextora/v3/V3Dialog";
import { V3Drawer } from "@/components/rextora/v3/V3Drawer";
import { V3Kpi } from "@/components/rextora/v3/V3Kpi";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import {
  ADMIN_API_CREATE_ROLES,
  adminUserReadOnlyReason,
  assignableRolesForAdminUi,
  canCallerDeleteAdminTarget,
  canCallerMutateAdminTarget,
  canMutateMemberManagement,
  isCeoSelfAccount,
} from "@/src/lib/rextora/auth/adminUserPolicy";
import { authRoleLabelKo } from "@/src/lib/rextora/auth/authPresentation";
import type { PublicRextoraUser, RextoraRole } from "@/src/lib/rextora/auth/authTypes";
import {
  ADMIN_USERS_API_PATH,
  adminCreateUserBody,
  adminDeleteUserPath,
  adminPatchDisabledBody,
  adminPatchDisplayNameBody,
  adminPatchPasswordBody,
  adminPatchRoleBody,
  adminPatchUsernameBody,
  adminUserDetailPath,
  readAdminApiError,
  type AdminPublicUser,
} from "@/src/lib/rextora/auth/adminUsersClient";

function formatCreatedAt(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(user: AdminPublicUser): string {
  return user.disabledAt ? "비활성" : "활성";
}

const ADMIN_BADGE_CLASS = {
  ceo: "v3-admin-badge v3-admin-badge--ceo",
  "ceo-account": "v3-admin-badge v3-admin-badge--ceo-account",
  admin: "v3-admin-badge v3-admin-badge--admin",
  operator: "v3-admin-badge v3-admin-badge--operator",
  member: "v3-admin-badge v3-admin-badge--member",
  active: "v3-admin-badge v3-admin-badge--active",
  disabled: "v3-admin-badge v3-admin-badge--disabled",
} as const;

function roleBadgeKind(role: RextoraRole): keyof Pick<typeof ADMIN_BADGE_CLASS, "ceo" | "admin" | "operator" | "member"> {
  if (role === "ceo") return "ceo";
  if (role === "admin") return "admin";
  if (role === "operator") return "operator";
  return "member";
}

function AdminBadge({
  kind,
  children,
  testId,
}: {
  kind: keyof typeof ADMIN_BADGE_CLASS;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span className={ADMIN_BADGE_CLASS[kind]} data-testid={testId}>
      {children}
    </span>
  );
}

export function AdminUsersConsole() {
  const router = useRouter();
  const { user: actor } = useAuth();
  const [users, setUsers] = useState<AdminPublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<(typeof ADMIN_API_CREATE_ROLES)[number]>("operator");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const canMutate = Boolean(actor && canMutateMemberManagement(actor.role));
  const closeCreateDialog = useCallback(() => setCreateOpen(false), []);

  const handleAuthFailure = useCallback(
    (status: number) => {
      if (status === 401) {
        router.replace("/login");
        router.refresh();
        return true;
      }
      if (status === 403) {
        router.replace("/dashboard");
        router.refresh();
        return true;
      }
      return false;
    },
    [router],
  );

  const loadUsers = useCallback(async () => {
    setError(null);
    const res = await fetch(ADMIN_USERS_API_PATH, { cache: "no-store", credentials: "include" });
    const payload = (await res.json().catch(() => null)) as
      | { data?: { users?: AdminPublicUser[] }; error?: string }
      | null;
    if (!res.ok) {
      if (handleAuthFailure(res.status)) return;
      setError(readAdminApiError(res.status, payload).message);
      setUsers([]);
      return;
    }
    setUsers(Array.isArray(payload?.data?.users) ? payload.data.users : []);
  }, [handleAuthFailure]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadUsers().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

  const counts = useMemo(() => {
    return {
      total: users.length,
      admin: users.filter((row) => row.role === "admin").length,
      operator: users.filter((row) => row.role === "operator").length,
      viewer: users.filter((row) => row.role === "viewer").length,
      disabled: users.filter((row) => Boolean(row.disabledAt)).length,
    };
  }, [users]);

  const editingUser = useMemo(
    () => users.find((row) => row.userId === editingUserId) ?? null,
    [users, editingUserId],
  );

  useEffect(() => {
    if (!editingUserId || !actor) return;
    const target = users.find((row) => row.userId === editingUserId);
    if (!target || !canCallerMutateAdminTarget(actor, target)) {
      setEditingUserId(null);
    }
  }, [actor, editingUserId, users]);

  function resetCreateForm() {
    setCreateUsername("");
    setCreateDisplayName("");
    setCreatePassword("");
    setCreateRole("operator");
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (!actor || creating || !canMutate) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    const body = adminCreateUserBody({
      username: createUsername,
      displayName: createDisplayName,
      password: createPassword,
      role: createRole,
    });
    try {
      const res = await fetch(ADMIN_USERS_API_PATH, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (handleAuthFailure(res.status)) return;
        setError(readAdminApiError(res.status, payload).message);
        return;
      }
      resetCreateForm();
      setCreateOpen(false);
      setNotice("계정을 만들었습니다.");
      await loadUsers();
    } catch {
      setError("요청을 처리하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function patchUser(
    userId: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusyUserId(userId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(adminUserDetailPath(userId), {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (handleAuthFailure(res.status)) return false;
        setError(readAdminApiError(res.status, payload).message);
        return false;
      }
      setNotice(successMessage);
      await loadUsers();
      return true;
    } catch {
      setError("요청을 처리하지 못했습니다.");
      return false;
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteAccount(user: AdminPublicUser) {
    const confirmed = window.confirm(
      `${user.displayName} (${user.username}) 계정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return false;
    setBusyUserId(user.userId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(adminDeleteUserPath(user.userId), {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (handleAuthFailure(res.status)) return false;
        setError(readAdminApiError(res.status, payload).message);
        return false;
      }
      setNotice("계정을 삭제했습니다.");
      setEditingUserId(null);
      await loadUsers();
      return true;
    } catch {
      setError("요청을 처리하지 못했습니다.");
      return false;
    } finally {
      setBusyUserId(null);
    }
  }

  if (!actor) return null;

  return (
    <div className="grid gap-4" data-testid="admin-users-console">
      <div className="v3-admin-pagehead">
        <header>
          <h1 className="rextora-page-title">회원 관리</h1>
          <p>아이디, 닉네임, 권한, 비밀번호 및 접속 상태를 관리합니다.</p>
        </header>
        <AdminBadge kind={roleBadgeKind(actor.role)} testId="admin-actor-role">
          {authRoleLabelKo(actor.role)}
        </AdminBadge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="admin-user-summary">
        <V3Kpi label="전체" value={counts.total} />
        <V3Kpi label="관리자" value={counts.admin} />
        <V3Kpi label="운영자" value={counts.operator} />
        <V3Kpi label="회원" value={counts.viewer} />
        <V3Kpi label="비활성" value={counts.disabled} tone="warning" />
      </div>

      {canMutate ? (
        <div className="v3-admin-toolbar">
          <Button
            type="button"
            variant="primary"
            data-testid="admin-create-open"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            계정 만들기
          </Button>
        </div>
      ) : null}

      {notice ? (
        <p className="rextora-helper text-emerald-700" role="status" data-testid="admin-notice">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rextora-helper text-red-700" role="alert" data-testid="admin-error">
          {error}
        </p>
      ) : null}

      {canMutate ? (
        <V3Dialog
          open={createOpen}
          onClose={closeCreateDialog}
          title="계정 만들기"
          className="v3-admin-create-dialog"
          actions={
            <>
              <Button type="button" variant="secondary" onClick={closeCreateDialog}>
                취소
              </Button>
              <Button
                type="submit"
                form="admin-create-form"
                variant="primary"
                loading={creating}
                disabled={creating}
              >
                계정 만들기
              </Button>
            </>
          }
        >
          <form
            id="admin-create-form"
            className="v3-admin-create-grid"
            data-create-columns="2"
            onSubmit={(event) => void createAccount(event)}
            data-testid="admin-create-form"
          >
            <label className="v3-admin-field">
              아이디
              <input
                name="username"
                autoComplete="off"
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                required
                data-testid="admin-create-username"
              />
            </label>
            <label className="v3-admin-field">
              닉네임
              <input
                name="displayName"
                autoComplete="off"
                value={createDisplayName}
                onChange={(event) => setCreateDisplayName(event.target.value)}
                required
                data-testid="admin-create-display-name"
              />
            </label>
            <label className="v3-admin-field">
              비밀번호
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                required
                data-testid="admin-create-password"
              />
            </label>
            <label className="v3-admin-field">
              권한
              <select
                name="role"
                value={createRole}
                onChange={(event) =>
                  setCreateRole(event.target.value as (typeof ADMIN_API_CREATE_ROLES)[number])
                }
                data-testid="admin-create-role"
                aria-label="권한"
              >
                {ADMIN_API_CREATE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {authRoleLabelKo(role)}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </V3Dialog>
      ) : null}

      <V3Card title="회원 목록" meta={`${counts.total}명`}>
        {loading ? (
          <LoadingState message="회원 목록을 불러오는 중입니다." hint="" lines={3} />
        ) : users.length === 0 ? (
          <p className="rextora-helper">표시할 계정이 없습니다.</p>
        ) : (
          <div className="grid gap-3">
            <div className="v3-table-wrap hidden xl:block">
              <table className="v3-table w-full" data-testid="admin-user-table">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>닉네임</th>
                    <th>권한</th>
                    <th>상태</th>
                    <th>생성일</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.userId} data-testid={`admin-user-row-${row.userId}`}>
                      <td>{row.username}</td>
                      <td>{row.displayName}</td>
                      <td>
                        <RoleStatusBadges user={row} />
                      </td>
                      <td>
                        <AdminBadge kind={row.disabledAt ? "disabled" : "active"}>
                          {statusLabel(row)}
                        </AdminBadge>
                      </td>
                      <td>{formatCreatedAt(row.createdAt)}</td>
                      <td>
                        <RowManageControl
                          actor={actor}
                          user={row}
                          onManage={setEditingUserId}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 xl:hidden" data-testid="admin-user-cards">
              {users.map((row) => (
                <article
                  key={row.userId}
                  className="v3-admin-user-card"
                  data-testid={`admin-user-card-${row.userId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{row.displayName}</p>
                      <p className="rextora-helper m-0">{row.username}</p>
                    </div>
                    <RoleStatusBadges user={row} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="rextora-helper m-0">{formatCreatedAt(row.createdAt)}</p>
                    <AdminBadge kind={row.disabledAt ? "disabled" : "active"}>
                      {statusLabel(row)}
                    </AdminBadge>
                  </div>
                  <RowManageControl actor={actor} user={row} onManage={setEditingUserId} />
                </article>
              ))}
            </div>
          </div>
        )}
      </V3Card>

      {canMutate ? (
        <V3Drawer
          open={Boolean(editingUser && actor && canCallerMutateAdminTarget(actor, editingUser))}
          onClose={() => setEditingUserId(null)}
          title={
            editingUser && actor && isCeoSelfAccount(actor, editingUser)
              ? "내 계정 관리"
              : "계정 관리"
          }
          wide
          className="v3-admin-edit-drawer"
        >
          {editingUser && actor && canCallerMutateAdminTarget(actor, editingUser) ? (
            <AccountEditor
              actor={actor}
              user={editingUser}
              busy={busyUserId === editingUser.userId}
              onPatch={patchUser}
              onDelete={deleteAccount}
            />
          ) : null}
        </V3Drawer>
      ) : null}
    </div>
  );
}

function RoleStatusBadges({ user }: { user: AdminPublicUser }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AdminBadge kind={roleBadgeKind(user.role)}>{authRoleLabelKo(user.role)}</AdminBadge>
      {user.role === "ceo" ? <AdminBadge kind="ceo-account">대표 계정</AdminBadge> : null}
    </div>
  );
}

function RowManageControl({
  actor,
  user,
  onManage,
}: {
  actor: PublicRextoraUser;
  user: AdminPublicUser;
  onManage: (userId: string) => void;
}) {
  const readOnly = adminUserReadOnlyReason(actor, user);
  if (isCeoSelfAccount(actor, user)) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        data-testid={`admin-manage-${user.userId}`}
        data-ceo-self="true"
        onClick={() => onManage(user.userId)}
      >
        내 계정 관리
      </Button>
    );
  }
  if (readOnly === "ceo") {
    return (
      <p
        className="v3-admin-protected"
        data-readonly="true"
        data-testid={`admin-readonly-${user.userId}`}
      >
        보호됨
      </p>
    );
  }
  if (readOnly === "operator_readonly" || !canCallerMutateAdminTarget(actor, user)) {
    return (
      <p
        className="v3-admin-protected"
        data-readonly="true"
        data-testid={`admin-readonly-${user.userId}`}
      >
        조회 전용
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      data-testid={`admin-manage-${user.userId}`}
      onClick={() => onManage(user.userId)}
    >
      관리
    </Button>
  );
}

function AccountEditor({
  actor,
  user,
  busy,
  onPatch,
  onDelete,
}: {
  actor: PublicRextoraUser;
  user: AdminPublicUser;
  busy: boolean;
  onPatch: (userId: string, body: Record<string, unknown>, successMessage: string) => Promise<boolean | void>;
  onDelete: (user: AdminPublicUser) => Promise<boolean | void>;
}) {
  const ceoSelf = isCeoSelfAccount(actor, user);
  const canDelete = canCallerDeleteAdminTarget(actor, user);
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<RextoraRole>(user.role);
  const [password, setPassword] = useState("");
  const roles = assignableRolesForAdminUi(actor, user);

  useEffect(() => {
    setUsername(user.username);
    setDisplayName(user.displayName);
    setRole(user.role);
    setPassword("");
  }, [user.displayName, user.role, user.userId, user.username]);

  return (
    <div
      className="grid"
      data-testid={`admin-actions-${user.userId}`}
      data-editor-mode={ceoSelf ? "ceo-self" : "managed"}
    >
      <section className="v3-admin-section">
        <h3 className="v3-admin-section__title">기본 정보</h3>
        <label className="v3-admin-field">
          아이디
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            aria-label="아이디"
            data-testid={`admin-username-${user.userId}`}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            void onPatch(
              user.userId,
              adminPatchUsernameBody(username),
              "아이디가 변경되었으며 해당 사용자의 기존 로그인 세션이 종료되었습니다.",
            )
          }
        >
          아이디 저장
        </Button>
        <label className="v3-admin-field">
          닉네임
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            aria-label="닉네임"
            data-testid={`admin-display-name-${user.userId}`}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            void onPatch(
              user.userId,
              adminPatchDisplayNameBody(displayName),
              "닉네임을 저장했습니다.",
            )
          }
        >
          닉네임 저장
        </Button>
      </section>

      {ceoSelf ? (
        <section className="v3-admin-section">
          <h3 className="v3-admin-section__title">보안</h3>
          <PasswordResetField
            userId={user.userId}
            busy={busy}
            password={password}
            onPasswordChange={setPassword}
            onPatch={onPatch}
          />
        </section>
      ) : (
        <>
          <section className="v3-admin-section">
            <h3 className="v3-admin-section__title">권한</h3>
            <label className="v3-admin-field">
              권한
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as RextoraRole)}
                aria-label="역할"
                data-testid={`admin-role-${user.userId}`}
              >
                {roles.map((option) => (
                  <option key={option} value={option}>
                    {authRoleLabelKo(option)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (role === "ceo") return;
                void onPatch(
                  user.userId,
                  adminPatchRoleBody(role),
                  "권한이 변경되었으며 해당 사용자의 기존 로그인 세션이 종료되었습니다.",
                );
              }}
            >
              권한 변경
            </Button>
          </section>

          <section className="v3-admin-section">
            <h3 className="v3-admin-section__title">계정 상태</h3>
            <AdminBadge kind={user.disabledAt ? "disabled" : "active"}>
              {statusLabel(user)}
            </AdminBadge>
            <Button
              type="button"
              variant={user.disabledAt ? "success" : "danger"}
              size="sm"
              disabled={busy}
              data-testid={`admin-status-${user.userId}`}
              onClick={() => {
                if (!user.disabledAt) {
                  const confirmed = window.confirm(
                    `${user.username} 계정을 비활성화할까요? 기존 로그인 세션이 종료됩니다.`,
                  );
                  if (!confirmed) return;
                }
                void onPatch(
                  user.userId,
                  adminPatchDisabledBody(!user.disabledAt),
                  user.disabledAt
                    ? "계정을 활성화했습니다."
                    : "계정을 비활성화했으며 해당 사용자의 기존 로그인 세션이 종료되었습니다.",
                );
              }}
            >
              {user.disabledAt ? "활성화" : "비활성화"}
            </Button>
          </section>

          <section className="v3-admin-section">
            <h3 className="v3-admin-section__title">보안</h3>
            <PasswordResetField
              userId={user.userId}
              busy={busy}
              password={password}
              onPasswordChange={setPassword}
              onPatch={onPatch}
            />
          </section>

          {canDelete ? (
            <section className="v3-admin-section v3-admin-danger">
              <h3 className="v3-admin-section__title">위험 영역</h3>
              <p className="v3-admin-danger-copy">
                {user.displayName} ({user.username}) 계정을 삭제하면 복구할 수 없습니다.
              </p>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={busy}
                data-testid={`admin-delete-${user.userId}`}
                onClick={() => void onDelete(user)}
              >
                계정 삭제
              </Button>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function PasswordResetField({
  userId,
  busy,
  password,
  onPasswordChange,
  onPatch,
}: {
  userId: string;
  busy: boolean;
  password: string;
  onPasswordChange: (value: string) => void;
  onPatch: (userId: string, body: Record<string, unknown>, successMessage: string) => Promise<boolean | void>;
}) {
  return (
    <>
      <label className="v3-admin-field">
        새 비밀번호
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          aria-label="새 비밀번호"
          data-testid={`admin-password-${userId}`}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy || password.length < 1}
        onClick={() => {
          void onPatch(
            userId,
            adminPatchPasswordBody(password),
            "비밀번호가 변경되었으며 해당 사용자의 기존 로그인 세션이 종료되었습니다.",
          ).then((ok) => {
            if (ok) onPasswordChange("");
          });
        }}
      >
        비밀번호 변경
      </Button>
    </>
  );
}
