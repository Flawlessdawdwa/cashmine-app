import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { setApiToken } from '../lib/api';
import { zustandStorage } from '../lib/storage';

type AuthState = {
  token: string | null;
  setToken: (token: string | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => {
        const clean = token?.trim() || null;
        setApiToken(clean);
        set({ token: clean });
      },
    }),
    {
      name: 'auth',
      storage: createJSONStorage(() => zustandStorage),
      // MMKV is synchronous, so this runs before the first render.
      onRehydrateStorage: () => (state) => setApiToken(state?.token ?? null),
    },
  ),
);
