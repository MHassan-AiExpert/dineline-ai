import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

const g = globalThis as unknown as { __dinelineStore?: Store };

/** Returns Supabase when configured, otherwise the local demo store. */
export function getStore(): Store {
  if (!g.__dinelineStore) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    g.__dinelineStore = url && key ? new SupabaseStore(url, key) : new LocalStore();
  }
  return g.__dinelineStore;
}

export type { Store } from "./types";
