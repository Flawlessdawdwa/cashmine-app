import { api, ApiError, type ClaimBody } from '../lib/api';
import { queryClient, queryKeys } from '../hooks/queries';
import { useClaimsStore } from './claimsStore';

// Sending a claim lives outside React on purpose: it must keep going when the
// user navigates away, and resume after a reload (attempts are persisted).

const running = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_BACKOFF_MS = 15_000;

/**
 * Send (or resend) an attempt until we know the outcome. Always the same
 * Idempotency-Key + body, so a resend after a timeout can only return the
 * original claim (200 Idempotent-Replayed), never create a second one.
 */
export async function runAttempt(key: string) {
  if (running.has(key)) return;
  running.add(key);
  try {
    let delay = 1_000;
    for (;;) {
      const a = useClaimsStore.getState().attempts.find((x) => x.key === key);
      if (!a || a.state === 'created' || a.state === 'rejected') return;
      try {
        const claim = await api.createClaim(a.body, a.key);
        useClaimsStore.getState().updateAttempt(key, { state: 'created', claim, error: undefined });
        queryClient.invalidateQueries({ queryKey: queryKeys.balances });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity });
        return;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(String(e), null, 'UNKNOWN', true);
        if (err.code === 'RATE_LIMITED') {
          await sleep(err.retryAfterMs ?? 1_000);
        } else if (err.outcomeUnknown) {
          useClaimsStore.getState().updateAttempt(key, { state: 'unknown', error: err.message });
          await sleep(delay);
          delay = Math.min(delay * 2, MAX_BACKOFF_MS);
        } else {
          // Definite 4xx: nothing was created.
          useClaimsStore.getState().updateAttempt(key, { state: 'rejected', error: err.message });
          if (err.code === 'VALIDATION') queryClient.invalidateQueries({ queryKey: queryKeys.balances });
          if (err.status === 401) return;
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
  for (const a of useClaimsStore.getState().attempts) {
    if (a.state === 'submitting' || a.state === 'unknown') runAttempt(a.key);
  }
}
