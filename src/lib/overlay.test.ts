import type { Balances, Claim } from './api';
import { displayBalances, type ClaimAttempt } from './overlay';

const snapshot = (asOf: string, available: string, claiming = '0'): Balances => ({
  asOf,
  items: [{ asset: 'USDT', decimals: 6, available, pending: '0', claiming, usdPrice: '1' }],
});

const attempt = (createdAt: string, status: Claim['status'], amount = '100'): ClaimAttempt => ({
  key: 'k1',
  owner: 'o',
  body: { asset: 'USDT', amount, destinationId: 'd' },
  decimals: 6,
  state: 'created',
  startedAt: createdAt,
  claim: {
    id: 'clm_1', asset: 'USDT', amount, fee: '1', receiveAmount: '99', destinationId: 'd',
    status, failureReason: null, createdAt, updatedAt: createdAt,
  },
});

describe('displayBalances', () => {
  it('applies a pending claim the snapshot predates', () => {
    const [row] = displayBalances(snapshot('2026-10-21T19:00:00Z', '500'), [attempt('2026-10-21T19:00:05Z', 'pending')]);
    expect(row.available).toBe(400_000000n);
    expect(row.claiming).toBe(100_000000n);
    expect(row.adjusted).toBe(true);
  });

  it('trusts a snapshot taken after the claim (no double subtraction, no jump)', () => {
    const [row] = displayBalances(snapshot('2026-10-21T19:00:15Z', '400', '100'), [attempt('2026-10-21T19:00:05Z', 'pending')]);
    expect(row.available).toBe(400_000000n);
    expect(row.claiming).toBe(100_000000n);
    expect(row.adjusted).toBe(false);
  });

  it('a completed claim on an old snapshot leaves available, not claiming', () => {
    const [row] = displayBalances(snapshot('2026-10-21T19:00:00Z', '500'), [attempt('2026-10-21T19:00:05Z', 'completed')]);
    expect(row.available).toBe(400_000000n);
    expect(row.claiming).toBe(0n);
  });

  it('a failed claim on an old snapshot has no net effect', () => {
    const [row] = displayBalances(snapshot('2026-10-21T19:00:00Z', '500'), [attempt('2026-10-21T19:00:05Z', 'failed')]);
    expect(row.available).toBe(500_000000n);
  });

  it('marks an asset unresolved while an attempt outcome is unknown', () => {
    const a = { ...attempt('2026-10-21T19:00:05Z', 'pending'), state: 'unknown' as const, claim: undefined };
    const [row] = displayBalances(snapshot('2026-10-21T19:00:00Z', '500'), [a]);
    expect(row.unresolved).toBe(true);
    expect(row.available).toBe(500_000000n);
  });
});
