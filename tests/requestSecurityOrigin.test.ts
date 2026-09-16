import { afterEach, describe, expect, it } from "vitest";
import { isSameOriginMutation } from "@/src/lib/rextora/auth/requestSecurity";

const ORIGINAL_PUBLIC_ORIGIN = process.env.REXTORA_PUBLIC_ORIGIN;

function mutationRequest(url: string, origin?: string): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set("origin", origin);
  return new Request(url, { method: "POST", headers });
}

afterEach(() => {
  if (ORIGINAL_PUBLIC_ORIGIN === undefined) {
    delete process.env.REXTORA_PUBLIC_ORIGIN;
  } else {
    process.env.REXTORA_PUBLIC_ORIGIN = ORIGINAL_PUBLIC_ORIGIN;
  }
});

describe("isSameOriginMutation public origin", () => {
  it("A. unset env keeps local same-origin allowed", () => {
    delete process.env.REXTORA_PUBLIC_ORIGIN;
    expect(
      isSameOriginMutation(
        mutationRequest("http://localhost/api/rextora/auth/login", "http://localhost"),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        mutationRequest("http://127.0.0.1/api/rextora/auth/login", "http://localhost"),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        mutationRequest("http://localhost/api/rextora/auth/login"),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        mutationRequest(
          "http://localhost/api/rextora/auth/login",
          "https://evil.example.com",
        ),
      ),
    ).toBe(false);
  });

  it("B. configured Render origin matching Origin is allowed", () => {
    process.env.REXTORA_PUBLIC_ORIGIN = "https://rextora-test.onrender.com";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://rextora-test.onrender.com",
        ),
      ),
    ).toBe(true);
  });

  it("C. configured Render origin rejects a foreign Origin", () => {
    process.env.REXTORA_PUBLIC_ORIGIN = "https://rextora-test.onrender.com";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://evil.example.com",
        ),
      ),
    ).toBe(false);
  });

  it("D. configured Render origin rejects a fake onrender subdomain", () => {
    process.env.REXTORA_PUBLIC_ORIGIN = "https://rextora-test.onrender.com";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://fake-rextora-test.onrender.com",
        ),
      ),
    ).toBe(false);
  });

  it("E. path on REXTORA_PUBLIC_ORIGIN is stripped to canonical origin", () => {
    process.env.REXTORA_PUBLIC_ORIGIN =
      "https://rextora-test.onrender.com/some/path";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://rextora-test.onrender.com",
        ),
      ),
    ).toBe(true);
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://rextora-test.onrender.com/some/path",
        ),
      ),
    ).toBe(true);
  });

  it("F. malformed REXTORA_PUBLIC_ORIGIN fails closed", () => {
    process.env.REXTORA_PUBLIC_ORIGIN = "not a url";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "http://localhost/api/rextora/auth/login",
          "http://localhost",
        ),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        mutationRequest("http://localhost/api/rextora/auth/login"),
      ),
    ).toBe(false);
    process.env.REXTORA_PUBLIC_ORIGIN = "rextora-test.onrender.com";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://rextora-test.onrender.com",
        ),
      ),
    ).toBe(false);
  });

  it("G. no wildcard onrender.com acceptance", () => {
    process.env.REXTORA_PUBLIC_ORIGIN = "https://rextora-test.onrender.com";
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://other.onrender.com",
        ),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://onrender.com",
        ),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        mutationRequest(
          "https://0.0.0.0:10000/api/rextora/auth/login",
          "https://rextora-test.onrender.com.evil.example",
        ),
      ),
    ).toBe(false);
  });

  it("does not trust Host headers when public origin is configured", () => {
    process.env.REXTORA_PUBLIC_ORIGIN = "https://rextora-test.onrender.com";
    const headers = new Headers({
      origin: "https://evil.example.com",
      host: "rextora-test.onrender.com",
    });
    const request = new Request("https://0.0.0.0:10000/api/rextora/auth/login", {
      method: "POST",
      headers,
    });
    expect(isSameOriginMutation(request)).toBe(false);
  });
});
