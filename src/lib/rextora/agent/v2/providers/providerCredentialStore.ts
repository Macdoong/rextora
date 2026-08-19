/**
 * AES-256-GCM encrypted API credential store — SERVER-SIDE ONLY.
 * Keys never appear in GET responses, logs, or client persistence.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "../../../storage/runtimePaths";
import type { AiProviderId, ProviderCredentialRecord } from "./providerTypes";

function secretsDir(): string {
  // Must follow rextoraDataRoot() so isolated runtimes (REXTORA_DATA_DIR)
  // cannot silently inherit the operator credential file from process.cwd().
  return path.join(rextoraDataRoot(), "secrets");
}

function credentialsFile(): string {
  return path.join(secretsDir(), "ai-provider-credentials.enc.json");
}

function masterKeyFile(): string {
  return path.join(secretsDir(), ".master.key");
}

function ensureSecretsDir(): void {
  const dir = secretsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best-effort on platforms without chmod semantics */
  }
}

function resolveMasterKey(): Buffer | null {
  const fromEnv = process.env.REXTORA_SECRETS_MASTER_KEY?.trim();
  if (fromEnv && fromEnv.length >= 32) {
    return crypto.createHash("sha256").update(fromEnv).digest();
  }
  ensureSecretsDir();
  const keyPath = masterKeyFile();
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, "utf8").trim();
    if (raw.length >= 32) {
      return crypto.createHash("sha256").update(raw).digest();
    }
  }
  // Auto-create local master key (gitignored under data/rextora/).
  const generated = crypto.randomBytes(48).toString("base64url");
  fs.writeFileSync(keyPath, generated, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    /* ignore */
  }
  return crypto.createHash("sha256").update(generated).digest();
}

export function credentialFingerprint(apiKey: string): string {
  return crypto.createHash("sha256").update(`rextora-ai:${apiKey}`).digest("hex").slice(0, 16);
}

function emptyRecord(): ProviderCredentialRecord {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    openai: null,
    gemini: null,
  };
}

function readRecord(): ProviderCredentialRecord {
  ensureSecretsDir();
  const file = credentialsFile();
  if (!fs.existsSync(file)) return emptyRecord();
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ProviderCredentialRecord;
  } catch {
    return emptyRecord();
  }
}

function writeRecord(record: ProviderCredentialRecord): void {
  ensureSecretsDir();
  const file = credentialsFile();
  const next = { ...record, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(next, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
}

function encrypt(apiKey: string): {
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
} {
  const master = resolveMasterKey();
  if (!master) {
    throw new Error("SECURE_STORAGE_UNAVAILABLE");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", master, iv);
  const enc = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    fingerprint: credentialFingerprint(apiKey),
  };
}

function decrypt(entry: {
  ciphertext: string;
  iv: string;
  tag: string;
}): string | null {
  const master = resolveMasterKey();
  if (!master) return null;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      master,
      Buffer.from(entry.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function getStoredCredentialFingerprint(
  provider: AiProviderId,
): string | null {
  const record = readRecord();
  return record[provider]?.fingerprint ?? null;
}

export function hasStoredCredential(provider: AiProviderId): boolean {
  return Boolean(readRecord()[provider]);
}

export function saveProviderCredential(
  provider: AiProviderId,
  apiKey: string,
): { fingerprint: string } {
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length < 8) {
    throw new Error("INVALID_API_KEY");
  }
  if (provider === "openai" && ![...trimmed].every((c) => c.charCodeAt(0) <= 127)) {
    throw new Error("INVALID_API_KEY");
  }
  const sealed = encrypt(trimmed);
  const record = readRecord();
  record[provider] = sealed;
  writeRecord(record);
  return { fingerprint: sealed.fingerprint };
}

export function deleteProviderCredential(provider: AiProviderId): boolean {
  const record = readRecord();
  if (!record[provider]) return false;
  record[provider] = null;
  writeRecord(record);
  return true;
}

/**
 * Resolve API key: stored encrypted credential first, then environment fallback.
 * Never log the return value.
 */
export function resolveProviderApiKey(provider: AiProviderId): string | undefined {
  const record = readRecord();
  const sealed = record[provider];
  if (sealed) {
    const plain = decrypt(sealed);
    if (plain?.trim()) return plain.trim();
  }
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return undefined;
    // OpenAI keys must be ASCII; non-ASCII usually means corruption/lookalikes.
    if (![...key].every((c) => c.charCodeAt(0) <= 127)) return undefined;
    return key;
  }
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined
  );
}

/** Sanitized reason when a provider appears configured in env but is unusable. */
export function describeProviderCredentialIssue(
  provider: AiProviderId,
): string | null {
  if (hasStoredCredential(provider) && resolveProviderApiKey(provider)) {
    return null;
  }
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) return null;
    if (![...key].every((c) => c.charCodeAt(0) <= 127)) {
      return "OpenAI API 키에 허용되지 않는 문자가 포함되어 있습니다. 키를 다시 붙여넣어 주세요.";
    }
  }
  return null;
}

export function isEnvCredentialFallback(provider: AiProviderId): boolean {
  if (hasStoredCredential(provider)) return false;
  return Boolean(resolveProviderApiKey(provider));
}
