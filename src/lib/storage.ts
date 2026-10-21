import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

// On web, react-native-mmkv falls back to localStorage under the hood.
export const storage = createMMKV({ id: 'cashmine' });

/** Adapter so zustand's persist middleware writes through MMKV (synchronous). */
export const zustandStorage: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => {
    storage.remove(name);
  },
};

export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
