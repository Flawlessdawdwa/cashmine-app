# CashMine payback (Expo web)

**Live:** https://flawlessdude-cashmine-app.expo.app

Open it on a phone, paste your API token on first launch (stored only in this browser, changeable via **Token**).

## Run locally

```bash
npm install
npx expo start --web     # dev server
npm test                 # unit tests (amount logic + balance overlay)
npx expo export --platform web   # static build in dist/
```

The API base URL is in `src/lib/config.ts`.

## What works

- **Balances (Home):** each asset's available, pending and claiming amounts, USD values and totals, and data freshness from `asOf`. It has loading, error/retry, stale-data and refresh states (button, pull to refresh, and auto-refresh every 15s).
- **Claim:** pick an asset, enter an amount or tap Max, then see validation against the API rules (min, available, decimals, wire format), the fee, the amount you receive and the destination. Then confirm and follow the claim through to completed or failed. Timeouts are resent safely with the same Idempotency-Key, and work continues after a reload.
- **Activity:** paginated history of accruals, reversals and claims.
- **Tests:** `src/lib/money.test.ts`, `src/lib/overlay.test.ts`.

Stack: Expo SDK 58, TypeScript, Zustand + MMKV (persisted state), TanStack React Query (server state). See [NOTES.md](NOTES.md) for decisions.
