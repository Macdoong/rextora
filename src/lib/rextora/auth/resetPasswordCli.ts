import readline from "node:readline";
import path from "node:path";
import {
  argvContainsPassword,
  readHiddenPasswordFromTty,
} from "./bootstrapCli";
import { getUserByUsername, resetUserPassword, userCount } from "./userStore";
import {
  productionRextoraDataRootCanonical,
  rextoraDataRoot,
} from "../storage/runtimePaths";

export { argvContainsPassword };

const PRODUCTION_DATA_ROOT =
  "/Users/macdoong/Documents/Rextora/data/rextora";

function question(
  rl: readline.Interface,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

export function parseResetUsernameArg(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith("--username=")) {
      const value = arg.slice("--username=".length).trim();
      return value || null;
    }
  }
  const flagIndex = argv.indexOf("--username");
  if (flagIndex >= 0) {
    const value = argv[flagIndex + 1]?.trim() ?? "";
    return value || null;
  }
  return null;
}

export function assertProductionAuthStore(): string {
  const resolved = path.resolve(rextoraDataRoot());
  const canonical = path.resolve(
    productionRextoraDataRootCanonical() || PRODUCTION_DATA_ROOT,
  );
  const required = path.resolve(PRODUCTION_DATA_ROOT);
  if (resolved !== required || canonical !== required) {
    throw new Error(
      `프로덕션 사용자 저장소가 아닙니다. REXTORA_DATA_DIR=${resolved}`,
    );
  }
  return resolved;
}

export async function runAuthPasswordReset(argv = process.argv): Promise<{
  username: string;
  displayName: string;
  role: string;
  totalUsers: number;
}> {
  if (argvContainsPassword(argv)) {
    throw new Error("비밀번호는 명령줄 인자로 전달할 수 없습니다.");
  }
  assertProductionAuthStore();

  let username = parseResetUsernameArg(argv);
  if (!username) {
    if (!process.stdin.isTTY) {
      throw new Error("아이디를 입력할 대화형 단말이 필요합니다.");
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    username = (await question(rl, "아이디: ")).trim();
    rl.close();
  }
  if (!username) {
    throw new Error("아이디가 필요합니다.");
  }

  const existing = getUserByUsername(username);
  if (!existing) {
    throw new Error("사용자를 찾을 수 없습니다.");
  }
  if (!process.stdin.isTTY) {
    throw new Error("비밀번호를 입력할 대화형 단말이 필요합니다.");
  }

  const password = await readHiddenPasswordFromTty("새 비밀번호: ");
  const confirm = await readHiddenPasswordFromTty("새 비밀번호 확인: ");
  if (!password || password !== confirm) {
    throw new Error("비밀번호가 비어 있거나 확인 값이 일치하지 않습니다.");
  }

  const updated = await resetUserPassword({ username, password });
  return {
    username: updated.username,
    displayName: updated.displayName,
    role: updated.role,
    totalUsers: userCount(),
  };
}
