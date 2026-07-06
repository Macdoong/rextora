import crypto from "node:crypto";
import { getEnv } from "./env";

const SECRET_KEY_NAMES = new Set([
  "apiKey",
  "apiSecret",
  "BINANCE_API_KEY",
  "BINANCE_API_SECRET",
  "TG_TOKEN",
  "token",
  "signature"
]);

/** Masks a secret so at most the last 4 characters are visible. Never log full secrets. */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return "미설정";
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

/** Deep-clones and masks any known secret-shaped keys before the object is logged or returned from an API route. */
export function redactSecrets<T>(input: T): T {
  if (input === null || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item)) as unknown as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_NAMES.has(key) && typeof value === "string") {
      output[key] = maskSecret(value);
    } else if (value && typeof value === "object") {
      output[key] = redactSecrets(value);
    } else {
      output[key] = value;
    }
  }
  return output as T;
}

/** Constant-time string comparison to avoid timing side-channels when checking the LIVE confirmation phrase. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/** Verifies a user-supplied confirmation string against REXTORA_LIVE_CONFIRMATION_TEXT. Never true if the env var is unset. */
export function verifyLiveConfirmationText(supplied: string | undefined | null): boolean {
  const env = getEnv();
  if (!env.REXTORA_LIVE_CONFIRMATION_TEXT) return false;
  if (!supplied) return false;
  return timingSafeEqual(supplied.trim(), env.REXTORA_LIVE_CONFIRMATION_TEXT.trim());
}

const HARDCODED_SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/, // AWS-style key, used as a generic "looks like a real secret" heuristic
  /xox[baprs]-[0-9A-Za-z-]+/, // Slack-style token
  /[0-9]{8,10}:[A-Za-z0-9_-]{30,}/, // Telegram bot token shape
  /BINANCE_API_(KEY|SECRET)\s*=\s*["'][A-Za-z0-9]{16,}["']/
];

/** Heuristic scan used by verify-rextora.mjs and tests to catch accidentally committed secrets. Returns true if source text looks clean. */
export function looksFreeOfHardcodedSecrets(sourceText: string): boolean {
  return !HARDCODED_SECRET_PATTERNS.some((pattern) => pattern.test(sourceText));
}

/** Safe-to-expose snapshot of credential configuration state (booleans only, never the values). */
export function getCredentialStatus() {
  const env = getEnv();
  return {
    binanceApiKeyConfigured: Boolean(env.BINANCE_API_KEY),
    binanceApiSecretConfigured: Boolean(env.BINANCE_API_SECRET),
    telegramTokenConfigured: Boolean(env.TG_TOKEN),
    telegramChatIdConfigured: Boolean(env.TG_CHAT_ID),
    liveConfirmationTextConfigured: Boolean(env.REXTORA_LIVE_CONFIRMATION_TEXT)
  };
}
