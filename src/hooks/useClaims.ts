import { useEffect, useMemo } from 'react';
import { displayBalances, totalsUsd } from '../lib/overlay';
import { useAuthStore } from '../state/authStore';
import { isPending, isUnresolved, useClaimsStore } from '../state/claimsStore';
import { resumeUnresolvedAttempts } from '../state/claimEngine';
import { queryClient, queryKeys, useBalances, useClaimStatus } from './queries';

/** Server snapshot merged with our own claims it doesn't include yet (see lib/overlay.ts). */
export function useDisplayBalances() {
  const query = useBalances();
  const attempts = useClaimsStore((s) => s.attempts);
  const derived = useMemo(() => {
    if (!query.data) return { rows: null, totals: null, dataError: null };
    try {
      const rows = displayBalances(query.data, attempts);
      return { rows, totals: totalsUsd(rows), dataError: null };
    } catch (e) {
      return { rows: null, totals: null, dataError: e as Error };
    }
  }, [query.data, attempts]);
  return { ...query, ...derived };
}

/** Polls one created claim and writes its latest status into the claims store. */
export function useWatchClaim(claimId: string | undefined) {
  const { data } = useClaimStatus(claimId);
  const setClaim = useClaimsStore((s) => s.setClaim);
  useEffect(() => {
    if (!data) return;
    setClaim(data);
    if (data.status !== 'pending') {
      queryClient.invalidateQueries({ queryKey: queryKeys.balances });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    }
  }, [data, setClaim]);
}

export function usePendingClaimIds() {
  const attempts = useClaimsStore((s) => s.attempts);
  return useMemo(() => attempts.filter(isPending).map((a) => a.claim!.id), [attempts]);
}

/** Forget settled claims once a balance snapshot is well past their settlement. */
export function usePruneSettledClaims() {
  const { data } = useBalances();
  const attempts = useClaimsStore((s) => s.attempts);
  const removeAttempt = useClaimsStore((s) => s.removeAttempt);
  useEffect(() => {
    if (!data) return;
    const asOf = Date.parse(data.asOf);
    for (const a of attempts) {
      if (a.state === 'created' && a.claim && a.claim.status !== 'pending' && Date.parse(a.claim.updatedAt) + 5 * 60_000 < asOf) {
        removeAttempt(a.key);
      }
    }
  }, [data, attempts, removeAttempt]);
}

/**
 * Switching token drops the previous token's cached data. Claims we can't yet prove are
 * settled (pending, or stalled after an unknown outcome) are kept and resumed with the new
 * token, never wiped: wiping would unlock the asset and allow a duplicate. Blocked only while
 * a resend is actively retrying.
 */
export function useChangeToken() {
  const current = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const attempts = useClaimsStore((s) => s.attempts);
  const blocked = attempts.some((a) => isUnresolved(a) && !a.stalled);
  const change = (token: string | null): boolean => {
    const clean = token?.trim() || null;
    if (clean === current) return true;
    if (blocked) return false;
    const { attempts: all, removeAttempt } = useClaimsStore.getState();
    for (const a of all) if (!isPending(a) && !isUnresolved(a)) removeAttempt(a.key);
    queryClient.clear();
    setToken(clean);
    if (clean) resumeUnresolvedAttempts();
    return true;
  };
  return { change, blocked };
}
