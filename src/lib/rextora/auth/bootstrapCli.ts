import fs from "node:fs";
import readline from "node:readline";
import { createInitialCeo, userCount } from "./userStore";

export function argvContainsPassword(argv: string[]): boolean {
  return argv.some(
    (arg) =>
      arg === "--password" ||
      arg.startsWith("--password=") ||
      arg.startsWith("password="),
  );
}

function question(
  rl: readline.Interface,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

export function readHiddenPasswordFromTty(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(new Error("BOOTSTRAP_PASSWORD_INPUT_GAP"));
      return;
    }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      if (chunk === "\n" || chunk === "\r" || chunk === "\u0004") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (chunk === "\u0003") {
        cleanup();
        reject(new Error("cancelled"));
        return;
      }
      if (chunk === "\u007f" || chunk === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (chunk >= " " || chunk.length > 1) value += chunk;
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    stdin.on("data", onData);
  });
}

export async function readBootstrapFields(input: {
  stdinIsTty: boolean;
  readStdin?: () => string;
}): Promise<{ username: string; displayName: string; password: string }> {
  if (!input.stdinIsTty) {
    const raw = input.readStdin ? input.readStdin() : fs.readFileSync(0, "utf8");
    const lines = raw.split(/\r?\n/);
    return {
      username: (lines[0] ?? "").trim(),
      displayName: (lines[1] ?? "").trim(),
      password: lines[2] ?? "",
    };
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const username = (await question(rl, "아이디: ")).trim();
  const displayName = (await question(rl, "표시 이름: ")).trim();
  rl.close();
  const password = await readHiddenPasswordFromTty("비밀번호: ");
  return { username, displayName, password };
}

const BOOTSTRAP_FIELDS_REQUIRED = "아이디, 표시 이름, 비밀번호가 필요합니다.";

/**
 * One-shot non-TTY bootstrap fields for Render Shell.
 * Requires REXTORA_BOOTSTRAP_ALLOWED=1. Never logs secrets.
 * Returns null when the guard is unset so existing TTY/stdin paths remain.
 */
export function readEnvBootstrapFields(
  env: NodeJS.ProcessEnv = process.env,
): { username: string; displayName: string; password: string } | null {
  const allowed = env.REXTORA_BOOTSTRAP_ALLOWED?.trim();
  if (allowed !== "1") return null;
  const username = env.REXTORA_BOOTSTRAP_USERNAME?.trim() ?? "";
  const displayName =
    env.REXTORA_BOOTSTRAP_DISPLAY_NAME?.trim() || username;
  const password = env.REXTORA_BOOTSTRAP_PASSWORD ?? "";
  if (!username || !displayName || password.length < 1) {
    throw new Error(BOOTSTRAP_FIELDS_REQUIRED);
  }
  return { username, displayName, password };
}

export async function runAuthBootstrap(argv = process.argv): Promise<{
  username: string;
  displayName: string;
}> {
  if (argvContainsPassword(argv)) {
    throw new Error("비밀번호는 명령줄 인자로 전달할 수 없습니다.");
  }
  if (userCount() > 0) {
    throw new Error("초기 대표 계정이 이미 있습니다.");
  }
  const envFields = readEnvBootstrapFields();
  const fields =
    envFields ??
    (await readBootstrapFields({ stdinIsTty: Boolean(process.stdin.isTTY) }));
  if (!fields.username || !fields.displayName || !fields.password) {
    throw new Error(BOOTSTRAP_FIELDS_REQUIRED);
  }
  const user = await createInitialCeo(fields);
  return { username: user.username, displayName: user.displayName };
}
