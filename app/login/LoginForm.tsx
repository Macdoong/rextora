"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import {
  AUTH_ACCOUNT_DISABLED,
  AUTH_LOGIN_INVALID,
  AUTH_RATE_LIMITED,
} from "@/src/lib/rextora/auth/authPresentation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rextora/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
      } | null;
      if (!response.ok || !body?.ok) {
        if (body?.code === "disabled") setError(AUTH_ACCOUNT_DISABLED);
        else if (body?.code === "rate_limited") setError(AUTH_RATE_LIMITED);
        else setError(body?.error || AUTH_LOGIN_INVALID);
        return;
      }
      router.replace(nextPath.startsWith("/") ? nextPath : "/dashboard");
      router.refresh();
    } catch {
      setError(AUTH_LOGIN_INVALID);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit} data-testid="login-form">
      <label className="grid gap-1.5 text-sm text-slate-300">
        아이디
        <input
          name="username"
          autoComplete="username"
          data-testid="login-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-500"
        />
      </label>
      <label className="grid gap-1.5 text-sm text-slate-300">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          data-testid="login-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-500"
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="login-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={busy} loading={busy} data-testid="login-submit">
        로그인
      </Button>
    </form>
  );
}
