# Notes

## Decisions

**Amounts: bigint in the asset's smallest unit, never JS numbers.** `parseAmount("0.5", 6)` gives `500000n`. Validation, fee and receive amount are integer math (`src/lib/money.ts`). We send the canonical string back (`formatUnits`), so the body is stable for idempotency. Why: ETH has 18 decimals and the live data has `12.345678901234591676`, which a float can't hold. USD values are exact decimals (`units × price` at a combined scale), summed exactly, and rounded half-up to cents **once**, only for display. _Alternatives:_ a decimal library (big.js or decimal.js), which works but adds a dependency for what amounts to add, subtract and compare; or floats with rounding, which is wrong for money. The input accepts `,` as a decimal separator (phone keyboards) and otherwise follows the API's format rules exactly.

**Balance right after a claim: local overlay, reconciled against the snapshot's `asOf`.** I asked the AI for approaches (see ai-logs). The options were (A) an overlay reconciled by `asOf`, (B) showing only server data plus a banner and a per-asset claim lock, and (C) naive optimistic subtraction followed by a refetch. C produces the "dropped, then jumped back up" bug, because the next snapshot can predate the claim (snapshots are recomputed every 15s). B leaves the balance unchanged for up to 15s, which is what caused the "claimed again" complaint. I chose A (`src/lib/overlay.ts`). After a 201, while a snapshot's `asOf` < the claim's `createdAt`, we move the amount from available to claiming ourselves and label it "Includes your claim just submitted". Once a snapshot with `asOf >= createdAt` arrives, it already includes the claim and we show server numbers as they are. Both timestamps come from the server, so client clock skew doesn't matter. The balance changes immediately and only goes back up if the claim actually **fails**, and in that case we say so explicitly. As defence in depth, out-of-order responses never replace a newer snapshot with an older one.

**Unknown claim outcome (timeout, network error, 5xx, 504).** Each claim attempt gets an `Idempotency-Key` that is persisted (MMKV) together with the exact body **before** the POST goes out. If the outcome is unknown, the screen says "We couldn't confirm your claim yet… it can't be submitted twice. Don't claim this again." The app keeps resending the **same key and body** with backoff (1s → 15s), and the server either replays the original claim or creates it once. The asset's Claim button is disabled while an attempt is unresolved, and unresolved attempts resume after a reload. Only a definite 4xx **on the first send** counts as "not submitted". A 4xx on a _resend_ (for example, the token expired mid-retry) does not prove that nothing was created, so the attempt stays unknown and locked. The user is told to check Activity, and the lock is released only by them confirming they've checked. An attempt still in flight when the page closed resumes as unknown. A 429 waits `retryAfterMs` and resends. Changing the token never wipes pending or unknown claims (see below). _Alternative rejected:_ show "failed, try again", which leads users to create duplicates.

**Other decisions**

- State: Zustand (token and claim attempts, persisted through MMKV, which uses localStorage on web). Server data: React Query custom hooks (`src/hooks/queries.ts`) with a retry policy that retries only safe cases (GETs on 5xx/network errors, and 429 honouring `retryAfterMs`). POST is never retried by React Query, only by the claim engine with the same key.
- The claim engine runs outside React (`src/state/claimEngine.ts`) so it keeps going while you navigate.
- Header total = available + pending + claiming in USD. The headline figure is "Available to claim".
- Freshness is shown from `asOf` ("Updated 12s ago"), with a warning after 60s and a "Couldn't refresh, showing data from…" banner when a refresh fails but older data exists. Auto-refresh runs every 15s while visible.
- Data is per token. Changing the token clears cached queries. Claim attempts are tagged with a fingerprint of the token that made them: the app only resends, polls, locks and overlays attempts belonging to the current token. Unsettled attempts from another token stay stored but inactive until that token is entered again, so they're never sent under another account's token and never wiped.
- Navigation is a tiny in-memory stack because there are only 5 screens. On web, the browser back button and deep links don't map to screens.

## Working with AI

All in `ai-logs/` (full Claude Code session transcript).

1. **A prompt that didn't get what I wanted.** -- My first prompt only gave the stack (“latest RN Expo with TS”) and said nothing about architecture. The AI made its own choice and built a hand-rolled React Context store that wrote to localStorage directly. That works for a demo, but it isn’t how I’d structure a production app. I re-prompted with the architecture I actually wanted: Zustand for client state, React Query with custom hooks for API calls, and MMKV for persistence. It refactored to that. It also checked that MMKV v4 has a real web fallback (createMMKV.web.js) before using it, which mattered because this app ships only as a web build. Lesson: specify the architecture up front, or the AI fills the gap with its own defaults.
2. **AI output that was wrong or risky.** -- The AI wrote the claim logic and its tests passed, but there was a bug that could make a user claim twice. If a claim request timed out and a retry then got an error (for example, because the token had expired), the app showed “Nothing was claimed.” The first request might already have gone through on the server, so the user could submit the claim again and get a duplicate.
   I found it by running a separate money-review agent over the code instead of trusting the passing tests. I fixed it so that in this case the claim stays marked as “unknown,” the asset stays locked, and the user is told to check Activity before claiming again. I also added a test for it.
3. **Disagreeing with or rejecting a suggestion.** -- The AI recommended Vercel for hosting. I rejected that and went with EAS Hosting, because I already have an Expo account and wanted the build and deploy flow to stay inside the Expo toolchain the app was built on, instead of adding another service and login under a deadline.

## Not done / known issues

- No cross-tab sync of claim attempts: two open tabs can overwrite each other's persisted list, and one tab doesn't see the other's lock. Next I'd listen to `storage` events and merge per key.
- An unknown attempt isn't auto-reconciled against `/v1/activity` (newer claims there have `relatedId` = claim id, but we don't have the id without a response). The user is asked to check Activity instead.

- Not tested on a physical phone, only in a phone-sized browser viewport.
- The overlay subtracts a claim from `available` even if that snapshot is older than a reversal; in extreme cases displayed available could briefly be off until the next snapshot (clamped at 0).
- Claim history across devices relies on Activity. Tracked in-flight claims are per browser.
- No component or end-to-end tests. Unit tests cover amounts, the balance overlay and the claim engine (timeout → resend with the same key, 4xx stops, 429 waits).
- Activity uses "Load more" rather than infinite scroll, which is deliberate for predictable paging on flaky networks.
