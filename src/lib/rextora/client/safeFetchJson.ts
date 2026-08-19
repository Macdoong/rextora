/** Parse fetch responses safely — never throw on empty/truncated JSON bodies. */
export type SafeJsonResult<T> =
  | { ok: true; status: number; data: T; receivedBytes: number; contentType: string | null }
  | {
      ok: false;
      status: number;
      error: true;
      messageKo: string;
      receivedBytes: number;
      contentType: string | null;
      parseSucceeded: false;
    };

export async function safeFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<SafeJsonResult<T>> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: true,
      messageKo:
        err instanceof Error && err.name === "AbortError"
          ? "요청 시간이 초과되었습니다."
          : "네트워크 요청에 실패했습니다.",
      receivedBytes: 0,
      contentType: null,
      parseSucceeded: false,
    };
  }

  const contentType = res.headers.get("content-type");
  const text = await res.text();
  const receivedBytes = text.length;
  const elapsedMs = Date.now() - t0;

  if (!text.trim()) {
    return {
      ok: false,
      status: res.status,
      error: true,
      messageKo:
        res.status >= 500
          ? "서버 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요."
          : "응답 본문이 비어 있습니다.",
      receivedBytes,
      contentType,
      parseSucceeded: false,
    };
  }

  try {
    const data = JSON.parse(text) as T;
    void elapsedMs;
    return { ok: true, status: res.status, data, receivedBytes, contentType };
  } catch {
    return {
      ok: false,
      status: res.status,
      error: true,
      messageKo: "응답 형식이 올바르지 않습니다.",
      receivedBytes,
      contentType,
      parseSucceeded: false,
    };
  }
}
