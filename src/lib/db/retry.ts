/**
 * Retry around Cosmos DB throughput throttling.
 *
 * Cosmos's RU-based Mongo API answers error 16500 when a request would exceed
 * the account's provisioned throughput, with a `RetryAfterMs` hint in the
 * message. It is NOT a failure — it means "ask again shortly". A real MongoDB
 * server never does this, so nothing in the driver handles it, and an
 * unretried 16500 surfaces to the caller as a hard error at exactly the worst
 * moment: a burst of teams submitting in the same second is precisely when
 * throttling appears.
 *
 * Wrap bulk or burst-prone database work in this — it is not a substitute for
 * provisioning enough throughput for the event, it's what stops a brief spike
 * from becoming a lost submission.
 */

const THROTTLE_CODE = 16500;

function retryAfterMs(err: unknown, attempt: number): number | null {
  const e = err as { code?: number; errorResponse?: { errmsg?: string }; message?: string };
  if (e?.code !== THROTTLE_CODE) return null;

  const text = e.errorResponse?.errmsg ?? e.message ?? "";
  const match = /RetryAfterMs=(\d+)/.exec(text);
  const hinted = match ? Number(match[1]) : 0;

  return Math.max(hinted, 25) * Math.pow(2, attempt);
}

export async function withThrottleRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const wait = retryAfterMs(err, attempt);
      if (wait === null) throw err; // not throttling — a real failure
      lastError = err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastError;
}
