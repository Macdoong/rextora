type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const responseCache = new Map<string, CacheEntry<unknown>>();

/**
 * Small client-side SWR cache for read-only JSON endpoints.
 * Concurrent callers share one request; settled data remains available for the
 * short TTL so persistent shell components do not refetch on every route hop.
 */
export async function fetchJsonCached<T>(
  url: string,
  options: {
    signal?: AbortSignal;
    ttlMs?: number;
    force?: boolean;
  } = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? 5_000;
  const now = Date.now();
  const cached = responseCache.get(url) as CacheEntry<T> | undefined;

  if (!options.force && cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }
  if (!options.force && cached?.promise) return cached.promise;

  const request = fetch(url, { signal: options.signal })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`요청 실패 (${response.status})`);
      }
      return (await response.json()) as T;
    })
    .then((value) => {
      responseCache.set(url, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      const current = responseCache.get(url);
      if (current?.promise === request) responseCache.delete(url);
      throw error;
    });

  responseCache.set(url, {
    value: cached?.value,
    expiresAt: cached?.expiresAt ?? 0,
    promise: request,
  });
  return request;
}

export function invalidateJsonCache(url?: string): void {
  if (url) responseCache.delete(url);
  else responseCache.clear();
}
