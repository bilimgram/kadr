import { describe, expect, it, vi } from "vitest";
import { describeError, isRetryable, retryDelayMs, withRetries } from "./retry.mjs";

const networkError = (code) => Object.assign(new Error(`write ${code}`), { code });
const s3Error = (status, name = "Error") =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

describe("isRetryable", () => {
  it("retries dropped connections, DNS hiccups and timeouts", () => {
    // What a reset upload looked like in practice: a Node error code under an SDK error name.
    expect(isRetryable(Object.assign(networkError("ECONNRESET"), { name: "TimeoutError" }))).toBe(
      true,
    );
    expect(isRetryable(networkError("ENOTFOUND"))).toBe(true);
    expect(isRetryable(networkError("EPIPE"))).toBe(true);
    // fetch() wraps the network error.
    expect(
      isRetryable(new TypeError("fetch failed", { cause: networkError("UND_ERR_SOCKET") })),
    ).toBe(true);
  });

  it("retries server errors and throttling, not client errors", () => {
    expect(isRetryable(s3Error(500, "InternalError"))).toBe(true);
    expect(isRetryable(s3Error(503, "SlowDown"))).toBe(true);
    expect(isRetryable(s3Error(429))).toBe(true);
    expect(isRetryable(s3Error(403, "AccessDenied"))).toBe(false);
    expect(isRetryable(s3Error(404, "NotFound"))).toBe(false);
    expect(isRetryable(new Error("SHA-512 mismatch"))).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially up to a cap", () => {
    expect([1, 2, 3, 4, 5, 6].map((retry) => retryDelayMs(retry))).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});

describe("describeError", () => {
  it("names the failure without echoing its message", () => {
    const dns = networkError("ENOTFOUND");
    dns.message = "getaddrinfo ENOTFOUND secret-account.r2.cloudflarestorage.com";
    expect(describeError(dns)).toBe("ENOTFOUND, Error");
    expect(describeError(s3Error(503, "SlowDown"))).toBe("SlowDown, HTTP 503");
  });
});

describe("withRetries", () => {
  const instant = { sleep: () => Promise.resolve() };

  it("tries again after a dropped connection and returns the result", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(networkError("ECONNRESET"))
      .mockRejectedValueOnce(networkError("ENOTFOUND"))
      .mockResolvedValue("uploaded");
    const onRetry = vi.fn();
    await expect(withRetries(task, { ...instant, onRetry })).resolves.toBe("uploaded");
    expect(task).toHaveBeenCalledTimes(3);
    expect(task.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3]);
    expect(onRetry.mock.calls.map(([, attempt, ms]) => [attempt, ms])).toEqual([
      [1, 2000],
      [2, 4000],
    ]);
  });

  it("gives up after the last attempt with the last error", async () => {
    const task = vi.fn().mockRejectedValue(networkError("ECONNRESET"));
    await expect(withRetries(task, { ...instant, attempts: 3 })).rejects.toMatchObject({
      code: "ECONNRESET",
    });
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("fails right away on errors that won't go away", async () => {
    const task = vi.fn().mockRejectedValue(s3Error(403, "AccessDenied"));
    await expect(withRetries(task, instant)).rejects.toMatchObject({ name: "AccessDenied" });
    expect(task).toHaveBeenCalledTimes(1);
  });
});
