import { ApiError, api, type Claim } from '../lib/api';
import { resumeUnresolvedAttempts, runAttempt, submitClaim } from './claimEngine';
import { useClaimsStore } from './claimsStore';

jest.mock('../lib/storage', () => {
  const mem = new Map<string, string>();
  let n = 0;
  return {
    zustandStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    },
    newIdempotencyKey: () => `key-${++n}`,
  };
});
jest.mock('../hooks/queries', () => ({
  queryClient: { invalidateQueries: jest.fn() },
  queryKeys: { balances: ['balances'], activity: ['activity'] },
}));

const body = { asset: 'USDT', amount: '12.5', destinationId: 'dest_wallet' };
const claim: Claim = {
  id: 'clm_1', asset: 'USDT', amount: '12.5', fee: '1.5', receiveAmount: '11', destinationId: 'dest_wallet',
  status: 'pending', failureReason: null, createdAt: '2026-10-21T19:00:00Z', updatedAt: '2026-10-21T19:00:00Z',
};
const timeout = () => new ApiError('timed out', 504, 'TIMEOUT', true);

let createClaim: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  useClaimsStore.getState().clear();
  createClaim = jest.spyOn(api, 'createClaim');
});
afterEach(() => {
  createClaim.mockRestore();
  jest.useRealTimers();
});

const attempt = (key: string) => useClaimsStore.getState().attempts.find((a) => a.key === key)!;

it('after a timeout, resends with the SAME idempotency key and body', async () => {
  createClaim.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(claim);
  const key = submitClaim(body, 6);
  expect(attempt(key).state).toBe('submitting');

  await jest.advanceTimersByTimeAsync(0);
  expect(attempt(key).state).toBe('unknown');

  await jest.advanceTimersByTimeAsync(1_000);
  expect(createClaim).toHaveBeenCalledTimes(2);
  expect(createClaim.mock.calls[0]).toEqual([body, key]);
  expect(createClaim.mock.calls[1]).toEqual([body, key]);
  expect(attempt(key).state).toBe('created');
  expect(attempt(key).claim?.id).toBe('clm_1');
});

it('a definite 4xx marks the attempt rejected and does not resend', async () => {
  createClaim.mockRejectedValueOnce(new ApiError('amount exceeds available', 400, 'VALIDATION', false, 'amount'));
  const key = submitClaim(body, 6);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(createClaim).toHaveBeenCalledTimes(1);
  expect(attempt(key).state).toBe('rejected');
});

it('429 waits retryAfterMs before resending with the same key', async () => {
  createClaim
    .mockRejectedValueOnce(new ApiError('Too many requests', 429, 'RATE_LIMITED', false, undefined, 2_300))
    .mockResolvedValueOnce(claim);
  const key = submitClaim(body, 6);
  await jest.advanceTimersByTimeAsync(2_000);
  expect(createClaim).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(300);
  expect(createClaim).toHaveBeenCalledTimes(2);
  expect(createClaim.mock.calls[1][1]).toBe(key);
});

it('a second runAttempt while one is in flight does not send twice', async () => {
  let resolve!: (c: Claim) => void;
  createClaim.mockReturnValueOnce(new Promise<Claim>((r) => (resolve = r)));
  const key = submitClaim(body, 6);
  runAttempt(key);
  runAttempt(key);
  resolve(claim);
  await jest.advanceTimersByTimeAsync(0);
  expect(createClaim).toHaveBeenCalledTimes(1);
});

it('a 4xx on a RESEND after an unknown outcome stays unknown (stalled), never "rejected"', async () => {
  createClaim
    .mockRejectedValueOnce(timeout())
    .mockRejectedValueOnce(new ApiError('Token expired', 401, 'UNAUTHORIZED', false));
  const key = submitClaim(body, 6);
  await jest.advanceTimersByTimeAsync(1_000);
  expect(createClaim).toHaveBeenCalledTimes(2);
  expect(attempt(key).state).toBe('unknown');
  expect(attempt(key).stalled).toBe(true);
});

it('an attempt still "submitting" when the page closed resumes as unknown', async () => {
  // persisted state after a reload: the request was in flight, no loop is running now
  const { key } = useClaimsStore.getState().addAttempt(body, 6);
  createClaim.mockRejectedValueOnce(new ApiError('amount exceeds available', 400, 'VALIDATION', false));
  resumeUnresolvedAttempts();
  await jest.advanceTimersByTimeAsync(0);
  expect(createClaim).toHaveBeenCalledWith(body, key);
  expect(attempt(key).state).toBe('unknown');
  expect(attempt(key).stalled).toBe(true);
});
