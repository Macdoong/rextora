import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "../storage/jsonStore";
import { hashPassword } from "./password";
import {
  AUTH_USERS_FILE,
  isRextoraRole,
  toPublicUser,
  type PublicRextoraUser,
  type RextoraRole,
  type RextoraUser,
} from "./authTypes";

type UserStoreFile = {
  version: 1;
  users: RextoraUser[];
};

const EMPTY: UserStoreFile = { version: 1, users: [] };

function readStore(): UserStoreFile {
  const stored = readJsonStore<UserStoreFile>(AUTH_USERS_FILE, EMPTY, { ttlMs: 0 });
  const users = Array.isArray(stored.users) ? stored.users : [];
  return { version: 1, users };
}

function writeStore(store: UserStoreFile): UserStoreFile {
  return writeJsonStore(AUTH_USERS_FILE, store);
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function listUsers(): RextoraUser[] {
  return readStore().users;
}

export function getUserById(userId: string): RextoraUser | null {
  return readStore().users.find((user) => user.userId === userId) ?? null;
}

export function getUserByUsername(username: string): RextoraUser | null {
  const key = normalizeUsername(username);
  if (!key) return null;
  return (
    readStore().users.find((user) => normalizeUsername(user.username) === key) ?? null
  );
}

export function userCount(): number {
  return readStore().users.length;
}

export async function createUser(input: {
  username: string;
  displayName: string;
  role: RextoraRole;
  password: string;
}): Promise<RextoraUser> {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (!username || username.length < 2) {
    throw new Error("아이디는 2자 이상이어야 합니다.");
  }
  if (!displayName) {
    throw new Error("표시 이름이 필요합니다.");
  }
  if (!isRextoraRole(input.role)) {
    throw new Error("역할이 올바르지 않습니다.");
  }
  if (getUserByUsername(username)) {
    throw new Error("이미 사용 중인 아이디입니다.");
  }
  const user: RextoraUser = {
    userId: `usr_${randomUUID()}`,
    username,
    displayName,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
    disabledAt: null,
  };
  const store = readStore();
  store.users = [...store.users, user];
  writeStore(store);
  return user;
}

export async function createInitialCeo(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<RextoraUser> {
  if (userCount() > 0) {
    throw new Error("초기 대표 계정이 이미 있습니다. 추가 CEO는 부트스트랩으로 만들 수 없습니다.");
  }
  return createUser({
    username: input.username,
    displayName: input.displayName,
    role: "ceo",
    password: input.password,
  });
}

export async function resetUserPassword(input: {
  username: string;
  password: string;
}): Promise<PublicRextoraUser> {
  if (typeof input.password !== "string" || input.password.length < 1) {
    throw new Error("비밀번호가 필요합니다.");
  }
  const store = readStore();
  const key = normalizeUsername(input.username);
  const index = store.users.findIndex(
    (user) => normalizeUsername(user.username) === key,
  );
  if (index < 0 || !store.users[index]) {
    throw new Error("사용자를 찾을 수 없습니다.");
  }
  const current = store.users[index];
  const passwordHash = await hashPassword(input.password);
  store.users[index] = {
    userId: current.userId,
    username: current.username,
    displayName: current.displayName,
    role: current.role,
    passwordHash,
    createdAt: current.createdAt,
    disabledAt: current.disabledAt ?? null,
  };
  writeStore(store);
  return toPublicUser(store.users[index]!);
}

export function disableUser(userId: string, nowMs = Date.now()): RextoraUser | null {
  const store = readStore();
  const index = store.users.findIndex((user) => user.userId === userId);
  if (index < 0) return null;
  const current = store.users[index];
  if (!current) return null;
  const updated: RextoraUser = {
    ...current,
    disabledAt: new Date(nowMs).toISOString(),
  };
  store.users[index] = updated;
  writeStore(store);
  return updated;
}

export function publicUserById(userId: string): PublicRextoraUser | null {
  const user = getUserById(userId);
  return user ? toPublicUser(user) : null;
}
