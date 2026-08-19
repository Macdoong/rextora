/** Safe upstream HTTP JSON parse — never throw SyntaxError on truncated bodies. */
export async function readUpstreamJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`upstream_empty_body (${response.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`upstream_invalid_json (${response.status})`);
  }
}
