import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Claim, ClaimBody } from '../lib/api';
import type { ClaimAttempt } from '../lib/overlay';
import { newIdempotencyKey, zustandStorage } from '../lib/storage';

type ClaimsState = {
  attempts: ClaimAttempt[];
  /** Creates and persists an attempt (with its idempotency key) before anything is sent. */
  addAttempt: (body: ClaimBody, decimals: number) => ClaimAttempt;
  updateAttempt: (key: string, patch: Partial<ClaimAttempt>) => void;
  setClaim: (claim: Claim) => void;
  removeAttempt: (key: string) => void;
  clear: () => void;
};

export const useClaimsStore = create<ClaimsState>()(
  persist(
    (set) => ({
      attempts: [],
      addAttempt: (body, decimals) => {
        const attempt: ClaimAttempt = { key: newIdempotencyKey(), body, decimals, state: 'submitting', startedAt: new Date().toISOString() };
        set((s) => ({ attempts: [...s.attempts, attempt] }));
        return attempt;
      },
      updateAttempt: (key, patch) =>
        set((s) => ({ attempts: s.attempts.map((a) => (a.key === key ? { ...a, ...patch } : a)) })),
      setClaim: (claim) =>
        set((s) => ({ attempts: s.attempts.map((a) => (a.claim?.id === claim.id ? { ...a, claim } : a)) })),
      removeAttempt: (key) => set((s) => ({ attempts: s.attempts.filter((a) => a.key !== key) })),
      clear: () => set({ attempts: [] }),
    }),
    { name: 'claims', storage: createJSONStorage(() => zustandStorage) },
  ),
);

export const isUnresolved = (a: ClaimAttempt) => a.state === 'submitting' || a.state === 'unknown';
export const isPending = (a: ClaimAttempt) => a.state === 'created' && a.claim?.status === 'pending';
