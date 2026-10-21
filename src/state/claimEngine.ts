import { api, ApiError, type ClaimBody } from '../lib/api';
import { queryClient, queryKeys } from '../hooks/queries';
import { currentOwner, useClaimsStore } from './claimsStore';

// Sending a claim lives outside React on purpose: it must keep going when the
// user navigates away, and resume after a reload (attempts are persisted).

const running = new Set<string>();
const wakers = new Map<string, () => void>();
const MAX_BACKOFF_MS = 15_000;

/** A backoff sleep; "Check now" can cut it short unless it's a server-requested 429 wait. */
function sleep(key: string, ms: number, wakeable = true) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      wakers.delete(key);
      resolve();
    }
    if (wakeable) wakers.set(key, done);
  });
}

/**
 * Send (or resend) an attempt until we know the outcome. Always the same
 * Idempotency-Key + body, so a resend after a timeout can only return the
 * original claim (200 Idempotent-Replayed), never create a second one.
 */
export async function runAttempt(key: string) {
  if (running.has(key)) {
    wakers.get(key)?.(); // already running: skip the rest of the current backoff
    return;
  }
  running.add(key);
  try {
    let delay = 1_000;
    for (;;) {
      const a = useClaimsStore.getState().attempts.find((x) => x.key === key);
      if (!a || a.state === 'created' || a.state === 'rejected') return;
      // Never send one account's claim with another account's token.
      if (a.owner !== currentOwner()) return;
      if (a.stalled) useClaimsStore.getState().updateAttempt(key, { stalled: false });
      try {
        const claim = await api.createClaim(a.body, a.key);
        useClaimsStore.getState().updateAttempt(key, { state: 'created', claim, error: undefined });
        queryClient.invalidateQueries({ queryKey: queryKeys.balances });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity });
        return;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(String(e), null, 'UNKNOWN', true);
        if (err.code === 'RATE_LIMITED') {
          await sleep(key, err.retryAfterMs ?? 1_000, false);
        } else if (err.outcomeUnknown) {
          useClaimsStore.getState().updateAttempt(key, { state: 'unknown', error: err.message, stalled: false });
          await sleep(key, delay);
          delay = Math.min(delay * 2, MAX_BACKOFF_MS);
        } else if (a.state === 'unknown') {
          // A 4xx on a RESEND doesn't prove the first request failed (e.g. token expired, or
          // available is now lower because the first one did go through). Stay unknown and locked.
          useClaimsStore.getState().updateAttempt(key, { error: err.message, stalled: true });
          return;
        } else {
          // 4xx on the first send: the server refused, nothing was created.
          useClaimsStore.getState().updateAttempt(key, { state: 'rejected', error: err.message });
          if (err.code === 'VALIDATION') queryClient.invalidateQueries({ queryKey: queryKeys.balances });
          return;
        }
      }
    }
  } finally {
    running.delete(key);
  }
}

export function submitClaim(body: ClaimBody, decimals: number): string {
  const attempt = useClaimsStore.getState().addAttempt(body, decimals);
  runAttempt(attempt.key);
  return attempt.key;
}

/** On startup: resend anything whose outcome we never learned. */
export function resumeUnresolvedAttempts() {
  const owner = currentOwner();
  for (const a of useClaimsStore.getState().attempts) {
    if (a.owner === owner && (a.state === 'submitting' || a.state === 'unknown')) {
      // A request in flight when the page closed may have reached the server.
      useClaimsStore.getState().updateAttempt(a.key, { state: 'unknown' });
      runAttempt(a.key);
    }
  }
}
