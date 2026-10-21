import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Claim, ClaimBody } from '../lib/api';
import type { ClaimAttempt } from '../lib/overlay';
import { newIdempotencyKey, tokenTag, zustandStorage } from '../lib/storage';
import { useAuthStore } from './authStore';

type ClaimsState = {
  attempts: ClaimAttempt[];
  /** Creates and persists an attempt (with its idempotency key) before anything is sent. */
  addAttempt: (body: ClaimBody, decimals: number) => ClaimAttempt;
  updateAttempt: (key: string, patch: Partial<ClaimAttempt>) => void;
  setClaim: (claim: Claim) => void;
  removeAttempt: (key: string) => void;
};

export const useClaimsStore = create<ClaimsState>()(
  persist(
    (set) => ({
      attempts: [],
      addAttempt: (body, decimals) => {
        const owner = tokenTag(useAuthStore.getState().token);
        const attempt: ClaimAttempt = { key: newIdempotencyKey(), owner, body, decimals, state: 'submitting', startedAt: new Date().toISOString() };
        set((s) => ({ attempts: [...s.attempts, attempt] }));
        return attempt;
      },
      updateAttempt: (key, patch) =>
        set((s) => ({ attempts: s.attempts.map((a) => (a.key === key ? { ...a, ...patch } : a)) })),
      setClaim: (claim) =>
        set((s) => ({ attempts: s.attempts.map((a) => (a.claim?.id === claim.id ? { ...a, claim } : a)) })),
      removeAttempt: (key) => set((s) => ({ attempts: s.attempts.filter((a) => a.key !== key) })),
    }),
    { name: 'claims', storage: createJSONStorage(() => zustandStorage) },
  ),
);

/** Attempts made with the current token. Others stay stored, inactive, until that token returns. */
export const currentOwner = () => tokenTag(useAuthStore.getState().token);

export function useMyAttempts() {
  const attempts = useClaimsStore((s) => s.attempts);
  const token = useAuthStore((s) => s.token);
  return useMemo(() => {
    const owner = tokenTag(token);
    return attempts.filter((a) => a.owner === owner);
  }, [attempts, token]);
}

export const isUnresolved = (a: ClaimAttempt) => a.state === 'submitting' || a.state === 'unknown';
export const isPending = (a: ClaimAttempt) => a.state === 'created' && a.claim?.status === 'pending';
