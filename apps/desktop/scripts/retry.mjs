// Retries for release uploads: a dropped connection or a brief DNS failure shouldn't fail a publish
// that has already sent hundreds of megabytes. The AWS SDK can't retry these uploads itself: their
// bodies are file streams, which can only be read once.

/** Network failures worth trying again (Node's and undici's error codes). */
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** S3 error names for timeouts and throttling. */
const RETRYABLE_NAMES = new Set([
  "TimeoutError",
  "RequestTimeout",
  "RequestTimeoutException",
  "SlowDown",
  "ThrottlingException",
]);

/** Total tries per request, including the first. */
export const UPLOAD_ATTEMPTS = 5;

/**
 * Whether a failed request may succeed if tried again: network errors, timeouts, throttling and
 * server errors. Anything else (bad credentials, a missing bucket) fails right away.
 */
export function isRetryable(error) {
  const status = error?.$metadata?.httpStatusCode ?? error?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const code = error?.code ?? error?.cause?.code;
  return RETRYABLE_CODES.has(code) || RETRYABLE_NAMES.has(error?.name);
}

/** Wait before retry number `retry` (1 for the first retry): 2 s, 4 s, 8 s… capped at 30 s. */
export function retryDelayMs(retry, baseMs = 2000, maxMs = 30_000) {
  return Math.min(maxMs, baseMs * 2 ** (retry - 1));
}

/** A short, safe description of a failure: no messages, which can contain account host names. */
export function describeError(error) {
  const status = error?.$metadata?.httpStatusCode ?? error?.status;
  return [error?.code ?? error?.cause?.code, error?.name, status && `HTTP ${status}`]
    .filter(Boolean)
    .join(", ");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` (given the attempt number) until it succeeds, up to `attempts` tries in total,
 * waiting longer before each retry. Only retryable failures are tried again.
 */
export async function withRetries(
  task,
  { attempts = UPLOAD_ATTEMPTS, delay = retryDelayMs, onRetry = () => {}, sleep = wait } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      const ms = delay(attempt);
      onRetry(error, attempt, ms);
      await sleep(ms);
    }
  }
}
