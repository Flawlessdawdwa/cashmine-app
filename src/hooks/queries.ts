import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, ApiError, type Balances } from '../lib/api';
import { useAuthStore } from '../state/authStore';

const BALANCES_REFETCH_MS = 15_000; // snapshots are recomputed every 15s
const CLAIM_POLL_MS = 2_000;

/** GETs are safe to repeat: retry transient failures and 429s, never 4xx. */
function shouldRetry(failureCount: number, error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'RATE_LIMITED') return failureCount < 5;
  return error.outcomeUnknown && failureCount < 3;
}

function retryDelay(attempt: number, error: unknown) {
  if (error instanceof ApiError && error.retryAfterMs) return error.retryAfterMs;
  return Math.min(500 * 2 ** attempt, 8_000);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, retryDelay, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

// Hooks append the token to these keys so switching token never shows another user's data.
export const queryKeys = {
  balances: ['balances'] as const,
  activity: ['activity'] as const,
  claimOptions: (asset: string) => ['claimOptions', asset] as const,
  claim: (id: string) => ['claim', id] as const,
};

const useToken = () => useAuthStore((s) => s.token);

export function useBalances() {
  const token = useToken();
  return useQuery({
    queryKey: [...queryKeys.balances, token],
    enabled: !!token,
    queryFn: async (): Promise<Balances> => {
      const fresh = await api.balances();
      // Responses can arrive out of order: never replace a newer snapshot with an older one.
      const prev = queryClient.getQueryData<Balances>([...queryKeys.balances, token]);
      if (prev && Date.parse(prev.asOf) > Date.parse(fresh.asOf)) return prev;
      return fresh;
    },
    refetchInterval: BALANCES_REFETCH_MS,
  });
}

export function useClaimOptions(asset: string | null) {
  const token = useToken();
  return useQuery({
    queryKey: [...queryKeys.claimOptions(asset ?? ''), token],
    enabled: !!token && !!asset,
    queryFn: () => api.claimOptions(asset!),
    staleTime: 60_000,
  });
}

/** Polls a claim every 2s until it settles. */
export function useClaimStatus(id: string | undefined) {
  const token = useToken();
  return useQuery({
    queryKey: [...queryKeys.claim(id ?? ''), token],
    enabled: !!token && !!id,
    queryFn: () => api.getClaim(id!),
    refetchInterval: (q) => {
      if (q.state.data && q.state.data.status !== 'pending') return false;
      const e = q.state.error;
      if (e instanceof ApiError && !e.outcomeUnknown && e.code !== 'RATE_LIMITED') return false; // 401/404: polling can't help
      return CLAIM_POLL_MS;
    },
    refetchIntervalInBackground: true,
  });
}

export function useActivity() {
  const token = useToken();
  return useInfiniteQuery({
    queryKey: [...queryKeys.activity, token],
    enabled: !!token,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.activity(pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
