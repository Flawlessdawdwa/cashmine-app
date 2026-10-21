import { useEffect, useMemo } from 'react';
import { displayBalances, totalsUsd } from '../lib/overlay';
import { useAuthStore } from '../state/authStore';
import { isPending, useClaimsStore } from '../state/claimsStore';
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

/** Switching token: drop the previous user's cached data and claims. */
export function useChangeToken() {
  const setToken = useAuthStore((s) => s.setToken);
  const clear = useClaimsStore((s) => s.clear);
  return (token: string | null) => {
    clear();
    queryClient.clear();
    setToken(token);
  };
}
