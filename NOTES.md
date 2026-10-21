# Notes

## Decisions

**Amounts: bigint in the asset's smallest unit, never JS numbers.** `parseAmount("0.5", 6)` gives `500000n`. Validation, fee and receive amount are integer math (`src/lib/money.ts`). We send the canonical string back (`formatUnits`), so the body is stable for idempotency. Why: ETH has 18 decimals and the live data has `12.345678901234591676`, which a float can't hold. USD values are exact decimals (`units × price` at a combined scale), summed exactly, and rounded half-up to cents **once**, only for display. *Alternatives:* a decimal library (big.js or decimal.js), which works but adds a dependency for what amounts to add, subtract and compare; or floats with rounding, which is wrong for money. The input accepts `,` as a decimal separator (phone keyboards) and otherwise follows the API's format rules exactly.

**Balance right after a claim: local overlay, reconciled against the snapshot's `asOf`.** I asked the AI for approaches (see ai-logs). The options were (A) an overlay reconciled by `asOf`, (B) showing only server data plus a banner and a per-asset claim lock, and (C) naive optimistic subtraction followed by a refetch. C produces the "dropped, then jumped back up" bug, because the next snapshot can predate the claim (snapshots are recomputed every 15s). B leaves the balance unchanged for up to 15s, which is what caused the "claimed again" complaint. I chose A (`src/lib/overlay.ts`). After a 201, while a snapshot's `asOf` < the claim's `createdAt`, we move the amount from available to claiming ourselves and label it "Includes your claim just submitted". Once a snapshot with `asOf >= createdAt` arrives, it already includes the claim and we show server numbers as they are. Both timestamps come from the server, so client clock skew doesn't matter. The balance changes immediately and only goes back up if the claim actually **fails**, and in that case we say so explicitly. As defence in depth, out-of-order responses never replace a newer snapshot with an older one.

**Unknown claim outcome (timeout, network error, 5xx, 504).** Each claim attempt gets an `Idempotency-Key` that is persisted (MMKV) together with the exact body **before** the POST goes out. If the outcome is unknown, the screen says "We couldn't confirm your claim yet… it can't be submitted twice. Don't claim this again." The app keeps resending the **same key and body** with backoff (1s → 15s), and the server either replays the original claim or creates it once. The asset's Claim button is disabled while an attempt is unresolved, and unresolved attempts resume after a reload. Only a definite 4xx counts as "not submitted". A 429 waits `retryAfterMs` and resends. *Alternative rejected:* show "failed, try again", which leads users to create duplicates.

**Other decisions**
- State: Zustand (token and claim attempts, persisted through MMKV, which uses localStorage on web). Server data: React Query custom hooks (`src/hooks/queries.ts`) with a retry policy that retries only safe cases (GETs on 5xx/network errors, and 429 honouring `retryAfterMs`). POST is never retried by React Query, only by the claim engine with the same key.
- The claim engine runs outside React (`src/state/claimEngine.ts`) so it keeps going while you navigate.
- Header total = available + pending + claiming in USD. The headline figure is "Available to claim".
- Freshness is shown from `asOf` ("Updated 12s ago"), with a warning after 60s and a "Couldn't refresh, showing data from…" banner when a refresh fails but older data exists. Auto-refresh runs every 15s while visible.
- Changing the token clears cached queries and tracked claims (data is per token).
- Navigation is a tiny in-memory stack because there are only 5 screens. On web, the browser back button and deep links don't map to screens.

## Working with AI

All in `ai-logs/` (full Claude Code session transcript).

1. **A prompt that didn't get what I wanted.** _TODO(Davit): fill in, e.g. initial state setup came back as a hand-rolled React Context store; I re-prompted to "use zustand for state management, react query for api calls with custom hooks, plus mmkv storage" and it refactored._
2. **AI output that was wrong or risky.** _TODO(Davit): fill in your own moment, e.g. where something was caught by tests, tsc or the real API._
3. **Disagreeing with or rejecting a suggestion.** _TODO(Davit): fill in, e.g. rejected option C (naive optimistic update) for balances and why._

## Not done / known issues

- Not tested on a physical phone, only in a phone-sized browser viewport.
- The overlay subtracts a claim from `available` even if that snapshot is older than a reversal; in extreme cases displayed available could briefly be off until the next snapshot (clamped at 0).
- Claim history across devices relies on Activity. Tracked in-flight claims are per browser.
- No component or end-to-end tests: unit tests cover amounts and the overlay only. Next, I'd add integration tests for the claim engine with a mocked fetch (timeout → resend with the same key).
- Activity uses "Load more" rather than infinite scroll, which is deliberate for predictable paging on flaky networks.
