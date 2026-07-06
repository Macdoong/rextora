import { getEnv, hasTelegramCredentials } from "./env";
import { TELEGRAM_TEST_MESSAGE } from "./telegramTemplates";

const RATE_LIMIT_MS = 3000;
let lastSendAt = 0;

function getTelegramEnv() {
  const env = getEnv();
  return { token: env.TG_TOKEN, chatId: env.TG_CHAT_ID };
}

function configured() {
  return hasTelegramCredentials();
}

export function getTelegramStatus() {
  return {
    configured: configured(),
    serviceState: configured() ? ("read-only" as const) : ("mock" as const),
    message: configured() ? "Telegram 연결 테스트 준비됨 (토큰/채팅 ID는 표시하지 않음)" : "Telegram 토큰/채팅 ID가 없어 mock 상태입니다."
  };
}

async function postTelegram(text: string) {
  const env = getTelegramEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.chatId, text }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return { ok: false, serviceState: "read-only" as const, message: "Telegram 전송 실패" };
    }
    return { ok: true, serviceState: "read-only" as const, message: "Telegram 메시지 전송됨" };
  } catch {
    return { ok: false, serviceState: "read-only" as const, message: "Telegram 네트워크 오류" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramMessage(text: string, options?: { liveMode?: boolean }) {
  const status = getTelegramStatus();
  if (!status.configured) {
    return { ok: true, serviceState: "mock" as const, message: `Telegram mock 기록: ${text.slice(0, 40)}...` };
  }

  if (options?.liveMode && !configured()) {
    return { ok: false, serviceState: "live-blocked" as const, message: "Telegram 설정이 필요합니다." };
  }

  const now = Date.now();
  if (now - lastSendAt < RATE_LIMIT_MS) {
    return { ok: true, serviceState: "read-only" as const, message: "Telegram rate limit — skipped" };
  }
  lastSendAt = now;
  return postTelegram(text);
}

export async function sendTestMessage(message = TELEGRAM_TEST_MESSAGE) {
  const status = getTelegramStatus();
  if (!status.configured) {
    return { ok: true, serviceState: "mock" as const, message: "Telegram mock 테스트 메시지가 기록되었습니다." };
  }
  if (message !== TELEGRAM_TEST_MESSAGE) {
    return { ok: false, serviceState: "live-blocked" as const, message: "허용된 Telegram 연결 테스트 메시지만 전송할 수 있습니다." };
  }
  return postTelegram(TELEGRAM_TEST_MESSAGE);
}

export const sendBotStartMessage = async () => ({ ok: false, serviceState: "live-blocked" as const, message: "LIVE 실행 메시지는 전송하지 않습니다." });
export const sendEntryMessage = async () => ({ ok: false, serviceState: "live-blocked" as const, message: "LIVE 진입 메시지는 전송하지 않습니다." });
export const sendExitMessage = async () => ({ ok: false, serviceState: "live-blocked" as const, message: "LIVE 청산 메시지는 전송하지 않습니다." });
export const sendRiskWarningMessage = async (warning: string) => sendTelegramMessage(`[Rextora] 위험: ${warning}`);
export const sendErrorMessage = async (error: string) => ({ ok: true, serviceState: "mock" as const, message: `오류 mock 기록: ${error}` });
