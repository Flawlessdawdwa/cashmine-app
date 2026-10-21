import type { Balances, Claim, ClaimBody } from './api';
import { addDecimals, parseApiAmount, usdValue, type Decimal } from './money';

/**
 * A claim attempt the app is tracking. Created before the POST so the
 * idempotency key survives a reload; the same key + body are reused on every resend.
 *  - submitting: request in flight
 *  - unknown:    request failed in a way where the claim may or may not exist
 *  - created:    server returned the claim (any status)
 *  - rejected:   server definitely refused (4xx); nothing was created
 */
export type ClaimAttempt = {
  key: string;
  body: ClaimBody;
  decimals: number;
  state: 'submitting' | 'unknown' | 'created' | 'rejected';
  claim?: Claim;
  error?: string;
  startedAt: string;
};

export type DisplayBalance = {
  asset: string;
  decimals: number;
  usdPrice: string;
  available: bigint;
  pending: bigint;
  claiming: bigint;
  /** a claim we created that the snapshot doesn't include yet */
  adjusted: boolean;
  /** a claim attempt with an unresolved outcome; block new claims for this asset */
  unresolved: boolean;
};

/**
 * Server snapshot + our own claims the snapshot doesn't know about yet.
 *
 * Snapshots are recomputed every 15s and `asOf` is the snapshot time. Both
 * `asOf` and `claim.createdAt` are server clocks, so if asOf < createdAt the
 * snapshot predates the claim and we apply its effect ourselves. Once a snapshot
 * at/after createdAt arrives, it already includes the claim and we stop. The
 * displayed balance therefore never "jumps back up" because of staleness.
 */
export function displayBalances(snapshot: Balances, attempts: ClaimAttempt[]): DisplayBalance[] {
  const asOf = Date.parse(snapshot.asOf);
  return snapshot.items.map((item) => {
    const d = item.decimals;
    const row: DisplayBalance = {
      asset: item.asset,
      decimals: d,
      usdPrice: item.usdPrice,
      available: parseApiAmount(item.available, d),
      pending: parseApiAmount(item.pending, d),
      claiming: parseApiAmount(item.claiming, d),
      adjusted: false,
      unresolved: false,
    };
    for (const a of attempts) {
      if (a.body.asset !== item.asset) continue;
      if (a.state === 'submitting' || a.state === 'unknown') {
        row.unresolved = true;
        continue;
      }
      const c = a.claim;
      if (a.state !== 'created' || !c) continue;
      if (Date.parse(c.createdAt) <= asOf) continue; // snapshot already includes it
      const amount = parseApiAmount(c.amount, d);
      // A failed claim returns its amount, so net effect vs. the older snapshot is zero.
      if (c.status === 'failed') continue;
      row.available -= amount;
      if (c.status === 'pending') row.claiming += amount;
      row.adjusted = true;
    }
    if (row.available < 0n) row.available = 0n;
    return row;
  });
}

export function totalsUsd(rows: DisplayBalance[]): { available: Decimal; total: Decimal } {
  return {
    available: addDecimals(rows.map((r) => usdValue(r.available, r.decimals, r.usdPrice))),
    total: addDecimals(rows.map((r) => usdValue(r.available + r.pending + r.claiming, r.decimals, r.usdPrice))),
  };
}
