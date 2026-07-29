import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchJsonCached,
  invalidateJsonCache,
} from "../src/lib/rextora/client/requestCache";

afterEach(() => {
  invalidateJsonCache();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("client JSON request cache", () => {
  it("deduplicates concurrent reads and reuses settled data within the TTL", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ value: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      fetchJsonCached<{ value: number }>("/api/example", { ttlMs: 5_000 }),
      fetchJsonCached<{ value: number }>("/api/example", { ttlMs: 5_000 }),
    ]);
    const third = await fetchJsonCached<{ value: number }>("/api/example", {
      ttlMs: 5_000,
    });

    expect(first).toEqual({ value: 1 });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after invalidation and does not cache failed responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ value: 2 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJsonCached("/api/example")).rejects.toThrow(
      "요청 실패 (503)",
    );
    await expect(fetchJsonCached("/api/example")).resolves.toEqual({ value: 2 });
    invalidateJsonCache("/api/example");
    await expect(fetchJsonCached("/api/example")).resolves.toEqual({ value: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
