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

/** Short non-secret fingerprint (FNV-1a) of the token, so stored claims can be tied to it without storing it twice. */
export function tokenTag(token: string | null): string {
  let h = 0x811c9dc5;
  for (const ch of token ?? '') {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
